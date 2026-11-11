export type InfluenceProfile = { id: string; username: string; name: string | null; avatarUrl: string | null };
export type InfluencePosition = {
  communityId: string; title: string; type: string; visibility: "PUBLIC" | "PRIVATE"; imageUrl: string | null;
  isMember: boolean; joinedAt: string; entryPosition: number | null; growthCount: string; settledThrough: string | null;
  earnState: "ACTIVE" | "PAUSED" | "PRIVATE" | "UNAVAILABLE"; canAssign: boolean;
  supportState: "SELF" | "ASSIGNED" | "UNAVAILABLE"; recipient: InfluenceProfile | null;
  earnedUnits: string; communityUnits: string; participationUnits: string; resonanceUnits: string;
};
export type InfluenceOverview = {
  profile: InfluenceProfile; earnedUnits: string; retainedUnits: string; assignedUnits: string;
  receivedUnits: string; availableUnits: string; earningStartsAt: string | null; rankingEnabled: boolean;
  positions: InfluencePosition[]; hasMore: boolean;
};

// Avoid converting ledger integers to Number; large balances must keep their digits.
export function formatInfluence(units: string, locale = "en"): string {
  if (!/^\d+$/.test(units)) return "0";
  const value = units.padStart(7, "0"), whole = value.slice(0, -6).replace(/^0+(?=\d)/, "");
  const decimal = value.slice(-6, -4).replace(/0+$/, "");
  const german = locale.startsWith("de");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, german ? "." : ",") + (decimal ? (german ? "," : ".") + decimal : "");
}
