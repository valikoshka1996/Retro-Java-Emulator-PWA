#!/usr/bin/env bash
# Runs only on the GitHub-hosted runner. Private key material never reaches the image.
set -Eeuo pipefail
umask 077

: "${DEPLOY_HOST:?Set repository secret IP_SERVER}"
: "${DEPLOY_USER:?Set repository secret USER}"
: "${DEPLOY_SSH_KEY:?Set repository secret SSH_KEY}"
: "${GITHUB_SHA:?Missing commit SHA}"
: "${GITHUB_RUN_ID:?Missing workflow run ID}"
: "${GITHUB_RUN_ATTEMPT:?Missing workflow run attempt}"
: "${RUNNER_TEMP:?Missing runner temporary directory}"
ssh_port=${DEPLOY_SSH_PORT:-22}
app_port=${DEPLOY_APP_PORT:-18087}
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.:-]*$ ]] || { echo 'Invalid server address' >&2; exit 1; }
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo 'Invalid SSH user' >&2; exit 1; }
if ! [[ "$ssh_port" =~ ^[0-9]{1,5}$ ]] || ! (( 10#$ssh_port > 0 && 10#$ssh_port < 65536 )); then echo 'Invalid SSH port' >&2; exit 1; fi
if ! [[ "$app_port" =~ ^[0-9]{4,5}$ ]] || ! (( 10#$app_port > 1024 && 10#$app_port < 65536 )); then echo 'Invalid application port' >&2; exit 1; fi
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || { echo 'Invalid release identifier' >&2; exit 1; }

work=$(mktemp -d "$RUNNER_TEMP/retro-ssh.XXXXXX")
trap 'rm -f -- "$work/key" "$work/known_hosts"; rmdir -- "$work"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$work/key"
chmod 600 "$work/key"
ssh-keygen -y -P '' -f "$work/key" >/dev/null
if [[ -n "${DEPLOY_KNOWN_HOSTS:-}" ]]; then
  printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$work/known_hosts"
else
  # First-use host discovery; a pinned SSH_KNOWN_HOSTS secret overrides this.
  ssh-keyscan -T 15 -p "$ssh_port" -H "$DEPLOY_HOST" > "$work/known_hosts"
fi
[[ -s "$work/known_hosts" ]] || { echo 'No SSH host key was received' >&2; exit 1; }
ssh_options=(-i "$work/key" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$work/known_hosts" -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
destination="$DEPLOY_USER@$DEPLOY_HOST"
release_name="$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
remote_release="/opt/retro-java-emulator-pwa/releases/$release_name"

# Preflight does not install/update Docker, restart its daemon, or change aaPanel.
ssh "${ssh_options[@]}" -p "$ssh_port" "$destination" bash -s -- "$release_name" <<'REMOTE'
set -Eeuo pipefail
umask 077
root=/opt/retro-java-emulator-pwa
project=retro-java-emulator-pwa
for program in docker curl ss flock sha256sum; do command -v "$program" >/dev/null || { echo "Missing server dependency: $program" >&2; exit 1; }; done
docker info >/dev/null
docker compose version
[[ ! -L "$root" ]] || { echo 'Deployment root must not be a symlink' >&2; exit 1; }
if [[ -d "$root" && ! -f "$root/.managed-by-java-retro" && -n "$(ls -A "$root")" ]]; then
  echo 'Deployment directory already contains unrelated files; aborting.' >&2; exit 1
fi
mkdir -p "$root"
if [[ -f "$root/.managed-by-java-retro" ]]; then
  [[ "$(cat "$root/.managed-by-java-retro")" == "$project" ]] || { echo 'Deployment directory belongs to another app' >&2; exit 1; }
else
  printf '%s\n' "$project" > "$root/.managed-by-java-retro"
fi
mkdir -p "$root/releases"
[[ ! -L "$root/releases" ]] || { echo 'Release directory must not be a symlink' >&2; exit 1; }
[[ ! -e "$root/releases/$1" ]] || { echo 'This release attempt already exists; rerun the workflow to create a new attempt.' >&2; exit 1; }
mkdir "$root/releases/$1"
REMOTE

(cd "$RUNNER_TEMP" && sha256sum image.tar.gz > image.tar.gz.sha256)
scp "${ssh_options[@]}" -P "$ssh_port" "$RUNNER_TEMP/image.tar.gz" "$RUNNER_TEMP/image.tar.gz.sha256" deploy/compose.yaml deploy/deploy.sh "$destination:$remote_release/"
ssh "${ssh_options[@]}" -p "$ssh_port" "$destination" bash "$remote_release/deploy.sh" "$GITHUB_SHA" "$app_port" "$release_name"
