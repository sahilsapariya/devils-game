# Kubernetes Manifests

Templates for deploying PROJECT EXTRACTION's backend stack to Kubernetes.
These are starting points — adapt namespaces, hosts, registry paths, and
storage classes to your target cluster.

## Files

| File | Purpose |
| --- | --- |
| `namespace.yaml` | Creates the `extraction` namespace |
| `configmap.yaml` | Non-secret backend configuration |
| `secret.yaml.template` | Template for sensitive values — never commit real values |
| `backend-deployment.yaml` | NestJS backend (3 replicas, probes, resource limits) |
| `backend-service.yaml` | ClusterIP service on port 3001 |
| `postgres-statefulset.yaml` | Postgres StatefulSet (staging only; use managed DB in prod) |
| `redis-deployment.yaml` | Redis with PVC (use Redis cluster / managed Redis in prod) |
| `ingress.yaml` | nginx ingress with cert-manager TLS |

## Apply order

```
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
# create the real secret out-of-band, then:
kubectl apply -f postgres-statefulset.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f backend-deployment.yaml
kubectl apply -f backend-service.yaml
kubectl apply -f ingress.yaml
```

Or, once you have a real secret in place, apply everything:

```
kubectl apply -f .
```

Dry-run validation:

```
kubectl apply --dry-run=client -f .
```

## Production notes

- Replace `postgres-statefulset.yaml` with a managed Postgres (RDS, Cloud SQL,
  Aiven) and configure `DATABASE_URL` in the secret accordingly.
- Replace `redis-deployment.yaml` with a 3-node Redis cluster (Bitnami chart or
  managed Redis) — see spec § Deployment Architecture.
- Manage secrets via Sealed Secrets, External Secrets Operator, or your cloud's
  KMS-backed secret store. Never apply raw `Secret` manifests with real values.
- Configure HPA on the backend deployment once baseline traffic is established.
- Enable Pod Disruption Budgets and NetworkPolicies before production.
