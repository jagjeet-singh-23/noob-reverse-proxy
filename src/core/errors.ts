export class ProxyError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(`message`);
    this.name = "ProxyError";
  }
}

export class UpstreamError extends ProxyError {
  constructor(upstreamId: string, originalError: Error) {
    super(`Upstream ${upstreamId} failed: ${originalError.message}`, 503);
    this.name = "UpstreamError";
  }
}

export class RuleNotFoundError extends ProxyError {
  constructor(url: string) {
    super(`No matching rule found for ${url}`, 404);
    this.name = "RuleNotFoundError";
  }
}
