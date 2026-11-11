# Community privacy, discovery, membership and network regression tests

The runner creates an in-memory PostgreSQL-compatible PGlite database, seeds the
pre-change schema from commit `fcffa46`, and applies the actual visibility and
membership history, network community, influence ledger, inactive accrual and growth
position and support assignment migrations (through `20261007090000_influence_support`).
It does not connect to production or read the app's `.env` file. Keep that commit
available locally (a shallow clone may need additional history).

Install the optional database test tools separately from application dependencies:

```sh
TEST_TOOLS=$(mktemp -d)
npm install --prefix "$TEST_TOOLS" --no-package-lock --no-audit --no-fund @electric-sql/pglite@0.5.8 @electric-sql/pglite-socket@0.2.11
pnpm --filter server prisma:generate
COMMUNITY_TEST_DEPS="$TEST_TOOLS" node apps/server/tests/run-community-privacy.mjs
```

Run from the repository root with Node 22 or later and the workspace dependencies
installed. Port 55439 must be free; use `COMMUNITY_TEST_PORT` for another port. The
runner stops the socket server and discards the test database when finished.

Coverage includes legacy backfill, immutable visibility (GraphQL and SQL), DROP,
profile/community audiences, blocks, direct and nested media access, pagination,
Moments mixing, shared stories, notification previews, membership removal,
chat subscriptions after an exit, deleted communities, and mobile GraphQL documents.

The discovery cases additionally cover public-only title search, literal wildcard
characters, stable pagination, nullable/clamped limits, recommendation reasons,
exclusion of inaccessible posts, blocked/banned profiles, own/joined communities,
join/leave transitions, and independent profiles sharing one account. Pure client
helpers verify that local recommendation rows do not change pagination offsets or
record post views. Membership cases additionally verify the legacy baseline,
implicit owner positions, repeated joins, exit/rejoin boundaries, owner removal,
transaction rollback, same-transaction exit/rejoin, independent profiles on a
shared account, ownership changes, and history/period deletion on profile or
community deletion.

Network community cases cover inert migration, read-only setup preview, explicit
owner validation, idempotent activation, real membership vs. profile-based seniority,
exits/removals surviving backfills, manual rejoin, direct/nested/API profile creation,
transaction rollback, no connection/chat fanout, explicit-only network Moments,
unchanged ordinary community mixing/chat, stale chat rows, unique immutable internal
markers, and disabled/expired enrollment. No actual network community is activated by running
this suite: activation uses only the disposable test database.

Influence ledger cases cover inert migration, no client minting API, canonical
retry identity, conflicting evidence/policies/amounts, overlapping vs. adjacent
windows, independent communities, exact BigInt values, budget limits, closed
time windows, positive membership overlap, suspension, exit/rejoin, rollback
after writes, relational constraints and deletion without resurrection on retry.
The accrual cases test initial weight calibration, growth vs. personal progress,
later members overcoming finite early leads, tied seniority, independent personal
earnings at different community sizes, per-day caps, net growth, first-join continuity,
absence, UTC activation guards, inactive defaults, real like/comment capture,
remove/re-add deduplication, actor independence on shared accounts, public explicit
contexts only, private/mixed/personal exclusions, Dach bootstrap vs. new profiles,
atomic growth capture, read-only previews, separated credit amounts, daily retries,
policy drift and explicit version-transition guards, day boundaries, bounded job
catch-up and cascading deletion. Growth cases verify zero join reward, no inherited
historical growth, early vs. late entry in a 10,000-profile community, cumulative
burst/split equivalence, absence without catch-up, simultaneous join cohorts, frozen
positions, independent additive positions without an activity prerequisite, and
efficient interval counting against a naive oracle. Transaction tests cover growth
checkpoint/receipt rollback and replay, preview without checkpoint writes, audit
counts, negative SQL constraints and conflicting growth counts on retries.
Support cases cover own-position authorization, profile-switch guards, exact totals,
future credits following an assignment, immediate switch/revocation, chains/cycles
without passing on received support, same-account profiles, bans/blocks, private
sources, exits, pagination, compact recipient search, deletion fallback/cascades,
schema validation of the mobile documents and precision-preserving number display.
The suite currently reports 96 passing tests, including the parent test. The runner
uses UTC, matching the PostgreSQL connection requirement of the activation command.
The weights are configurable initial calibration, not a production ranking formula.
Caps do not prove meaningful interaction or independent people. Ranking is still
unchanged and not exercised here.

History is maintained by SQL triggers, with a partial unique index for open
periods. `prisma db push` alone does not install these invariants. Use the actual
migrations. The local socket adapter is not a multi-session PostgreSQL load test;
parallel joins/exits and migration locking must also be tested on PostgreSQL.
For the network community, also test concurrent registrations/exits during the
administrative activation and backfill, plus lock timeout/rollback on large datasets.
For influence accounting, test competing settlement workers (including partially
overlapping windows), concurrent membership/profile deletion, transaction retries
and large credit batches on a real PostgreSQL test instance before activation.
Activation guidance and its explicit owner requirement are in
`docs/community-momentum-spec.md`; migrations alone do not enroll any profiles.

The new cards and search component were separately checked using React Native Web
and Playwright in an isolated local harness at 320, 390, 768 and 1280 px, with light
and dark themes and DE/EN text. Loading, empty, error/retry, pagination, navigation
payloads and late search responses were exercised. That harness substitutes native
navigation/bridge dependencies; it does not certify iOS or Android behavior.

The influence screen was also checked using its actual RN component in an isolated
RN Web harness at the same viewport sizes: light/dark, DE/EN, SVG signal animation,
reduced motion, images, large balances, recipient selection, switch/revocation,
mutation failures and retry, stale searches, private explanation, paging, profile
remount and empty/loading/error states. Preview artifacts are under
`/private/tmp/bvrly-influence-ui`. Native modal, keyboard and navigation behavior
still need on-device checks. Multiple simultaneous PostgreSQL sessions must verify
assignment vs. deletion, blocking and settlement before production deployment.

These are API/database integration tests, not native UI or production load tests.
Before release, also verify on-device creation, public browsing, private link joins,
post creation/editing, membership removal, keyboard/search navigation, and the
suggestion rail in the real Homefeed. Production-sized query performance remains
untested. Apply the migration to a disposable
copy of the deployment's PostgreSQL database before scheduling production rollout.
