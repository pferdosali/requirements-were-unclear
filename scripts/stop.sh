#!/bin/bash
# DocBridge — Stop all services to save costs
# Scales Fargate to 0, stops RDS
# Run: ./scripts/stop.sh [profile]

set -e

PROFILE="${1:-dev}"
REGION="us-east-1"
CLUSTER="docbridge"
API_SERVICE="DocBridge-Compute-ApiService"
WORKER_SERVICE="DocBridge-Compute-WorkerService"
DB_INSTANCE="docbridge-db"

echo "🛑 Stopping DocBridge services (profile: $PROFILE, region: $REGION)"
echo ""

# Scale Fargate services to 0
echo "→ Scaling API service to 0..."
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$API_SERVICE" \
  --desired-count 0 \
  --profile "$PROFILE" \
  --region "$REGION" \
  --no-cli-pager > /dev/null 2>&1 || echo "  ⚠️  API service not found (may not be deployed yet)"

echo "→ Scaling Worker service to 0..."
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$WORKER_SERVICE" \
  --desired-count 0 \
  --profile "$PROFILE" \
  --region "$REGION" \
  --no-cli-pager > /dev/null 2>&1 || echo "  ⚠️  Worker service not found (may not be deployed yet)"

# Stop RDS instance
echo "→ Stopping RDS instance..."
aws rds stop-db-instance \
  --db-instance-identifier "$DB_INSTANCE" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --no-cli-pager > /dev/null 2>&1 || echo "  ⚠️  RDS instance not found or already stopped"

echo ""
echo "✅ All services stopped. Estimated cost while stopped: ~$1-2/day (NAT + EBS only)"
echo ""
echo "⚠️  Note: RDS auto-restarts after 7 days. Re-run this script if needed."
echo "   To restart: ./scripts/start.sh $PROFILE"
