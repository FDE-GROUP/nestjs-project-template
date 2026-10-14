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
bun install

# Apply schema (development)
bun drizzle:push

# Start the application in development mode
bun start:dev
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
```

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

Other environment variables can be set in `.env` file or configured in the `docker-compose.yml` file.

**Reverse proxy (rate-limit trust chain):** when the app runs behind a reverse proxy (nginx, SLB, …), set `AUTH_TRUSTED_PROXIES` to the comma-separated CIDR list of the proxy network segment (e.g. `172.16.0.0/12,127.0.0.1`). Without it, Better Auth cannot resolve a trusted client IP in production and all users share a single rate-limit bucket, causing site-wide false lockouts on sign-in (see `docs/plans/module-auth-ip-trust.md`).

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

### Viewing Container Logs for Debugging

```bash
# View detailed container logs
docker logs -f nestjs-app
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image Documentation](https://hub.docker.com/_/postgres) 