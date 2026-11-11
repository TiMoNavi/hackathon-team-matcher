// apps/server/src/lib/context/engine.ts
import type { PrismaClient } from "@prisma/client";
import { keyOf } from "./keys";

import { extractTopicsFromCaption } from "./topicExtraction";

type Tx = PrismaClient;

export async function ensureContext(
  tx: Tx,
  opts: { kind: any; key: string; label: string; cityScoped?: boolean; groupLinkId?: string }
) {
  return tx.context.upsert({
    where: { key: opts.key },
    update: {
      ...(opts.groupLinkId ? { groupLinkId: opts.groupLinkId } : {}),
      label: opts.label,
      kind: opts.kind,
      cityScoped: opts.cityScoped ?? true,
    },
    create: {
      ...(opts.groupLinkId ? { groupLinkId: opts.groupLinkId } : {}),
      key: opts.key,
      kind: opts.kind,
      label: opts.label,
      cityScoped: opts.cityScoped ?? true,
    },
  });
}

export async function setProfileSeedContexts(tx: Tx, profileId: string, seed: {
  city?: string | null;
  educationLevel?: string | null;
  educationOrg?: string | null;
  educationField?: string | null;
  interests?: string[] | null;
}) {
  const items: Array<{ kind: any; key: string; label: string }> = [];

  if (seed.city) {
    const k = keyOf("city", seed.city);
    if (k) items.push({ kind: "CITY", key: k, label: seed.city });
  }
  if (seed.educationLevel) {
    const k = keyOf("eduLevel", seed.educationLevel);
    if (k) items.push({ kind: "EDU_LEVEL", key: k, label: seed.educationLevel });
  }
  if (seed.educationOrg) {
    const k = keyOf("eduOrg", seed.educationOrg);
    if (k) items.push({ kind: "EDU_ORG", key: k, label: seed.educationOrg });
  }
  if (seed.educationField) {
    const k = keyOf("eduField", seed.educationField);
    if (k) items.push({ kind: "EDU_FIELD", key: k, label: seed.educationField });
  }
  for (const i of seed.interests ?? []) {
    const k = keyOf("interest", i);
    if (k) items.push({ kind: "INTEREST", key: k, label: i });
  }

  for (const it of items) {
    const ctx = await ensureContext(tx, { kind: it.kind, key: it.key, label: it.label, cityScoped: true });
    await tx.profileContext.upsert({
      where: { profileId_contextId_source: { profileId, contextId: ctx.id, source: "SEED" } },
      update: { weight: 10 }, // Seeds = stark am Anfang
      create: { profileId, contextId: ctx.id, source: "SEED", weight: 10 },
    });
  }
}

export async function indexPostContexts(
  tx: Tx,
  postId: string,
  input: {
    location?: string | null;
    caption?: string | null;
    interestLabels?: string[] | null;
    taggedVlogIds?: string[] | null; // optional
  }
) {
  // ✅ REPLACE statt ADD:
  // Lösche nur die POST-basierten Zuordnungen dieses Posts,
  // damit Caption-Edits keine alten Contexts "liegen lassen".
  await tx.postContext.deleteMany({
    where: { postId, source: "POST" },
  });

  // Optional: dedupe Inputs (verhindert unnötige ensureContext/upserts)
  const interestLabels = Array.from(new Set((input.interestLabels ?? []).map((x) => (x ?? "").trim()).filter(Boolean)));
  const taggedVlogIds = Array.from(new Set((input.taggedVlogIds ?? []).map((x) => (x ?? "").trim()).filter(Boolean)));
  const location = (input.location ?? "").trim() || null;
  const caption = input.caption ?? null;

  // --- Location -> PLACE Context
  if (location) {
    const key = keyOf("place", location);
    if (key) {
      const ctx = await ensureContext(tx, {
        kind: "PLACE",
        key,
        label: location,
        cityScoped: true,
      });

      await tx.postContext.create({
        data: { postId, contextId: ctx.id, source: "POST", weight: 1 },
      });
    }
  }

  // --- Interests -> INTEREST Contexts
  for (const label of interestLabels) {
    const key = keyOf("interest", label);
    if (!key) continue;

    const ctx = await ensureContext(tx, {
      kind: "INTEREST",
      key,
      label,
      cityScoped: true,
    });

    await tx.postContext.create({
      data: { postId, contextId: ctx.id, source: "POST", weight: 2.5 },
    });
  }

  // --- Caption -> TOPIC Contexts
  const topics = extractTopicsFromCaption(caption);
  for (const t of topics) {
    const key = keyOf("topic", t.rawKey);
    if (!key) continue;

    const ctx = await ensureContext(tx, {
      kind: "TOPIC",
      key,
      label: t.label,
      cityScoped: true,
    });

    await tx.postContext.create({
      data: { postId, contextId: ctx.id, source: "POST", weight: t.weight },
    });
  }

  // --- Vlog tags -> VLOG Context (Signal)
  for (const vlogId of taggedVlogIds) {
    const key = `vlog:${vlogId}`;
    const ctx = await ensureContext(tx, {
      kind: "VLOG",
      key,
      label: "Vlog",
      cityScoped: false,
    });

    await tx.postContext.create({
      data: { postId, contextId: ctx.id, source: "POST", weight: 0.5 },
    });
  }
}

export async function applyLikeContextLift(tx: Tx, profileId: string, postId: string, delta: number) {
  const pcs = await tx.postContext.findMany({
    where: { postId },
    select: { contextId: true, weight: true },
  });

  for (const pc of pcs) {
    await tx.profileContext.upsert({
      where: { profileId_contextId_source: { profileId, contextId: pc.contextId, source: "LIKE" } },
      update: { weight: { increment: delta * (pc.weight ?? 1) } },
      create: { profileId, contextId: pc.contextId, source: "LIKE", weight: Math.max(0, delta * (pc.weight ?? 1)) },
    });
  }
}

export async function applyAuthorContextImportOnLike(
  tx: Tx,
  likerProfileId: string,
  authorProfileId: string,
  opts?: {
    factor?: number;     // how strong the import is (keep small)
    limit?: number;      // how many contexts we import at most
  }
) {
  const factor = opts?.factor ?? 0.12;
  const limit = opts?.limit ?? 12;

  if (likerProfileId === authorProfileId) return;

  // We only import "identity-ish" contexts, not geography or containers.
  // CITY/PLACE/VLOG would create wrong jumps.
  const ALLOWED_KINDS: Array<any> = ["TOPIC", "INTEREST", "EDU_FIELD", "EDU_ORG", "EDU_LEVEL"];

  const authorTop = await tx.profileContext.findMany({
    where: {
      profileId: authorProfileId,
      source: { in: ["SEED", "LIKE", "IMPORT", "FOLLOW"] },
      context: { kind: { in: ALLOWED_KINDS } },
      weight: { gt: 0 },
    },
    select: {
      contextId: true,
      weight: true,
      context: { select: { kind: true } },
    },
    orderBy: [{ weight: "desc" }],
    take: limit,
  });

  for (const pc of authorTop) {
    const w = pc.weight ?? 0;
    if (w <= 0) continue;

    // conservative contribution:
    // - seeds are weight 10 in your system, so cap to keep it bounded
    const capped = Math.min(w, 10);
    const delta = factor * capped;

    await tx.profileContext.upsert({
      where: {
        profileId_contextId_source: {
          profileId: likerProfileId,
          contextId: pc.contextId,
          source: "IMPORT",
        },
      },
      update: { weight: { increment: delta } },
      create: {
        profileId: likerProfileId,
        contextId: pc.contextId,
        source: "IMPORT",
        weight: Math.max(0, delta),
      },
    });
  }
}
