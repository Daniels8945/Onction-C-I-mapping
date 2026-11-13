# Deploying "mapping" at onctionenergy.com/mapping

This is a distinct product from the main Onction website running on the
same VPS. It's called **mapping**, and everything here (Linux user,
containers, network, URL path) is named that way on purpose so it never
gets confused with the website's own containers.

Everything for this app (Postgres, the API, the feeder poller and the
built frontend) runs as Docker containers under a dedicated `mapping`
Linux user.

**Current setup: one box.** `144.91.104.174` serves onctionenergy.com
(Cloudflare points there) and runs the mapping containers.

- Host Nginx on that box holds the TLS cert (Certbot) and the site config
  `/etc/nginx/sites-available/onction-website`.
- `/` goes to the website's frontend container (`127.0.0.1:8090`).
- `/mapping/` goes to `mapping-web` (`127.0.0.1:4080`), and
  `/mapping/api/` to `mapping-api` (`127.0.0.1:4001`).
- The mapping containers bind to `127.0.0.1` only. Nothing is exposed
  to the internet except through Nginx, and no firewall changes are needed.

Requires Docker + the compose plugin on the VPS.

## 1. One-time: create the dedicated user

SSH into the VPS as root/sudo admin and run:

```bash
sudo adduser --disabled-password --gecos "" mapping
sudo usermod -aG docker mapping
sudo mkdir -p /home/mapping/app
sudo chown -R mapping:mapping /home/mapping
```

`deploy/bootstrap.sh` does these steps as one script.

Note: docker-group membership is effectively root-equivalent (standard
Docker caveat). The isolation is about not touching the website's
files/containers/ports, not a hard security sandbox.

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

First run generates `.env` (DB password, ports, API keys left blank) if it
doesn't exist yet, then builds and starts the containers:

- `mapping-db`: Postgres, internal only
- `mapping-api`: the Express API, on `127.0.0.1:4001`
- `mapping-poller`: records the feeder feed once a minute (idle until
  `FEEDER_API_KEY` is set in `.env`)
- `mapping-web`: Nginx serving the built React app, on `127.0.0.1:4080`
- `mapping-osrm`: only started once road data has been built with
  `server/scripts/build-osrm-data.sh`; without it, last-mile distances
  fall back to straight-line

Keep `MAPPING_BIND_ADDR=127.0.0.1` in `.env`; host Nginx reaches the
containers over localhost.

`server/init/01-onction-grid.sql` auto-runs against a fresh `db` volume
on first start (schema + seed data). It does **not** run against an
existing database, so see "Database migrations" below.

The script polls `/health` until the API responds and prints
`docker compose ps` when it's up.

## 4. Wire up host Nginx (one-time)

Paste `deploy/nginx-mapping.conf` into the `listen 443 ssl` `server { }`
block for onctionenergy.com in
`/etc/nginx/sites-available/onction-website`, **above** the catch-all
`location /`, then:

```bash
sudo cp -a /etc/nginx/sites-available/onction-website /root/onction-website.nginx.bak-$(date +%Y%m%d%H%M%S)
# ...edit...
sudo nginx -t && sudo systemctl reload nginx
```

(This is already done on 144.91.104.174.)

## 5. Verify

- `https://onctionenergy.com/` still loads the Onction website
- `https://onctionenergy.com/mapping/` loads the app
- `https://onctionenergy.com/mapping/api/health` returns `{"ok":true}`
- Route & Loss Calculator returns a result with the route line drawn

## Redeploying after a code change

The repo is owned by `mapping`, so run git as that user (as root, git
refuses with "dubious ownership"):

```bash
cd /home/mapping/app
sudo -u mapping git pull            # or: git fetch && git checkout <branch>
sudo -u mapping ./deploy/deploy.sh
```

`deploy.sh` is safe to re-run. It rebuilds images and recreates only
the containers whose image actually changed.

## Database migrations

Changes to existing data ship as files in `server/migrations/`. Apply any
new ones once after deploying; each is safe to run more than once:

```bash
for f in server/migrations/*.sql; do
  docker exec -i mapping-db psql -v ON_ERROR_STOP=1 -U mapping -d mapping_grid -q < "$f"
done
```

## If you ever need to change the DB password

Postgres only applies `POSTGRES_PASSWORD` the first time a volume
initializes. Editing `MAPPING_DB_PASSWORD` in `.env` after that does
nothing by itself, and the API will start failing DB auth. Either:

```bash
docker exec mapping-db psql -U mapping -d mapping_grid -c \
  "ALTER ROLE mapping WITH PASSWORD 'new-password-here';"
```

or, if the data doesn't matter, wipe and reinit:

```bash
docker compose down -v   # destroys the db volume; reseeds from server/init on next up
docker compose up -d
```

## Useful commands

```bash
docker compose logs -f api      # tail API logs
docker compose logs -f poller   # tail feeder poller logs
docker compose logs -f web      # tail frontend/nginx logs
docker compose restart api      # restart just the API
docker compose down             # stop everything (keeps the db volume)
```
