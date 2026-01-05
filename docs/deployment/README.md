# Deployment Guide

## Overview

VeriHire uses a containerized microservices architecture deployed on Kubernetes with automated CI/CD pipelines.

---

## Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE                                   │
│                    (CDN, DDoS Protection, WAF)                       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AWS / GCP CLOUD                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    KUBERNETES CLUSTER                        │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │   │
│  │  │   Ingress   │ │   Ingress   │ │   Ingress   │            │   │
│  │  │   (API)     │ │   (Web)     │ │   (WS)      │            │   │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │   │
│  │         │               │               │                    │   │
│  │         ▼               ▼               ▼                    │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │                   SERVICES                           │    │   │
│  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │    │   │
│  │  │  │ API │ │ Web │ │ AI  │ │Eval │ │Cert │ │Block│   │    │   │
│  │  │  │     │ │     │ │ Svc │ │ Svc │ │ Svc │ │chain│   │    │   │
│  │  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘   │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    DATA LAYER                                │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │   │
│  │  │ PostgreSQL│ │   Redis   │ │Elasticsearch│ │    S3     │   │   │
│  │  │  (RDS)    │ │(Elasticache)│ │           │ │           │   │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Environment Configuration

### Environment Types

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local development | localhost:3000 |
| Staging | Testing & QA | staging.verihire.com |
| Production | Live platform | verihire.com |

### Environment Variables

```bash
# Application
NODE_ENV=production
APP_URL=https://api.verihire.com
FRONTEND_URL=https://verihire.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/verihire
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://host:6379
REDIS_PASSWORD=secret

# Authentication
JWT_PRIVATE_KEY_PATH=/secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=/secrets/jwt-public.pem
JWT_ACCESS_TOKEN_TTL=900
JWT_REFRESH_TOKEN_TTL=604800

# AI Services
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4-turbo

# Blockchain
POLYGON_RPC_URL=https://polygon-rpc.com
CONTRACT_ADDRESS=0x...
WALLET_PRIVATE_KEY=0x...

# Storage
AWS_S3_BUCKET=verihire-assets
AWS_REGION=us-east-1

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
DATADOG_API_KEY=xxx
```

---

## Kubernetes Manifests

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: verihire
  labels:
    app.kubernetes.io/name: verihire
```

### API Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: verihire
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: verihire/api:${VERSION}
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: verihire
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 3000
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
  namespace: verihire
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### AI Service Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-service
  namespace: verihire
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ai-service
  template:
    metadata:
      labels:
        app: ai-service
    spec:
      containers:
        - name: ai-service
          image: verihire/ai-service:${VERSION}
          ports:
            - containerPort: 8000
          resources:
            requests:
              memory: "2Gi"
              cpu: "1000m"
              nvidia.com/gpu: 1
            limits:
              memory: "4Gi"
              cpu: "2000m"
              nvidia.com/gpu: 1
      nodeSelector:
        gpu: "true"
      tolerations:
        - key: "nvidia.com/gpu"
          operator: "Exists"
          effect: "NoSchedule"
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: verihire-ingress
  namespace: verihire
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
    - hosts:
        - api.verihire.com
        - verihire.com
      secretName: verihire-tls
  rules:
    - host: api.verihire.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
    - host: verihire.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
name: Deploy

on:
  push:
    branches: [main]
  release:
    types: [published]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pnpm install
      - run: pnpm test
      - run: pnpm build

  build:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api, web, ai-service, blockchain-service]
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./apps/${{ matrix.service }}
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/${{ matrix.service }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: staging
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}
      
      - name: Deploy to staging
        run: |
          kubectl set image deployment/api api=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/api:${{ github.sha }} -n verihire
          kubectl set image deployment/web web=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/web:${{ github.sha }} -n verihire
          kubectl rollout status deployment/api -n verihire
          kubectl rollout status deployment/web -n verihire
      
      - name: Run smoke tests
        run: |
          ./scripts/smoke-tests.sh https://staging.verihire.com

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    if: github.event_name == 'release'
    environment: production
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG_PRODUCTION }}
      
      - name: Deploy to production
        run: |
          kubectl set image deployment/api api=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/api:${{ github.sha }} -n verihire
          kubectl set image deployment/web web=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/web:${{ github.sha }} -n verihire
          kubectl rollout status deployment/api -n verihire
          kubectl rollout status deployment/web -n verihire
```

---

## Database Migrations

### Migration Strategy

```bash
# Run migrations before deployment
pnpm db:migrate

# Rollback if needed
pnpm db:migrate:rollback

# Generate new migration
pnpm db:migrate:create add_new_feature
```

### Zero-Downtime Migrations

1. **Expand**: Add new columns/tables (backward compatible)
2. **Migrate**: Deploy code that writes to both old and new
3. **Contract**: Remove old columns/tables after full rollout

---

## Monitoring & Observability

### Prometheus Metrics

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: api-monitor
  namespace: verihire
spec:
  selector:
    matchLabels:
      app: api
  endpoints:
    - port: metrics
      interval: 15s
      path: /metrics
```

### Grafana Dashboards

- API Response Times
- Error Rates
- Database Connections
- Redis Cache Hit Rates
- AI Service Latency
- Blockchain Transaction Status

### Alerting Rules

```yaml
groups:
  - name: verihire-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          
      - alert: APILatencyHigh
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "API latency is high"
          
      - alert: DatabaseConnectionsHigh
        expr: pg_stat_activity_count > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database connections approaching limit"
```

---

## Rollback Procedures

### Quick Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/api -n verihire

# Rollback to specific revision
kubectl rollout undo deployment/api --to-revision=3 -n verihire

# Check rollout history
kubectl rollout history deployment/api -n verihire
```

### Database Rollback

```bash
# Rollback last migration
pnpm db:migrate:rollback

# Restore from backup
./scripts/restore-database.sh backup-2024-01-15.sql
```

---

## Disaster Recovery

### Backup Schedule

| Component | Frequency | Retention |
|-----------|-----------|-----------|
| PostgreSQL | Hourly | 7 days |
| PostgreSQL | Daily | 30 days |
| PostgreSQL | Weekly | 1 year |
| Redis | Daily | 7 days |
| S3 | Versioned | 90 days |

### Recovery Time Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single service failure | 5 min | 0 |
| Database failure | 30 min | 1 hour |
| Full region failure | 4 hours | 1 hour |

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Security scan completed
- [ ] Database migrations tested
- [ ] Feature flags configured
- [ ] Rollback plan documented
- [ ] On-call team notified

### Post-Deployment
- [ ] Health checks passing
- [ ] Smoke tests completed
- [ ] Monitoring dashboards checked
- [ ] Error rates normal
- [ ] Performance metrics normal
- [ ] Deployment documented

---

*Last Updated: January 2026*
