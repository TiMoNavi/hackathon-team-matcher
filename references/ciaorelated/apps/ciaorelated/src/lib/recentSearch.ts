// apps/ciaorelated/src/lib/recentSearch.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
const KEY = "recent_search_v1";
export type SearchEntry = { id: string; username: string; name?: string | null; avatarUrl?: string | null; ts: number };
const MAX = 12;

export async function addRecent(u: Omit<SearchEntry,"ts">) {
  const json = (await AsyncStorage.getItem(KEY)) || "[]";
  let list: SearchEntry[] = JSON.parse(json);
  // dedupe by id
  list = [{ ...u, ts: Date.now() }, ...list.filter(x => x.id !== u.id)];
  if (list.length > MAX) list = list.slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}
export async function removeRecent(id: string) {
  const json = (await AsyncStorage.getItem(KEY)) || "[]";
  const list: SearchEntry[] = JSON.parse(json).filter((x: SearchEntry) => x.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
export async function getRecent(): Promise<SearchEntry[]> {
  const json = (await AsyncStorage.getItem(KEY)) || "[]";
  return JSON.parse(json);
}
export async function clearRecent() { await AsyncStorage.removeItem(KEY); }
