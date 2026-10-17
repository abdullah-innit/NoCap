# Part I requirement traceability

This table maps the booklet's audit requirements to the current code. “Partial” is intentional: the file does not claim tests or features that are missing.

| Requirement | Implementation | Verification | Status |
| --- | --- | --- | --- |
| FR-1.1 Data-defined sports and event scoring | `backend/domain.js` | `backend/domain.test.js` | Implemented |
| FR-1.2 League setup and standings | `backend/leagues.js` | `backend/audit.test.js` | Partial: innings net run rate needs more checks |
| FR-1.3 Fixtures and tournament brackets | `backend/fixtures.js` | `backend/audit.test.js` | Implemented; hidden edge vectors pending |
| FR-1.4 Qualification and tie breakers | `backend/leagues.js` | `backend/audit.test.js` | Partial: 3-way H2H tests pending |
| FR-2.1 Club profile and tenant access | `backend/security.js`, `mobile/App.js` | manual RBAC matrix pending | Partial |
| FR-2.2 Roster and transfer history | `backend/roster.js` | tests pending | Partial |
| FR-2.3 Store and mock payment | `backend/domain.js`, `mobile/App.js` | `backend/domain.test.js` | Implemented core API; receipt UI is summary |
| FR-5.1 Five-role RBAC | `backend/security.js` | tests pending | Implemented probe routes |
| NFR-3 Concurrent stock correctness | `backend/server.js`, `backend/domain.js` | serialized PostgreSQL transaction; burst test pending | Partial |
| NFR-4 Offline tolerance | `backend/offline.js`, `mobile/App.js` | `backend/audit.test.js`; phone test pending | Partial |
| NFR-5 Secure token storage | `mobile/App.js`, `backend/security.js` | phone test pending | Partial |
| NFR-7 Reproducible startup | `docker-compose.yml`, `backend/Dockerfile` | local Docker health/reset check passed | Implemented |

The audit server uses `/audit/v1/*` and `/health` without login except the RBAC probes. The separate `/api/v1/login` and `/api/v1/dashboard` support the phone demo.
