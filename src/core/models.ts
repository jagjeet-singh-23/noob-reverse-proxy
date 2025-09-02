import { z } from "zod";

export interface Upstream {
  id: string;
  url: string;
}

export interface Rule {
  path: string;
  upstreams: string[];
}

export interface SSLConfig {
  enabled: boolean;
  cert?: string;
  key?: string;
  port?: number;
  protocols?: string[];
  ciphers?: string;
}

export interface ServerConfig {
  upstreams: Upstream[];
  rules: Rule[];
  loadbalancer?: "round-robin" | "random";
  ssl?: SSLConfig;
}

export interface ProxyServerConfig {
  port: number;
  workerCount: number;
  config: {
    server: ServerConfig;
  }
}

export const workerMessageSchema = z.object({
  requestType: z.enum(["HTTP"]),
  headers: z.any(),
  body: z.any(),
  url: z.string(),
});

export const workerMessageReplySchema = z.object({
  data: z.string().optional(),
  error: z.string().optional(),
  errorCode: z.enum(["500", "404"]).optional(),
});

export type WorkerMessageType = z.infer<typeof workerMessageSchema>;
export type WorkerMessageReplyType = z.infer<typeof workerMessageReplySchema>;
