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
  # 2026-06-19 加固：之前用 `systemctl restart` 会出现老 gunicorn worker
  # 还没释放 8000 端口、新 master 起不来、systemd 进入 restart 死循环的问题
  # （部署时实际遇到 restart counter=15）。改成 "stop → 等端口空 → 兜底 pkill → start"。

  log "Stopping $SERVICE_NAME"
  sudo systemctl stop "$SERVICE_NAME"

  # 等老进程真的退出（最多等 10 秒）
  for i in {1..10}; do
    if ! sudo ss -tlnp 2>/dev/null | grep -q ':8000 '; then
      log "Port 8000 released"
      break
    fi
    sleep 1
  done

  # 兜底强杀残留 gunicorn —— 极端情况下 worker 没收到 SIGTERM
  if sudo ss -tlnp 2>/dev/null | grep -q ':8000 '; then
    log "Port 8000 still busy after 10s, force-killing gunicorn"
    sudo pkill -9 -f 'gunicorn.*config\.wsgi' 2>/dev/null || true
    sleep 1
  fi

  log "Starting $SERVICE_NAME"
  sudo systemctl start "$SERVICE_NAME"

  # 起来后等 2 秒 + 验证端口被新进程占用
  sleep 2
  if ! sudo ss -tlnp 2>/dev/null | grep -q ':8000 '; then
    die "$SERVICE_NAME failed to bind port 8000 after start; check logs"
  fi

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
