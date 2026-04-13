#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  printf '%s\n' "[build_test] $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

log "Starting build and test process"

log "Running tests and building backend..."
cd backend
npm run test
npm run build
cd "$SCRIPT_DIR"

log "Running tests and building frontend..."
cd frontend
# Note: This assumes 'npm run test' is defined in frontend/package.json
npm run test
npm run build
cd "$SCRIPT_DIR"

log "Build and test completed successfully!"
