#!/usr/bin/env bash
set -euo pipefail

BRANCH=${1:-master}
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
SERVICE_NAME=${SERVICE_NAME:-myfactory.service}
NGINX_SERVICE=${NGINX_SERVICE:-nginx}

log() {
  printf '[%(%Y-%m-%d %H:%M:%S)T] %s\n' -1 "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

git_pull() {
  log "Updating repository (branch: $BRANCH)"
  cd "$ROOT_DIR"
  git fetch --all
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
}

prepare_backend() {
  [[ -x "$VENV_DIR/bin/python" ]] || die "Virtualenv not found at $VENV_DIR"
  log "Installing backend dependencies"
  "$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"

  log "Running database migrations"
  "$VENV_DIR/bin/python" "$BACKEND_DIR/manage.py" migrate --noinput

  log "Collecting static files"
  "$VENV_DIR/bin/python" "$BACKEND_DIR/manage.py" collectstatic --noinput
}

build_frontend() {
  if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
    log "Skipping frontend build (package.json missing)"
    return
  fi
  log "Installing frontend dependencies"
  (cd "$FRONTEND_DIR" && npm ci)

  log "Building frontend"
  (cd "$FRONTEND_DIR" && npm run build)
}

restart_services() {
  log "Restarting $SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"

  log "Reloading $NGINX_SERVICE"
  sudo systemctl reload "$NGINX_SERVICE"
}

main() {
  git_pull
  prepare_backend
  build_frontend
  restart_services
  log "Deployment complete."
}

main "$@"
