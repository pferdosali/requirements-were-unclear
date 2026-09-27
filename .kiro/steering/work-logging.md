---
inclusion: always
---

# Work Logging Rule

Every working session MUST be documented in realtime in a file called `WORK_LOG.md`
in the current working directory. This applies to every task, every session.

## What to log

For each meaningful action, append an entry that records:

- **Command / action** — the exact command run or the operation performed.
- **Rationale** — why this action was taken.
- **Result** — the observed output or outcome (summarize long output; never paste secret values).

## How to log

- Create `WORK_LOG.md` at the start of a session if it does not already exist.
- Append entries as you go — do NOT wait until the end of the task.
- Group entries under a dated session header (e.g. `## Session: YYYY-MM-DD (topic)`).
- Finish each session with a concise **Summary of Findings** table or list.

## Safety

- Never write secret values (access keys, secret keys, tokens, passwords) into the log.
  Reference credentials by key name or masked suffix (e.g. `...VRU6`) only.
- Treat `WORK_LOG.md` as a shareable artifact — assume it may be committed or read by others.
