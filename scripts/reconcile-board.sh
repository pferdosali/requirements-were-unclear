#!/usr/bin/env bash
#
# reconcile-board.sh — close completed epic issues and the stale deployment PR.
#
# WHY THIS SCRIPT EXISTS:
#   These epics are all complete and live on AWS (see PROJECT_OVERVIEW.md /
#   STATUS.generated.md), but the GitHub issues + PR #21 are still open. The
#   agent's fine-grained PAT is READ-ONLY for the Issues/Pull-requests API
#   (`gh issue/pr close` -> "Resource not accessible by personal access token"),
#   so this must run under YOUR auth.
#
# REQUIREMENTS:
#   A gh token with "Issues: write" and "Pull requests: write" on this repo.
#   Check with:  gh auth status
#   If needed:   gh auth login   # or a fine-grained PAT with those permissions
#
# USAGE:
#   ./reconcile-board.sh          # do it
#   ./reconcile-board.sh --dry    # just print what it would do
#
# Safe: closing issues/PRs is reversible (they can be reopened).

set -euo pipefail

REPO="pferdosali/requirements-were-unclear"
DRY=0
[ "${1:-}" = "--dry" ] && DRY=1

# Completed epics (verified live/merged). Kept as number:label for the comment.
declare -A EPICS=(
  [1]="Authentication & User Access"
  [2]="File Upload & S3 Storage"
  [4]="Queue-Based Processing"
  [5]="Worker Execution & Retry"
  [6]="Destination Routing"
  [7]="Status Tracking UI"
  [8]="Audit Logging & Observability"
  [10]="CI/CD and Deployment"
)

ISSUE_COMMENT="Completed and deployed to AWS (us-east-1). Verified live — see PROJECT_OVERVIEW.md and STATUS.generated.md on main. Closing as done."
PR_COMMENT="Closing: Epic #10 CI/CD + deployment is merged into main and live on AWS (ECS Fargate API + Worker, CloudFront, 8 CDK stacks). Superseded by current main."

run() { if [ "$DRY" -eq 1 ]; then echo "DRY: $*"; else echo "+ $*"; "$@"; fi; }

echo "==> Closing completed epic issues..."
for n in $(printf '%s\n' "${!EPICS[@]}" | sort -n); do
  echo "-- Issue #$n (${EPICS[$n]})"
  run gh issue close "$n" --repo "$REPO" --comment "$ISSUE_COMMENT"
done

echo
echo "==> Closing stale deployment PR #21..."
run gh pr close 21 --repo "$REPO" --comment "$PR_COMMENT"

echo
echo "==> Done. Remaining open issues/PRs:"
gh issue list --repo "$REPO" --state open
gh pr list --repo "$REPO" --state open
