#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  printf '%s\n' "[deploy] $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: deploy [restart]

  Sets up the Aura service host by building both workspaces, syncing the repository,
  copying the frontend bundle, and restarting docker compose. Pass the optional
  "restart" argument to stop the running container before bringing it back up.
USAGE
  exit 1
}

resolve_home_path() {
  local value="$1"

  if [[ "$value" == "~" ]]; then
    printf '%s' "$HOME"
    return
  fi

  if [[ "$value" == "~/"* ]]; then
    printf '%s' "$HOME/${value:2}"
    return
  fi

  printf '%s' "$value"
}


SSH_KEY="${SSH_KEY:-$HOME/.ssh/homeserver}"
SERVER_USER="${SERVER_USER:-sanjeevhalyal}"
SERVER_HOST="${SERVER_HOST:-192.168.8.129}"
SERVER_PATH="${SERVER_PATH:-/opt/stacks/aura-pa-dashboard}"
CODEX_AUTH_SOURCE="$(resolve_home_path "${CODEX_AUTH_PATH:-$HOME/.codex/auth.json}")"

required_vars=(SSH_KEY SERVER_USER SERVER_HOST SERVER_PATH)
missing=()
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} )); then
  die "Missing required environment variables: ${missing[*]}"
fi

if [[ ! -f "$CODEX_AUTH_SOURCE" ]]; then
  die "Codex auth file not found at $CODEX_AUTH_SOURCE. Create it or point CODEX_AUTH_PATH at a valid credential file."
fi

RESTART=false
while (( $# )); do
  case "$1" in
    restart|--restart)
      RESTART=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

SSH_ARGS=(-i "$SSH_KEY")
if [[ -n "${SSH_PORT:-}" ]]; then
  SSH_ARGS+=("-p" "$SSH_PORT")
  log "Using SSH port $SSH_PORT"
fi

SERVER_USER_HOST="$SERVER_USER@$SERVER_HOST"

ssh_exec() {
  ssh "${SSH_ARGS[@]}" "$SERVER_USER_HOST" "$1"
}

build_rsync_ssh_cmd() {
  local escaped args=()
  for arg in "${SSH_ARGS[@]}"; do
    printf -v escaped '%q' "$arg"
    args+=("$escaped")
  done
  printf 'ssh %s' "${args[*]}"
}

RSYNC_SSH_CMD="$(build_rsync_ssh_cmd)"

FRONTEND_BUILD_DIR="${FRONTEND_BUILD_DIR:-out}"
FRONTEND_BUILD_PATH="$SCRIPT_DIR/frontend/$FRONTEND_BUILD_DIR"

log "Starting deploy to $SERVER_USER_HOST:$SERVER_PATH"

# Build/test to ensure fresh artifacts
log "Running build_test to refresh artifacts"
npm run build_test

# Check for build artifacts
if [[ ! -d "$FRONTEND_BUILD_PATH" ]]; then
  die "Frontend build directory not found at $FRONTEND_BUILD_PATH. Run ./build_test.sh first."
fi

if [[ ! -d "$SCRIPT_DIR/backend/dist" ]]; then
  die "Backend build directory not found at $SCRIPT_DIR/backend/dist. Run ./build_test.sh first."
fi

log "Preparing remote directories"
ssh_exec "set -euo pipefail; mkdir -p \"$SERVER_PATH/frontend\" \"$SERVER_PATH/uploads\" \"$SERVER_PATH/data\""

log "Setting permissions for persistent directories"
if ! ssh_exec "chmod 777 \"$SERVER_PATH/uploads\" \"$SERVER_PATH/data\""; then
  log "chmod failed, using container fallback to ensure permissions"
  ssh_exec "docker run --rm -v \"$SERVER_PATH:/mnt\" node:20-alpine sh -c 'mkdir -p /mnt/uploads /mnt/data && chmod 777 /mnt/uploads /mnt/data'"
fi

RSYNC_EXCLUDES=(
  --exclude=".git"
  --exclude="node_modules"
  --exclude="frontend/node_modules"
  --exclude="backend/node_modules"
  --exclude="frontend/out"
  --exclude="backend/dist"
  --exclude="plan"
  --exclude="uploads"
  --exclude="data"
)

log "Copying files to the server..."
rsync -az --delete "${RSYNC_EXCLUDES[@]}" -e "$RSYNC_SSH_CMD" ./ "$SERVER_USER_HOST":"$SERVER_PATH/"

log "Copying built frontend bundle"
rsync -az --delete -e "$RSYNC_SSH_CMD" "$FRONTEND_BUILD_PATH/" "$SERVER_USER_HOST":"$SERVER_PATH/frontend/$FRONTEND_BUILD_DIR/"

log "Copying Codex auth credentials to the server"
ssh_exec "set -euo pipefail; mkdir -p \"$SERVER_PATH/.codex\" \"$SERVER_PATH/agent_os_chat/.codex\""
scp "${SSH_ARGS[@]}" "$CODEX_AUTH_SOURCE" "$SERVER_USER_HOST":"$SERVER_PATH/.codex/auth.json"
scp "${SSH_ARGS[@]}" "$CODEX_AUTH_SOURCE" "$SERVER_USER_HOST":"$SERVER_PATH/agent_os_chat/.codex/auth.json"
ssh_exec "chmod 700 \"$SERVER_PATH/.codex\" \"$SERVER_PATH/agent_os_chat/.codex\""
ssh_exec "chmod 600 \"$SERVER_PATH/.codex/auth.json\" \"$SERVER_PATH/agent_os_chat/.codex/auth.json\""

log "Success! Files pushed to $SERVER_PATH."

log "Restarting the container..."
if [[ "$RESTART" == true ]]; then
  log "Stopping the container before restart"
  ssh_exec "cd \"$SERVER_PATH\" && docker compose down"
fi

ssh_exec "cd \"$SERVER_PATH\" && docker compose up -d --build"

log "Done!"
