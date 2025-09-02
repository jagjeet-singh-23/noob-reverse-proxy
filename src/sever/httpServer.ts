import http from "node:http";
import https from "node:https";
import { IHttpServer, IWorkerManager } from "../core/interfaces";
import { WorkerMessageReplyType, WorkerMessageType } from "../core/models";
import { CertificateManager } from "../ssl/certificateManager";

export class HttpServer implements IHttpServer {
  private httpServer?: http.Server;
  private httpsServer?: https.Server;
  private certificateManager: CertificateManager;

  constructor(
    private port: number,
    private workerManager: IWorkerManager,
    private sslConfig?: any
  ) {
    this.certificateManager = new CertificateManager();
  }

  async start(): Promise<void> {
    // Always start HTTP server
    await this.startHttpServer();

    // Start HTTPS server if SSL is configured
    if (this.sslConfig?.enabled) {
      await this.startHttpsServer();
    }
  }

  private async startHttpServer(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (error) {
          console.error('Error handling HTTP request:', error);
          this.sendErrorResponse(res, 500, 'Internal server error');
        }
      });

      this.httpServer.listen(this.port, () => {
        console.log(`🌐 HTTP Reverse Proxy Server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  private async startHttpsServer(): Promise<void> {
    try {
      let sslCredentials;

      if (this.sslConfig.cert && this.sslConfig.key) {
        // Load provided certificates
        sslCredentials = await this.certificateManager.loadCertificate(
          this.sslConfig.cert,
          this.sslConfig.key
        );
      } else {
        // Generate self-signed for development
        sslCredentials = await this.certificateManager.createSelfSignedCertificate();
      }

      const sslOptions = {
        cert: sslCredentials.cert,
        key: sslCredentials.key,
        ...this.certificateManager.getDefaultSSLOptions()
      };

      return new Promise((resolve) => {
        this.httpsServer = https.createServer(sslOptions, async (req, res) => {
          try {
            await this.handleRequest(req, res);
          } catch (error) {
            console.error('Error handling HTTPS request:', error);
            this.sendErrorResponse(res, 500, 'Internal server error');
          }
        });

        const sslPort = this.sslConfig.port || 8443;
        this.httpsServer.listen(sslPort, () => {
          console.log(`🔐 HTTPS Reverse Proxy Server running on https://localhost:${sslPort}`);
          resolve();
        });
      });

    } catch (error) {
      console.error('❌ Failed to start HTTPS server:', error); console.log('📝 Continuing with HTTP only...');
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const worker = this.workerManager.getRandomWorker();

    const payload: WorkerMessageType = {
      requestType: "HTTP",
      headers: req.headers,
      body: null,
      url: req.url || '/'
    };

    worker.send(JSON.stringify(payload));

    // Set up timeout
    const timeout = setTimeout(() => {
      this.sendErrorResponse(res, 504, 'Gateway timeout');
    }, 30000);

    worker.once("message", (workerReply: string) => {
      clearTimeout(timeout);

      try {
        const reply = JSON.parse(workerReply) as WorkerMessageReplyType;
        this.sendResponse(res, reply);
      } catch (error) {
        console.error('Error parsing worker response:', error);
        this.sendErrorResponse(res, 500, 'Internal server error');
      }
    });
  }

  private sendResponse(res: http.ServerResponse, reply: WorkerMessageReplyType): void {
    if (reply.errorCode) {
      this.sendErrorResponse(res, parseInt(reply.errorCode), reply.error || 'Unknown error');
    } else {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'X-Proxy-Version': 'NGINX-Style-v1.0',
        'X-Connection-Pool': 'Enabled'
      });
      res.end(reply.data || '');
    }
  }

  private sendErrorResponse(res: http.ServerResponse, statusCode: number, message: string): void {
    if (!res.headersSent) {
      res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
      res.end(message);
    }
  }

  async stop(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.httpServer) {
      promises.push(new Promise((resolve) => {
        this.httpServer!.close(() => {
          console.log('HTTP Server stopped');
          resolve();
        });
      }));
    }

    if (this.httpsServer) {
      promises.push(new Promise((resolve) => {
        this.httpsServer!.close(() => {
          console.log('HTTPS Server stopped');
          resolve();
        });
      }));
    }

    await Promise.all(promises);
  }
}
