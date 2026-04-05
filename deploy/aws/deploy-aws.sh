#!/usr/bin/env bash
# =============================================================================
# deploy-aws.sh  – Deploy Tic-Tac-Toe (Nakama + Frontend) to AWS
#
# Prerequisites:
#   • AWS CLI configured (aws configure)
#   • Docker installed and running
#   • jq, curl installed
#
# Usage:
#   chmod +x deploy/aws/deploy-aws.sh
#   ./deploy/aws/deploy-aws.sh
# =============================================================================
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-us-east-1}"
PROJECT="tictactoe"
NAKAMA_IMAGE_TAG="heroiclabs/nakama:3.22.0"

# ECR repo names
FRONTEND_REPO="${PROJECT}-frontend"
NAKAMA_MODULE_BUILDER_REPO="${PROJECT}-module-builder"

# ECS cluster / task names
CLUSTER_NAME="${PROJECT}-cluster"
NAKAMA_SERVICE="${PROJECT}-nakama"
FRONTEND_SERVICE="${PROJECT}-frontend"

# ─── Helpers ─────────────────────────────────────────────────────────────────
log() { echo "[$(date +%H:%M:%S)] $*"; }

# ─── 1. Create ECR repos (idempotent) ────────────────────────────────────────
log "Ensuring ECR repos..."
for repo in "$FRONTEND_REPO"; do
  aws ecr describe-repositories --repository-names "$repo" --region "$AWS_REGION" 2>/dev/null || \
    aws ecr create-repository --repository-name "$repo" --region "$AWS_REGION"
done

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# ─── 2. Build Nakama module JS ────────────────────────────────────────────────
log "Building Nakama TypeScript module..."
(cd nakama && npm ci && npm run build)

# ─── 3. Build & push frontend image ──────────────────────────────────────────
log "Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${ECR_BASE}"

log "Building frontend Docker image..."
FRONTEND_IMAGE="${ECR_BASE}/${FRONTEND_REPO}:latest"
docker build \
  --build-arg VITE_NAKAMA_HOST="${NAKAMA_LB_DNS:-localhost}" \
  --build-arg VITE_NAKAMA_PORT="7350" \
  --build-arg VITE_NAKAMA_USE_SSL="false" \
  --build-arg VITE_NAKAMA_SERVER_KEY="defaultsocketkey" \
  -t "$FRONTEND_IMAGE" \
  ./frontend

docker push "$FRONTEND_IMAGE"
log "Frontend image pushed: $FRONTEND_IMAGE"

# ─── 4. ECS infrastructure (simplified – uses AWS CLI directly) ───────────────
# For production, prefer using the CloudFormation template in deploy/aws/cloudformation.yml
log ""
log "═══════════════════════════════════════════════════════════"
log "  Frontend image is ready: $FRONTEND_IMAGE"
log ""
log "  Next steps for ECS deployment:"
log "  1. Create an ECS cluster: aws ecs create-cluster --cluster-name ${CLUSTER_NAME}"
log "  2. Register task definitions from deploy/aws/task-definitions/"
log "  3. Create services with the registered task definitions"
log "  4. See deploy/aws/cloudformation.yml for a one-command full deploy"
log "═══════════════════════════════════════════════════════════"
