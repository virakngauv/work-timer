# Work Timer

A flexible work/break timer for people who want awareness without Pomodoro-style interruptions.

The app tracks three things at a glance:

- **Today's Work** — total focused time for the current workday.
- **Current Session / Current Break** — time since the most recent mode switch.
- **Break Today** — total break time for the current workday.

The primary control is a single toggle: **Switch to Break** while working and **Back to Work** while on break. Every switch creates an explicit state-transition event and starts a fresh current session. **Stop Day** stops all accumulation.

## Why this exists

A fixed 25-minute alarm can interrupt useful flow. This tool does not tell you when to stop. It gives you enough information to decide:

- 40 minutes into a productive session might be a natural time to pause.
- 8 minutes into a session might encourage you to keep going.
- 2 minutes into a break might remind you that it is fine to relax a little longer.

The detailed product behavior, correction workflow, and data model are documented in [docs/product-spec.md](docs/product-spec.md), [docs/data-model.md](docs/data-model.md), and [docs/ui-spec.md](docs/ui-spec.md).

## Architecture

The first implementation is intentionally local-first:

- Next.js App Router + React + strict TypeScript
- Tailwind CSS
- Browser IndexedDB for the MVP
- Explicit state-transition events as the canonical data
- Derived work/break intervals for display and totals
- Vitest + React Testing Library for unit/component tests
- Playwright for browser tests

A backend is not required for a single-device personal timer. If multi-device sync or accounts become necessary, the planned persistence path is Convex; see [docs/data-model.md](docs/data-model.md).

## Local setup

Requirements:

- Node.js 24 LTS
- pnpm 12.6

Install dependencies:

    corepack enable
    pnpm install

The committed `pnpm-lock.yaml` pins the exact dependency set, and CI installs with `--frozen-lockfile`. Regenerate it only through a real `pnpm install`; never hand-edit it.

Start the app:

    pnpm dev

By default development binds to loopback. For trusted LAN testing:

    DEV_LAN=true pnpm dev

If the requested port is busy, the dev script probes the next ports (up to ten) and logs the one it picked; set `PORT` to start elsewhere.

## Commands

    pnpm dev
    pnpm build
    pnpm start
    pnpm lint
    pnpm typecheck
    pnpm format
    pnpm format:check
    pnpm test
    pnpm test:watch
    pnpm test:e2e
    pnpm check

## Persistence

The MVP stores workday metadata and individual transition events in browser IndexedDB. Clearing site data clears timer history. This is deliberate for the first version; no account, hosted database, or paid service is required.

Every timer action and boundary edit runs in one IndexedDB `readwrite` transaction that reads the latest event history, validates the explicit action, and writes only the resulting event change. Overlapping write transactions are serialized by IndexedDB, so cooperating tabs do not rely on cached React state or localStorage visibility for correctness. Repeated requests for the current mode do nothing; incompatible stale requests show an error.

A BroadcastChannel only tells other tabs to reread IndexedDB so their UI stays current. Tabs also reread when opened or returned to, so missed notifications do not affect correctness. Existing valid `work-timer:v1` localStorage data is migrated once; malformed legacy data is preserved and reported instead of being replaced.

## Repository setup status

The code, documentation, tests, and project configuration are scaffolded. The lockfile is committed and CI runs quality checks, the production build, Playwright e2e on all three engines, CodeQL, and linked-issue validation. See [docs/setup-status.md](docs/setup-status.md).
