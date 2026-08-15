#!/bin/bash
# DocBridge — Check service status
# Run: ./scripts/status.sh [profile]

PROFILE="${1:-dev}"
REGION="us-east-1"
CLUSTER="docbridge"
DB_INSTANCE="docbridge-db"

echo "📊 DocBridge Service Status (profile: $PROFILE)"
echo ""

echo "── ECS Services ──"
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "DocBridge-Compute-ApiService" "DocBridge-Compute-WorkerService" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'services[].{Service:serviceName,Status:status,Desired:desiredCount,Running:runningCount}' \
  --output table 2>/dev/null || echo "  ECS cluster not found (not deployed yet)"

echo ""
echo "── RDS Database ──"
aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'DBInstances[0].{Instance:DBInstanceIdentifier,Status:DBInstanceStatus,Class:DBInstanceClass,Endpoint:Endpoint.Address}' \
  --output table 2>/dev/null || echo "  RDS instance not found (not deployed yet)"

echo ""
echo "── Cost Estimate ──"
echo "  Running:  ~$82/month (~$2.70/day)"
echo "  Stopped:  ~$1-2/day (NAT Gateway + EBS volumes)"
echo ""
