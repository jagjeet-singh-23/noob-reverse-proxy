import cluster from "cluster";
import { ProxyServerConfig } from "../core/models";
import { ProxyServiceFactory } from "../factory/proxyServiceFactory";
import { HttpServer } from "./httpServer";
import { WorkerManager } from "./workerManager";

export class ClusterManager {
  constructor(private config: ProxyServerConfig) {
    console.log("🏭 ClusterManager created with config:", JSON.stringify(config, null, 2));

    // Log SSL configuration status
    if (this.config.config.server.ssl?.enabled) {
      console.log("🔐 SSL termination will be enabled");
    } else {
      console.log("🌐 HTTP-only mode configured");
    }
  }

  async start(): Promise<void> {
    if (cluster.isPrimary) {
      await this.startPrimary();
    } else {
      await this.startWorker();
    }
  }

  private async startPrimary(): Promise<void> {
    console.log("🏭 Starting primary process...");

    const workerManager = new WorkerManager(this.config.workerCount, this.config.config);
    workerManager.initializeWorkers();

    // Pass SSL configuration to HTTP server
    const sslConfig = this.config.config.server.ssl;
    const httpServer = new HttpServer(this.config.port, workerManager, sslConfig);

    console.log("🌐 Starting HTTP/HTTPS servers...");
    await httpServer.start();

    // Enhanced SSL status logging
    if (sslConfig?.enabled) {
      const sslPort = sslConfig.port || 8443;
      console.log(`\n🔐 SSL TERMINATION ACTIVE`);
      console.log(`📡 HTTP Server:  http://localhost:${this.config.port}`);
      console.log(`🔒 HTTPS Server: https://localhost:${sslPort}`);
      console.log(`🔑 Certificate: ${sslConfig.cert ? 'Custom certificate' : 'Auto-generated dev certificate'}`);
      console.log(`🛡️  TLS Protocols: ${sslConfig.protocols?.join(', ') || 'TLS 1.2, TLS 1.3'}`);
    } else {
      console.log(`\n🌐 HTTP-ONLY MODE`);
      console.log(`📡 HTTP Server: http://localhost:${this.config.port}`);
    }

    console.log(`\n🏭 Cluster ready with ${this.config.workerCount} workers`);
  }

  private async startWorker(): Promise<void> {
    try {
      const configString = process.env.config;
      if (!configString) {
        throw new Error('No config found in environment');
      }

      const parsedConfig = JSON.parse(configString);
      const requestHandler = ProxyServiceFactory.createRequestHandler(parsedConfig.server);

      console.log(`👷 Worker ${process.pid} starting with SSL support...`);

      process.on("message", async (message: string) => {
        try {
          const parsedMessage = JSON.parse(message);

          // Add SSL termination info to request context
          if (parsedMessage.headers && parsedMessage.headers['x-forwarded-proto']) {
            console.log(`🔒 Processing ${parsedMessage.headers['x-forwarded-proto'].toUpperCase()} request in worker ${process.pid}`);
          }

          const reply = await requestHandler.handleRequest(parsedMessage);

          if (process.send) {
            process.send(JSON.stringify(reply));
          }
        } catch (error) {
          console.error(`👷 Worker ${process.pid} error:`, error);
          const errorReply = {
            errorCode: "500",
            error: "Internal worker error"
          };

          if (process.send) {
            process.send(JSON.stringify(errorReply));
          }
        }
      });

      console.log(`✅ Worker ${process.pid} ready for SSL-terminated requests`);

    } catch (error) {
      console.error(`❌ Worker ${process.pid} failed to start:`, error);
      process.exit(1);
    }
  }

  // Graceful shutdown for SSL cleanup
  async stop(): Promise<void> {
    console.log("🏭 Shutting down cluster...");

    if (cluster.isPrimary) {
      // Stop all workers
      for (const worker of Object.values(cluster.workers || {})) {
        if (worker) {
          worker.kill();
        }
      }
      console.log("🏭 All workers stopped");
    }
  }
}
