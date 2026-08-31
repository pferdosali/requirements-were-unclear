#!/usr/bin/env bash
#
# status.sh — Generate a TRUTHFUL project status by querying live systems.
#
# This script derives status from reality (git, GitHub, AWS, live HTTP probes)
# rather than hand-written prose that drifts. Run it at the start of a session
# to get up to speed, and at the end of a session to record true state.
#
# Usage:
#   ./scripts/status.sh            # print report to stdout AND write STATUS.generated.md
#   ./scripts/status.sh --stdout   # print only, do not write the file
#
# Requirements (all optional — script degrades gracefully if a tool is missing
# or credentials are unavailable, and clearly labels what it could not check):
#   - git
#   - gh   (GitHub CLI, authenticated)
#   - aws  (AWS CLI v2, with the profile below)
#   - curl
#
# Safe to run anytime: it is READ-ONLY. It never modifies AWS or git state.

set -uo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — the only place with project-specific values. Update here if infra
# names change. Everything below is derived automatically.
# ─────────────────────────────────────────────────────────────────────────────
REPO="pferdosali/requirements-were-unclear"
AWS_REGION="us-east-1"
AWS_PROFILE="dev"
AWS_ACCOUNT="930330383608"
ECS_CLUSTER="docbridge"
CLOUDFRONT_DIST_ID="EYJ0TF0EM7LS3"
FRONTEND_URL="https://dk9dmvpe7a2yb.cloudfront.net"
HEALTH_PATH="/api/health"          # expected 401 (auth-guarded) when healthy-but-unauthenticated
MOCK_DEST_URL="https://6nn7dftjsk.execute-api.us-east-1.amazonaws.com/prod/upload"
API_DIR="implementation/api"
OUTPUT_FILE="STATUS.generated.md"

# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────
WRITE_FILE=1
[ "${1:-}" = "--stdout" ] && WRITE_FILE=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || exit 1

have() { command -v "$1" >/dev/null 2>&1; }
aws_q() { aws --region "$AWS_REGION" --profile "$AWS_PROFILE" "$@" 2>/dev/null; }

OUT=""
emit() { OUT+="$1"$'\n'; }

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ─────────────────────────────────────────────────────────────────────────────
# Header
# ─────────────────────────────────────────────────────────────────────────────
emit "# DocBridge — Generated Status"
emit ""
emit "> **AUTO-GENERATED — do not edit by hand.** Regenerate with \`./scripts/status.sh\`."
emit "> This report is derived from live systems (git, GitHub, AWS, HTTP probes),"
emit "> so it reflects reality at generation time, not aspirations."
emit ""
emit "**Generated:** \`$NOW\` (UTC)"
emit ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. Git / source-of-truth state
# ─────────────────────────────────────────────────────────────────────────────
emit "## 1. Repository State (git)"
emit ""
if have git && [ -d .git ]; then
  git fetch origin --quiet 2>/dev/null
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  HEAD_LINE="$(git log -1 --format='%h — %s (%ci)' 2>/dev/null)"
  AHEAD_BEHIND="$(git rev-list --left-right --count origin/main...HEAD 2>/dev/null || echo '? ?')"
  BEHIND="$(echo "$AHEAD_BEHIND" | awk '{print $1}')"
  AHEAD="$(echo "$AHEAD_BEHIND" | awk '{print $2}')"
  DIRTY="$(git status --porcelain 2>/dev/null)"
  UNTRACKED="$(git status --porcelain 2>/dev/null | grep -c '^??')"

  emit "| Field | Value |"
  emit "|-------|-------|"
  emit "| Current branch | \`$BRANCH\` |"
  emit "| HEAD | $HEAD_LINE |"
  emit "| Commits ahead of origin/main | $AHEAD |"
  emit "| Commits behind origin/main | $BEHIND |"
  emit "| Uncommitted changes | $([ -z "$DIRTY" ] && echo 'none ✅' || echo "$(echo "$DIRTY" | wc -l | tr -d ' ') file(s) ⚠️") |"
  emit "| Untracked files | $([ "$UNTRACKED" -eq 0 ] && echo 'none ✅' || echo "$UNTRACKED ⚠️") |"
  emit ""
  if [ -n "$DIRTY" ]; then
    emit "<details><summary>Uncommitted / untracked detail</summary>"
    emit ""
    emit '```'
    emit "$DIRTY"
    emit '```'
    emit "</details>"
    emit ""
  fi
  if [ "${AHEAD:-0}" != "0" ] && [ "$AHEAD" != "?" ]; then
    emit "> ⚠️ **$AHEAD local commit(s) not pushed.** Work may be stranded — push before ending session."
    emit ""
  fi
else
  emit "_git unavailable or not a repo — could not determine source state._"
  emit ""
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. GitHub issues & PRs
# ─────────────────────────────────────────────────────────────────────────────
emit "## 2. GitHub Issues & PRs"
emit ""
if have gh; then
  # Use gh's built-in Go templating (no jq dependency).
  PR_TMPL='{{range .}}- #{{.number}} {{.title}} (`{{.headRefName}}`)
{{end}}'
  OPEN_PRS="$(gh pr list --repo "$REPO" --state open --limit 30 --json number,title,headRefName --template "$PR_TMPL" 2>/dev/null)"
  if [ -n "$OPEN_PRS" ]; then
    emit "**Open PRs:**"
    emit ""
    while IFS= read -r l; do [ -n "$l" ] && emit "$l"; done <<<"$OPEN_PRS"
    emit ""
  else
    emit "**Open PRs:** none ✅"
    emit ""
  fi

  ISSUE_TMPL='{{range .}}- #{{.number}} {{.title}}
{{end}}'
  OPEN_ISSUES="$(gh issue list --repo "$REPO" --state open --limit 50 --json number,title --template "$ISSUE_TMPL" 2>/dev/null)"
  ISSUE_CNT="$(printf '%s' "$OPEN_ISSUES" | grep -c '^- #')"
  if [ "$ISSUE_CNT" -gt 0 ]; then
    emit "**Open issues:** $ISSUE_CNT"
    emit ""
    while IFS= read -r l; do [ -n "$l" ] && emit "$l"; done <<<"$OPEN_ISSUES"
    emit ""
    emit "> ⚠️ Verify these against \`## 4. Live Deployment\` below — issues often lag reality."
    emit ""
  else
    emit "**Open issues:** none ✅"
    emit ""
  fi
else
  emit "_gh CLI unavailable — could not check issues/PRs._"
  emit ""
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Tests & typecheck (fast, local)
# ─────────────────────────────────────────────────────────────────────────────
emit "## 3. Build / Test (API)"
emit ""
if have node && [ -d "$API_DIR/node_modules" ]; then
  TS_OUT="$(cd "$API_DIR" && npx tsc --noEmit 2>&1)"; TS_RC=$?
  emit "| Check | Result |"
  emit "|-------|--------|"
  emit "| \`tsc --noEmit\` | $([ $TS_RC -eq 0 ] && echo 'pass ✅' || echo 'FAIL ❌') |"
else
  emit "| Check | Result |"
  emit "|-------|--------|"
  emit "| \`tsc --noEmit\` | skipped (run \`npm ci\` in $API_DIR first) |"
fi
emit ""
emit "_Run full tests with: \`cd $API_DIR && npm test\`_"
emit ""

# ─────────────────────────────────────────────────────────────────────────────
# 4. Live deployment (the ground truth that prose forgets)
# ─────────────────────────────────────────────────────────────────────────────
emit "## 4. Live Deployment (AWS + HTTP probes)"
emit ""
emit "Account \`$AWS_ACCOUNT\`, region \`$AWS_REGION\`, profile \`$AWS_PROFILE\`."
emit ""

# HTTP probes
if have curl; then
  FE_CODE="$(curl -s -o /tmp/_st_fe.html -w '%{http_code}' --max-time 15 "$FRONTEND_URL/" 2>/dev/null)"
  FE_TITLE="$(grep -oiE '<title>[^<]*</title>' /tmp/_st_fe.html 2>/dev/null | head -1)"
  HC_CODE="$(curl -s -o /tmp/_st_hc.txt -w '%{http_code}' --max-time 15 "$FRONTEND_URL$HEALTH_PATH" 2>/dev/null)"
  HC_BODY="$(head -c 200 /tmp/_st_hc.txt 2>/dev/null)"

  emit "| Probe | URL | Result |"
  emit "|-------|-----|--------|"
  emit "| Frontend (SPA) | $FRONTEND_URL/ | HTTP $FE_CODE $([ "$FE_CODE" = "200" ] && echo '✅' || echo '⚠️') ${FE_TITLE:+— \`$FE_TITLE\`} |"
  emit "| API via CloudFront | \`$HEALTH_PATH\` | HTTP $HC_CODE $([ "$HC_CODE" = "401" ] || [ "$HC_CODE" = "200" ] && echo '✅ (reachable)' || echo '⚠️') ${HC_BODY:+— \`$HC_BODY\`} |"
  emit ""
  emit "> Note: \`$HEALTH_PATH\` returning **401** is HEALTHY — it means the API is reachable through CloudFront and the auth guard is active. A 5xx/timeout is the failure signal."
  emit ""
  rm -f /tmp/_st_fe.html /tmp/_st_hc.txt
else
  emit "_curl unavailable — skipped HTTP probes._"
  emit ""
fi

# CloudFront
if have aws; then
  CF_STATUS="$(aws_q cloudfront get-distribution --id "$CLOUDFRONT_DIST_ID" --query 'Distribution.Status' --output text)"
  CF_ENABLED="$(aws_q cloudfront get-distribution --id "$CLOUDFRONT_DIST_ID" --query 'Distribution.DistributionConfig.Enabled' --output text)"
  emit "**CloudFront** \`$CLOUDFRONT_DIST_ID\`: status=\`${CF_STATUS:-unknown}\`, enabled=\`${CF_ENABLED:-unknown}\`"
  emit ""

  # ECS services — the real "is the app running" signal
  emit "**ECS Fargate** (cluster \`$ECS_CLUSTER\`):"
  emit ""
  SVC_ARNS="$(aws_q ecs list-services --cluster "$ECS_CLUSTER" --query 'serviceArns' --output text)"
  if [ -n "$SVC_ARNS" ]; then
    emit "| Service | Desired | Running | Status |"
    emit "|---------|---------|---------|--------|"
    for arn in $SVC_ARNS; do
      svc="${arn##*/}"
      read -r d r st <<<"$(aws_q ecs describe-services --cluster "$ECS_CLUSTER" --services "$svc" --query 'services[0].[desiredCount,runningCount,status]' --output text)"
      HEALTHY="⚠️"; { [ "${r:-0}" = "${d:-x}" ] && [ "${r:-0}" != "0" ] && [ "${st:-}" = "ACTIVE" ]; } && HEALTHY="✅"
      emit "| \`$svc\` | ${d:-?} | ${r:-?} | ${st:-?} $HEALTHY |"
    done
    emit ""
  else
    emit "_Could not list ECS services (no AWS creds, or cluster empty)._"
    emit ""
  fi
else
  emit "_aws CLI unavailable — skipped CloudFront/ECS checks. (Live status UNVERIFIED.)_"
  emit ""
fi

emit "**Mock destination endpoint:** \`$MOCK_DEST_URL\`"
emit ""

# ─────────────────────────────────────────────────────────────────────────────
# 5. Footer / how to use
# ─────────────────────────────────────────────────────────────────────────────
emit "---"
emit ""
emit "_This file is regenerated by \`scripts/status.sh\`. If it looks stale, it is —"
emit "just re-run the script. See \`START_HERE.md\` for the session workflow._"

# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────
printf '%s' "$OUT"
if [ "$WRITE_FILE" -eq 1 ]; then
  printf '%s' "$OUT" > "$REPO_ROOT/$OUTPUT_FILE"
  echo ""
  echo ">>> wrote $OUTPUT_FILE"
fi
