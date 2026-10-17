# NoCap — NaSCon '26 App Dev, Part I

Android app: React Native with Expo. API: Node.js 20 and PostgreSQL 16. Everything the audit API needs starts with Docker Compose. No competition salt is stored in the repository.

## Start at the venue

From the repository root, set the **Day 1 salt from your team sheet** in the terminal, then start Docker. Do not paste the salt into a file or commit it.

Linux:

```sh
export DAY1_SALT='value-from-team-sheet'
docker compose up -d --build
curl http://localhost:8080/health
```

Windows PowerShell:

```powershell
$env:DAY1_SALT = 'value-from-team-sheet'
docker compose up -d --build
Invoke-RestMethod http://localhost:8080/health
```

The health response should be `{"status":"ok"}`. The audit grader supplies the salt itself and calls `POST /audit/v1/reset` before each group. The API listens on laptop port **8080**. Run `docker compose logs -f api` to see errors.

## Phone demo

Install `mobile/release/app-release.apk` on Android 10 or newer. Keep phone and laptop on the same Wi-Fi or hotspot. In the app's **Settings**, enter `http://LAPTOP-LAN-IP:8080`; for an Android emulator use `http://10.0.2.2:8080`. Open Fixtures, Standings, Club, and Store once while connected to cache them. The Sync tab shows pending offline actions and their results.

Demo password for all accounts: `Nascon@26`.

| Role | Email |
| --- | --- |
| Super Admin | `admin@nascon.test` |
| League Organizer | `organizer@nascon.test` |
| Club Manager | `manager@nascon.test` |
| Player | `player@nascon.test` |
| Viewer | `viewer@nascon.test` |

For the roster desk demo, sign in as Club Manager while online and tap **Prepare demo roster** before trying a transfer, loan, or release. Score entry is shown to Organizer and Super Admin. The baseline `match-alpha-1` is already in progress.

## Tests and project map

Run `./run_tests.sh` from the repository root after Docker starts. Tests use disposable in-memory state. See `TRACEABILITY.md` for requirement mapping, `ADR.md` for architecture decisions, and `COVERAGE.json` for measured test coverage.

- `backend/server.js`: HTTP routes and PostgreSQL transaction boundary.
- `backend/domain.js`: reset, data-defined sports, signed event log, checkout and PDF receipt.
- `backend/fixtures.js`: round robin, Swiss, and single-elimination schedules.
- `backend/leagues.js`: league registration and standings.
- `backend/roster.js`, `backend/offline.js`, `backend/security.js`: roster, offline replay, and roles.
- `mobile/App.js`: Android UI and SQLite queue/cache.

The Compose stack currently contains the API and PostgreSQL. MinIO is intentionally omitted at the team's request.
