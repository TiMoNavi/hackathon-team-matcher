/**
 * Contracts for the existing ordinary discovery GETs.
 * Consumed by the same-origin page adapter; tests alone are not RP1/N11 acceptance.
 * These snapshots are not authorization grants. The backend owns permission checks.
 */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface CurrentEvent {
  readonly space_id: number;
  readonly selection_revision: string;
  readonly access_version: string;
}

/** Display-only public projection. There is intentionally no model-input converter. */
export interface DiscoveryAttribute {
  readonly attribute_id: string;
  readonly key: string;
  readonly value: JsonValue;
  readonly visibility: 'authenticated';
  readonly confirmation: 'confirmed';
  readonly last_confirmed_at: string;
  readonly schema_version: number;
}

export interface DiscoveryScope {
  readonly revision: number;
  readonly permission_version: number;
  readonly attributes: readonly DiscoveryAttribute[];
}

export interface DiscoveryPerson {
  readonly owner_id: number;
  readonly space_id: number;
  readonly display_name: string;
  readonly identity_version: number;
  /** Opaque reference, never an image URL or an instruction to fetch a source. */
  readonly avatar_ref: string | null;
  readonly global: DiscoveryScope;
  readonly space: DiscoveryScope;
  /** Profile confirmation/update time, not activity or online presence. */
  readonly updated_at: string;
  readonly relationship: {
    readonly state: 'none' | 'friend' | 'pending_out' | 'pending_in';
    readonly friend: boolean;
    readonly pending_out: boolean;
    readonly pending_in: boolean;
    readonly version: string;
  };
  readonly discovery_version: number;
  readonly privacy_policy_version: string;
}

export type DiscoverySort = 'recent' | 'relevance';
export interface DiscoveryFilters {
  readonly direction?: readonly string[];
  readonly role?: readonly string[];
  readonly skill?: readonly string[];
  readonly interest?: readonly string[];
  readonly event_role?: readonly string[];
  readonly event_seeking?: { readonly role_codes?: readonly string[]; readonly skill_codes?: readonly string[] };
  readonly event_availability?: readonly { readonly starts_at: string; readonly ends_at: string }[];
}

export interface DiscoveryQuery {
  readonly sort?: DiscoverySort;
  readonly limit?: number;
  readonly filters?: DiscoveryFilters;
  readonly cursor?: string | null;
}
export interface PreparedDiscoveryQuery {
  readonly sort: DiscoverySort;
  readonly limit: number;
  readonly filters: DiscoveryFilters;
  readonly cursor: string | null;
}

export interface DiscoveryPage {
  readonly space_id: number;
  readonly target_type: 'person';
  readonly sort: DiscoverySort;
  readonly items: readonly DiscoveryPerson[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
  readonly exhausted: boolean;
  readonly limit: number;
}

export type Invalidation = 'session' | 'activity' | 'list' | 'none';
export interface ReadFailure {
  readonly kind: 'http' | 'network' | 'invalid-response' | 'invalid-request';
  readonly status: number | null;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly invalidation: Invalidation;
}
export type ReadResult<T> =
  | { readonly ok: true; readonly data: T; readonly requestId: string }
  | { readonly ok: false; readonly error: ReadFailure };

/** The host must implement same-origin GET semantics. No default network adapter. */
export interface GetRequest {
  readonly method: 'GET';
  readonly url: string;
  readonly credentials: 'same-origin';
  readonly cache: 'no-store';
  readonly redirect: 'error';
  readonly headers: { readonly Accept: 'application/json' };
}
export interface GetResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: string;
}
export type GetTransport = (request: GetRequest) => Promise<GetResponse>;

export interface OrdinaryDiscoveryReads {
  readCurrentEvent(): Promise<ReadResult<CurrentEvent>>;
  readPage(context: CurrentEvent, query?: DiscoveryQuery): Promise<ReadResult<DiscoveryPage>>;
  readPerson(context: CurrentEvent, ownerId: number): Promise<ReadResult<DiscoveryPerson>>;
}
