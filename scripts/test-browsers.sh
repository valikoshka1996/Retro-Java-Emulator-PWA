#!/usr/bin/env bash
set -Eeuo pipefail
npm run test:e2e
npm run test:pwa
npm run test:webkit
npm run test:repository
