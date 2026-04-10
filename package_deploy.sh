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

FRONTEND_BUILD_DIR="${FRONTEND_BUILD_DIR:-.next}"
FRONTEND_BUILD_PATH="$SCRIPT_DIR/frontend/$FRONTEND_BUILD_DIR"

log "Starting deploy to $SERVER_USER_HOST:$SERVER_PATH"

log "Building frontend workspace"
npm run build:frontend

log "Building backend workspace"
cd backend
npm run build
cd "$SCRIPT_DIR"

if [[ ! -d "$FRONTEND_BUILD_PATH" ]]; then
  die "Frontend build directory not found at $FRONTEND_BUILD_PATH"
fi

log "Preparing remote directories"
ssh_exec "set -euo pipefail; mkdir -p \"$SERVER_PATH/frontend\" \"$SERVER_PATH/uploads\""

log "Setting uploads permissions"
if ! ssh_exec "chmod 777 \"$SERVER_PATH/uploads\""; then
  log "chmod failed, using container fallback to ensure uploads permissions"
  ssh_exec "docker run --rm -v \"$SERVER_PATH:/mnt\" node:20-alpine sh -c 'mkdir -p /mnt/uploads && chmod 777 /mnt/uploads'"
fi

RSYNC_EXCLUDES=(
  --exclude=".git"
  --exclude="node_modules"
  --exclude="frontend/node_modules"
  --exclude="backend/node_modules"
  --exclude="frontend/.next"
  --exclude="backend/dist"
  --exclude="plan"
  --exclude="uploads"
)

log "Copying files to the server..."
rsync -az --delete "${RSYNC_EXCLUDES[@]}" -e "$RSYNC_SSH_CMD" ./ "$SERVER_USER_HOST":"$SERVER_PATH/"

log "Copying built frontend bundle"
rsync -az --delete -e "$RSYNC_SSH_CMD" "$FRONTEND_BUILD_PATH/" "$SERVER_USER_HOST":"$SERVER_PATH/frontend/$FRONTEND_BUILD_DIR/"

log "Success! Files pushed to $SERVER_PATH."

log "Restarting the container..."
if [[ "$RESTART" == true ]]; then
  log "Stopping the container before restart"
  ssh_exec "cd \"$SERVER_PATH\" && docker compose down"
fi

ssh_exec "cd \"$SERVER_PATH\" && docker compose up -d --build"

log "Done!"
