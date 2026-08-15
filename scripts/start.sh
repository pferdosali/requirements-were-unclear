#!/bin/bash
# DocBridge — Start all services
# Scales Fargate to 1, starts RDS
# Run: ./scripts/start.sh [profile]

set -e

PROFILE="${1:-dev}"
REGION="us-east-1"
CLUSTER="docbridge"
API_SERVICE="DocBridge-Compute-ApiService"
WORKER_SERVICE="DocBridge-Compute-WorkerService"
DB_INSTANCE="docbridge-db"

echo "🚀 Starting DocBridge services (profile: $PROFILE, region: $REGION)"
echo ""

# Start RDS first (takes a few minutes)
echo "→ Starting RDS instance..."
aws rds start-db-instance \
  --db-instance-identifier "$DB_INSTANCE" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --no-cli-pager > /dev/null 2>&1 || echo "  ⚠️  RDS instance not found or already running"

echo "  Waiting for RDS to become available (this may take 3-5 minutes)..."
aws rds wait db-instance-available \
  --db-instance-identifier "$DB_INSTANCE" \
  --profile "$PROFILE" \
  --region "$REGION" 2>/dev/null || echo "  ⚠️  Could not wait for RDS (may already be available)"

# Scale Fargate services to 1
echo "→ Scaling API service to 1..."
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$API_SERVICE" \
  --desired-count 1 \
  --profile "$PROFILE" \
  --region "$REGION" \
  --no-cli-pager > /dev/null 2>&1 || echo "  ⚠️  API service not found (may not be deployed yet)"

echo "→ Scaling Worker service to 1..."
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$WORKER_SERVICE" \
  --desired-count 1 \
  --profile "$PROFILE" \
  --region "$REGION" \
  --no-cli-pager > /dev/null 2>&1 || echo "  ⚠️  Worker service not found (may not be deployed yet)"

echo ""
echo "✅ All services starting. ECS tasks will take ~30-60s to reach healthy state."
echo ""
echo "   Check status: aws ecs describe-services --cluster $CLUSTER --services $API_SERVICE $WORKER_SERVICE --profile $PROFILE --region $REGION --query 'services[].{name:serviceName,desired:desiredCount,running:runningCount}' --output table"
