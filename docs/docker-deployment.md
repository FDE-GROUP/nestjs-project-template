# Docker Deployment Guide

This guide provides instructions for deploying the NestJS application using Docker and Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (version 20.10.0 or higher)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 2.0.0 or higher)

## Docker Configuration Files

The project includes the following Docker configuration files:

- `Dockerfile`: Defines the multi-stage build process for the application container
- `docker-compose.yml`: Configuration for running both the application and PostgreSQL in production
- `docker-compose.dev.yml`: Configuration for running only PostgreSQL for local development
- `.dockerignore`: Specifies which files should be excluded from the Docker build

## Development Environment

### Running PostgreSQL in Docker (Local Development)

If you want to run PostgreSQL in Docker while developing the application locally:

```bash
# Start PostgreSQL container
docker compose -f docker-compose.dev.yml up -d

# Check container status
docker ps

# View PostgreSQL logs
docker compose -f docker-compose.dev.yml logs -f postgres
```

With PostgreSQL running in Docker, update your `.env` file to connect to it:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_practice
```

> **Note**: The development PostgreSQL container exposes port `5432` with user/password `postgres`/`postgres`.

You can then run the NestJS application locally:

```bash
# Install dependencies
pnpm install

# Apply migrations (development)
pnpm run migration:run

# Start the application in development mode
pnpm run start:dev
```

### Stopping the Development Environment

```bash
# Stop and remove PostgreSQL container
docker compose -f docker-compose.dev.yml down

# To remove volumes as well (will delete all data)
docker compose -f docker-compose.dev.yml down -v
```

## Production Deployment

### Building the Docker Image

```bash
# Build the Docker image
docker build -t nestjs-app .

# Outside mainland China, use the official base image instead of the DaoCloud mirror:
# docker build --build-arg NODE_IMAGE=node:22-slim -t nestjs-app .
```

The image is a Node 22 (`node:22-slim`) multi-stage build: Corepack provides `pnpm` pinned by the
`packageManager` field, `pnpm install --frozen-lockfile` resolves dependencies from the npmmirror
registry (`.npmrc`, and `COREPACK_NPM_REGISTRY` for the pnpm tarball itself — Corepack does **not**
read `.npmrc`), and `pnpm run build` compiles `libs/core` before the app. The runtime stage keeps
`node_modules`, `dist`, `libs/core/dist` and the root/package `package.json` files (plus
`pnpm-workspace.yaml`) so that the `@core/saas-kit/…` bare handles still resolve through the workspace
link + `exports` map. It deliberately carries **no pnpm and no migration tooling** (the `scripts/mikro-migrate.ts` /
`mikro-migration-create.ts` runners need `tsx` and the TS sources absent from the runtime stage), so migrations
run outside the image (ops machine / CI).

> If the build dies inside the dependency stage with `getaddrinfo ENOTFOUND registry.npmmirror.com`,
> the base image pull succeeded but the `RUN` steps cannot resolve names — see
> [Build-time DNS resolution (WSL / Docker Desktop)](#build-time-dns-resolution-wsl--docker-desktop).

### Running with Docker Compose

```bash
# Start the application and PostgreSQL
docker compose up -d

# Check container status
docker ps

# View application logs
docker compose logs -f app

# View PostgreSQL logs
docker compose logs -f postgres
```

### Environment Variables

When deploying with Docker, the database connection string should be:

```
DATABASE_URL=postgres://postgres:postgres@postgres:5432/nestjs_practice
```

The shipped `docker-compose.yml` splits environment input into **two deliberately different channels**:

| 通道 | 内容 | 为何这样分 |
|---|---|---|
| `services.app.environment`（编排声明） | `DATA_RESIDENCY_ENFORCE=true`、`NODE_ENV`、`DATABASE_URL`、`PORT`、`DATA_RESIDENCY_DB_HOST_ALLOWLIST`，以及 8 项 `${VAR:?…}` 插值（`JWT_SECRET` / `JWT_REFRESH_SECRET` / `ALLOWED_ORIGINS` / `STORAGE_PROVIDER` / `STORAGE_REGION` / `STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY_ID` / `STORAGE_ACCESS_KEY_SECRET`） | 这些是 **Joi required** 或**驻留判定的输入事实**。它们必须在图上可见，否则同一张图在不同开发机上会得出相反的合规结论 |
| 挂载的 `./.env:/app/.env`（文件补缺） | 其余非决策键（mailer / OAuth / Stripe / 应用元数据等） | 仍由文件提供，但它们**改变不了**合规判定 |

Why the split matters: `@nestjs/config` assigns loaded `.env` keys into `process.env` **only when the key is not already set** ("可补缺、不可覆有"; the project does not enable `override`). So anything the compose file declares wins over the mounted file, and anything it *forgets* can be silently supplied — or overridden in the policy direction — by that file. Pinning `DATA_RESIDENCY_ENFORCE=true` in the orchestration is what keeps a stray `DATA_RESIDENCY_ENFORCE=false` in a developer's `.env` from downgrading a production `strict` boot to `warn`.

The `${VAR:?message}` values are interpolated by Compose from **the host project directory's own `./.env`** (loaded automatically) or your shell environment — no extra file is introduced and no extra copy of the secrets is made. Missing values fail **before** any container starts:

```bash
error while interpolating services.app.environment.[]: required variable STORAGE_REGION is missing a value: STORAGE_REGION is required by the deployment env
# exit code 1 —— up 之前就被拦住
```

Inspect what the graph will actually receive (renders the interpolation, no daemon needed):

```bash
docker compose config
```

**Reverse proxy (rate-limit trust chain):** when the app runs behind a reverse proxy (nginx, SLB, …), set `AUTH_TRUSTED_PROXIES` to the comma-separated CIDR list of the proxy network segment (e.g. `172.16.0.0/12,127.0.0.1`). Without it, Better Auth cannot resolve a trusted client IP in production and all users share a single rate-limit bucket, causing site-wide false lockouts on sign-in (see `docs/plans/module-auth-ip-trust.md`).

**Listen address:** the image sets `ENV HOST=0.0.0.0` in its runtime stage. This is deliberately an image-level default: the code falls back to `localhost` (correct for running on a host), and a container bound to loopback would make every published port **unreachable** (a **502 from the Docker proxy**, or a refused/reset connection when the port is forwarded through iptables — the symptom depends on the publishing path, but the app logs **never show the request**), so `docker-compose.yml` intentionally does **not** declare `HOST` — the Dockerfile is the single source of truth (enforced by `pnpm run verify:compose-contract`). When you `docker run` the image directly you therefore need no `-e HOST`; override it only if you truly want a narrower bind.

**Prerequisite — data residency guard (fail-closed):** `docker-compose.yml` sets `NODE_ENV=production`, which activates the strict check: boot is **refused** when the `DATABASE_URL` host or the storage region falls outside the mainland allowlist (`localhost`, RFC1918 addresses, `.cn` TLDs, Aliyun/Tencent Cloud endpoints — see `apps/api/src/config/data-residency.ts`).

One consequence is specific to this compose graph: the in-network database is addressed by its **service name `postgres`**, which is not a mainland pattern, so the shipped `docker-compose.yml` passes `DATA_RESIDENCY_DB_HOST_ALLOWLIST=postgres` — a *narrow* allowance for the in-graph host only, leaving every other strict check (storage region included) in force. If you host the database elsewhere, put the actual mainland hostname there (or drop the variable once your `DATABASE_URL` already matches a mainland pattern).

The template's `.env.example` ships a mainland-compliant storage block by default (`STORAGE_PROVIDER=alioss`, `STORAGE_REGION=oss-cn-hangzhou`, `oss-cn-hangzhou.aliyuncs.com`); the `s3` / `us-east-1` lines exist only as commented alternatives. If you uncomment them, `docker compose up -d` exits with `Data residency violation, refusing to boot` — that is intended behaviour, not a broken image. Point storage at a mainland-resident endpoint instead.

Do **not** use `DATA_RESIDENCY_ENFORCE=false` as a routine way to make the graph start: it disables the whole compliance guard rather than the one host that needs allowing. The shipped `docker-compose.yml` pins `DATA_RESIDENCY_ENFORCE=true` precisely so that no mounted file can turn the guard off; leave that line in place. Reserve `false` for a genuinely local, throw-away verification run passed on the command line (`docker run -e DATA_RESIDENCY_ENFORCE=false …`), and never ship it in `docker-compose.yml` (also enforced by `pnpm run verify:compose-contract`).

**Health check:** the image `HEALTHCHECK` probes `GET /api/v1/health` with Node's built-in `fetch` — `node:*-slim` ships **neither `wget` nor `curl`**, so a shell-probe style check would keep the container permanently `unhealthy`.

### Accessing the Application

The application will be available at http://localhost:7009.

### Stopping the Application

```bash
# Stop and remove containers
docker compose down

# Stop and remove containers and volumes (will delete all data)
docker compose down -v
```

## Container Management

### Viewing Logs

```bash
# View application logs
docker logs -f nestjs-app

# View PostgreSQL logs
docker logs -f postgres
```

### Entering Containers

```bash
# Access the application container shell
docker exec -it nestjs-app sh

# Access the PostgreSQL shell (development)
docker exec -it postgres-dev psql -U postgres

# Access the PostgreSQL shell (production)
docker exec -it postgres psql -U postgres
```

### Checking Container Health

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' nestjs-app
```

## Data Management

### PostgreSQL Data Persistence

PostgreSQL data is stored in a Docker volume named `postgres-data`. This ensures that your data persists even if the container is removed.

### Backup and Restore

```bash
# Backup PostgreSQL data
docker exec -it postgres sh -c 'pg_dump -U postgres nestjs_practice' > postgres-backup.sql

# Restore PostgreSQL data
docker exec -i postgres sh -c 'psql -U postgres -d nestjs_practice' < postgres-backup.sql
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: If port 7009 or 5432 is already in use, you can change the port mapping in the `docker-compose.yml` file.

2. **Connection issues**: If the application cannot connect to PostgreSQL, ensure the `DATABASE_URL` is set correctly to `postgres://postgres:postgres@postgres:5432/nestjs_practice` in the application container.

3. **Permission issues**: If you encounter permission errors with volumes, you might need to run Docker commands with sudo or adjust the file permissions.

4. **`i18n 资产根解析失败` at startup (fail-closed)**: the i18n loader and the mailer resolve a single assets root and **refuse to boot** when the translation data (`zh/en/ja` + `emails/*.mjml`) is missing from the image — this is intentional (the alternative was silently returning raw keys and failing only when sending mail). It means the build did not copy the assets: check the `nest-cli.json` `assets` entries, rebuild with `pnpm run build`, and verify with `pnpm run verify:i18n-assets` (expects `i18n assets PASSED`).

5. **`docker build` fails on a working host (`getaddrinfo ENOTFOUND registry.npmmirror.com`)**: the build itself never started resolving — see [Build-time DNS resolution (WSL / Docker Desktop)](#build-time-dns-resolution-wsl--docker-desktop) below.

6. **`error while interpolating …: required variable X is missing a value`**: Compose fails **before** any container starts, so this is neither an image nor an application problem. `X` must come from the host project directory's own `./.env` (loaded automatically for interpolation) or your shell environment. Check the rendered graph with `docker compose config`, and do not push these keys back into the mounted file — see [Environment Variables](#environment-variables) for the two-channel split.

### Build-time DNS resolution (WSL / Docker Desktop)

Symptom: `docker build` dies inside the dependency stage with
`Error when performing the request to https://registry.npmmirror.com/pnpm/<version>` →
`getaddrinfo ENOTFOUND`, even though `docker pull` and a host-side `pnpm install` both work. This is
**not** a Dockerfile defect and **not** “no internet”: there are three separate network stacks in play
and only one of them is broken.

| Layer | What it covers | Typical state on a broken WSL box |
|-------|----------------|-----------------------------------|
| Docker **daemon** (VM) | `docker pull`, image resolution | Works — Docker Desktop injects a hub proxy + registry mirrors of its own |
| Build **`RUN` steps** | `corepack` fetching the pnpm tarball (`COREPACK_NPM_REGISTRY`), `pnpm install` (`.npmrc`) | **Broken** — these containers use the VM's DNS, which does not benefit from the daemon's hub proxy or mirrors |
| Host shell (WSL) | `pnpm install`, `curl` | Works **misleadingly** — often via a local HTTP proxy in `http_proxy`/`https_proxy`, which resolves names remotely, while the WSL nameserver itself is dead |

Probe each layer separately before changing anything (a successful `curl` on the host proves nothing
about a container):

```bash
# 1) host: is the configured nameserver answering at all?
node -e "require('dns').lookup('registry.npmmirror.com',(e,a)=>console.log(e?e.code:a))"
# 2) VM/container side: can a build step resolve it?
docker run --rm node:22-slim node -e "require('dns').lookup('registry.npmmirror.com',(e,a)=>console.log(e?e.code:a))"
# 3) daemon: image pulls are a different path and may succeed while 2) fails
docker pull docker.m.daocloud.io/library/node:22-slim
```

Three ways forward, in order of preference:

1. **Fix the VM DNS (permanent, no repository change).** Docker Desktop → Settings → Docker Engine,
   add to `daemon.json`:

   ```json
   { "dns": ["223.5.5.5", "114.114.114.114"] }
   ```

   The Settings editor writes this into the daemon.json next to the CLI config (on Windows:
   `%USERPROFILE%\.docker\daemon.json`), which normally already holds `registry-mirrors` — **merge** the
   `dns` key, do not overwrite the file. The change only takes effect after the engine restarts, and
   restarting it interrupts every running container, so plan for it rather than doing it mid-task.

   Outbound connectivity from the VM is usually already fine — only resolution is broken, so this alone
   makes a plain `docker build` get **past the `ENOTFOUND` dead end**. It does not immunise the build from
   registry latency: see [`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` on a healthy lockfile](#err_pnpm_minimum_release_age_violation-on-a-healthy-lockfile).
   Fixing WSL's own resolver (`[dns] generateResolvConf=false` in
   `/etc/wsl.conf` plus an explicit `nameserver`) helps the host but **does not** help build steps.

   Verified on this machine after the engine restart: containers inherit the two resolvers in
   `/etc/resolv.conf`, `registry.npmmirror.com` resolves from inside a build, and a plain `docker build`
   (default builder, no extra flags) runs this repository's `Dockerfile` end to end with exit code 0.
   Option 2 is therefore only worth keeping where a restart would interrupt other projects' containers.

2. **Persistent builder with its own DNS (no machine config, no restart — set up once, then plain builds).**

   ```bash
   # one-time
   docker network create buildkit-dnsnet
   docker run -d --name bkdns --privileged --restart unless-stopped \
     --dns 223.5.5.5 --dns 114.114.114.114 -p 12345:1234 \
     --network buildkit-dnsnet moby/buildkit:latest --addr tcp://0.0.0.0:1234
   docker buildx create --name vm-dns --driver remote tcp://127.0.0.1:12345

   # day-to-day (note `--load`: a remote builder does not populate the local image store on `-t` alone)
   docker build --builder vm-dns --load -t nestjs-app .
   ```

   This leaves the `default` (docker) builder untouched, so anything not needing network at build time
   keeps its normal behaviour. `--restart unless-stopped` plus the buildx registration in
   `~/.docker/buildx` survive an engine restart, so the one-time block really is one-time.
   Verified on this repository's own `Dockerfile`: Corepack fetched the pinned
   pnpm tarball and `pnpm install` started resolving against npmmirror — i.e. the previously fatal step was
   cleared — and the remaining failures came from registry latency, not from resolution.

   If you prefer a throwaway run instead, keep these two facts in mind:

   ```bash
   docker run -d --name buildkit --privileged --dns 223.5.5.5 --dns 114.114.114.114 \
     -p 12345:1234 moby/buildkit:latest --addr tcp://0.0.0.0:1234
   docker buildx create --name bypass --driver remote tcp://127.0.0.1:12345 --use
   docker buildx build --output type=docker,dest=/tmp/app.tar -t nestjs-app .
   docker load -i /tmp/app.tar
   ```

   Use `type=docker`, **not** `type=tar`: the latter is a filesystem tar which `docker load` rejects
   (`invalid archive: does not contain a manifest.json`) and which `docker import` degrades by dropping
   `HEALTHCHECK` / `ENV` / `CMD`. Note the remote driver accepts only a URL — `name:/run/buildkit/buildkitd.sock`
   fails with “unrecognized url scheme”. Teardown order matters: remove the containers that are still
   attached before `docker network rm`, otherwise the removal fails silently.

3. **Route the build through an existing local proxy (one-off verification only).** Node's global
   `fetch` ignores proxy variables unless told otherwise, so both pieces are required:

   ```bash
   docker build --build-arg HTTPS_PROXY=http://host.docker.internal:<proxy-port> ...
   # plus, inside the build environment: ENV NODE_USE_ENV_PROXY=1
   ```

   (`pnpm` itself reads `https_proxy`; only the Corepack fetch needs the flag.) This is deliberately
   **not** baked into the `Dockerfile`: it encodes the machine-specific fact that a proxy is listening
   locally, which a template must not assume — consistent with `docs/specs/tooling-standards.md` §4.10,
   where the acceptance criterion is a real run of the shipped declarations, not a per-workstation workaround.

### `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` on a healthy lockfile

Second, independent failure mode observed **after** resolution was fixed. The dependency stage dies with:

```text
✗ Lockfile failed supply-chain policy check (975 entries in 11m 36s)
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 21 lockfile entries failed verification:
  @babel/parser@7.29.9 could not be checked against minimumReleaseAge
    (GET https://registry.npmmirror.com/@babel%2Fparser: The operation was aborted due to timeout)
…
The lockfile contains entries that the active policies reject. This can mean the lockfile is stale,
or that someone committed a lockfile that bypassed the policy.
```

Read the last two lines as **misleading**: the operative words are `could not be checked … aborted due to
timeout`. The repository sets no such policy (`minimumReleaseAge` appears in none of `pnpm-workspace.yaml` /
`.npmrc` / `package.json`, and host-side `pnpm config get minimumReleaseAge` is `undefined`), so this is
pnpm 11's built-in supply-chain check — and it **fails closed when registry metadata cannot be fetched**,
reporting an unreachable registry as a rejected lockfile.

**Do not "fix" this by regenerating `pnpm-lock.yaml`** — that would rewrite a healthy lockfile to appease
a transient network error (and is a schema/supply-chain change requiring sign-off anyway). The check needs
metadata for every entry, so a slow mirror (single requests observed at 60+ s) plus retries exhausts the
timeout budget. Dispositions, in order: retry at a quieter hour or with a reachable registry
(`--build-arg` is not enough — the registry comes from `.npmrc`); raise the fetch timeout budget
(`fetchTimeout` / `fetchRetries`) for the build environment; or run the install outside the image and feed
the store through the existing cache mount. The distinguishing signature is in the error text:
`getaddrinfo ENOTFOUND` = resolution (previous section), `aborted due to timeout` = latency (this section).

### Viewing Container Logs for Debugging

```bash
# View detailed container logs
docker logs -f nestjs-app
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image Documentation](https://hub.docker.com/_/postgres) 