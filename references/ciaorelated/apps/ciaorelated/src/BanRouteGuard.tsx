// apps/ciaorelated/src/BanRouteGuard.tsx
import React from "react";
import { gql, useApolloClient } from "@apollo/client";
import { Auth } from "./lib/auth";
import { navigationRef } from "./navigationRef";

const BAN_Q = gql`
  query BanGate { me { id username bannedUntil bannedReason } }
`;

async function fetchBanOnce(client: any) {
  const [t, p] = await Promise.all([Auth.get(), Auth.getProfileId()]);
  if (!t || !p) return;
  await client.query({ query: BAN_Q, fetchPolicy: "network-only" });
}

export default function BanRouteGuard() {
  const client = useApolloClient();

  const runGuard = React.useCallback(async (c: any = client) => {
    const nav = navigationRef.current;
    if (!nav) return;

    const [t, p] = await Promise.all([Auth.get(), Auth.getProfileId()]);
    if (!t || !p) return;

    const { data } = await c.query({ query: BAN_Q, fetchPolicy: "cache-first" });
    const untilISO = data?.me?.bannedUntil ?? null;
    const isBanned = !!untilISO && new Date(untilISO) > new Date();
    const routeName = nav.getCurrentRoute?.()?.name;

  
    if (isBanned) {
      if (routeName !== "Banned") {
        nav.navigate("Banned", { untilISO, reason: data?.me?.bannedReason ?? null });
      }
    } else if (routeName === "Banned") {
      nav.goBack();
    }
  }, [client]);

  // 1) Beim Mount: Netz-Fetch und **danach** Guard laufen lassen
  React.useEffect(() => {
    (async () => {
      await fetchBanOnce(client);
      await runGuard(client);
    })();
  }, [client, runGuard]);

  // 2) Bei Login/Logout/Profilwechsel → Cache clear + neu ziehen + Guard
  React.useEffect(() => {
    const unsub = Auth.onChange?.(async () => {
      try { await client.clearStore(); } catch {}
      await fetchBanOnce(client);
      await runGuard(client);
    });
    return () => unsub?.();
  }, [client, runGuard]);

  // 3) Global exposen für onStateChange im Navigator
  (global as any).__banGuardRun = () => runGuard();

  return null;
}
