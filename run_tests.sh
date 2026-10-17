#!/bin/sh
set -eu
docker compose exec -T api node --test domain.test.js audit.test.js
