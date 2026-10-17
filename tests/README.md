# Audit smoke tests

Run `./run_tests.sh` after the stack starts. The test suite lives in `backend/*.test.js` and checks fixture properties, event compensation, standings, checkout stock, and offline duplicate behavior. These tests use disposable in-memory state and never alter the running database.

`node tests/http-smoke.js` exercises the running server with a 20-buyer burst. It calls `/reset`, so it replaces the current demo data. Run it only when a live demo is not in progress.
