import { ILoadBalancer, IRequestHandler } from "../core/interfaces";
import { ServerConfig } from "../core/models";
import { ProxyRequestHandler } from "../handlers/proxyRequestHandler";
import { HttpHealthChecker } from "../health/httpHealthChecker";
import { RandomLB } from "../loadbalancing/randomLb";
import { RoundRobinLoadBalancer } from "../loadbalancing/roundRobinLb";
import { HttpProxyClient } from "../proxy/httpProxyClient";
import { RegexRuleEngine } from "../rules/rule-engine";

type LoadBalancerType = 'round-robin' | 'random';

export class ProxyServiceFactory {
  static createRequestHandler(
    config: ServerConfig,
    loadBalancerType?: LoadBalancerType
  ): IRequestHandler {
    const healthChecker = new HttpHealthChecker();
    const loadBalancer = this.createLoadBalancer(
      loadBalancerType || config.loadbalancer || 'round-robin'
    );
    const proxyClient = new HttpProxyClient();
    const ruleEngine = new RegexRuleEngine();

    // Start health checks
    healthChecker.startPeriodicChecks(config.upstreams, 30000);

    return new ProxyRequestHandler(
      config,
      healthChecker,
      loadBalancer,
      proxyClient,
      ruleEngine
    );
  }

  private static createLoadBalancer(type: LoadBalancerType): ILoadBalancer {
    switch (type) {
      case 'random':
        return new RandomLB();
      case 'round-robin':
      default:
        return new RoundRobinLoadBalancer();
    }
  }
}

