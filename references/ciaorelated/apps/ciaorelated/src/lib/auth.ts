// apps/ciaorelated/src/lib/auth.ts
import * as SecureStore from "expo-secure-store";
import { AuthVault } from "./auth-vault";
import { navigationRef } from '../navigationRef';
const LEGACY_KEY_TOKEN = "auth_token";
const LEGACY_KEY_PROFILE = "active_profile_id";

/** ---- onChange Emitter ---- */
type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => { for (const fn of Array.from(listeners)) { try { fn(); } catch {} } };

async function migrateLegacyIfNeeded() {
  const legacyToken = await SecureStore.getItemAsync(LEGACY_KEY_TOKEN);
  if (!legacyToken) return;

  const legacyProfileId = (await SecureStore.getItemAsync(LEGACY_KEY_PROFILE)) ?? "";

  await AuthVault.upsertSession({
    accountId: "legacy",
    profileId: legacyProfileId || "unknown",
    token: legacyToken,
    username: null,
    avatarUrl: null,
    avatarThumbUrl: null,
  });

  await SecureStore.deleteItemAsync(LEGACY_KEY_TOKEN);
  await SecureStore.deleteItemAsync(LEGACY_KEY_PROFILE);
}

export const Auth = {
  /** ---- Subscribe/Unsubscribe ---- */
  onChange(cb: Listener) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },

  emitChange() {
    notify();
  },

  /** ---- Token (aktive Session) ---- */
  get: async (): Promise<string | null> => {
    await migrateLegacyIfNeeded();
    return (await AuthVault.active())?.token ?? null;
  },
  set: async (t: string): Promise<void> => {
    const active = await AuthVault.active();
    if (active) {
      await AuthVault.update(active.sessionId, { token: t });
    } else {
      await AuthVault.upsertSession({ token: t, accountId: "unknown", profileId: "unknown" });
    }
    notify();
  },
  clear: async (): Promise<void> => {
    const active = await AuthVault.active();
    if (active) await AuthVault.remove(active.sessionId);
    notify();

    const nav = navigationRef.current;
    if (nav) {
      nav.reset({
        index: 0,
        routes: [{ name: "Auth" as never, params: { start: "login" } as never }],
      });
    }
  },

  /** ---- Profile (aktive Session) ---- */
  getProfileId: async (): Promise<string | null> => {
    await migrateLegacyIfNeeded();
    return AuthVault.getProfileId();
  },
  setProfileId: async (id: string): Promise<void> => {
    const active = await AuthVault.active();
    if (active) {
      await AuthVault.update(active.sessionId, { profileId: id });
      notify();
    }
  },
  clearProfileId: async (): Promise<void> => {
    const active = await AuthVault.active();
    if (active) {
      await AuthVault.update(active.sessionId, { profileId: "" });
      notify();
    }
  },

  /** ---- Hilfsfunktionen ---- */
  isLoggedIn: async (): Promise<boolean> => {
    const [t, p] = await Promise.all([Auth.get(), Auth.getProfileId()]);
    return !!t && !!p;
  },
  logout: async (): Promise<void> => {
    const active = await AuthVault.active();
    if (active) await AuthVault.remove(active.sessionId);
    notify();
  },

  /** ---- Multi-Account APIs ---- */
  listSessions: () => AuthVault.all(),
  setActiveSession: async (sessionId: string) => { await AuthVault.setActive(sessionId); notify(); },
  removeSession: async (sessionId: string) => { await AuthVault.remove(sessionId); notify(); },

  /** ⚠️ Wichtig: Diese Funktion wurde vermisst */
  upsertSession: async (p: {
    accountId: string;
    profileId: string;
    token: string;
    username?: string | null;
    avatarUrl?: string | null;
    avatarThumbUrl?: string | null;
  }) => {
    const s = await AuthVault.upsertSession(p);
    notify();
    return s;
  },
};

export default Auth;
