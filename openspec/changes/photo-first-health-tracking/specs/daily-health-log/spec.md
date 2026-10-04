## ADDED Requirements

### Requirement: Preserve source and unknown values
The system SHALL distinguish self reports, measurements, estimates, derived values, targets, recommendations and execution records. Missing values SHALL remain unknown. Seed import SHALL NOT create execution records.

#### Scenario: Import a private planning seed
- **WHEN** a seed contains approximate profile values and no execution logs
- **THEN** those values remain self reports and no measurement, meal or completed workout is created

### Requirement: Record through photos and concise language
The system SHALL accept image-derived candidates and concise user statements through an adapter, validate them before persistence, and request only material missing facts.

#### Scenario: Consumption is not stated
- **WHEN** a food photo arrives without confirmation of actual consumption
- **THEN** the system preserves a pending draft and excludes it from consumed totals

#### Scenario: A treadmill image has ambiguous fields
- **WHEN** the image does not establish units or whether speed and incline apply to the whole session
- **THEN** ambiguous values remain unknown and instantaneous values are not promoted to session averages

### Requirement: Calculate an auditable intake ledger
The system SHALL deterministically handle portions, units, local dates, nutrition ranges, unknown nutrients, idempotency and revisions. Only confirmed-consumed effective records SHALL contribute to reported intake.

#### Scenario: Correct only one component
- **WHEN** the user changes the rice portion while confirming the other foods were eaten fully
- **THEN** only rice is rescaled and the same meal is recalculated without duplication

#### Scenario: Retry a saved operation
- **WHEN** an operation with the same request identifier is retried
- **THEN** the original result is returned without a second execution record

### Requirement: Separate prescription from performed training
The system SHALL distinguish planned and actual sessions, warmup and work sets, load modes, bilateral values and recovery evidence. Progression SHALL require all configured evidence and user confirmation.

#### Scenario: Progression evidence is incomplete
- **WHEN** two consecutive qualifying sessions cannot be established
- **THEN** the system does not recommend progression as if the conditions were satisfied

### Requirement: Ground reviews and recommendations in records
The system SHALL calculate trends from valid date windows and report sample counts and completeness. Food recommendations SHALL NOT count as intake. Plan changes SHALL preserve previous versions and require confirmation.

#### Scenario: A review has insufficient records
- **WHEN** valid measurements or meal completeness are insufficient
- **THEN** the system reports the gap and does not automatically reduce energy targets or raise training intensity

### Requirement: Preserve private data and honest failure states
The system SHALL restrict personal data to authorized storage, support export and deletion, and distinguish successful persistence from pending or failed work. The system SHALL NOT diagnose conditions or introduce unconfirmed treatments.

#### Scenario: Analysis fails after an upload
- **WHEN** model analysis is unavailable
- **THEN** saved assets and the pending draft remain recoverable without fabricated nutrition or a success claim

#### Scenario: Export or delete owned records
- **WHEN** the owner requests export or deletion
- **THEN** the system identifies the cloud record, local attachment and backup scope and does not claim that provider-side chat history was also deleted

### Requirement: Share one canonical ledger across Remote and the frontend
The system SHALL use one authoritative cloud ledger for committed records. Remote tools and frontend operations SHALL enforce the same authorization, validation, calculations, idempotency and revision rules. Pending local submissions SHALL NOT be represented as committed cloud records.

#### Scenario: Read a Remote write on the website
- **WHEN** a Remote operation is committed and the frontend refreshes its data
- **THEN** the frontend displays the same effective record and revision without a site deployment

#### Scenario: Concurrent corrections
- **WHEN** a frontend or Remote update presents a stale expected revision
- **THEN** the system rejects silent overwrite and returns a conflict that requires reading the latest record

### Requirement: Provide a minimal private frontend
The system SHALL provide mobile-friendly today, record and trend views, plus simple user notes and structured corrections. It SHALL display missing-data and pending states honestly. Page loads and chart rendering SHALL NOT invoke a model API.

#### Scenario: Add a general note
- **WHEN** the user saves a general note on the website
- **THEN** a later authorized Remote query can read it, without automatically adding intake, completed exercise or a plan change

#### Scenario: Mac is offline
- **WHEN** the Mac is offline and the Site is available
- **THEN** the user can view committed cloud records and save supported manual entries, while Remote image analysis remains unavailable

### Requirement: Limit cloud content and preserve deletion scope
The system SHALL store only the approved structured fitness data in the cloud and keep raw attachments on the Mac in the initial version. Private handoff documents and sensitive medical or sexual-health context SHALL NOT be imported into Site source, cloud records or logs.

#### Scenario: Cloud deletion while Mac is unavailable
- **WHEN** a record is deleted from the cloud while its local attachment cannot be reached
- **THEN** the system identifies the local attachment as pending cleanup and does not claim that all copies were deleted
