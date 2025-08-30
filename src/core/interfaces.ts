import { Worker } from "node:cluster";
import { Rule, Upstream, WorkerMessageReplyType, WorkerMessageType } from "./models";

export interface IHealthChecker {
  checkHealth(upstream: Upstream): Promise<boolean>;
  getActiveUpstreams(): Set<string>;
  startPeriodicChecks(upstreams: Upstream[], intervalMs: number): void;
  isUpstreamActive(upstreamId: string): boolean;
}

export interface ILoadBalancer {
  selectUpstream(upstreams: Upstream[], activeUpstreams: Set<string>): Upstream | null;
}

export interface IRequestHandler {
  handleRequest(message: WorkerMessageType): Promise<WorkerMessageReplyType>;
}

export interface IProxyClient {
  makeRequest(upstream: Upstream, path: string): Promise<string>;
}

export interface IRuleEngine {
  findMatchingRule(url: string, rules: Rule[]): Rule | null;
}

export interface IWorkerManager {
  initializeWorkers(numWorkers: number): void;
  getRandomWorker(): Worker;
  getWorkerCount(): number;
}

export interface IHttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ParsedUpstreamOptions {
  hostname: string;
  port: number;
  path: string;
  method: string;
}

