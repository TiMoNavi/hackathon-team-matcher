import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { setupNetworkCommunity } from "../lib/networkCommunity";

async function main() {
  const { values } = parseArgs({ options: {
    "owner-id": { type: "string" }, apply: { type: "boolean", default: false }, help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("Usage: tsx src/scripts/setupNetworkCommunity.ts --owner-id <profile-id> [--apply]\nDefault: read-only preview. --apply creates the public Bvrly community and enrolls profiles without prior history.\nUse a staging database first; activation locks Profile, GroupLink and GroupLinkMember for the transaction.");
    return;
  }
  if (!values["owner-id"]) throw new Error("--owner-id is required; no owner is selected automatically.");
  const prisma = new PrismaClient();
  try {
    console.log(JSON.stringify(await setupNetworkCommunity(prisma, { ownerId: values["owner-id"], apply: values.apply }), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Network community setup failed");
  process.exitCode = 1;
});
