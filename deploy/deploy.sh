#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly project='retro-java-emulator-pwa'
readonly root='/opt/retro-java-emulator-pwa'
revision=${1:?Pass the full 40-character Git commit SHA}
app_port=${2:-18087}
release_name=${3:-$revision}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid revision' >&2; exit 1; }
if ! [[ "$app_port" =~ ^[0-9]{4,5}$ ]] || ! (( 10#$app_port > 1024 && 10#$app_port < 65536 )); then echo 'Invalid unprivileged app port' >&2; exit 1; fi
[[ "$release_name" =~ ^${revision}(-[0-9]+-[0-9]+)?$ ]] || { echo 'Invalid release name' >&2; exit 1; }
readonly release="$root/releases/$release_name"
readonly image="$project:$revision"
[[ -f "$root/.managed-by-java-retro" && "$(cat "$root/.managed-by-java-retro")" == "$project" ]] || { echo 'Deployment root is not managed by this application' >&2; exit 1; }
[[ -d "$release" && ! -L "$release" ]] || { echo 'Invalid release directory' >&2; exit 1; }
exec 9>"$root/deploy.lock"
flock -w 300 9 || { echo 'Another deployment is still running' >&2; exit 1; }

for program in docker curl ss; do command -v "$program" >/dev/null || { echo "Missing required program: $program" >&2; exit 1; }; done
docker info >/dev/null
docker compose version
docker compose up --help | grep -q -- '--wait-timeout' || { echo 'Docker Compose with --wait-timeout is required; update it through aaPanel.' >&2; exit 1; }

# A project name collision is an error; never adopt or delete foreign containers.
owns_port=false
for id in $(docker ps -aq --filter "label=com.docker.compose.project=$project"); do
  [[ "$(docker inspect --format '{{index .Config.Labels "io.java-retro.app"}}' "$id")" == "$project" ]] || { echo 'Compose project name is occupied by another application' >&2; exit 1; }
  if docker port "$id" 8080/tcp 2>/dev/null | grep -Fxq "127.0.0.1:$app_port"; then owns_port=true; fi
done
for id in $(docker ps -q --filter "publish=$app_port"); do
  [[ "$(docker inspect --format '{{index .Config.Labels "io.java-retro.app"}}' "$id")" == "$project" ]] || { echo "Port $app_port belongs to another container; nothing changed." >&2; exit 1; }
done
if [[ "$owns_port" != true && -n "$(ss -H -ltn "sport = :$app_port")" ]]; then
  echo "Port $app_port is occupied; nothing changed. Set a free APP_PORT repository variable." >&2
  exit 1
fi

(cd "$release" && sha256sum -c image.tar.gz.sha256)
docker load --input "$release/image.tar.gz"
[[ "$(docker image inspect --format '{{index .Config.Labels "io.java-retro.app"}}' "$image")" == "$project" ]] || { echo 'Image application label mismatch' >&2; exit 1; }
[[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" == "$revision" ]] || { echo 'Image revision mismatch' >&2; exit 1; }
host_arch=$(docker info --format '{{.Architecture}}')
image_arch=$(docker image inspect --format '{{.Architecture}}' "$image")
[[ "$(docker image inspect --format '{{index .Config.Labels "io.java-retro.app"}}' "$image-repository")" == "$project" ]] || { echo 'Repository image label mismatch' >&2; exit 1; }
[[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image-repository")" == "$revision" ]] || { echo 'Repository image revision mismatch' >&2; exit 1; }
case "$host_arch" in x86_64) host_arch=amd64;; aarch64) host_arch=arm64;; esac
[[ "$host_arch" == "$image_arch" ]] || { echo "Server architecture $host_arch does not match image $image_arch; existing app unchanged." >&2; exit 1; }
printf 'APP_IMAGE=%s\nAPP_PORT=%s\n' "$image" "$app_port" > "$release/release.env"

previous=''
if [[ -L "$root/current" ]]; then
  previous=$(readlink -f "$root/current")
  [[ "$previous" =~ ^/opt/retro-java-emulator-pwa/releases/[0-9a-f]{40}(-[0-9]+-[0-9]+)?$ && -f "$previous/release.env" && -f "$previous/compose.yaml" ]] || { echo 'Invalid current release pointer' >&2; exit 1; }
elif [[ -e "$root/current" ]]; then
  echo 'Current pointer is not an application-managed symlink' >&2; exit 1
fi

compose_release() {
  local selected=$1; shift
  docker compose -p "$project" --project-directory "$root" --env-file "$selected/release.env" -f "$selected/compose.yaml" "$@"
}
rollback() {
  local status=$?
  trap - ERR
  echo 'Deployment failed; collecting logs for this application only.' >&2
  compose_release "$release" logs --tail=60 >&2 || true
  if [[ -n "$previous" ]]; then
    echo 'Restoring the previous application release.' >&2
    compose_release "$previous" up -d --wait --wait-timeout 90 || echo 'Automatic rollback failed; inspect this application manually.' >&2
  else
    echo 'No previous release exists. The failed application container is retained for diagnosis.' >&2
  fi
  exit "$status"
}
trap rollback ERR
compose_release "$release" config -q
compose_release "$release" up -d --wait --wait-timeout 90
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$app_port/healthz"
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$app_port/api/repository/games" >/dev/null
range_status=$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 10 -H 'Range: bytes=0-15' "http://127.0.0.1:$app_port/engine/freej2me-web.jar")
[[ "$range_status" == 206 ]] || { echo "Byte ranges are broken (HTTP $range_status)" >&2; false; }
if [[ -n "$previous" && "$previous" != "$release" ]]; then ln -sfn "$previous" "$root/previous"; fi
ln -sfn "$release" "$root/current"
trap - ERR
# Only the transferred archive is removed. No global prune/down/restart operations.
rm -f -- "$release/image.tar.gz" "$release/image.tar.gz.sha256"
printf 'Deployment healthy: %s on 127.0.0.1:%s\n' "$revision" "$app_port"
