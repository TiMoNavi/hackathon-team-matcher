// src/AppBanGate.tsx
import React from "react";
import { gql, useQuery } from "@apollo/client";
import { navigationRef } from "./navigationRef";

// ⬇️ VARIANTE A: me.activeProfile (wahrscheinlich bei dir vorhanden)
const ME_BAN_Q = gql`
  query BanGateMe {
    me {
      id
      username
      bannedUntil
      bannedReason
    }
  }
`;

export default function AppBanGate() {
  const { data, loading } = useQuery(ME_BAN_Q, { fetchPolicy: "cache-and-network" });

  React.useEffect(() => {
    const nav = navigationRef.current;
    if (loading || !nav) return;

    const prof = data?.me?.activeProfile;
    if (!prof) return;

    const until = prof?.bannedUntil ? new Date(prof.bannedUntil) : null;
    const isBanned = !!until && until.getTime() > Date.now();

    const routeName = nav.getCurrentRoute?.()?.name;

    if (isBanned && routeName !== "Banned") {
      nav.reset({
        index: 0,
        routes: [{ name: "Banned", params: { untilISO: until!.toISOString(), reason: prof.bannedReason ?? null } }],
      });
    } else if (!isBanned && routeName === "Banned") {
      nav.reset({ index: 0, routes: [{ name: "AppTabs" }] });
    }
  }, [loading, data?.me?.activeProfile?.bannedUntil, data?.me?.activeProfile?.bannedReason]);

  React.useEffect(() => {
    (global as any).__banGuardRun = () => {
      const nav = navigationRef.current;
      const prof = data?.me?.activeProfile;
      if (!nav || !prof) return;
      const until = prof?.bannedUntil ? new Date(prof.bannedUntil) : null;
      const isBanned = !!until && until > new Date();
      const routeName = nav.getCurrentRoute?.()?.name;
      if (isBanned && routeName !== "Banned") {
        nav.reset({
          index: 0,
          routes: [{ name: "Banned", params: { untilISO: until!.toISOString(), reason: prof.bannedReason ?? null } }],
        });
      }
    };
  }, [data?.me?.activeProfile]);

  return null;
}
