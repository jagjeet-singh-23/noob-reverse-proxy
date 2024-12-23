import cluster, { Worker } from "node:cluster";
import http from "node:http";
import { RootConfig, rootConfigSchema } from "./config-schema";

interface CreateServerConfig {
  port: number;
  workerCount: number;
  config: RootConfig;
}

export async function createServer(config: CreateServerConfig) {
  const { workerCount } = config;
  if (cluster.isPrimary) {
    console.log(`Master ${process.pid} is running`);

    for (let i = 0; i < workerCount; ++i) {
      cluster.fork({ config: JSON.stringify(config.config) });
      console.log(`Master Node Spinned up worker ${i}`);
    }

    const server = http.createServer(function (req, res) {
      // select a random worker
      const index = Math.floor(Math.random() * workerCount);
      const worker: Worker = Object.values(!cluster.workers)[index];

      worker.send({
        requestType: "http",
        headers: "",
        body: "",
        path: "",
      });
    });
  } else {
    console.log(`Worker ${process.pid} started`);
    const parseYAMLConfig = JSON.parse(process.env.config as string);
    const config = await rootConfigSchema.parseAsync(parseYAMLConfig);
  }
}
