---
name: session-memory
description: Keep AGENT_MEMORY.md current for the DocBridge repo. Use at the END of every session (assume the session can end at any moment), and read it at the START of a session to get up to speed. Trigger whenever meaningful work is done, decisions are made, branch/state changes, or the user says to wrap up.
---

# Skill: session-memory

Maintain `AGENT_MEMORY.md` at the repository root as the durable, self-sufficient memory for the
DocBridge project so any future session can get fully up to speed from it alone.

## When to run
- **Start of session:** read `AGENT_MEMORY.md` before doing anything else.
- **End of session, and opportunistically after any meaningful change:** update it. Do not wait
  for a clean "end" — the session may terminate abruptly.

## What to update (keep it truthful and code-grounded)
Verify claims against the code/AWS, not memory. Then update these sections of `AGENT_MEMORY.md`:

1. **Ground truth (§2):** if architecture, endpoints, limits, or live-AWS facts changed, correct
   them. Cite the file (e.g. `src/services/delivery-service.ts`) so it stays verifiable.
2. **Current branch / work in flight (§5):** current branch, what's done, what's next.
3. **Open decisions (§6):** add/close ADR-linked open items.
4. **Handoff log (§8):** prepend a dated entry — **Done / Next / Blockers**, ~3 lines. Newest first.
5. **Last updated** date at the top.

## How to update
- Prefer targeted edits (`strReplace`) over rewriting the whole file.
- Never write secrets (keys, tokens, passwords, client secrets). Reference by name or masked
  suffix only.
- If a verification step was blocked (e.g. no AWS creds), say so explicitly in the handoff rather
  than leaving it silently unverified.

## Quick verification commands
```bash
git status -sb
cd implementation/api && npx tsc --noEmit && npm test
cd implementation/infra && npx cdk synth --quiet
aws sts get-caller-identity
```

## Definition of done for this skill
- `AGENT_MEMORY.md` reflects the true current state.
- A fresh agent could read only `AGENT_MEMORY.md` and know what the project is, what's built,
  what branch is active, what's next, and what decisions are open.
