#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for key in IMAGE_URI ECS_CLUSTER API_SERVICE WORKER_SERVICE FRONTEND_BUCKET CLOUDFRONT_DISTRIBUTION_ID FRONTEND_URL COGNITO_USER_POOL_ID COGNITO_CLIENT_ID; do
  test -n "${!key:-}" || { echo "Missing $key" >&2; exit 1; }
done
[[ "$IMAGE_URI" =~ @sha256:[a-f0-9]{64}$ ]] || { echo 'An immutable image digest is required' >&2; exit 1; }
test -f release/frontend/index.html
mkdir -p release/deployment
for pair in "${API_SERVICE}:api" "${WORKER_SERVICE}:worker"; do
  service="${pair%:*}"; container="${pair##*:}"
  aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$service" > release/deployment/service.json
  task=$(jq -er '.services[0].taskDefinition' release/deployment/service.json)
  printf '%s\n' "$task" > "release/deployment/${container}-previous-task.txt"
  aws ecs describe-task-definition --task-definition "$task" --query taskDefinition > release/deployment/task.json
  jq -e --arg name "$container" 'any(.containerDefinitions[]; .name == $name)' release/deployment/task.json >/dev/null
  jq --arg name "$container" --arg image "$IMAGE_URI" '
    del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy)
    | (.containerDefinitions[] | select(.name == $name) | .image) = $image
  ' release/deployment/task.json > release/deployment/new-task.json
  revision=$(aws ecs register-task-definition --cli-input-json file://release/deployment/new-task.json --query taskDefinition.taskDefinitionArn --output text)
  aws ecs update-service --cluster "$ECS_CLUSTER" --service "$service" --task-definition "$revision" > /dev/null
  printf '%s\n' "$revision" > "release/deployment/${container}-expected-task.txt"
done
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$API_SERVICE" "$WORKER_SERVICE"
for pair in "${API_SERVICE}:api" "${WORKER_SERVICE}:worker"; do
  service="${pair%:*}"; container="${pair##*:}"
  expected=$(cat "release/deployment/${container}-expected-task.txt")
  aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$service" > release/deployment/service.json
  jq -e --arg expected "$expected" '.services[0] | .taskDefinition == $expected and .runningCount > 0 and .runningCount == .desiredCount and any(.deployments[]; .status == "PRIMARY" and .taskDefinition == $expected and .rolloutState == "COMPLETED")' release/deployment/service.json >/dev/null
done
# Upload assets first and HTML last; retain old hashed assets for open browser sessions.
aws s3 sync release/frontend/ "s3://$FRONTEND_BUCKET/" --exclude index.html --exclude config.js --cache-control 'public,max-age=31536000,immutable'
jq -n --arg pool "$COGNITO_USER_POOL_ID" --arg client "$COGNITO_CLIENT_ID" '{userPoolId:$pool,clientId:$client}' > release/deployment/config.json
{ printf 'window.DOCBRIDGE_CONFIG = '; cat release/deployment/config.json; printf ';\n'; } > release/deployment/config.js
aws s3 cp release/deployment/config.js "s3://$FRONTEND_BUCKET/config.js" --content-type application/javascript --cache-control no-store
aws s3 cp release/frontend/index.html "s3://$FRONTEND_BUCKET/index.html" --cache-control no-cache --content-type text/html
invalidation=$(aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths '/*' --query Invalidation.Id --output text)
aws cloudfront wait invalidation-completed --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --id "$invalidation"
curl --fail --silent --show-error --retry 5 --max-time 30 "$FRONTEND_URL/" | grep -q '<html'
# Current auth is mock; /api/me confirms routing and DB-independent identity handling.
code=$(curl --silent --show-error --max-time 30 -o release/deployment/probe.json -w '%{http_code}' "$FRONTEND_URL/api/me")
test "$code" = 401
curl --fail --silent --show-error --max-time 30 -H 'x-user-id: user-1' "$FRONTEND_URL/api/me" | jq -e '.user.userId == "user-1"' >/dev/null
