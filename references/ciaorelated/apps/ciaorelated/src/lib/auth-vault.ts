// apps/ciaorelated/src/lib/auth-vault.ts
import * as SecureStore from "expo-secure-store";
import { nanoid } from "nanoid/non-secure";

export type Session = {
  sessionId: string;
  accountId: string;
  profileId: string;
  username?: string | null;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;
  token: string;
  createdAt: number;
};

const KEY_ACTIVE = "ig.active.sessionId";
const KEY_INDEX  = "ig.sessions.index";         // <- nur Array<string> (sessionIds)
const KEY_SESS   = (id: string) => `ig.session.${id}`;

async function readIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(KEY_INDEX);
  return raw ? (JSON.parse(raw) as string[]) : [];
}
async function writeIndex(ids: string[]) {
  await SecureStore.setItemAsync(KEY_INDEX, JSON.stringify(ids));
}

async function readSession(id: string): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY_SESS(id));
  return raw ? (JSON.parse(raw) as Session) : null;
}
async function writeSession(s: Session) {
  await SecureStore.setItemAsync(KEY_SESS(s.sessionId), JSON.stringify(s));
}
async function deleteSession(id: string) {
  await SecureStore.deleteItemAsync(KEY_SESS(id));
}

export const AuthVault = {
  /** alle Sessions laden (aus Index + einzelnen Keys) */
  async all(): Promise<Session[]> {
    const ids = await readIndex();
    const out: Session[] = [];
    for (const id of ids) {
      const s = await readSession(id);
      if (s) out.push(s);
    }
    return out;
  },

  async active(): Promise<Session | null> {
    const id = await SecureStore.getItemAsync(KEY_ACTIVE);
    if (!id) return null;
    return await readSession(id);
  },

  async getToken() { return (await this.active())?.token ?? null; },
  async getProfileId() { return (await this.active())?.profileId ?? null; },

  async hasAccount(accountId: string) {
    const all = await this.all();
    return !!all.find(s => s.accountId === accountId);
  },

  async setActive(sessionId: string) {
    await SecureStore.setItemAsync(KEY_ACTIVE, sessionId);
  },

  /** upsert per accountId (wie bisher) */
  async upsertSession(input: Omit<Session, "sessionId"|"createdAt">) {
    const ids = await readIndex();

    const cleanInput = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    ) as Omit<Session, "sessionId"|"createdAt">;

    let existingId: string | null = null;
    for (const id of ids) {
      const s = await readSession(id);
      if (s?.accountId === cleanInput.accountId) {
        existingId = id;

        const next: Session = { ...s, ...cleanInput };
        await writeSession(next);
        await SecureStore.setItemAsync(KEY_ACTIVE, next.sessionId);
        return next;
      }
    }

    const session: Session = {
      sessionId: nanoid(),
      createdAt: Date.now(),
      ...cleanInput,
    };
    await writeSession(session);
    await writeIndex([session.sessionId, ...ids]);
    await SecureStore.setItemAsync(KEY_ACTIVE, session.sessionId);
    return session;
  },


  async add(input: Omit<Session, "sessionId"|"createdAt">) {
    return this.upsertSession(input);
  },

  async update(sessionId: string, patch: Partial<Session>) {
    const s = await readSession(sessionId);
    if (!s) return;

    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    ) as Partial<Session>;

    await writeSession({ ...s, ...clean });
  },


  async remove(sessionId: string) {
    const ids = await readIndex();
    const nextIds = ids.filter(id => id !== sessionId);
    await writeIndex(nextIds);
    await deleteSession(sessionId);

    const active = await SecureStore.getItemAsync(KEY_ACTIVE);
    if (active === sessionId) {
      await SecureStore.setItemAsync(KEY_ACTIVE, nextIds[0] ?? "");
    }
  },
};
