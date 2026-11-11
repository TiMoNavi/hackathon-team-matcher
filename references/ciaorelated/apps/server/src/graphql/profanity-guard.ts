// apps/server/src/graphql/profanity-guard.ts
import { GraphQLError } from "graphql";
import { containsProfanity } from "../lib/profanity";

/** Pfad-Syntax: "text", "caption", "profile.bio", "blocks[].text", "attachments[].caption" */
type PathSpec = string;

function getAllValues(obj: any, path: PathSpec): { parent: any; key: string | number; value: any }[] {
  const parts = path.split(".");
  const results: { parent: any; key: any; value: any }[] = [];

  function walk(current: any, idx: number) {
    if (idx >= parts.length || current == null) return;

    const raw = parts[idx];
    const isArray = raw.endsWith("[]");
    const key = isArray ? raw.slice(0, -2) : raw;
    const next = current?.[key];

    const atLeaf = idx === parts.length - 1;

    if (isArray) {
      if (Array.isArray(next)) {
        if (atLeaf) {
          next.forEach((v, i) => results.push({ parent: next, key: i, value: v }));
        } else {
          next.forEach((item) => walk(item, idx + 1));
        }
      }
      return;
    }

    if (atLeaf) {
      results.push({ parent: current, key, value: next });
      return;
    }

    walk(next, idx + 1);
  }

  walk(obj, 0);
  return results;
}

/** Wirft GraphQLError, wenn ein Feld Obszönitäten enthält. */
export function assertNoProfanity(input: any, paths: PathSpec[], opts?: { code?: string }) {
  const code = opts?.code ?? "OBJECTIONABLE_CONTENT";
  for (const p of paths) {
    const hits = getAllValues(input, p);
    for (const h of hits) {
      if (typeof h.value === "string" && containsProfanity(h.value)) {
        throw new GraphQLError("Contains disallowed terms", {
          extensions: { code, field: p },
        });
      }
    }
  }
}

/** Optional: stattdessen automatisch entschärfen (maskieren) oder auto-flaggen */
export function sanitizeProfanity(input: any, paths: PathSpec[], mask: (s: string)=>string) {
  for (const p of paths) {
    const hits = getAllValues(input, p);
    for (const h of hits) {
      if (typeof h.value === "string" && containsProfanity(h.value)) {
        h.parent[h.key] = mask(h.value); // z. B. ***-Maskierung
      }
    }
  }
}
