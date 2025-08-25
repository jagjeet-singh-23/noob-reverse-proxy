import http from "node:http";
import { IHttpServer, IWorkerManager } from "../core/interfaces";
import { WorkerMessageReplyType, WorkerMessageType } from "../core/models";

export class HttpServer implements IHttpServer {
  private server?: http.Server;

  constructor(
    private port: number,
    private workerManager: IWorkerManager
  ) { }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (error) {
          console.error('Error handling request:', error);
          this.sendErrorResponse(res, 500, 'Internal server error');
        }
      });

      this.server.listen(this.port, () => {
        console.log(`Reverse Proxy Server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
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
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(reply.data || '');
    }
  }

  private sendErrorResponse(res: http.ServerResponse, statusCode: number, message: string): void {
    if (!res.headersSent) {
      res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
      res.end(message);
    }
  }
}
