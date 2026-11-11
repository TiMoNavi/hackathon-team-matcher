export function formatCount(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(".0", "")}K`;
  if (n < 1000000) return `${Math.floor(n / 1000)}K`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1).replace(".0", "")}M`;
  return `${Math.floor(n / 1000000)}M`;
}
