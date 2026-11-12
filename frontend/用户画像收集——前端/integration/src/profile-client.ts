import { isPositiveId, isUuid, parseDraft, parseLegacySessionProgress, parseOwnerProfile, parsePreview, parseSourceCapabilities, parseSources, scopeMatches, type LegacySessionProgress, type OwnerProfileRead, type ProfileDraftRead, type ProfilePreviewRead, type ProfileScope, type SourceCapabilities, type SourceSummary } from "./contracts.ts";
import { apiBase, ProfileReadFailure, readProfileJson, type ProfileFetcher } from "./http.ts";

// These operations deliberately have no callable method until their new
// server contracts exist. Existing review_confirm is a formal legacy write.
export const UNCONNECTED_PROFILE_OPERATIONS = Object.freeze(["private_review_snapshot", "narrative_segment_write", "private_identity_draft", "g05_confirmation", "ten_step_journey_restore"] as const);
const checkId = (id: string) => { if (!isUuid(id)) throw new ProfileReadFailure(0, "INVALID_RESOURCE_ID"); return id; };
function scopeQuery(scope: ProfileScope): string {
  if (scope.kind === "global") return "scope=global";
  if (scope.kind !== "space" || !isPositiveId(scope.space_id)) throw new ProfileReadFailure(0, "INVALID_PROFILE_SCOPE");
  return "scope=space&space_id=" + scope.space_id;
}
function inScope<T extends { scope: string; space_id: number | null }>(result: T, requested: ProfileScope): T { if (!scopeMatches(result, requested)) throw new Error("MISMATCHED_PROFILE_SCOPE"); return result; }

/** Explicit owner reads. Results are returned, never cached or locally persisted. */
export class ProfileReadClient {
  private readonly base: string; private readonly fetcher: ProfileFetcher;
  constructor(base: string, fetcher: ProfileFetcher = fetch) { this.base = apiBase(base); this.fetcher = fetcher; }
  profile(scope: ProfileScope, signal: AbortSignal): Promise<OwnerProfileRead> {
    return readProfileJson(this.base + "/me/profile?" + scopeQuery(scope), (value) => inScope(parseOwnerProfile(value), scope), signal, this.fetcher);
  }
  draft(id: string, scope: ProfileScope, signal: AbortSignal): Promise<ProfileDraftRead> {
    checkId(id); return readProfileJson(this.base + "/me/profile/drafts/" + id + "?" + scopeQuery(scope), (value) => { const draft = inScope(parseDraft(value), scope); if (draft.id !== id) throw new Error("MISMATCHED_DRAFT"); return draft; }, signal, this.fetcher);
  }
  preview(scope: ProfileScope, perspective: ProfilePreviewRead["perspective"], signal: AbortSignal, draftId: string | null = null): Promise<ProfilePreviewRead> {
    if (!["owner", "authenticated", "friends"].includes(perspective)) throw new ProfileReadFailure(0, "INVALID_PREVIEW_PERSPECTIVE");
    if (draftId !== null) checkId(draftId);
    const query = scopeQuery(scope) + "&perspective=" + perspective + (draftId === null ? "" : "&draft_id=" + draftId);
    return readProfileJson(this.base + "/me/profile/preview?" + query, (value) => { const result = parsePreview(value); inScope(result.profile, scope); if (result.perspective !== perspective || result.draft_id !== draftId) throw new Error("MISMATCHED_PREVIEW"); return result; }, signal, this.fetcher);
  }
  sources(signal: AbortSignal): Promise<readonly SourceSummary[]> { return readProfileJson(this.base + "/me/profile/sources", parseSources, signal, this.fetcher); }
  sourceCapabilities(signal: AbortSignal): Promise<SourceCapabilities> { return readProfileJson(this.base + "/me/profile/source-capabilities", parseSourceCapabilities, signal, this.fetcher); }
  legacySessionProgress(id: string, scope: ProfileScope, signal: AbortSignal): Promise<LegacySessionProgress> {
    checkId(id); scopeQuery(scope);
    // A known server session reference is required; there is no invented GET
    // active/current session endpoint and no automatic POST-to-resume fallback.
    return readProfileJson(this.base + "/onboarding/sessions/" + id + "/progress", (value) => { const result = parseLegacySessionProgress(value); if (result.session_id !== id || !scopeMatches({ scope: result.scope_key, space_id: result.space_id }, scope)) throw new Error("MISMATCHED_SESSION"); return result; }, signal, this.fetcher);
  }
}
