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

## Required first local setup

Run:

    corepack enable
    pnpm install

Then commit the generated `pnpm-lock.yaml`.

The lockfile is intentionally not hand-written. It should reflect a real dependency resolution.

After that, run:

    pnpm check
    pnpm exec playwright install
    pnpm test:e2e

## CI follow-up

Do not enable a frozen-lockfile CI workflow until the real lockfile exists. Once it is committed, add GitHub Actions jobs for:

- linked issue validation
- formatting / lint / typecheck / Vitest / production build
- Playwright on Chromium, Firefox, and WebKit
- CodeQL for JavaScript/TypeScript
- weekly Dependabot updates

Pin third-party actions to verified commit SHAs. Require passing checks before merge.

Repository settings such as branch protection/rulesets and remote secrets should be configured explicitly rather than assumed from checked-in files.
