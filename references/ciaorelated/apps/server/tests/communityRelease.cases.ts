import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { checkCommunityRelease, communityMigrationChecksums, COMMUNITY_RELEASE_MIGRATIONS } from "../src/lib/communityRelease";

export async function testCommunityRelease(t: TestContext, prisma: PrismaClient) {
  const migrations = await communityMigrationChecksums();
  const native = process.env.TEST_DATABASE_ENGINE === "postgres";
  const check = (env: NodeJS.ProcessEnv = {}) => checkCommunityRelease(prisma, { migrations, env });
  await t.test("release preflight is read-only and requires real migration history", async () => {
    const counts = async () => [await prisma.communityInfluenceSettings.count(), await prisma.communityInfluenceCredit.count(),
      await prisma.communityInfluenceSupport.count(), await prisma.groupLink.count(), await prisma.communityMembershipHistory.count()];
    const before = await counts();
    const result = await check();
    assert.equal(result.readOnly, true);
    assert.equal(result.checks.find(c => c.name === "read-only")?.detail, "on");
    assert.equal(result.passed, native, JSON.stringify(result));
    if (!native) assert.equal(result.checks.find(c => c.name === "migrations")?.status, "error");
    assert.deepEqual(await counts(), before);
  });
  await t.test("release preflight rejects changed migration checksums", { skip: !native }, async () => {
    const result = await checkCommunityRelease(prisma, { env: {}, migrations: { ...migrations, [COMMUNITY_RELEASE_MIGRATIONS[0]]: "0".repeat(64) } });
    assert.equal(result.passed, false);
    assert.equal(result.checks.find(c => c.name === COMMUNITY_RELEASE_MIGRATIONS[0])?.status, "error");
  });
  await t.test("release preflight detects disabled privacy triggers without repairing them", { skip: !native }, async () => {
    await prisma.$executeRaw`ALTER TABLE "GroupLink" DISABLE TRIGGER group_visibility_immutable`;
    try {
      const result = await check();
      assert.equal(result.passed, false);
      assert.equal(result.checks.find(c => c.name === "group_visibility_immutable")?.status, "error");
      const [trigger] = await prisma.$queryRaw<{ enabled: string }[]>`SELECT tgenabled::text AS enabled FROM pg_trigger WHERE tgname = 'group_visibility_immutable'`;
      assert.equal(trigger.enabled, "D");
    } finally { await prisma.$executeRaw`ALTER TABLE "GroupLink" ENABLE TRIGGER group_visibility_immutable`; }
  });
  await t.test("release preflight validates enabled ranking, including future scheduled activation", { skip: !native }, async () => {
    const missing = await check({ ENABLE_COMMUNITY_INFLUENCE_RANKING: "true" });
    assert.equal(missing.passed, false);
    assert.equal(missing.checks.find(c => c.name === "ranking-policy")?.status, "error");
    const future = await check({ ENABLE_COMMUNITY_INFLUENCE_RANKING: "true", COMMUNITY_INFLUENCE_RANKING_STARTS_AT: "2100-01-01T00:00:00Z" });
    assert.equal(future.passed, true, JSON.stringify(future));
    const malformed = await check({ ENABLE_COMMUNITY_INFLUENCE_WORKER: "TRUE" });
    assert.equal(malformed.passed, false);
    assert.equal(malformed.checks.find(c => c.name === "ENABLE_COMMUNITY_INFLUENCE_WORKER")?.status, "error");
  });
}
