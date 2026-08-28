#!/usr/bin/env bash
# One-time setup. Run as root (or via sudo) on the VPS.
# Creates a dedicated Linux user for this app (the "mapping" product at
# onction.com/mapping — distinct from the main Onction platform already
# on this box) and puts it in the docker group so it can run
# `docker compose` without touching the other app or needing root for
# day-to-day deploys.
set -euo pipefail

APP_USER="mapping"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed on this VPS. Install Docker + the compose plugin first." >&2
  exit 1
fi

if id "$APP_USER" >/dev/null 2>&1; then
  echo "User '$APP_USER' already exists — skipping creation."
else
  adduser --disabled-password --gecos "" "$APP_USER"
  echo "Created user '$APP_USER'."
fi

usermod -aG docker "$APP_USER"
mkdir -p "/home/$APP_USER/app"
chown -R "$APP_USER:$APP_USER" "/home/$APP_USER"

cat <<EOF

Done. Next steps:

  su - $APP_USER
  git clone https://github.com/Daniels8945/Onction-C-I-mapping.git app
  cd app
  ./deploy/deploy.sh

Then paste deploy/nginx-mapping.conf into your existing Nginx server
block and reload Nginx (that part needs your host Nginx admin access,
outside the $APP_USER account).
EOF
