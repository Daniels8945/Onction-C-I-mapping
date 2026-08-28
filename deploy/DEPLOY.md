# Deploying "mapping" at onctionenergy.com/mapping

This is a distinct product from the main Onction platform already
running on this VPS — it's called **mapping**, and everything here
(Linux user, containers, network, URL path) is named that way on
purpose so it never gets confused with Onction's main app/containers.

Everything for this app — Postgres, the API, and the built frontend —
runs as three Docker containers under a dedicated `mapping` Linux
user, isolated from Onction's existing stack on the same box. The
host's existing Nginx (already serving onctionenergy.com) is the only shared
component: it reverse-proxies the `/mapping/` path to this app's
containers and everything else keeps working as before.

Requires Docker + the compose plugin already installed on the VPS
(Onction's stack already needs it, so it's likely there).

## 1. One-time: create the dedicated user

SSH into the VPS as your existing root/sudo admin user and run:

```bash
sudo adduser --disabled-password --gecos "" mapping
sudo usermod -aG docker mapping
sudo mkdir -p /home/mapping/app
sudo chown -R mapping:mapping /home/mapping
```

What each line does:
- `adduser` — creates the `mapping` Linux user with its own home
  directory (`/home/mapping`), no login password (SSH in via `su` or
  keys only)
- `usermod -aG docker` — lets `mapping` run `docker` / `docker compose`
  without needing root for every deploy
- `mkdir` + `chown` — preps and hands over the app directory

Verify Docker is present first if you're not sure: `docker --version`.

Once this repo is pushed to GitHub, `deploy/bootstrap.sh` does exactly
these four steps as a single script — you can `scp` it over and run it
instead of typing the above by hand on future boxes.

Note: docker-group membership is effectively root-equivalent on this
host (standard Docker caveat) — the isolation here is about not
touching Onction's files/containers/ports, not a hard security
sandbox. If you need real privilege separation, look at rootless
Docker instead; out of scope for this quick deploy.

## 2. Get the code onto the VPS

```bash
su - mapping
git clone https://github.com/Daniels8945/Onction-C-I-mapping.git app
cd app
```

## 3. Deploy

```bash
./deploy/deploy.sh
```

First run generates `.env` (DB password + container ports) if it
doesn't exist yet, then builds and starts all three containers:

- `mapping-db` — Postgres, internal only, not exposed to the host at all
- `mapping-api` — the Express API, bound to `127.0.0.1:4001`
- `mapping-web` — Nginx serving the built React app, bound to `127.0.0.1:4080`

`server/init/01-onction-grid.sql` auto-runs against a fresh `db`
volume on first start — schema + seed data (Onction's PPA network
data, which this tool maps) land automatically.

The script polls `/health` until the API responds and prints
`docker compose ps` when it's up.

## 4. Wire up the host Nginx

Paste `deploy/nginx-mapping.conf` into the existing `server { }` block
for **onctionenergy.com** (ports there already match the `.env` defaults —
change both if you edited `MAPPING_API_PORT` / `MAPPING_WEB_PORT`),
then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Verify

- `https://onctionenergy.com/mapping/` loads the app
- `https://onctionenergy.com/mapping/api/health` returns `{"ok":true}`
- Route & Loss Calculator returns a result with the route line drawn

## Redeploying after a code change

```bash
cd /home/mapping/app
git pull
./deploy/deploy.sh
```

`deploy.sh` is safe to re-run — it rebuilds images and recreates only
the containers whose image actually changed.

## If you ever need to change the DB password

Postgres only applies `POSTGRES_PASSWORD` the first time a volume
initializes. Editing `MAPPING_DB_PASSWORD` in `.env` after that does
nothing by itself — the API will start failing DB auth. Either:

```bash
docker exec mapping-db psql -U mapping -d mapping_grid -c \
  "ALTER ROLE mapping WITH PASSWORD 'new-password-here';"
```

or, if the data doesn't matter, wipe and reinit:

```bash
docker compose down -v   # destroys the db volume — reseeds from server/init on next up
docker compose up -d
```

## Useful commands

```bash
docker compose logs -f api      # tail API logs
docker compose logs -f web      # tail frontend/nginx logs
docker compose restart api      # restart just the API
docker compose down             # stop everything (keeps the db volume)
```
