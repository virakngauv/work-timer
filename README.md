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
- Browser localStorage for the MVP
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

Then commit the generated `pnpm-lock.yaml`. This repository intentionally does not contain a fabricated lockfile; the first real install should generate it from the selected package versions.

Start the app:

    pnpm dev

By default development binds to loopback. For trusted LAN testing:

    DEV_LAN=true pnpm dev

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

The MVP stores a single workday event stream in browser localStorage. Clearing site data clears timer history. This is deliberate for the first version; no account, hosted database, or paid service is required.

## Repository setup status

The code, documentation, tests, and project configuration are scaffolded. A lockfile and CI should be finalized after the first dependency install. See [docs/setup-status.md](docs/setup-status.md).
