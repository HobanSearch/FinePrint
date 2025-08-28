#!/usr/bin/env python3
"""
Fine Print AI Monitoring Stack Health Check
Comprehensive health monitoring for all monitoring services
"""

import requests
import json
import sys
import time
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MonitoringHealthCheck:
    """Health check orchestrator for Fine Print AI monitoring stack"""
    
    def __init__(self, config_file: str = None):
        self.config = self._load_config(config_file)
        self.results = {}
        self.overall_status = True
        
    def _load_config(self, config_file: Optional[str]) -> Dict:
        """Load configuration for health checks"""
        default_config = {
            "services": {
                "prometheus": {
                    "url": "http://prometheus:9090",
                    "health_endpoint": "/-/healthy",
                    "ready_endpoint": "/-/ready",
                    "metrics_endpoint": "/metrics",
                    "timeout": 10,
                    "critical": True
                },
                "grafana": {
                    "url": "http://grafana:3000",
                    "health_endpoint": "/api/health",
                    "timeout": 10,
                    "critical": True
                },
                "loki": {
                    "url": "http://loki:3100",
                    "health_endpoint": "/ready",
                    "timeout": 10,
                    "critical": True
                },
                "jaeger-collector": {
                    "url": "http://jaeger-collector:14268",
                    "health_endpoint": "/",
                    "timeout": 10,
                    "critical": True
                },
                "jaeger-query": {
                    "url": "http://jaeger-query:16686",
                    "health_endpoint": "/",
                    "timeout": 10,
                    "critical": True
                },
                "alertmanager": {
                    "url": "http://alertmanager:9093",
                    "health_endpoint": "/-/healthy",
                    "ready_endpoint": "/-/ready",
                    "timeout": 10,
                    "critical": True
                },
                "elasticsearch": {
                    "url": "http://elasticsearch:9200",
                    "health_endpoint": "/_cluster/health",
                    "timeout": 15,
                    "critical": True
                },
                "node-exporter": {
                    "url": "http://node-exporter:9100",
                    "health_endpoint": "/metrics",
                    "timeout": 5,
                    "critical": False
                },
                "cadvisor": {
                    "url": "http://cadvisor:8080",
                    "health_endpoint": "/healthz",
                    "timeout": 5,
                    "critical": False
                },
                "blackbox-exporter": {
                    "url": "http://blackbox-exporter:9115",
                    "health_endpoint": "/metrics",
                    "timeout": 5,
                    "critical": False
                }
            },
            "thresholds": {
                "response_time_warning": 2.0,
                "response_time_critical": 5.0,
                "prometheus_targets_min": 10,
                "elasticsearch_status": "yellow"
            },
            "notifications": {
                "slack_webhook": None,
                "email_recipients": [],
                "pagerduty_key": None
            }
        }
        
        if config_file:
            try:
                with open(config_file, 'r') as f:
                    user_config = json.load(f)
                    default_config.update(user_config)
            except Exception as e:
                logger.warning(f"Could not load config file {config_file}: {e}")
                
        return default_config
    
    def check_service_health(self, service_name: str, service_config: Dict) -> Tuple[bool, Dict]:
        """Check health of a single service"""
        result = {
            'service': service_name,
            'status': 'unknown',
            'response_time': None,
            'details': {},
            'timestamp': datetime.utcnow().isoformat(),
            'critical': service_config.get('critical', True)
        }
        
        try:
            start_time = time.time()
            
            # Primary health check
            health_url = f"{service_config['url']}{service_config['health_endpoint']}"
            response = requests.get(
                health_url,
                timeout=service_config.get('timeout', 10),
                verify=False
            )
            
            response_time = time.time() - start_time
            result['response_time'] = response_time
            
            if response.status_code == 200:
                result['status'] = 'healthy'
                result['details']['http_status'] = response.status_code
                
                # Service-specific checks
                if service_name == 'prometheus':
                    self._check_prometheus_targets(service_config['url'], result)
                elif service_name == 'elasticsearch':
                    self._check_elasticsearch_cluster(service_config['url'], result)
                elif service_name == 'grafana':
                    self._check_grafana_datasources(service_config['url'], result)
                elif service_name == 'loki':
                    self._check_loki_ingestion(service_config['url'], result)
                    
            else:
                result['status'] = 'unhealthy'
                result['details']['http_status'] = response.status_code
                result['details']['response_body'] = response.text[:500]
                
        except requests.exceptions.Timeout:
            result['status'] = 'timeout'
            result['details']['error'] = 'Request timeout'
        except requests.exceptions.ConnectionError:
            result['status'] = 'connection_error'
            result['details']['error'] = 'Connection refused'
        except Exception as e:
            result['status'] = 'error'
            result['details']['error'] = str(e)
            
        # Evaluate response time thresholds
        if result['response_time']:
            if result['response_time'] > self.config['thresholds']['response_time_critical']:
                result['details']['response_time_status'] = 'critical'
            elif result['response_time'] > self.config['thresholds']['response_time_warning']:
                result['details']['response_time_status'] = 'warning'
            else:
                result['details']['response_time_status'] = 'ok'
                
        return result['status'] == 'healthy' and not result['details'].get('response_time_status') == 'critical', result
    
    def _check_prometheus_targets(self, base_url: str, result: Dict):
        """Check Prometheus target health"""
        try:
            targets_url = f"{base_url}/api/v1/targets"
            response = requests.get(targets_url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                active_targets = data.get('data', {}).get('activeTargets', [])
                
                up_targets = [t for t in active_targets if t.get('health') == 'up']
                down_targets = [t for t in active_targets if t.get('health') == 'down']
                
                result['details']['targets_total'] = len(active_targets)
                result['details']['targets_up'] = len(up_targets)
                result['details']['targets_down'] = len(down_targets)
                
                if len(active_targets) < self.config['thresholds']['prometheus_targets_min']:
                    result['details']['targets_status'] = 'insufficient'
                elif down_targets:
                    result['details']['targets_status'] = 'degraded'
                else:
                    result['details']['targets_status'] = 'healthy'
                    
        except Exception as e:
            result['details']['prometheus_targets_error'] = str(e)
    
    def _check_elasticsearch_cluster(self, base_url: str, result: Dict):
        """Check Elasticsearch cluster health"""
        try:
            health_url = f"{base_url}/_cluster/health"
            response = requests.get(health_url, timeout=15)
            
            if response.status_code == 200:
                health_data = response.json()
                result['details']['cluster_status'] = health_data.get('status')
                result['details']['number_of_nodes'] = health_data.get('number_of_nodes')
                result['details']['active_shards'] = health_data.get('active_shards')
                result['details']['relocating_shards'] = health_data.get('relocating_shards')
                result['details']['unassigned_shards'] = health_data.get('unassigned_shards')
                
                if health_data.get('status') not in ['green', 'yellow']:
                    result['details']['cluster_health_status'] = 'unhealthy'
                else:
                    result['details']['cluster_health_status'] = 'healthy'
                    
        except Exception as e:
            result['details']['elasticsearch_health_error'] = str(e)
    
    def _check_grafana_datasources(self, base_url: str, result: Dict):
        """Check Grafana datasources health"""
        try:
            # Note: This would require authentication in production
            datasources_url = f"{base_url}/api/datasources"
            # Simplified check - just verify we can reach the API
            response = requests.get(f"{base_url}/api/health", timeout=10)
            
            if response.status_code == 200:
                result['details']['grafana_api_status'] = 'healthy'
            else:
                result['details']['grafana_api_status'] = 'unhealthy'
                
        except Exception as e:
            result['details']['grafana_datasources_error'] = str(e)
    
    def _check_loki_ingestion(self, base_url: str, result: Dict):
        """Check Loki log ingestion"""
        try:
            # Check Loki metrics for ingestion rate
            metrics_url = f"{base_url}/metrics"
            response = requests.get(metrics_url, timeout=10)
            
            if response.status_code == 200:
                # Parse metrics to check ingestion rate
                metrics_text = response.text
                if 'loki_ingester_samples_received_total' in metrics_text:
                    result['details']['loki_ingestion_status'] = 'active'
                else:
                    result['details']['loki_ingestion_status'] = 'no_activity'
            else:
                result['details']['loki_ingestion_status'] = 'unknown'
                
        except Exception as e:
            result['details']['loki_ingestion_error'] = str(e)
    
    def run_health_checks(self) -> Dict:
        """Run health checks for all services"""
        logger.info("Starting Fine Print AI monitoring stack health checks...")
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_service = {
                executor.submit(
                    self.check_service_health, 
                    service_name, 
                    service_config
                ): service_name 
                for service_name, service_config in self.config['services'].items()
            }
            
            for future in as_completed(future_to_service):
                service_name = future_to_service[future]
                try:
                    is_healthy, result = future.result()
                    self.results[service_name] = result
                    
                    if not is_healthy and result['critical']:
                        self.overall_status = False
                        
                    logger.info(f"{service_name}: {result['status']} ({result.get('response_time', 0):.2f}s)")
                    
                except Exception as e:
                    logger.error(f"Health check failed for {service_name}: {e}")
                    self.results[service_name] = {
                        'service': service_name,
                        'status': 'error',
                        'details': {'error': str(e)},
                        'timestamp': datetime.utcnow().isoformat()
                    }
                    self.overall_status = False
        
        # Generate summary
        summary = self._generate_summary()
        
        # Send notifications if needed
        if not self.overall_status:
            self._send_notifications(summary)
            
        return {
            'overall_status': 'healthy' if self.overall_status else 'unhealthy',
            'timestamp': datetime.utcnow().isoformat(),
            'summary': summary,
            'services': self.results
        }
    
    def _generate_summary(self) -> Dict:
        """Generate health check summary"""
        total_services = len(self.results)
        healthy_services = len([r for r in self.results.values() if r['status'] == 'healthy'])
        critical_unhealthy = len([
            r for r in self.results.values() 
            if r['status'] != 'healthy' and r.get('critical', True)
        ])
        
        avg_response_time = sum([
            r['response_time'] for r in self.results.values() 
            if r['response_time'] is not None
        ]) / max(1, len([r for r in self.results.values() if r['response_time'] is not None]))
        
        return {
            'total_services': total_services,
            'healthy_services': healthy_services,
            'unhealthy_services': total_services - healthy_services,
            'critical_unhealthy': critical_unhealthy,
            'average_response_time': round(avg_response_time, 3),
            'health_percentage': round((healthy_services / total_services) * 100, 1)
        }
    
    def _send_notifications(self, summary: Dict):
        """Send notifications for unhealthy services"""
        try:
            message = f"""
🚨 Fine Print AI Monitoring Stack Health Alert

Overall Status: {'✅ Healthy' if self.overall_status else '❌ Unhealthy'}
Healthy Services: {summary['healthy_services']}/{summary['total_services']}
Critical Issues: {summary['critical_unhealthy']}
Average Response Time: {summary['average_response_time']}s

Unhealthy Services:
"""
            
            for service_name, result in self.results.items():
                if result['status'] != 'healthy':
                    message += f"• {service_name}: {result['status']} - {result.get('details', {}).get('error', 'Unknown error')}\n"
            
            # Send to Slack if configured
            slack_webhook = self.config['notifications'].get('slack_webhook')
            if slack_webhook:
                self._send_slack_notification(slack_webhook, message)
                
            logger.info("Notifications sent for unhealthy monitoring services")
            
        except Exception as e:
            logger.error(f"Failed to send notifications: {e}")
    
    def _send_slack_notification(self, webhook_url: str, message: str):
        """Send Slack notification"""
        payload = {
            'text': message,
            'username': 'Fine Print AI Monitoring',
            'icon_emoji': ':warning:'
        }
        
        response = requests.post(webhook_url, json=payload, timeout=10)
        response.raise_for_status()

def main():
    parser = argparse.ArgumentParser(description='Fine Print AI Monitoring Health Check')
    parser.add_argument('--config', help='Configuration file path')
    parser.add_argument('--output', choices=['json', 'text'], default='text', help='Output format')
    parser.add_argument('--quiet', action='store_true', help='Quiet mode - only errors')
    
    args = parser.parse_args()
    
    if args.quiet:
        logging.getLogger().setLevel(logging.ERROR)
    
    # Run health checks
    health_checker = MonitoringHealthCheck(args.config)
    results = health_checker.run_health_checks()
    
    # Output results
    if args.output == 'json':
        print(json.dumps(results, indent=2))
    else:
        print(f"\n{'='*60}")
        print("Fine Print AI Monitoring Stack Health Report")
        print(f"{'='*60}")
        print(f"Overall Status: {results['overall_status'].upper()}")
        print(f"Timestamp: {results['timestamp']}")
        print(f"\nSummary:")
        print(f"  Total Services: {results['summary']['total_services']}")
        print(f"  Healthy: {results['summary']['healthy_services']}")
        print(f"  Unhealthy: {results['summary']['unhealthy_services']}")
        print(f"  Critical Issues: {results['summary']['critical_unhealthy']}")
        print(f"  Health Percentage: {results['summary']['health_percentage']}%")
        print(f"  Avg Response Time: {results['summary']['average_response_time']}s")
        
        print(f"\nService Details:")
        print(f"{'Service':<20} {'Status':<12} {'Response Time':<15} {'Details'}")
        print("-" * 80)
        
        for service_name, service_result in results['services'].items():
            response_time = f"{service_result.get('response_time', 0):.3f}s" if service_result.get('response_time') else 'N/A'
            details = service_result.get('details', {})
            detail_str = ', '.join([f"{k}:{v}" for k, v in details.items() if k != 'error'])[:30]
            
            print(f"{service_name:<20} {service_result['status']:<12} {response_time:<15} {detail_str}")
    
    # Exit with appropriate code
    sys.exit(0 if results['overall_status'] == 'healthy' else 1)

if __name__ == '__main__':
    main()