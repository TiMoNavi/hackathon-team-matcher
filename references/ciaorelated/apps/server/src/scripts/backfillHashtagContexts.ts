import {  } from "@prisma/client";
import  { prisma } from "../context";
import { maybePromoteHashtagContexts } from "../lib/context/hashtagPromotion";

async function main() {
  const posts = await prisma.post.findMany({
    where: { hashtags: { some: {} } },
    select: { id: true },
    take: 5000,
  });

  for (const p of posts) {
    await maybePromoteHashtagContexts(prisma, p.id);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
