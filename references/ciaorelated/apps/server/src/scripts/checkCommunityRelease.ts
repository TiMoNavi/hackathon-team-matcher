import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { checkCommunityRelease, communityMigrationChecksums } from "../lib/communityRelease";

async function main() {
  const { values } = parseArgs({ options: { help: { type: "boolean", default: false } } });
  if (values.help) {
    console.log("Usage: community:check\nRead-only database/configuration preflight. Checks migration checksums, triggers, UTC and activation settings. Never migrates, activates or repairs data. Uses this process's environment, not PM2's running environment. Not a load/native acceptance test.");
    return;
  }
  const migrations = await communityMigrationChecksums();
  const prisma = new PrismaClient();
  try {
    const report = await checkCommunityRelease(prisma, { migrations });
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}

main().catch(() => {
  console.error("Community preflight failed. Check database access, deployed migration files and schema; no repair attempted.");
  process.exitCode = 1;
});
