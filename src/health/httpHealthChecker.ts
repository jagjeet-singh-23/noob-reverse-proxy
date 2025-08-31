import http from "node:http";
import https from "node:https";
import { IHealthChecker } from "../core/interfaces";
import { Upstream } from "../core/models";
import { parseUpstream } from "../core/utils";

export class HttpHealthChecker implements IHealthChecker {
  private activeUpstreams = new Set<string>();
  private intervalId: NodeJS.Timeout | null = null;
  private healthCheckAgent: http.Agent;

  constructor() {
    // Dedicated agent for health checks with connection pooling
    this.healthCheckAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 60000,        // Keep health check connections longer
      maxSockets: 5,                // Fewer sockets needed for health checks
      maxFreeSockets: 2,            // Keep some health check connections idle
      timeout: 5000                 // Shorter timeout for health checks
    });
  }

  async checkHealth(upstream: Upstream): Promise<boolean> {
    try {
      const statusCode = await this.makeHealthCheckRequest(upstream);
      const isHealthy = statusCode === 200;

      console.log(`🔍 Health check for ${upstream.id}: status=${statusCode}, healthy=${isHealthy}`);

      if (isHealthy) {
        this.activeUpstreams.add(upstream.id);
        console.log(`✅ ${upstream.id} marked as ACTIVE`);
      } else {
        this.activeUpstreams.delete(upstream.id);
        console.log(`❌ ${upstream.id} marked as INACTIVE (status ${statusCode})`);
      }

      return isHealthy;
    } catch (error: any) {
      console.error(`❌ Health check FAILED for upstream ${upstream.id}: ${error.message}`);
      this.activeUpstreams.delete(upstream.id);
      console.log(`❌ ${upstream.id} marked as INACTIVE (error)`);
      return false;
    }
  }

  private async makeHealthCheckRequest(upstream: Upstream): Promise<number | undefined> {
    const path = this.getHealthCheckPath(upstream.url);
    const useHttps = this.shouldUseHttps(upstream.url);

    try {
      const options = {
        ...parseUpstream(upstream.url, path),
        agent: this.healthCheckAgent  // Use pooled connections for health checks
      };

      const requestModule = useHttps ? https : http;
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = requestModule.request(options, resolve);
        req.on('error', (err) => {
          console.log(`🔍 Request error for ${upstream.url}: ${err.message}`);
          reject(err);
        });
        req.setTimeout(5000, () => {
          console.log(`🔍 Request timeout for ${upstream.url}`);
          req.destroy();
          reject(new Error('Health check request timed out'));
        });
        req.end();
      });

      console.log(`🔍 Response received for ${upstream.url}: ${response.statusCode}`);
      return response.statusCode;
    } catch (error) {
      console.log(`🔍 Exception in makeHealthCheckRequest: ${error}`);
      throw error;
    }
  }

  private shouldUseHttps(hostname: string): boolean {
    const httpsHosts = [
      'jsonplaceholder.typicode.com',
      'dummyjson.com'
    ];

    // Local development uses HTTP
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return false;
    }

    return httpsHosts.includes(hostname);
  }

  private getHealthCheckPath(hostname: string): string {
    switch (hostname) {
      case 'jsonplaceholder.typicode.com':
        return '/posts/1';
      case 'dummyjson.com':
        return '/products/1';
      case 'localhost:3001':
        return '/health-check';
      default:
        return '/health-check';
    }
  }

  getActiveUpstreams(): Set<string> {
    console.log(`🔍 Current active upstreams: ${Array.from(this.activeUpstreams).join(', ')}`);
    return this.activeUpstreams;
  }

  isUpstreamActive(upstreamId: string): boolean {
    const isActive = this.activeUpstreams.has(upstreamId);
    console.log(`🔍 Is ${upstreamId} active? ${isActive}`);
    return isActive;
  }

  startPeriodicChecks(upstreams: Upstream[], intervalMs: number): void {
    console.log(`🔍 Starting periodic health checks every ${intervalMs}ms for upstreams:`, upstreams.map(u => u.id));

    // Start with all upstreams active
    upstreams.forEach(upstream => {
      this.activeUpstreams.add(upstream.id);
      console.log(`🔍 Initially marking ${upstream.id} as active`);
    });

    this.intervalId = setInterval(() => {
      console.log(`🔍 Running periodic health checks...`);
      upstreams.forEach((upstream) => {
        this.checkHealth(upstream).catch(error => {
          console.error(`🔍 Error during periodic health check for upstream ${upstream.id}: ${error.message}`)
        })
      })
    }, intervalMs);
  }

  // Cleanup method for graceful shutdown
  public destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.healthCheckAgent.destroy();
  }
}
