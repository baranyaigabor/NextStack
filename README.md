# Fullstack Starter

A cloneable TypeScript foundation: Next.js, NestJS, PostgreSQL/Drizzle, Better
Auth, Redis/BullMQ, Docker, and optional provider integrations.

```bash
./start.sh
```

The initializer creates a private `.env`, unique secrets and clone identity,
selects free local ports, and preserves existing configuration. Each initialization
checks the latest stable cloudflared release and refreshes its development and
production image pins with the Docker registry digest. If the lookup fails, setup
warns and keeps the existing pins; rerun `pnpm project:init` to retry. Docker starts the
core services, runs serialized migrations, and starts the applications. The
usual application URL is <http://localhost:8080>; setup prints the actual URL.
`./start.sh` also enables the System Stats agent and opens its account-pairing
page. The agent requires a separate System Stats account and Docker-socket access.

- Email/password accounts, configurable social login, profile editing and uploads
- Local Mailpit email and SeaweedFS S3 storage without cloud credentials
- Optional SES, R2/S3, Stripe, Turnstile, Meilisearch, and ClamAV
- Clone-specific containers, data volumes, and authentication cookies
- Feature-aware UI, shared validated contracts, CORS/origin configuration
- Signed Stripe webhooks, transactional deduplication and a payment ledger
- Retry/retention defaults for background jobs and explicit worker failures
- Correlated redacted JSON logs, stable client errors, and optional OpenTelemetry
- System Stats host/container monitoring agent via `start.sh` (separate cloud account)
- Controlled migrations and backup/restore commands
- Pinned container digests, root lint/type/format checks, and GHCR release workflow
- Isolated integration and Playwright browser tests with CI reports and cleanup
- Automatic optional Cloudflare tunnel/DNS provisioning

Keep product code in `frontend/src`, `backend/src`, and `shared/src`.
Environment settings choose deployment/integrations; provider account setup and
product-specific rules still belong to each product.

```bash
pnpm verify
pnpm audit --audit-level high
pnpm project:doctor
pnpm dev:rebuild
pnpm dev:down
```

Read [Getting started](./GETTING_STARTED.md), [Database lifecycle](./docs/DATABASE.md),
[Billing and jobs](./docs/BILLING.md), [Releases](./docs/RELEASES.md),
[Testing](./docs/TESTING.md),
[Observability](./docs/OBSERVABILITY.md),
[Template updates](./docs/TEMPLATE_UPDATES.md),
[API contract](./docs/API_CONTRACT.md), [Feature inventory](./docs/FEATURES.md),
[Audit](./docs/AUDIT.md), and [Improvement ideas](./docs/IMPROVEMENTS.md).
[Native foundation](./docs/NATIVE.md) provides a static bundle and native session/
callback contracts for [Electron desktop](./docs/ELECTRON.md). The separate
[Expo app](./docs/EXPO.md) provides a React Native starting point for iOS,
Android, and web with the same backend account system.
