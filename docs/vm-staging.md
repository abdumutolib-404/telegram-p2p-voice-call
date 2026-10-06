# VM staging pack

This pack targets a small Google Compute Engine x86_64 VM running Ubuntu 24.04: `e2-medium` (2 shared vCPU, 4 GiB RAM) with a 30 GB persistent disk. It is the first fit for the current combined image because the repository builds an x86_64 Go gateway and Node runner together. Oracle Cloud A1 is a later option after a multi-architecture image is built and tested; do not switch architecture by changing only the VM shape.

This is a staging layout, not a provider provisioning script. It makes no Google, Oracle, Cloudflare, LiveKit, R2, DNS, billing, or account changes. Free-trial eligibility and quotas are account and region dependent; QA must confirm those separately. The VM should be disposable and the image reference must be immutable.

| Candidate | Decision | Gate |
| --- | --- | --- |
| Google Compute Engine `e2-medium`, x86_64 | Primary target for this pack | Owner confirms trial/quota eligibility and QA supplies an immutable x86_64 image digest |
| Oracle Cloud A1, ARM | Future portable target only | Owner confirms current free-tenancy eligibility and QA first builds/tests a multi-architecture ARM64 image; the current image is not ARM-verified |

## Files

- `infra/vm-staging/compose.yaml` — app, PostgreSQL 16, Redis 7, and Caddy. Only Caddy publishes ports 80 and 443. PostgreSQL and Redis have no host-published ports.
- `infra/vm-staging/Caddyfile` — automatic HTTPS, access logging, WebSocket-compatible reverse proxying to the Go gateway, and explicit Cloudflare proxy trust.
- `infra/vm-staging/.env.example` — placeholders only. On the VM copy it to `.env`, fill it privately, and never add that file to Git.

The combined image starts Node internally on port 3000 and the Go gateway on port 3001. Caddy proxies to `app:3001`; the gateway proxies ordinary HTTP requests to its internal Node listener and owns Socket.IO/WebSocket traffic. The fixed Compose network is `172.30.0.0/24`, so the gateway trusts that network as its immediate proxy. Node also needs loopback in `TRUSTED_PROXY_CIDRS` because the gateway is its local reverse proxy. Caddy's trusted list must contain only the current Cloudflare origin CIDRs, refreshed from Cloudflare's published list before a new VM is opened.

The frontends remain on Cloudflare Pages. Build the Mini App with `VITE_SERVER_URL=https://<API_HOST>` and keep the landing and admin origins in `MINI_APP_URL`, `ADMIN_PANEL_URL`, and `ALLOWED_ORIGINS`. External users should use the Cloudflare-hosted frontends; the combined image still contains embedded frontend fallback assets under the application paths, so this pack does not claim those routes were removed.

## First setup on the VM

Install Docker Engine and the Compose plugin through the approved Ubuntu repository, then copy an explicitly reviewed source snapshot into a deployment directory. This working tree contains uncommitted application changes, so do not assume that a bare Git `HEAD` archive captures the tested state; the preferred deployment input is the immutable combined image digest recorded by QA, with the reviewed `infra/vm-staging` files copied alongside it. QA should create the private runtime file with a mode that prevents other users from reading it:

```sh
umask 077
cp infra/vm-staging/.env.example infra/vm-staging/.env
${EDITOR:-vi} infra/vm-staging/.env
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml config --quiet
```

Before starting, verify that `PAIRTALK_IMAGE` contains a digest (`@sha256:`), `CADDY_TRUSTED_PROXIES` contains real current Cloudflare CIDRs, DNS for `API_HOST` points to the VM, and the GCE firewall permits 80/443 while denying 5432, 6379, 3000, and 3001. Do not put database, Redis, LiveKit, or R2 secrets in shell history.

For the first certificate issuance, point `API_HOST` directly at the VM with DNS-only mode and allow ports 80/443 through the GCE firewall. Start Caddy and wait for certificate issuance, then enable the Cloudflare proxy with Full (strict) TLS and keep the origin firewall restricted to Cloudflare ranges. If DNS-01 is chosen instead, configure it through an approved Caddy DNS build and a private token; this pack does not create that provider credential.

Apply migrations as an explicit one-off operation. The image entrypoint refuses command arguments during a normal boot and executes the requested command only when `RELEASE_COMMAND=1`:

```sh
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml run --rm \
  -e RELEASE_COMMAND=1 app npm run db:deploy
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml up -d
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml ps
curl --fail https://<API_HOST>/healthz
```

Normal `up -d` never migrates. The app, database, Redis, and Caddy all have restart policies, health checks, bounded Docker JSON logs, and named volumes. Recording files persist in the named `pairtalk-vm-staging-recordings` volume even when R2 is configured; R2 remains the durable external recording store for LiveKit Cloud egress.

## Image upgrades

Build and scan the combined image in CI, publish it to the approved registry, and record the immutable digest. On the VM, fetch the new source/config pack, review the rendered Compose configuration, run the explicit migration command, then recreate the app:

```sh
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml config --quiet
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml pull app
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml stop app
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml run --rm \
  -e RELEASE_COMMAND=1 app npm run db:deploy
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml up -d --no-build app caddy
docker image prune --filter 'until=168h'
```

Keep the previous digest and the database backup until the new health check, Telegram launch, Socket.IO reconnect, two-account call, recording, and admin login checks pass. Never use a mutable `latest` tag for staging acceptance.

## Backups and teardown

Back up before every migration and before expiring a trial VM. PostgreSQL is the authoritative state; copy recordings from R2 and the local recordings volume when a provider test used local egress:

```sh
mkdir -p /var/backups/pairtalk
docker compose --env-file infra/vm-staging/.env -f infra/vm-staging/compose.yaml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > /var/backups/pairtalk/pairtalk-$(date -u +%Y%m%dT%H%M%SZ).dump
docker run --rm -v pairtalk-vm-staging-recordings:/source -v /var/backups/pairtalk:/backup alpine \
  tar -czf /backup/recordings-$(date -u +%Y%m%dT%H%M%SZ).tgz -C /source .
```

Before stopping or deleting a free-trial VM, QA must: export PostgreSQL and any local recordings; confirm R2 recordings, retention metadata, and download authorization; stop bot polling; disable the staging DNS origin; revoke the staging bot, LiveKit, R2, admin, and database credentials; check for pending refunds and prepaid call/recording/storage credits; export the credit ledger and customer test fixtures; and record the final image digest and migration level. Then run `docker compose down` only after backups are verified. Do not use `down -v` until the exported data has been independently restored.

## QA checks and known boundaries

QA should review these exact files: `infra/vm-staging/compose.yaml`, `infra/vm-staging/Caddyfile`, `infra/vm-staging/.env.example`, and this document. Harmless validation from the repository root is:

```sh
check_dir="$(mktemp -d /tmp/pairtalk-vm-staging-check.XXXXXX)"
trap 'rm -rf "$check_dir"' EXIT
mkdir -p "$check_dir/infra/vm-staging"
cp infra/vm-staging/compose.yaml infra/vm-staging/Caddyfile infra/vm-staging/.env.example "$check_dir/infra/vm-staging/"
sed -i 's#REPLACE_WITH_VERIFIED_DIGEST#'"$(printf '0%.0s' {1..64})"'#' "$check_dir/infra/vm-staging/.env.example"
sed -i 's/REPLACE_WITH_CURRENT_CLOUDFLARE_CIDRS/203.0.113.0\/24/' "$check_dir/infra/vm-staging/.env.example"
cp "$check_dir/infra/vm-staging/.env.example" "$check_dir/infra/vm-staging/.env"
docker compose --env-file "$check_dir/infra/vm-staging/.env" \
  -f "$check_dir/infra/vm-staging/compose.yaml" config --quiet
```

The PostgreSQL URL is composed by Compose from the private values and intentionally has no Prisma-only `schema=public` query parameter because the same URL is consumed by the Go `pgx` pool. Generate `POSTGRES_PASSWORD` as URL-safe hex or base64url and use that value directly; do not use raw `@`, `:`, `/`, `?`, or `#` characters. This pack does not provision the VM, open its firewall, create DNS, configure Cloudflare Pages, create a LiveKit project, create an R2 bucket, or supply a fresh bot. It also does not change application behavior. A real staging run is incompatible with placeholder credentials, mutable image tags, missing Cloudflare CIDRs, a non-public API hostname, a LiveKit host without valid egress storage, or a frontend built with the wrong API origin.
