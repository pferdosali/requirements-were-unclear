# Contributing to DocBridge

Thanks for contributing. This guide covers how we work: branching, local setup, testing, and the
documentation split.

## Documentation split

We separate **collaboration docs** from **software docs**:

- **Business & engineering collaboration docs** live as Markdown in `docs/` and are the source of
  truth. They are exported to `.docx` (`docs/generated/`) for sharing in Google Docs:
  - `docs/blueprint/` — business-facing Blueprint (PAS-001).
  - `docs/tech-spec/` — granular Technical Specification.
  - `docs/adr/` — Architecture Decision Records (one file per decision).
- **Software docs** live in the repo as standard GitHub docs: this `CONTRIBUTING.md`, the root
  `README.md`, `docs/architecture.md`, and `docs/runbook.md`.

Edit the `.md`; never hand-edit the `.docx`. Regenerate exports with:

```bash
scripts/build-docs.sh      # requires pandoc (a static binary in ~/.local/bin works)
```

## Branching & PRs

- Work on a feature branch off `main`: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Open a PR. Do **not** push directly to `main` or `dev`.
- **Environments follow branches:** merge to `dev` deploys to the Dev environment; merge to
  `main` deploys to Prod behind a manual approval gate (see ADR-0011 and `docs/runbook.md`).
- Keep PR titles concise (conventional commits style: `feat:`, `fix:`, `docs:`, `chore:`).

## Local setup

```bash
# API + in-process worker (TypeScript)
cd implementation/api
npm ci
npm run dev            # Express on :3000
npm run dev:worker     # SQS consumer (optional)

# Frontend (React + Vite)
cd implementation/frontend
npm ci      # or pnpm install
npm run dev

# Infrastructure (AWS CDK)
cd implementation/infra
npm ci
npx cdk synth -c env=dev
```

## Before you open a PR (definition of done)

Run, for anything you touched:

```bash
cd implementation/api && npx tsc --noEmit && npm test
cd implementation/infra && npx tsc --noEmit && npx cdk synth -c env=dev --quiet
```

- Tests and typecheck pass.
- No secrets committed (use Secrets Manager / env; commit `*.template` files, never real values).
- Docs updated if behavior changed; ADR added for any real decision (use the template in
  `docs/adr/README.md`).
- `AGENT_MEMORY.md` handoff updated if you changed project state (the `session-memory` skill does
  this).

## Code conventions

- TypeScript throughout. Match existing style in each package.
- API structure: `routes/` (HTTP), `services/` (logic), `worker/` (async), `middleware/`,
  `logging/`, `db/`. Keep HTTP handlers thin; put logic in services.
- Structured logging with correlation IDs; never log document contents or secrets.
