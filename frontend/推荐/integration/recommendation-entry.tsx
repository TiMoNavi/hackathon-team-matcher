'use client';
import { useEffect, useMemo } from 'react';
import { createOrdinaryDiscoveryReads } from '../lib/recommendation-runtime/client';
import { createSameOriginDiscoveryTransport, type RecommendationBootstrap } from '../lib/recommendation-runtime/browser-transport';
import { RecommendationController } from '../lib/recommendation-runtime/controller';
import { createAnalysisApi, type AnalysisBootstrap } from '../lib/recommendation-runtime/analysis';
import type { CurrentEvent } from '../lib/recommendation-runtime/contracts';
import { ConnectedRecommendationExperience, type RecommendationIdentity } from '../components/recommendation-connected';

export interface RecommendationEntryProps {
  readonly bootstrap: RecommendationBootstrap & AnalysisBootstrap;
  readonly identity: RecommendationIdentity;
  readonly currentEvent: CurrentEvent;
  readonly onAuthorityInvalidated?: () => void;
}

/** Mounted only by the authenticated same-origin host. Never reads browser tokens. */
export function RecommendationEntry({ bootstrap, identity, currentEvent, onAuthorityInvalidated }: RecommendationEntryProps) {
  const { api_base, base_path } = bootstrap;
  const { space_id, selection_revision, access_version } = currentEvent;
  const controller = useMemo(() => {
    if (!Number.isSafeInteger(identity.user_id) || identity.user_id < 1 || !Number.isSafeInteger(identity.identity_version) || identity.identity_version < 0) throw new Error("Invalid host identity.");
    return new RecommendationController(
    createOrdinaryDiscoveryReads(createSameOriginDiscoveryTransport({ api_base, base_path }, window.location.origin, window.fetch.bind(window))),
    { space_id, selection_revision, access_version }, onAuthorityInvalidated,
  ); }, [api_base, base_path, space_id, selection_revision, access_version, identity.user_id, identity.identity_version, onAuthorityInvalidated]);
  const { csrf_header, csrf_token } = bootstrap;
  const analysisApi = useMemo(() => createAnalysisApi({ api_base, base_path, csrf_header, csrf_token }, window.location.origin, window.fetch.bind(window), { space_id, selection_revision, access_version }, identity.user_id), [api_base, base_path, csrf_header, csrf_token, space_id, selection_revision, access_version, identity.user_id]);
  useEffect(() => { controller.activate(); void controller.refresh(); return () => controller.dispose(); }, [controller]);
  return <ConnectedRecommendationExperience controller={controller} analysisApi={analysisApi} identity={identity} currentEvent={currentEvent} homeHref={bootstrap.base_path} />;
}
