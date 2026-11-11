// src/auth/reconcileSession.ts
import { gql } from "@apollo/client";
import { apollo } from "../apollo";
import Auth from "../lib/auth";
import { AuthVault } from "../lib/auth-vault";

/** --- Queries --- */
const ME_MIN = gql`query Me { me { id username account { id } } }`;
const ME_PROFILES = gql`query MeProfiles { me { profiles { id isDefault } } }`;

/** --- Utils: JWT payload defensiv decodieren (ohne neue Libs) --- */
function decodeJwtPayload(token: string | undefined | null): any | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  const base64url = parts[1];
  // Base64URL → Base64
  let s = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);

  try {
    // RN hat i.d.R. kein atob – erst checken
    if (typeof (globalThis as any).atob === "function") {
      const json = decodeURIComponent(
        escape((globalThis as any).atob(s))
      );
      return JSON.parse(json);
    }
  } catch {/* fallback unten */}

  try {
    // Fallback über Buffer (wenn polyfilled)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Buffer } = require("buffer");
    const json = Buffer.from(s, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Reconcile: aktualisiert NUR die METADATEN der AKTIVEN Session (kein upsert!),
 * damit beim App-Reload KEINE neuen Sessions für dasselbe Profil entstehen.
 */
export async function reconcileSession(): Promise<boolean> {
  try {
    // 1) Server-Wahrheit holen
    const { data } = await apollo.query({ query: ME_MIN, fetchPolicy: "network-only" });
    const me = data?.me ?? null;

    // 2) Aktive Session lesen
    const active = await AuthVault.active(); // { sessionId, token, accountId, profileId, username, ... }

    // 3) Wenn Server sagt "nicht eingeloggt" → aktive lokale Session entfernen
    if (!me) {
      if (active) {
        // räumt active im Vault + navigiert (Auth.clear macht das bei dir bereits)
        await Auth.clear();
      }
      return false;
    }

    // 4) Wenn es KEINE aktive Vault-Session gibt, legen wir HIER KEINE neue an.
    //    (Nur Login/Registrierung sollen Sessions anlegen.)
    if (!active) {
      return true; // Server ok, aber lokal keine Session – App bleibt im Auth-Flow.
    }

    // 5) Aktive Session *patchen* (KEIN upsert!)
    const patch: Partial<{
      accountId: string;
      username: string | null;
    }> = {};

    const accountId = me?.account?.id ?? "";
    if (accountId && (active.accountId ?? "") !== accountId) patch.accountId = accountId;
    if ((active.username ?? null) !== (me.username ?? null)) patch.username = me.username ?? null;

    if (Object.keys(patch).length > 0) {
      await AuthVault.update(active.sessionId, patch);
    }

    // 6) ProfileId sicherstellen (ohne neue Session zu erzeugen)
    let profileId = active.profileId;

    if (!profileId) {
      // a) aus JWT, falls vorhanden
      const payload = decodeJwtPayload(active.token);
      const fromJwt: string | undefined =
        payload?.profileId || payload?.profile || payload?.pid;

      if (fromJwt) {
        profileId = String(fromJwt);
        await Auth.setProfileId(profileId);
      }
    }

    if (!profileId) {
      // b) optional: vom Server Default-Profil holen (falls API das Feld unterstützt)
      try {
        const prof = await apollo.query({ query: ME_PROFILES, fetchPolicy: "network-only" });
        const list: Array<{ id: string; isDefault?: boolean }> = prof?.data?.me?.profiles ?? [];
        const def = list.find(p => p.isDefault) ?? list[0];
        if (def?.id) {
          profileId = def.id;
          await Auth.setProfileId(profileId);
        }
      } catch {
        // Wenn der Server das Feld nicht kennt: ignorieren
      }
    }

    // 7) Fertig – wir haben die aktive Session nur aktualisiert.
    return true;
  } catch (e) {
    console.warn("[AUTH] reconcile error:", String(e));
    // Bei Netzwerkfehlern NICHT hart abmelden
    return false;
  }
}
