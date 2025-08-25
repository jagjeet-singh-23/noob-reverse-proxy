import { RuleNotFoundError } from "../core/errors";
import { IHealthChecker, ILoadBalancer, IProxyClient, IRequestHandler, IRuleEngine } from "../core/interfaces";
import { Rule, ServerConfig, Upstream, WorkerMessageReplyType, WorkerMessageType } from "../core/models";

// src/handlers/ProxyRequestHandler.ts
export class ProxyRequestHandler implements IRequestHandler {
  constructor(
    private config: ServerConfig,
    private healthChecker: IHealthChecker,
    private loadBalancer: ILoadBalancer,
    private proxyClient: IProxyClient,
    private ruleEngine: IRuleEngine
  ) { }

  async handleRequest(message: WorkerMessageType): Promise<WorkerMessageReplyType> {
    const requestURL = message.url;

    const rule = this.findRule(requestURL);
    if (!rule) throw new RuleNotFoundError(message.url);

    const upstreams = this.resolveUpstreams(rule);
    if (upstreams.length === 0) {
      return this.error("500", `No valid upstreams found for rule: ${this.pretty(rule)}`);
    }

    const activeSet = this.getActiveSet();
    const activeForRule = this.filterActive(upstreams, activeSet);
    if (activeForRule.length === 0) {
      return this.error("500", `No active upstreams available for rule: ${this.pretty(rule)}`);
    }

    const selected = this.selectWithLB(upstreams, activeSet);
    if (!selected) {
      return this.error("500", `Load balancer could not select an upstream for rule: ${this.pretty(rule)}`);
    }

    // Try primary; on failure, remove it from the current active set and retry once via LB.
    try {
      const data = await this.proxyOnce(selected, requestURL);
      return { data };
    } catch (err: any) {
      this.logFailure(selected, err);

      const retry = this.retryCandidate(upstreams, selected);
      if (!retry) {
        return this.error("500", `No active upstreams available for rule: ${this.pretty(rule)}`);
      }

      try {
        const retryData = await this.proxyOnce(retry, requestURL);
        return { data: retryData };
      } catch (retryErr: any) {
        this.logFailure(retry, retryErr, /*isRetry*/ true);
        return this.error("500", `No active upstreams available for rule: ${this.pretty(rule)}`);
      }
    }
  }

  private findRule(requestURL: string): Rule | null {
    return this.ruleEngine.findMatchingRule(requestURL, this.config.rules) ?? null;
  }

  private resolveUpstreams(rule: Rule): Upstream[] {
    return rule.upstreams
      .map((id) => this.config.upstreams.find((u) => u.id === id))
      .filter(Boolean) as Upstream[];
  }

  private getActiveSet(): Set<string> {
    return this.healthChecker.getActiveUpstreams();
  }

  private filterActive(upstreams: Upstream[], activeSet: Set<string>): Upstream[] {
    return upstreams.filter((u) => activeSet.has(u.id));
  }

  private selectWithLB(upstreams: Upstream[], activeSet: Set<string>): Upstream | null {
    return this.loadBalancer.selectUpstream(upstreams, activeSet) ?? null;
  }

  private async proxyOnce(upstream: Upstream, url: string): Promise<any> {
    return this.proxyClient.makeRequest(upstream, url);
  }

  /**
   * Removes the failed upstream from a *fresh* active set and asks the LB for another choice.
   * Returns null when no alternative is available.
   */
  private retryCandidate(allRuleUpstreams: Upstream[], failed: Upstream): Upstream | null {
    const updatedActive = this.getActiveSet(); // fetch current health
    updatedActive.delete(failed.id);
    return this.selectWithLB(allRuleUpstreams, updatedActive);
  }

  private error(errorCode: "404" | "500", error: string): WorkerMessageReplyType {
    return { errorCode, error };
  }

  private logFailure(upstream: Upstream, err: unknown, isRetry = false): void {
    const label = isRetry ? "Retry request" : "Request";
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${label} to upstream ${upstream.id} failed: ${msg}`);
  }

  private pretty(obj: unknown): string {
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }
}
