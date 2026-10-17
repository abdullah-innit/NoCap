# Audit smoke tests

Run `./run_tests.sh` after the stack starts. The test suite lives in `backend/*.test.js` and checks fixture properties, event compensation, standings, checkout stock, and offline duplicate behavior. Tests use disposable in-memory state and never alter the running database.
