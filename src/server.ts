import cluster, { Worker } from "node:cluster";
import http from "node:http";
import { RootConfig, rootConfigSchema } from "./config-schema";
import {
  workerMessageSchema,
  WorkerMessageType,
  workerMessageReplySchema,
  WorkerMessageReplyType,
} from "./server-schema";

interface CreateServerConfig {
  port: number;
  workerCount: number;
  config: RootConfig;
}

export async function createServer(config: CreateServerConfig) {
  const { port, workerCount } = config;
  const WORKER_POOL: Worker[] = [];

  if (cluster.isPrimary) {
    console.log(`Master ${process.pid} is running`);

    for (let i = 0; i < workerCount; ++i) {
      const worker = cluster.fork({ config: JSON.stringify(config.config) });
      WORKER_POOL.push(worker);
      console.log(`Master Node Spinned up worker ${i}`);
    }

    const server = http.createServer((req, res) => {
      // select a random worker
      const index = Math.floor(Math.random() * WORKER_POOL.length);
      const worker = WORKER_POOL.at(index);

      if (!worker) throw new Error(`Worker not found!`);

      const payload: WorkerMessageType = {
        requestType: "HTTP",
        headers: req.headers,
        body: null,
        url: `${req.url}`,
      };

      worker.send(JSON.stringify(payload));

      worker.on("message", async (workerReply: string) => {
        const reply = await workerMessageReplySchema.parseAsync(
          JSON.parse(workerReply),
        );

        console.log(reply);

        if (reply.errorCode) {
          res.writeHead(parseInt(reply.errorCode));
          res.end(reply.error);
          return;
        }

        res.writeHead(200);
        res.end(reply.data);
        return;
      });
    });

    server.listen(port, () => {
      console.log(
        `Reverse Proxy Server is running on http://localhost:${port}`,
      );
    });
  } else {
    console.log(`Worker ${process.pid} started`);
    const parseYAMLConfig = JSON.parse(process.env.config as string);
    const config = await rootConfigSchema.parseAsync(parseYAMLConfig);

    process.on("message", async (message: string) => {
      const validatedMessage = await workerMessageSchema.parseAsync(
        JSON.parse(message),
      );

      const requestURL = validatedMessage.url;
      const rule = config.server.rules.find((e) => {
        const regex = new RegExp(`^${e.path}.*$`);
        return regex.test(requestURL);
      });

      // handle 404 error
      if (!rule) {
        const reply: WorkerMessageReplyType = {
          errorCode: "404",
          error: `Rule not found for ${requestURL}`,
        };

        if (process.send) return process.send(JSON.stringify(reply));
      }

      const upstreamID = rule?.upstreams[0];
      const upstream = config.server.upstreams.find((e) => e.id === upstreamID);

      // handle 404 error
      if (!upstream) {
        const reply: WorkerMessageReplyType = {
          errorCode: "500",
          error: `Upstream not found: ${upstream}`,
        };

        if (process.send) return process.send(JSON.stringify(reply));
      }

      const request = http.request(
        { host: upstream?.url, path: requestURL },
        (proxyRes) => {
          let body = "";
          proxyRes.on("data", (chunk) => (body += chunk));
          proxyRes.on("end", () => {
            const reply: WorkerMessageReplyType = {
              data: body,
            };
            if (process.send) return process.send(JSON.stringify(reply));
          });
        },
      );

      request.end();
    });
  }
}
