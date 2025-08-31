import http from "node:http";
import https from "node:https";
import { IProxyClient } from "../core/interfaces";
import { Upstream } from "../core/models";
import { parseUpstream } from "../core/utils";

export class HttpProxyClient implements IProxyClient {
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;

  constructor() {
    // HTTP Agent with connection pooling
    this.httpAgent = new http.Agent({
      keepAlive: true,              // Enable keep-alive connections
      keepAliveMsecs: 30000,        // Keep connections alive for 30 seconds
      maxSockets: 50,               // Max concurrent connections per upstream
      maxFreeSockets: 10,           // Max idle connections to maintain
      timeout: 10000,               // Connection timeout (10s)
      scheduling: 'fifo'            // First-in-first-out connection reuse
    });

    // HTTPS Agent with connection pooling
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 10000,
      scheduling: 'fifo'
    });

    // Log agent statistics periodically for monitoring
    this.startAgentMonitoring();
  }

  async makeRequest(upstream: Upstream, path: string): Promise<string> {
    const options = parseUpstream(upstream.url, path);
    const useHttps = this.shouldUseHttps(upstream.url);
    const requestModule = useHttps ? https : http;
    const agent = useHttps ? this.httpsAgent : this.httpAgent;

    // Add agent to request options for connection pooling
    const requestOptions = {
      ...options,
      agent: agent
    };

    try {
      console.log(`🌐 Using ${useHttps ? 'HTTPS' : 'HTTP'} with connection pooling for ${upstream.url}`);

      const response = await this.executeRequest(requestOptions, requestModule);
      const body = await this.readResponseBody(response);
      return body;
    } catch (error: any) {
      throw error;
    }
  }

  private shouldUseHttps(hostname: string): boolean {
    // Local development uses HTTP
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return false;
    }

    // External APIs require HTTPS
    return true;
  }

  private executeRequest(options: any, requestModule: typeof http | typeof https): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const request = requestModule.request(options, resolve);

      request.on('error', (err) => {
        console.log(`🌐 Request error: ${err.message}`);
        reject(err);
      });

      request.setTimeout(10000, () => {
        console.log(`🌐 Request timeout for ${options.hostname}:${options.port}${options.path}`);
        request.destroy();
        reject(new Error('Request timed out'));
      });

      request.end();
    });
  }

  private async readResponseBody(response: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";

      response.on('data', chunk => {
        body += chunk;
      });

      response.on('end', () => resolve(body));
      response.on('error', reject);
    });
  }

  private startAgentMonitoring(): void {
    // Monitor connection pool stats every 30 seconds
    setInterval(() => {
      this.logAgentStats();
    }, 30000);
  }

  private logAgentStats(): void {
    // Log HTTP agent statistics
    const httpStats = {
      sockets: Object.keys(this.httpAgent.sockets).length,
      freeSockets: Object.keys(this.httpAgent.freeSockets).length,
      requests: Object.keys(this.httpAgent.requests).length
    };

    // Log HTTPS agent statistics  
    const httpsStats = {
      sockets: Object.keys(this.httpsAgent.sockets).length,
      freeSockets: Object.keys(this.httpsAgent.freeSockets).length,
      requests: Object.keys(this.httpsAgent.requests).length
    };

    console.log(`🔗 Connection Pool Stats - HTTP: ${JSON.stringify(httpStats)}, HTTPS: ${JSON.stringify(httpsStats)}`);
  }

  // Graceful shutdown - destroy all connections
  public destroy(): void {
    console.log('🔗 Destroying connection pools...');
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }
}
