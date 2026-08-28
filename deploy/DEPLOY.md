# Deploying "mapping" at onctionenergy.com/mapping

This is a distinct product from the main Onction platform already
running on this VPS — it's called **mapping**, and everything here
(Linux user, containers, network, URL path) is named that way on
purpose so it never gets confused with Onction's main app/containers.

Everything for this app — Postgres, the API, and the built frontend —
runs as three Docker containers under a dedicated `mapping` Linux user.

**This runs on a separate VPS from the one serving onctionenergy.com.**
Confirmed setup:
- `144.91.104.174` — this app (mapping), the box these steps target
- `46.105.211.204` — the box Cloudflare/DNS actually points
  onctionenergy.com at, running Onction's main site + its Nginx

Since DNS resolves by hostname only (not by path), Nginx on
`46.105.211.204` has to reverse-proxy `/mapping/` across the network to
`144.91.104.174` — see "Cross-server setup" below for the exact steps.
If mapping ever moves onto the same box as the main site, skip that
section and use `deploy/nginx-mapping.conf` (localhost proxy) instead
of `deploy/nginx-mapping-origin.conf`.

Requires Docker + the compose plugin already installed on
144.91.104.174.

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
- `mapping-api` — the Express API, bound to `127.0.0.1:4001` by default
- `mapping-web` — Nginx serving the built React app, bound to `127.0.0.1:4080` by default

(Step 4 below changes that binding to this box's public IP, since
Nginx for onctionenergy.com is on a different server.)

`server/init/01-onction-grid.sql` auto-runs against a fresh `db`
volume on first start — schema + seed data (Onction's PPA network
data, which this tool maps) land automatically.

The script polls `/health` until the API responds and prints
`docker compose ps` when it's up.

## 4. Cross-server setup (do this before step 5)

`144.91.104.174` and `46.105.211.204` are different providers with no
private network between them, so this crosses the public internet,
locked down by source IP.

**On 144.91.104.174 (this box)** — edit `.env` (created in step 3) and
set:

```
MAPPING_BIND_ADDR=144.91.104.174
```

then recreate the containers so the port binding picks it up:

```bash
docker compose up -d
```

Now lock the ports down to only accept traffic from the main server.
**Important:** Docker rewrites iptables directly and routes published
container ports through the `DOCKER-USER` chain — a plain `ufw allow`
rule does **not** reliably block Docker-published ports, it'll look
firewalled while actually being open to the whole internet. Use
`DOCKER-USER` directly:

```bash
sudo iptables -I DOCKER-USER -p tcp -s 46.105.211.204 -j ACCEPT
sudo iptables -A DOCKER-USER -p tcp --dport 4001 -j DROP
sudo iptables -A DOCKER-USER -p tcp --dport 4080 -j DROP
```

Make it survive a reboot:

```bash
sudo apt-get install -y iptables-persistent   # prompts to save current rules — say yes
sudo netfilter-persistent save
```

Verify from the *other* box (46.105.211.204) that it can reach these
ports, and confirm from literally anywhere else that it can't:

```bash
# from 46.105.211.204 — should succeed:
curl -sf http://144.91.104.174:4001/health

# from your own laptop/elsewhere — should hang/refuse:
curl -m 5 http://144.91.104.174:4001/health
```

## 5. Wire up Nginx on the main server (46.105.211.204)

This part happens on the *other* box — the one Cloudflare/DNS actually
points onctionenergy.com at, not 144.91.104.174.

Paste `deploy/nginx-mapping-origin.conf` into the existing `server { }`
block for onctionenergy.com there (it already targets
`144.91.104.174:4001` / `:4080` — only edit it if you changed
`MAPPING_API_PORT` / `MAPPING_WEB_PORT` in step 3), then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Verify

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
