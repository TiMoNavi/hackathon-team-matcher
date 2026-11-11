// apps/ciaorelated/src/apollo.ts
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  ApolloLink,
  split,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import Constants from "expo-constants";
import { AuthVault } from "./lib/auth-vault";
import { Auth } from "./lib/auth";
import { offsetLimitPagination } from "@apollo/client/utilities";
import { relayStylePagination } from "@apollo/client/utilities";
import { navigationRef } from "./navigationRef";
import { getErrorHandler } from "./error/ErrorSink";
import i18n from "./i18n";

import { getMainDefinition } from "@apollo/client/utilities"; 
import { GraphQLWsLink } from "@apollo/client/link/subscriptions"; 
import { createClient as createWsClient } from "graphql-ws";   


import type { Reference, StoreObject, } from "@apollo/client";
import { ReadFieldFunction } from "@apollo/client/cache/core/types/common";


const API_URL =
  Constants.expoConfig?.extra?.API_URL?.trim() ||
  Constants.expoConfig?.extra?.apiUrl?.trim() ||
  process.env.EXPO_PUBLIC_API_URL?.trim();

console.log("[API] Using GraphQL:", API_URL);

if (!API_URL) {
  console.warn("[Apollo] No API URL configured. Set expo.extra.API_URL or EXPO_PUBLIC_API_URL.");
}

const httpLink = createHttpLink({ uri: API_URL });

const WS_URL = API_URL?.replace(/^http/, "ws");
console.log("[API] Using GraphQL WS:", WS_URL);

/** Erkenne Ops, bei denen KEINE Auth-Header gesendet werden sollen */
const AUTH_OPS = new Set([
  "login",
  "register",
  "requestphonelogincode",
  "verifyphonelogincode",
  "refresh",
  "refreshtoken",
  "refreshsession",
]);

const isAuthOp = (opName?: string) => {
  if (!opName) return false;
  const n = opName.toLowerCase();
  return AUTH_OPS.has(n);
};

const LOCAL_ERROR_OPS = new Set([
  "leavegroup",
  "searchcommunities",
  "suggestedcommunities",
  "mycommunityinfluence",
  "communityinfluencerecipients",
  "setcommunityinfluencerecipient",
]);

const isLocalErrorOp = (opName?: string) => {
  if (!opName) return false;
  return LOCAL_ERROR_OPS.has(opName.toLowerCase());
};

/** 1) Auth-Header setzen */
const authLink = setContext(async (operation, prevCtx) => {
  const active = await AuthVault.active();
  const token = active?.token;
  const profileId = active?.profileId;
  const opName = operation.operationName;

  const nextHeaders: Record<string, string> = {
    ...(prevCtx.headers as Record<string, string>),
    "content-type": "application/json",
  };

  if (!isAuthOp(opName) && token) {
    nextHeaders.authorization = `Bearer ${token}`;
  } else {
    delete nextHeaders.authorization;
  }

  if (!isAuthOp(opName) && profileId) {
    nextHeaders["x-profile-id"] = profileId;
  } else {
    delete nextHeaders["x-profile-id"];
  }

  return { headers: nextHeaders };
});

const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
  const showError = getErrorHandler();
  const opName = operation?.operationName;

  // Auth-Ops sollen ihre Fehler lokal im Screen behandeln (Alert/Text)
  const isAuth = isAuthOp(opName);
  const isLocalError = isLocalErrorOp(opName);

  if (graphQLErrors?.length) {
    for (const e of graphQLErrors) {
      const code = (e.extensions as any)?.code;
      const msg = (e.message || "").toLowerCase();

      // --- 1) UNAUTHENTICATED ---
      if (code === "UNAUTHENTICATED" || msg.includes("not authenticated")) {
        // ✅ NIE bei login/register/refresh global ausloggen/resetten,
        // sonst wirkt es wie "App hängt"
        if (isAuth) {
          console.warn("[AUTH] unauthenticated during auth-op -> ignore global clear");
          return;
        }

        // ✅ optional: debounce damit Auth.clear nicht 10x feuert
        if (!(global as any).__authClearing) {
          (global as any).__authClearing = true;
          console.warn("[AUTH] unauthenticated -> clear & redirect");
          void Auth.clear().finally(() => {
            setTimeout(() => ((global as any).__authClearing = false), 800);
          });
        }
        return;
      }

      // --- 2) Terms nicht akzeptiert (wie gehabt) ---
      if (code === "TERMS_NOT_ACCEPTED") {
        console.warn("[TERMS] Terms not accepted -> redirect TermsScreen");
        const nav = navigationRef.current;
        if (nav) {
          if (!(global as any).__termsRedirecting) {
            (global as any).__termsRedirecting = true;
            nav.navigate("Terms", { version: 1 });
            setTimeout(() => {
              (global as any).__termsRedirecting = false;
            }, 1000);
          }
        }
        return;
      }

      // ✅ Bei Auth-Ops keine globalen Error-Modals (sonst “hängt” wegen Overlays)
      if (isAuth || isLocalError) {
        console.warn("[apollo] operation error handled locally:", opName, code, e.message);
        return;
      }

      const field = (e.extensions as any)?.field;
      const title = code || i18n.t("common.error");
      const message = field
        ? `${e.message} (${i18n.t("common.fieldSuffix", { field })})`
        : (e.message || i18n.t("common.unexpectedError"));
      showError({ title, message });
    }
  }

  // ✅ NetworkError auch bei Auth-Ops eher lokal behandeln (optional)
  if (networkError && !isAuth && !isLocalError) {
    showError({ title: i18n.t("common.networkErrorTitle"), message: i18n.t("common.networkErrorBody") });
  }
});


// ------- WS-Link (graphql-ws) -------
const wsLink =
  WS_URL
    ? new GraphQLWsLink(
        createWsClient({
          url: WS_URL,
          lazy: true,
          keepAlive: 10_000,
          retryAttempts: Infinity,
          shouldRetry: () => true,
          connectionParams: async () => {
            const active = await AuthVault.active();
            const token = active?.token;
            const profileId = active?.profileId;

            return {
              Authorization: token ? `Bearer ${token}` : "",
              authorization: token ? `Bearer ${token}` : "",
              "x-profile-id": profileId ?? "",
            };
          },
          // ✅ Debug-Logging entfernt
        })
      )
    : null;




function dedupeConnectionMerge() {
  return {
    keyArgs: (args: any) => {
      // passe ggf. an: wenn deine Query args hat
      return ["postId"]; // für postComments(postId, ...)
    },
    merge(existing: any = { edges: [], nextCursor: null, __typename: undefined }, incoming: any, { readField }: any) {
      const seen = new Set<string>();
      const merged: any[] = [];

      const push = (edges?: any[]) => {
        for (const e of edges ?? []) {
          const id = readField("id", e?.node);
          if (id && !seen.has(id)) { seen.add(id); merged.push(e); }
        }
      };

      push(existing.edges);
      push(incoming.edges);

      return { ...incoming, edges: merged };
    },
  };
}

export function toStrId(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null; // Reference, Array etc. -> nicht akzeptieren
}

export function readNodeId(
  readField: ReadFieldFunction,
  ref: Reference | StoreObject | null | undefined
): string | null {
  try {
    const v = ref ? readField<unknown>("id", ref) : null;
    return toStrId(v);
  } catch {
    return null;
  }
}

// HTTP inkl. Auth
const httpAuthed = authLink.concat(httpLink);

// Split: Subscriptions → WS, Rest → HTTP
const splitLink = WS_URL
  ? split(
      ({ query }) => {
        const def = getMainDefinition(query);
        return def.kind === "OperationDefinition" && def.operation === "subscription";
      },
      wsLink!,              // Subscriptions
      httpAuthed            // Queries/Mutations
    )
  : httpAuthed;             // Fallback ohne WS

export const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        exploreFeed: {
          // cursor/limit sollen NICHT Teil des Cache-Keys sein → wir mergen Pages
          keyArgs: false,

          merge(existing, incoming) {
            const exEdges = existing?.edges ?? [];
            const inEdges = incoming?.edges ?? [];

            const seen = new Set(exEdges.map((e: any) => e?.node?.id).filter(Boolean));

            const mergedEdges = [
              ...exEdges,
              ...inEdges.filter((e: any) => {
                const id = e?.node?.id;
                if (!id) return true;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
              }),
            ];

            return {
              ...incoming,
              edges: mergedEdges,
            };
          },
        },
      
        profileGrid: {
          keyArgs: ["userId", "tab"],
          merge(_existing, incoming) {
            // wir ersetzen bewusst die gesamte Liste (refetch / updateQuery regelt pagination)
            return incoming;
          },
        },
        
        postComments: {
          keyArgs: ["postId"],                 // gleiche "Schublade" pro Post
          merge(_existing, incoming) {
            // wir ersetzen bewusst die gesamte Liste → kein Data-Loss-Alarm
            return incoming as any;
          },
        },

        uploadQueue: {
          merge(_existing, incoming) {
            return incoming;
          },
        },

        // dein Feed etc. (belassene Beispiele)
        feed: {
          keyArgs: ["filter", "sort", "vlogId", "search", "tab"],
          merge(existing, incoming) {
            // falls du Relay-Style hast, kannst du auch relayStylePagination nutzen
            return incoming;
          },
        },
        reelsVlogs: { keyArgs: ["limit", "days"], merge: (_e, i) => i },
        vlogsSearch: { keyArgs: ["q", "limit"], merge: (_e, i) => i },

        me: { merge: false },
        currentTermsVersion: { merge: false },
      },
    },

    // Falls Kommentare im Post-Objekt als Connection hängen (z.B. Post.comments):
    Post: {
      keyFields: ["id"],
      fields: {
        comments: {
          keyArgs: false,
          merge(existing: any = { edges: [], nextCursor: null }, incoming: any, { readField }: any) {
            const seen = new Set<string>();
            const merged: any[] = [];
            const push = (edges?: any[]) => {
              for (const e of edges ?? []) {
                const id = readNodeId(readField, e?.node);
                if (id && !seen.has(id)) { seen.add(id); merged.push(e); }
              }
            };
            push(existing.edges);
            push(incoming.edges);
            return { ...incoming, edges: merged };
          },
        },
      },
    },

    Comment: { keyFields: ["id"] },
    Profile: { keyFields: ["id"] },
    Vlog: { keyFields: ["id"] },
  },
});

export const apollo = new ApolloClient({
  link: ApolloLink.from([errorLink, splitLink]), // Subscriptions → WS, Queries/Mutations → auth+HTTP (bereits im splitLink)
  cache,
});

// ---- Nur Zusatz: verbotene Optionen aus watchQuery strippen ----
function sanitizeWatchQueryOptions(opts: any) {
  if (!opts || typeof opts !== "object") return opts;
  const cleaned = { ...opts };

  if ("canonizeResults" in cleaned) {
    console.warn("[apollo] Entferne verbotene Option canonizeResults aus:", cleaned);
    delete cleaned.canonizeResults;
  }
  if ("partialRefetch" in cleaned) {
    console.warn("[apollo] Entferne verbotene Option partialRefetch aus:", cleaned);
    delete cleaned.partialRefetch;
  }
  return cleaned;
}

const _origWatchQuery = apollo.watchQuery.bind(apollo);
apollo.watchQuery = function patchedWatchQuery(options: any) {
  return _origWatchQuery(sanitizeWatchQueryOptions(options));
};

// (optional) falls irgendwo query() genauso gefüttert wird:
const _origQuery = apollo.query.bind(apollo);
apollo.query = function patchedQuery(options: any) {
  return _origQuery(sanitizeWatchQueryOptions(options));
};
/* ------------------------------------------------------------------
   DEV-GUARD: Entfernt (verbotene) canonizeResults-Option aus allen
   relevanten Aufrufen. Das killt die Warnung und loggt die Quelle.
------------------------------------------------------------------- */
type AnyOpts = Record<string, any> | undefined;

function stripCanonize<T extends AnyOpts>(opts: T): T {
  if (!opts || !Object.prototype.hasOwnProperty.call(opts, "canonizeResults")) {
    return opts;
  }

  const val = (opts as any).canonizeResults;

  // Bei undefined: still entfernen, NICHT loggen (verhindert Spam)
  if (typeof val === "undefined") {
    const { canonizeResults, ...rest } = (opts as any);
    return rest as T;
  }

  // Nur loggen, wenn jemand canonizeResults tatsächlich gesetzt hat
  if (typeof __DEV__ === "undefined" || __DEV__) {
    console.warn("[apollo] Entferne verbotene Option canonizeResults aus (explicit):", opts);
  }

  const { canonizeResults, ...rest } = (opts as any);
  return rest as T;
}

// Client-Methoden patchen
const _watchQuery = apollo.watchQuery.bind(apollo) as any;
(apollo as any).watchQuery = (options: any) => _watchQuery(stripCanonize(options));

const _query = apollo.query.bind(apollo) as any;
(apollo as any).query = (options: any) => _query(stripCanonize(options));

// Cache-Lesezugriffe patchen (hier entsteht die Warnung: cache.diff)
const cacheAny = apollo.cache as any;

if (typeof cacheAny.readQuery === "function") {
  const _readQuery = cacheAny.readQuery.bind(cacheAny);
  cacheAny.readQuery = (options: any, ...rest: any[]) =>
    _readQuery(stripCanonize(options), ...rest);
}
if (typeof cacheAny.readFragment === "function") {
  const _readFragment = cacheAny.readFragment.bind(cacheAny);
  cacheAny.readFragment = (options: any, ...rest: any[]) =>
    _readFragment(stripCanonize(options), ...rest);
}
if (typeof cacheAny.diff === "function") {
  const _diff = cacheAny.diff.bind(cacheAny);
  cacheAny.diff = (options: any) => _diff(stripCanonize(options));
}
