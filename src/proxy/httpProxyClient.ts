import http from "node:http";
import https from "node:https";
import { IProxyClient } from "../core/interfaces";
import { Upstream } from "../core/models";
import { parseUpstream } from "../core/utils";

export class HttpProxyClient implements IProxyClient {
  async makeRequest(upstream: Upstream, path: string): Promise<string> {
    // use shared helper
    const options = parseUpstream(upstream.url, path);

    try {
      // Choose HTTP or HTTPS based on upstream
      const requestModule = this.shouldUseHttps(upstream.url) ? https : http;
      console.log(`🌐 Using ${requestModule === https ? 'HTTPS' : 'HTTP'} for ${upstream.url}`);

      const response = await this.executeRequest(options, requestModule);
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

    // These external APIs require HTTPS
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
        console.log(`🌐 Request timeout for ${options.host}${options.path}`);
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
}
