import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { configureCommunityInfluence, runCommunityInfluence } from "../jobs/communityInfluence";

async function main() {
  const { values } = parseArgs({ options: {
    activate: { type: "boolean", default: false }, run: { type: "boolean", default: false },
    apply: { type: "boolean", default: false }, "policy-file": { type: "string" }, help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("Usage: community:influence --activate [--policy-file file.json] [--apply]\n       community:influence --run [--apply]\nDefault: read-only preview. Activation starts next UTC day; no historical awards. Test on staging first. Ranking remains unchanged.");
    return;
  }
  if (values.activate === values.run || (values.run && values["policy-file"])) throw new Error("Choose --activate OR --run; --policy-file is for activation only.");
  const prisma = new PrismaClient();
  try {
    const result = values.activate ? await configureCommunityInfluence(prisma, {
      apply: values.apply, policy: values["policy-file"] ? JSON.parse(await readFile(values["policy-file"], "utf8")) : undefined,
    }) : await runCommunityInfluence(prisma, { apply: values.apply });
    console.log(JSON.stringify(result, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
    if ("errors" in result && result.errors.length) process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Influence operation failed"); process.exitCode = 1; });
