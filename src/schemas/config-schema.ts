import { z } from "zod";

const upstreamSchema = z.object({
  id: z.string(),
  url: z.string(),
});

const headerSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const ruleSchema = z.object({
  path: z.string(),
  upstreams: z.array(z.string()),
});

const sslVerificationScheme = z.object({
  enabled: z.boolean(),
  cert: z.string().optional(),
  key: z.string().optional(),
  port: z.number().optional(),
  protocol: z.enum(['http', 'https']).optional(),
  ciphers: z.string().optional(),
});

const serverSchema = z.object({
  listen: z.number(),
  workers: z.number().optional(),
  upstreams: z.array(upstreamSchema),
  headers: z.array(headerSchema).optional(),
  rules: z.array(ruleSchema),
  ssl: sslVerificationScheme.optional(),
});

export const rootConfigSchema = z.object({
  server: serverSchema,
});

export type RootConfig = z.infer<typeof rootConfigSchema>;
