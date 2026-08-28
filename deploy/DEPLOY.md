# Deploying under /onction on the VPS

Assumes: Docker + Docker Compose, Node 18+, and Nginx already present on the
VPS (all used by the other app). Run the `sudo` steps as your existing admin
user, not as the new `onction` user.

## 1. Create a dedicated system user

```bash
sudo adduser --system --group --home /home/onction --shell /usr/sbin/nologin onction
sudo mkdir -p /home/onction/app
sudo chown onction:onction /home/onction/app
```

## 2. Ship the code

From your machine (excludes node_modules/dist/.env — those are
regenerated or created directly on the VPS):

```bash
rsync -av --exclude node_modules --exclude dist --exclude .env \
  --exclude server/node_modules --exclude server/.env \
  ./ youruser@your-vps:/home/onction/app/
```

## 3. Start Postgres (Docker)

```bash
cd /home/onction/app
echo "ONCTION_DB_PASSWORD=$(openssl rand -hex 24)" | sudo tee .env
echo "ONCTION_DB_PORT=5433" | sudo tee -a .env
sudo docker compose up -d
```

`server/init/01-onction-grid.sql` auto-runs on first container start —
schema + seed data land automatically, no manual migration step.

## 4. Configure and install the backend

```bash
sudo cp server/.env.production.example server/.env
```

Edit `server/.env`:
- `DATABASE_URL` — password must match `ONCTION_DB_PASSWORD` from step 3,
  port must match `ONCTION_DB_PORT` (5433)
- `PORT` — 4001 (or whatever you pick; must match the nginx snippet)
- `CORS_ORIGIN` — your real domain, e.g. `https://yourdomain.example`

```bash
cd /home/onction/app/server
sudo -u onction npm install --omit=dev
```

## 5. Build the frontend

```bash
cd /home/onction/app
sudo -u onction npm install
sudo -u onction npm run build
```

This produces `dist/` with `base: /onction/` baked in and API calls
pointed at the relative `/onction/api` path (see `.env.production`) —
same-origin, so no CORS round-trip in the browser.

## 6. systemd service for the API

```bash
sudo cp deploy/onction-grid-api.service /etc/systemd/system/
which node   # confirm this matches ExecStart in the unit file — edit if not /usr/bin/node
sudo systemctl daemon-reload
sudo systemctl enable --now onction-grid-api
sudo systemctl status onction-grid-api
curl http://127.0.0.1:4001/health   # should return {"ok":true}
```

## 7. Nginx

Paste `deploy/nginx-onction.conf` into the existing `server { }` block for
your domain (adjust the port/alias if you changed them above), then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Verify

- `https://yourdomain.example/onction/` loads the app
- `https://yourdomain.example/onction/api/health` returns `{"ok":true}`
- Route & Loss Calculator returns a result with the route line drawn

## Redeploying after a code change

```bash
# ship new code (step 2), then:
cd /home/onction/app && sudo -u onction npm run build
cd server && sudo -u onction npm install --omit=dev
sudo systemctl restart onction-grid-api
```
