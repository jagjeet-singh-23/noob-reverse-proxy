import http from "node:http";
import { IHealthChecker } from "../core/interfaces";
import { Upstream } from "../core/models";

export class HttpHealthChecker implements IHealthChecker {
  private activeUpstreams = new Set<string>();
  private intervalId?: NodeJS.Timeout;

  async checkHealth(upstream: Upstream): Promise<boolean> {
    try {
      const statusCode = await this.makeHealthCheckRequest(upstream);
      const isHealthy = statusCode === 200;

      if (isHealthy) {
        this.activeUpstreams.add(upstream.id);
      } else {
        this.activeUpstreams.delete(upstream.id);
      }

      return isHealthy;
    } catch (error: any) {
      console.error(`Health check failed for upstream ${upstream.id}: ${error.message}`);
      this.activeUpstreams.delete(upstream.id);
      return false;
    }
  }

  private async makeHealthCheckRequest(upstream: Upstream): Promise<number | undefined> {
    try {
      const options = {
        host: upstream.url,
        path: "/health-check",
        method: "GET"
      }

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(options, resolve);
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Health check request timed out'));
        })
        req.end();
      });

      return response.statusCode;
    } catch (error) {
      throw error;
    }
  }

  getActiveUpstreams(): Set<string> {
    return this.activeUpstreams;
  }

  isUpstreamActive(upstreamId: string): boolean {
    return this.activeUpstreams.has(upstreamId);
  }

  startPeriodicChecks(upstreams: Upstream[], intervalMs: number): void {
    upstreams.forEach(upstream => this.activeUpstreams.add(upstream.id));

    this.intervalId = setInterval(() => {
      upstreams.forEach((upstream) => {
        this.checkHealth(upstream).catch(error => {
          console.error(`Error during health check for upstream ${upstream.id}: ${error.message}`)
        })
      })
    }, intervalMs);
  }
}
