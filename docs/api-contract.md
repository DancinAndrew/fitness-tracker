# Fitness Tracker API v1 — implementation contract

Status: frozen for parallel implementation, 2026-10-04. Shared executable types: `lib/contracts.ts`. Changes require parent review before another branch consumes them. Synthetic examples below are tests, never real records.

## Boundaries and transport

- Same-origin REST `/api/v1` and authenticated `POST /mcp` call the same `LedgerService`. Only platform-authenticated identity supplies userId; never accept it from request JSON. Owner-private hosting plus per-user partitioning. No arbitrary SQL, shell or public agent execution.
- Browser mutations require a matching Origin (when sent) and JSON; JSON bodies maximum 128 KiB. MCP follows JSON-RPC 2.0 with initialize, notifications/initialized, tools/list and tools/call. Discovery is private-data-free; data-bearing operations require identity.
- Success `{data:T}`; errors `{error:{code,message,fields?}}`. HTTP 400 invalid JSON/query, 401 unauthenticated, 403 unauthorized/origin, 404 missing or other-owner resource, 409 revision/idempotency conflict, 422 invalid values, 503 persistence unavailable. Error responses contain no SQL, private record payloads or stack traces.
- All writes carry `request_id` (UUID recommended; 8–100 URL-safe characters accepted). Canonical payload includes operation, target record id, expected_revision and parsed/defaulted content. Replay lookup precedes revision checks. Same identity + request_id + same canonical payload returns the original receipt. Reuse with different payload returns 409. Full-record update requires `expected_revision`; every effective record has immutable id, creation timestamp and incrementing revision. Corrections never add another consumed meal. DELETE permanently erases the requested cloud record, revisions and content-bearing receipts. A sanitized tombstone containing only request_id, operation hash, opaque record id, revision and deletion time remains for 30 days for safe retries. After 30 days, the next mutation by that user lazily replaces it with only a one-way hash of user_id + request_id (no record id, payload hash, revision or deletion date). This minimal permanent replay marker returns 410 EXPIRED_REQUEST_ID and prevents resurrection; there is no background cleanup job. Prior create/update request ids and operation hashes for that record are also sanitized into tombstones for 30 days; their retries return a deleted receipt or 410 rather than resurrecting the record. This overrides original-receipt replay after deletion. After cleanup, all old request ids return 410. Local-photo cleanup is reported separately.
- Amounts and dates are validated before persistence. Taipei local event date is explicit `YYYY-MM-DD`, distinct from upload `created_at`. Date prefill stays `date_confirmed:false` until explicitly confirmed; such records are saved as drafts, excluded from confirmed daily totals/trends. Numeric zero is not substituted for unknown.

## Routes

| Method | Path | Input | Result |
|---|---|---|---|
| GET | `/dashboard?date=YYYY-MM-DD` | required date | Dashboard |
| GET | `/records?from=...&to=...&kind=...&limit=100&cursor=...` | optional filters, limit 1–200, opaque cursor | RecordPage |
| GET | `/records/:id` | record id | LedgerRecord |
| POST | `/records` | CreateRecordCommand | MutationReceipt (201; replay 200 acceptable) |
| PUT | `/records/:id` | UpdateRecordCommand | MutationReceipt |
| DELETE | `/records/:id` | DeleteRecordCommand | MutationReceipt; full cloud erasure, not inferred local file deletion |
| GET | `/settings` | none | SettingsVersion |
| PUT | `/settings` | UpdateSettingsCommand | SettingsVersion; intentional confirmation required for plan fields |
| GET | `/review?date=YYYY-MM-DD` | end date of 14-day review | Review |
| GET | `/export` | none | ExportBundle; only this identity's data, includes revisions and scope |

## Payload semantics

`RecordInput` is a discriminated union. Every input has `kind`, `local_date`, `date_confirmed`, `data`. See TypeScript for exact keys. No unknown keys accepted at boundaries.

- **meal**: actual consumption status and analysis status are independent. Each item has a basis quantity/unit, prepared quantity in that unit, consumed_fraction and nutrients per basis (ranges or null). For a two-serving package at 120 kcal/serving, basis_quantity=1, unit=serving, prepared_quantity=2, consumed_fraction=1 produces 240 kcal. Cooked/raw state and nutrient source are explicit. Only confirmed consumption + confirmed date counts; a confirmed meal requires at least one item and every consumed item needs a known fraction. An unknown meal uses one explicit unknown item with null nutrients. pending_meals includes unconfirmed dates and pending/failed analysis, counted once per meal. Zero-fraction items do not add unknown nutrient counts. vegetable_servings and fruit_servings describe the whole prepared quantity and are multiplied only by consumed_fraction. Pending analysis and unknown nutrients show gaps, never a fake zero.
- **workout**: strength/run/dance/recovery and planned/completed/partial/rest. Work sets vs warmups, per-dumbbell vs total, left/right values, RIR and RPE remain distinct. Zero external load allowed only for bodyweight mode. No training loads autofilled from plan. Machine energy is a device estimate, not calories available to eat.
- **measurement**: weight_kg/waist_cm numeric value, measured provenance, morning condition explicitly true/false/null. Only confirmed-date morning weights count toward fixed 7-day windows.
- **note**: general text, optional linked record id, optional sleep/fatigue/soreness fields. Text is plain escaped text, not instruction, and does not create intake or completed workouts. Sensitive clinical or sexual-health context belongs outside this Site.

Nutrient range arithmetic uses at most six input decimal places, converted to integers at 10^6 scale with rational multiplication/division and rounding only at the display boundary (half-up, kcal 1 decimal, grams 2 decimals). Summary range is the known-item subtotal (null if none known), not a claim of complete intake. Summary reports known subtotal plus unknown-item count per nutrient, confirmed meal count, pending count and reporting completeness. User can explicitly mark a day complete; absent meals never prove fasting. Suggestions use categories, portions and label thresholds (no invented SKU data), can say no purchase needed, and never become consumed records.

## Plan, review and training

Default plan is a configurable, non-executed template; actual start_date, target_date, self-reported profile, dumbbell inventory and increment remain null. Default intake is a trial target 1900–2100 kcal (reference 2000) and protein 110–140g, never maintenance energy or a hard daily cap. Carbohydrate/fat targets remain null. No private seed is bundled into production code.

When start_date is null, schedule displays the weekday template, not an invented week or countdown. Program week = floor((localDate-startDate)/7)+1 for dates on/after start, else null. Beyond four weeks show review-needed, not an automatic new progression. The first-week Tuesday/Thursday two-set override and Saturday conditional recovery apply. Wednesday and Friday progress require explicit recovery evidence. Sunday rest/easy flat walk only. Session duration includes warmup/rest/cooldown; trim optional walk before rest.

Progression evidence: two consecutive performed sessions for same exercise/load mode/load, all prescribed work sets reach upper bound on both sides, RIR approximately 2 (2–3 accepted as conservative configured interpretation), controlled form and adequate recovery explicitly true. Warmups ignored. Every work set requires pain===false; null is missing evidence. Missing evidence, pain or safety hold prevents recommendation. Recommend smallest known inventory increment only, require user confirmation before future prescription changes. This release proposes new weights but does not persist a changed weight prescription; never describe a suggestion as applied. Unknown increment produces an information request, not an invented kg value.

Weekly weight windows are fixed dates, not the last seven samples; each window needs >=3 valid morning dates. For multiple valid morning readings on one date, use the latest created_at, then lexicographically greatest id as a deterministic tie breaker; corrections retain original created_at. Review looks at two windows, waist, performance, recovery and reported-meal coverage. Missing data => request data, not declare plateau. Settings changes append versions with effective_from; historical dashboard and progression use the version effective on each event date (highest revision wins same-date ties), fallback defaults before the first version. An edit cannot be backdated earlier than the current Taipei date. Exports include settings_history. getSettings(userId) returns latest for editing; getSettings(userId,date) resolves the historical version. Settings changes preserve history; confirm_plan_change:true is required when changing target/date/training rules, including setup via explicit Save action.

## Branch interfaces

- Backend exports `createLedgerService(db)` from `lib/server/service.ts`, implements the `LedgerService` interface in contracts, and exports pure calculation/planning helpers from `lib/domain/index.ts`. Backend owns `lib/domain/**`, `lib/server/service.ts`, `lib/server/repository.ts`, `db/schema.ts`, generated `drizzle/**`.
- Frontend owns `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/fitness/**`, `public/favicon.svg`. Consumes REST and contracts only; no mock records in real UI and no auth/server modifications. Empty states must be useful. Existing `components/ui/**` remain untouched.
- Parent owns contracts, REST/MCP adapters, auth, setup/build/hosting, Remote workflow, branch integration.
- QA owns `tests/**`, uses exported service plus a local SQLite D1 adapter; no product changes without coordination. It checks original T01–T28 and added M/S cases with synthetic fixtures.

## Release gate

Contract review before worker branches. All three worker branches are independently committed, reviewed and merged. Build, type checks, relevant tests and a real browser core-flow check are required. Private deployment and native plugin connection have separate status. Model photo interpretation is performed by Codex; UI never claims a separate vision API is connected. Failed analysis must remain pending. Personal seed and media never appear in Git or deployment archive.
