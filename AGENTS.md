# AGENTS.md

## Stack

- Next.js 16 App Router
- React 19
- TypeScript in strict mode
- Tailwind CSS
- Vitest + React Testing Library
- Playwright
- pnpm

The MVP is browser-local. Do not add authentication, analytics, a database, payments, email, or another state-management library unless the product requires it.

## Product invariants

The source of truth is an ordered list of explicit state-transition events:

- `work`
- `break`
- `stopped`

Never store generic toggle events. Never make interval rows the canonical data.

A visible session is derived from one non-stopped event and the timestamp of the next event. Therefore one boundary timestamp is shared by the end of one session and the start of the next.

Allowed transitions:

- no event -> work
- stopped -> work
- work -> break
- work -> stopped
- break -> work
- break -> stopped

Events must remain strictly chronological. Editing a boundary must preserve that ordering.

## UX rules

- No Pomodoro alarms or forced interruptions.
- The main action is one toggle between work and break.
- Switching modes automatically starts a fresh current session.
- Stop Day stops all accumulation.
- The session table shows Mode, Started, Ended, Duration, and Edit.
- Editing a session start edits the underlying transition timestamp, which automatically adjusts the previous session's end.
- Provide quick corrections for -5, -1, +1, and +5 minutes plus an exact date/time field.
- Keep keyboard operation, visible focus states, accessible names, and useful empty/error states.

## Commands

- `pnpm dev` — complete local app
- `pnpm build`
- `pnpm start`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm format`
- `pnpm format:check`
- `pnpm test`
- `pnpm test:watch`
- `pnpm test:e2e`
- `pnpm check`

## GitHub workflow

Every pull request must link a real tracking issue with a closing reference such as `Closes #123`. Do not merge while required checks are failing or pending.

The repository still needs a generated and committed `pnpm-lock.yaml` before frozen-lockfile CI is enabled. Do not add a fake lockfile or silently weaken CI to compensate.
