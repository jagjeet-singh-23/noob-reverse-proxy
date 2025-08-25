import http from "node:http";
import { IProxyClient } from "../core/interfaces";

import { Upstream } from "../core/models";

export class HttpProxyClient implements IProxyClient {
  async makeRequest(upstream: Upstream, path: string): Promise<string> {
    const options = {
      host: upstream.url,
      path,
      method: "GET"
    }

    try {
      const response = await this.executeRequest(options);
      const body = await this.readResponseBody(response);

      return body;
    } catch (error: any) {
      throw error;
    }
  }

  private executeRequest(options: any): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const request = http.request(options, resolve);
      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timed out'));
      })
      request.end();
    })
  }

  private async readResponseBody(response: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";

      response.on('data', chunk => {
        body += chunk;
      });

      response.on('end', () => resolve(body))
      response.on('error', reject);
    })
  }
}
