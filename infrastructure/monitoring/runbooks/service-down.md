# Service Down Runbook

## Alert: ServiceDown

**Severity:** Critical  
**Team:** Platform  
**SLA Impact:** High

## Description
A Fine Print AI microservice has stopped responding to health checks for more than 1 minute.

## Immediate Actions (0-5 minutes)

### 1. Acknowledge the Alert
- Acknowledge in PagerDuty/Slack to prevent alert spam
- Note the affected service and time in incident channel

### 2. Quick Assessment
```bash
# Check service status in Kubernetes
kubectl get pods -n fineprintai -l app=${SERVICE_NAME}

# Check recent logs
kubectl logs -n fineprintai -l app=${SERVICE_NAME} --tail=100 --since=5m

# Check service endpoints
kubectl get svc -n fineprintai ${SERVICE_NAME}
```

### 3. Service Health Check
```bash
# Test health endpoint directly
curl -f http://${SERVICE_NAME}:${PORT}/health

# Check if service is accepting connections
telnet ${SERVICE_NAME} ${PORT}
```

## Investigation Steps (5-15 minutes)

### 4. Container and Resource Analysis
```bash
# Check container restart count
kubectl describe pod -n fineprintai -l app=${SERVICE_NAME}

# Check resource usage
kubectl top pods -n fineprintai -l app=${SERVICE_NAME}

# Check node resources
kubectl describe nodes
```

### 5. Application Logs Analysis
```bash
# Check application logs for errors
kubectl logs -n fineprintai -l app=${SERVICE_NAME} --since=10m | grep -i error

# Check for OOM kills
dmesg | grep -i "killed process"

# Check systemd logs if applicable
journalctl -u ${SERVICE_NAME} --since "10 minutes ago"
```

### 6. Database and Dependencies
```bash
# Check database connectivity
kubectl exec -it ${SERVICE_NAME}-pod -- nc -zv postgres 5432

# Check Redis connectivity  
kubectl exec -it ${SERVICE_NAME}-pod -- nc -zv redis 6379

# Check external dependencies
curl -f https://api.stripe.com/v1/charges (for billing service)
```

## Resolution Steps

### For Container Issues:
```bash
# Restart the service
kubectl rollout restart deployment/${SERVICE_NAME} -n fineprintai

# Scale up replicas if needed
kubectl scale deployment/${SERVICE_NAME} --replicas=3 -n fineprintai
```

### For Resource Issues:
```bash
# Increase resource limits
kubectl patch deployment ${SERVICE_NAME} -n fineprintai -p '{"spec":{"template":{"spec":{"containers":[{"name":"${SERVICE_NAME}","resources":{"limits":{"memory":"2Gi","cpu":"1000m"}}}]}}}}'

# Add horizontal pod autoscaler
kubectl autoscale deployment ${SERVICE_NAME} --cpu-percent=70 --min=2 --max=10 -n fineprintai
```

### For Configuration Issues:
```bash
# Check and update ConfigMaps
kubectl get configmap -n fineprintai ${SERVICE_NAME}-config
kubectl edit configmap -n fineprintai ${SERVICE_NAME}-config

# Check secrets
kubectl get secrets -n fineprintai ${SERVICE_NAME}-secrets
```

## Validation Steps

### 7. Verify Service Recovery
```bash
# Check pod status
kubectl get pods -n fineprintai -l app=${SERVICE_NAME}

# Test health endpoint
curl -f http://${SERVICE_NAME}:${PORT}/health

# Check metrics endpoint
curl -f http://${SERVICE_NAME}:${PORT}/metrics
```

### 8. Validate Dependencies
```bash
# Test downstream services
kubectl exec -it ${SERVICE_NAME}-pod -- curl -f http://dependent-service/health

# Check service mesh connectivity (if using Istio)
kubectl get virtualservice,destinationrule -n fineprintai
```

## Post-Incident Actions

### 9. Documentation
- Update incident timeline in Slack/PagerDuty
- Document root cause in incident postmortem
- Update runbook if new information discovered

### 10. Prevention
- Review resource limits and requests
- Check alerting thresholds
- Update deployment strategies if needed
- Schedule capacity planning review

## Service-Specific Notes

### Analysis Service
- Check Ollama model availability
- Verify Qdrant vector database connectivity
- Monitor document processing queue depth

### Billing Service  
- Verify Stripe API connectivity
- Check payment webhook endpoints
- Monitor subscription sync jobs

### Gateway Service
- Check Kong configuration
- Verify upstream service health
- Review rate limiting rules

### WebSocket Service
- Check connection pool status
- Monitor memory usage (connection state)
- Verify Redis pub/sub connectivity

## Escalation

**Level 1:** On-call engineer (5 minutes)  
**Level 2:** Platform team lead (15 minutes)  
**Level 3:** Engineering manager (30 minutes)  
**Level 4:** CTO (60 minutes)

## Related Runbooks
- [High Error Rate](./high-error-rate.md)
- [Slow Response Times](./slow-response.md)
- [Database Connectivity](./database-issues.md)

## Monitoring Queries

```promql
# Service availability
up{job=~".*-service"} == 0

# Service restart rate
increase(kube_pod_container_status_restarts_total[5m]) > 0

# Resource utilization
rate(container_cpu_usage_seconds_total[5m]) * 100
```