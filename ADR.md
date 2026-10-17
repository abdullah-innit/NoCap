# Architecture decisions

## ADR 1 — PostgreSQL state and transactions

The API stores the audit state in one PostgreSQL JSONB row. Every mutation locks that row inside a database transaction. This makes the 20-buyer last-unit checkout burst safe and keeps reset deterministic. It is a small competition system; a larger production system would split the domains into indexed tables.

## ADR 2 — Signed, append-only score events

Each accepted event is appended, signed with HMAC-SHA256 from the `DAY1_SALT` environment variable, and scored again from the log on read. Corrections append compensation events. Nothing overwrites a score event.

## ADR 3 — Offline phone data

Expo SQLite stores the last dashboard and pending actions on the phone. The login token is stored with Expo SecureStore, which uses Android secure storage. The app replays queued actions through `/audit/v1/offline-sync` and shows per-action results.

## ADR 4 — Local reproducibility

Docker Compose builds the Node 20 API and starts PostgreSQL 16. The grader needs no host Node installation. The Android APK is delivered separately, as requested by the competition booklet.
