# Setup status

## Completed in the initial scaffold

- Product requirements and workflow documentation
- Explicit transition-event data model
- Session history and boundary-editing UX specification
- Next.js/React/TypeScript application scaffold
- Tailwind styling
- Local browser persistence
- Pure timer-domain utilities
- Unit/component test scaffolding
- Playwright browser test scaffolding
- pnpm scripts
- Node/pnpm version declarations
- Repository-specific AGENTS.md
- Environment example

## Completed after the first local install (issue #1)

- Generated `pnpm-lock.yaml` from a real dependency resolution (Node 24.21.0, pnpm 12.6.0 via corepack)
- Local verification: `pnpm check` (format, lint, typecheck, Vitest, production build) and `pnpm test:e2e`
- GitHub Actions workflows:
  - Quality and build with `pnpm install --frozen-lockfile` (`.github/workflows/ci.yml`)
  - Playwright e2e matrix on Chromium, Firefox, and WebKit (`.github/workflows/ci.yml`)
  - Linked-issue validation for pull requests (`.github/workflows/check-linked-issue.yml`)
  - CodeQL for JavaScript/TypeScript (`.github/workflows/codeql.yml`)
- Weekly Dependabot updates for GitHub Actions and npm dependencies (`.github/dependabot.yml`)
- All actions pinned to verified commit SHAs

## First local setup

    corepack enable
    pnpm install
    pnpm exec playwright install

Then run `pnpm check` and `pnpm test:e2e`.

## Repository settings (not checked in)

Branch protection, rulesets, required checks, and remote secrets must be configured explicitly in GitHub settings; checked-in workflow files alone do not enforce them. Require the CI, E2E, CodeQL, and Check linked issue jobs to pass before merge.
