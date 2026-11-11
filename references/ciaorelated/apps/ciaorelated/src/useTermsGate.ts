// src/useTermsGate.ts
import { gql, useQuery, useApolloClient } from "@apollo/client";
import * as React from "react";
import { Auth } from "./lib/auth";

export const TERMS_Q = gql`
  query TermsGate {
    currentTermsVersion
    me { id termsVersionAccepted }
  }
`;

export function useTermsGate(loggedIn?: boolean) {
  const [profileId, setProfileId] = React.useState<string | null>(null);
  const client = useApolloClient();

  // aktive Profile-ID tracken
  React.useEffect(() => {
    let alive = true;

    const load = async () => {
      const p = await Auth.getProfileId();
      if (alive) setProfileId(p ?? null);
    };
    load();

    // reagiert auf Login/Logout/Profilwechsel
    const unsub = Auth.onChange?.(async () => {
      const p = await Auth.getProfileId();
      setProfileId(p ?? null);

      // 👉 harter Refresh, damit Terms sofort aktualisiert
      try { await client.clearStore(); } catch {}
      await client.refetchQueries({ include: ["TermsGate"] });
    });

    return () => { alive = false; unsub?.(); };
  }, [client]);


  const { data, loading, refetch } = useQuery(TERMS_Q, {
    fetchPolicy: "network-only",
    nextFetchPolicy: "cache-first",
    notifyOnNetworkStatusChange: true,
    skip: !loggedIn,
  });

  // Beim Profilwechsel sicherheitshalber nochmal ziehen
  React.useEffect(() => {
    if (!loggedIn || !profileId) return;
    refetch();
  }, [profileId, loggedIn, refetch]);

  const current  = data?.currentTermsVersion ?? 1;
  const accepted = data?.me?.termsVersionAccepted ?? 0;
  const required = !!loggedIn && accepted < current;

  return { required, loading, current };
}
