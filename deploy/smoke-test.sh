#!/usr/bin/env bash
set -Eeuo pipefail
: "${APP_IMAGE:?Set the Docker image to test}"
export APP_PORT=${APP_PORT:-18087}
readonly project=retro-java-emulator-pwa-ci
compose() { docker compose -p "$project" -f deploy/compose.yaml "$@"; }
cleanup() { compose logs --tail=60 web || true; compose down; }
trap cleanup EXIT
compose up -d --wait --wait-timeout 60 web
base="http://127.0.0.1:$APP_PORT"
curl --fail --silent --show-error "$base/healthz" | grep -Fxq ok
curl --fail --silent --show-error "$base/" | grep -q 'manifest.webmanifest'
curl --fail --silent --show-error "$base/manifest.webmanifest" | grep -q standalone
curl --fail --silent --show-error "$base/sw.js" | grep -q java-retro-shell
headers=$(curl --fail --silent --show-error -D - -o /dev/null -H 'Range: bytes=0-15' "$base/engine/freej2me-web.jar")
grep -q '206 Partial Content' <<< "$headers"
grep -iq 'Content-Range: bytes 0-15/' <<< "$headers"
[[ "$(curl --silent --output /dev/null --write-out '%{http_code}' "$base/engine/missing.jar")" == 404 ]]
curl --fail --silent --show-error -I "$base/sw.js" | grep -iq 'Cache-Control: no-store'
echo 'Production Docker smoke test passed.'
