#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for component in api frontend mock-destination infra; do
  (cd "implementation/$component" && npm ci)
done
(cd implementation/api && npx tsc --noEmit && npm test -- --ci)
(cd implementation/frontend && npm run build)
(cd implementation/mock-destination && npm run build && cp -r node_modules dist/)
(cd implementation/infra && npx tsc --noEmit && npm test -- --runInBand && npx cdk synth --quiet && npx cdk synth --quiet -c environment=staging)
