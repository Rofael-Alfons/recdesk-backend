# RecDesk AI Backend

NestJS backend for RecDesk AI - a hiring intelligence platform for the Egyptian/MENA market.

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Docker (for local Redis)

## Quick Start

```bash
# Install dependencies
npm install

# Start local services (Redis)
docker-compose up -d

# Run database migrations
npx prisma migrate dev

# Start development server
npm run start:dev
```

## Environment Setup

1. Copy `.env.example` to `.env`
2. Update values for your local setup

## Local Services (Docker)

The `docker-compose.yml` provides Redis for local development:

```bash
# Start Redis
docker-compose up -d

# Stop Redis
docker-compose down

# View logs
docker-compose logs -f redis
```

## Redis Configuration

Redis is **optional** - the app gracefully falls back to in-memory cache and synchronous processing when Redis is not available.

### Local Development

1. Start Redis with Docker:
   ```bash
   docker-compose up -d
   ```

2. Ensure these are set in `.env`:
   ```env
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

### Production (Railway)

Railway auto-injects `REDIS_URL` when you add a Redis addon:

1. Go to your Railway project dashboard
2. Click **"New"** -> **"Database"** -> **"Redis"**
3. Railway automatically sets `REDIS_URL` in your backend service
4. No code changes needed - the backend auto-detects `REDIS_URL`

### Without Redis

If neither `REDIS_URL` nor `REDIS_HOST` is set:
- Caching falls back to in-memory cache
- Queue processing runs synchronously
- App works fully, just without distributed caching/queues

## Scripts

```bash
# Development
npm run start:dev      # Start with hot-reload

# Production
npm run build          # Build for production
npm run start:prod     # Run production build

# Database
npx prisma migrate dev # Run migrations (dev)
npx prisma generate    # Regenerate Prisma client

# Testing
npm run test           # Unit tests
npm run test:e2e       # E2E tests
```

## API Documentation

When running locally, Swagger docs are available at:
- http://localhost:3000/api/docs

## Health Checks

- `GET /health/live` - Liveness probe (is the server running?)
- `GET /health/ready` - Readiness probe (are dependencies connected?)

## Project Structure

```
src/
├── auth/              # Authentication (JWT, refresh tokens)
├── candidates/        # Candidate management & CV processing
├── companies/         # Company/organization management
├── jobs/              # Job posting management
├── integrations/      # Gmail/Outlook OAuth integrations
├── ai/                # AI service (Groq/OpenAI)
├── queue/             # Bull queue processors
├── cache/             # Redis/in-memory caching
├── billing/           # Stripe subscription management
└── common/            # Shared utilities, guards, filters
```
