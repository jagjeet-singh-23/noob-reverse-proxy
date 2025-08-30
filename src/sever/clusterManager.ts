import cluster from "cluster";
import { ProxyServerConfig } from "../core/models";
import { ProxyServiceFactory } from "../factory/proxyServiceFactory";
import { HttpServer } from "./httpServer";
import { WorkerManager } from "./workerManager";

export class ClusterManager {
  constructor(private config: ProxyServerConfig) {
    console.log("🏭 ClusterManager created with config:", JSON.stringify(config, null, 2));
  }

  async start(): Promise<void> {
    if (cluster.isPrimary) {
      await this.startPrimary();
    } else {
      await this.startWorker();
    }
  }

  private async startPrimary(): Promise<void> {
    const workerManager = new WorkerManager(this.config.workerCount, this.config.config);
    workerManager.initializeWorkers();

    const httpServer = new HttpServer(this.config.port, workerManager);
    await httpServer.start();
  }

  private async startWorker(): Promise<void> {
    try {
      const configString = process.env.config;
      if (!configString) {
        throw new Error('No config found in environment');
      }

      const parsedConfig = JSON.parse(configString);
      const requestHandler = ProxyServiceFactory.createRequestHandler(parsedConfig.server);

      process.on("message", async (message: string) => {
        try {
          const parsedMessage = JSON.parse(message);
          const reply = await requestHandler.handleRequest(parsedMessage);

          if (process.send) {
            process.send(JSON.stringify(reply));
          }
        } catch (error) {
          console.error('👷 Error processing message:', error);
          const errorReply = {
            errorCode: "500",
            error: "Internal worker error"
          };

          if (process.send) {
            process.send(JSON.stringify(errorReply));
          }
        }
      });
    } catch (error) {
      process.exit(1);
    }
  }
}
