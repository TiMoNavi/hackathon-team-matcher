// apps/server/src/lib/context/ensureContext.ts
import type { PrismaClient, Prisma, ContextKind } from "@prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

export async function ensureContext(
  tx: Tx,
  input: {
    kind: ContextKind;          // oder ContextKind | "INTEREST" | ...
    key: string;
    label: string;
    cityScoped?: boolean;
  }
) {
  const cityScoped = input.cityScoped ?? true;

  return tx.context.upsert({
    where: { key: input.key },
    update: {
      kind: input.kind,
      label: input.label,
      cityScoped,
    },
    create: {
      key: input.key,
      kind: input.kind,
      label: input.label,
      cityScoped,
    },
  });
}
