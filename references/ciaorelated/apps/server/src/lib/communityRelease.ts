import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { influencePolicyVersion, parseInfluencePolicy } from "./communityInfluencePolicy";
import { influenceRankingPolicy } from "./communityInfluenceRanking";

export const COMMUNITY_RELEASE_MIGRATIONS = [
  "20261006120000_community_visibility", "20261006150000_community_membership_history",
  "20261006170000_network_community", "20261006190000_community_influence_ledger",
  "20261006210000_community_influence_accrual", "20261006230000_influence_growth_positions",
  "20261007090000_influence_support",
] as const;

export async function communityMigrationChecksums() {
  const result: Record<string, string> = {};
  for (const name of COMMUNITY_RELEASE_MIGRATIONS) {
    const sql = await readFile(resolve(__dirname, "../../prisma/migrations", name, "migration.sql"));
    result[name] = createHash("sha256").update(sql).digest("hex");
  }
  return result;
}

type Check = { name: string; status: "ok" | "warning" | "error"; detail: string };
const requiredTriggers = [
  ["GroupLink", "group_visibility_immutable"], ["GroupLink", "community_system_key"],
  ["GroupLink", "community_owner_history"], ["GroupLinkMember", "community_membership_history"],
  ["GroupLinkMember", "community_membership_identity"], ["GroupLinkMember", "influence_join_event"],
  ["Profile", "network_profile_enrollment"],
];

// Configuration checks only: no full ledger scans, personal data or activation.
export async function checkCommunityRelease(prisma: PrismaClient, options: {
  migrations: Record<string, string>; env?: NodeJS.ProcessEnv; now?: Date;
}) {
  const env = options.env ?? process.env, now = options.now ?? new Date();
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
    const checks: Check[] = [];
    const add = (name: string, status: Check["status"], detail: string) => checks.push({ name, status, detail });
    const report = () => ({ readOnly: true, passed: checks.every(c => c.status !== "error"), checks,
      scope: "Database/configuration preflight only; not native, load or production release approval." });
    const [db] = await tx.$queryRaw<{ zone: string; readOnly: string; migrationsPresent: boolean }[]>`
      SELECT current_setting('TimeZone') AS zone, current_setting('transaction_read_only') AS "readOnly",
        to_regclass(format('%I.%I', current_schema(), '_prisma_migrations')) IS NOT NULL AS "migrationsPresent"`;
    add("read-only", db.readOnly === "on" ? "ok" : "error", db.readOnly);
    add("timezone", ["UTC", "ETC/UTC", "GMT", "ETC/GMT", "ETC/GMT0", "UCT", "ZULU"].includes(db.zone.toUpperCase()) ? "ok" : "error", db.zone);
    if (!db.migrationsPresent) {
      add("migrations", "error", "Prisma migration history is missing. Do not baseline a live database automatically.");
      return report();
    }
    const rows = await tx.$queryRaw<{ migration_name: string; checksum: string; finished_at: Date | null }[]>`
      SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`;
    for (const name of COMMUNITY_RELEASE_MIGRATIONS) {
      const matching = rows.filter(r => r.migration_name === name);
      const valid = matching.length === 1 && matching[0].finished_at && matching[0].checksum === options.migrations[name];
      add(name, valid ? "ok" : "error", valid ? "Applied; checksum matches." : "Missing, unfinished, duplicated or different migration checksum.");
    }
    if (rows.some(r => !r.finished_at)) add("migration-history", "error", "Unfinished migration found; inspect prisma migrate status.");
    if (checks.some(c => c.status === "error")) return report();
    const triggers = await tx.$queryRaw<{ table: string; name: string; enabled: string }[]>`
      SELECT c.relname AS "table", t.tgname AS name, t.tgenabled::text AS enabled
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname = current_schema()`;
    for (const [table, name] of requiredTriggers) {
      const present = triggers.some(t => t.table === table && t.name === name && ["O", "A"].includes(t.enabled));
      add(name, present ? "ok" : "error", present ? "Trigger enabled." : "Required trigger missing or disabled.");
    }
    const settings = await tx.communityInfluenceSettings.findUnique({ where: { id: "default" } });
    if (settings) {
      let valid = false;
      try { valid = settings.policyVersion === influencePolicyVersion(parseInfluencePolicy(settings.policy)); } catch { /* Report invalid stored policy without rewriting it. */ }
      add("accrual-policy", valid ? "ok" : "error", valid ? `Locked; starts ${settings.startsAt.toISOString()}.` : "Stored policy does not match this release.");
    } else add("accrual-policy", "ok", "Not activated; no automatic activation performed.");
    for (const key of ["ENABLE_COMMUNITY_INFLUENCE_WORKER", "ENABLE_COMMUNITY_INFLUENCE_RANKING"]) {
      const value = env[key] ?? "false";
      add(key, ["true", "false"].includes(value) ? "ok" : "error", ["true", "false"].includes(value) ? value : "Use exactly true or false.");
    }
    if (env.ENABLE_COMMUNITY_INFLUENCE_WORKER === "true" && !settings) add("worker", "warning", "Worker enabled but accrual is not activated.");
    if (env.ENABLE_COMMUNITY_INFLUENCE_RANKING === "true") {
      const start = new Date(env.COMMUNITY_INFLUENCE_RANKING_STARTS_AT ?? "");
      const policy = influenceRankingPolicy(start > now ? start : now, env);
      add("ranking-policy", policy ? "ok" : "error", policy ? `Valid; starts ${policy.startsAt.toISOString()}.` : "Missing/invalid UTC start or ranking parameters; runtime ranking stays off.");
      if (!settings) add("ranking-accrual", "warning", "Ranking enabled before accrual activation; no new credits will be earned.");
    }
    const network = await tx.groupLink.findUnique({ where: { systemKey: "BVRLY" }, select: { visibility: true, isActive: true, expiresAt: true } });
    add("network-community", network && (network.visibility !== "PUBLIC" || !network.isActive || (network.expiresAt && network.expiresAt <= now)) ? "warning" : "ok",
      !network ? "Not configured; setup remains an explicit separate operation." : "Configured; verify intended enrollment separately.");
    return report();
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 15_000 });
}
