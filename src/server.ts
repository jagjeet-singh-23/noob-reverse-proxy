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
      // Select a random worker
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

    cluster.on("exit", (worker) => {
      // Remove the dead worker
      console.log(`Worker ${worker.process.pid} died`);
      const index = WORKER_POOL.indexOf(worker);

      if (index !== -1) WORKER_POOL.splice(index, 1);

      // Respawn the worker
      const newWorker = cluster.fork({ config: JSON.stringify(config.config) });
      WORKER_POOL.push(newWorker);
      console.log(
        `New worker process spawned with id: ${newWorker.process.pid}`,
      );
    });
  } else {
    console.log(`Worker ${process.pid} started`);
    const parseYAMLConfig = JSON.parse(process.env.config as string);
    const config = await rootConfigSchema.parseAsync(parseYAMLConfig);

    // Health check function
    const checkUpstreamHealth = async (upstream: {
      id: string;
      url: string;
    }) => {
      try {
        const healthCheckRequest = http.request(
          { host: upstream.url, path: "/health-check" }, // Assuming a health check endpoint
          (proxyRes) => {
            if (proxyRes.statusCode === 200) {
              // Mark as active if health check is successful
              activeUpstreams.add(upstream.id);
            } else {
              // Mark as inactive if health check fails
              activeUpstreams.delete(upstream.id);
            }
          },
        );

        healthCheckRequest.on("error", () => {
          // Mark as inactive on error
          activeUpstreams.delete(upstream.id);
        });

        healthCheckRequest.end();
      } catch (error: any) {
        console.error(
          `Health check failed for upstream ${upstream.id}: ${error.message}`,
        );
      }
    };

    // Periodically check the health of upstreams
    const activeUpstreams = new Set<string>(
      config.server.upstreams.map((u) => u.id),
    );

    setInterval(() => {
      config.server.upstreams.forEach((upstream) => {
        checkUpstreamHealth(upstream);
      });
    }, 30000); // Check every 30 seconds

    process.on("message", async (message: string) => {
      const validatedMessage = await workerMessageSchema.parseAsync(
        JSON.parse(message),
      );

      const requestURL = validatedMessage.url;
      const rule = config.server.rules.find((e) => {
        const regex = new RegExp(`^${e.path}.*$`);
        return regex.test(requestURL);
      });

      // Handle 404 error
      if (!rule) {
        const reply: WorkerMessageReplyType = {
          errorCode: "404",
          error: `Rule not found for ${requestURL}`,
        };

        if (process.send) return process.send(JSON.stringify(reply));
      }

      // Round Robin Upstream Selection
      let currentUpstreamIndex = 0;

      const upstreams = rule?.upstreams
        .map((upstreamId) =>
          config.server.upstreams.find((u) => u.id === upstreamId),
        )
        .filter(Boolean);

      if (upstreams?.length === 0) {
        const reply: WorkerMessageReplyType = {
          errorCode: "500",
          error: `No valid upstreams found for rule: ${rule}`,
        };

        if (process.send) return process.send(JSON.stringify(reply));
      }

      // Filter active upstreams
      const activeUpstreamList = upstreams!.filter((upstream) =>
        activeUpstreams.has(upstream!.id),
      );

      if (activeUpstreamList.length === 0) {
        const reply: WorkerMessageReplyType = {
          errorCode: "500",
          error: `No active upstreams available for rule: ${rule}`,
        };
        if (process.send) return process.send(JSON.stringify(reply));
      }

      const upstream = activeUpstreamList[currentUpstreamIndex];
      currentUpstreamIndex =
        (currentUpstreamIndex + 1) % activeUpstreamList.length;

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

      // Handle request errors
      request.on("error", (err) => {
        console.error(
          `Request to upstream ${upstream?.id} failed: ${err.message}`,
        );
        activeUpstreams.delete(upstream!.id); // Remove failed upstream from active list

        // Select the next upstream if the current one fails
        const nextUpstream =
          activeUpstreamList[currentUpstreamIndex % activeUpstreamList.length];

        // Handle if there are no active upstreams available
        if (!nextUpstream) {
          const reply: WorkerMessageReplyType = {
            errorCode: "500",
            error: `No active upstreams available for rule: ${rule}`,
          };
          if (process.send) return process.send(JSON.stringify(reply));
        } else {
          // Retry the request with the next available upstream
          const retryRequest = http.request(
            { host: nextUpstream.url, path: requestURL },
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

          retryRequest.on("error", (retryErr) => {
            console.error(
              `Retry request to upstream ${nextUpstream.id} failed: ${retryErr.message}`,
            );
            const reply: WorkerMessageReplyType = {
              errorCode: "500",
              error: `No active upstreams available for rule: ${rule}`,
            };
            if (process.send) return process.send(JSON.stringify(reply));
          });

          retryRequest.end();
        }
      });

      request.end();
    });
  }
}
