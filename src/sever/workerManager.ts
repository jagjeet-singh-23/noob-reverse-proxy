import cluster, { Worker } from "node:cluster";
import { IWorkerManager } from "../core/interfaces";
import { ProxyServerConfig } from "../core/models";

export class WorkerManager implements IWorkerManager {
  private workerPool: Worker[] = [];

  constructor(
    private workerCount: number,
    private config: ProxyServerConfig['config']
  ) { }

  initializeWorkers(): void {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = cluster.fork({
        config: JSON.stringify(this.config)
      });
      this.workerPool.push(worker);
      console.log(`Worker ${i} initialized with PID: ${worker.process.pid}`);
    }

    this.setupWorkerRestart();
  }

  getRandomWorker(): Worker {
    if (this.workerPool.length === 0) {
      throw new Error('No workers available');
    }

    const index = Math.floor(Math.random() * this.workerPool.length);
    const worker = this.workerPool[index];

    if (!worker) {
      throw new Error('Selected worker is undefined');
    }

    return worker;
  }

  getWorkerCount(): number {
    return this.workerPool.length;
  }

  private setupWorkerRestart(): void {
    cluster.on("exit", (deadWorker) => {
      console.log(`Worker ${deadWorker.process.pid} died`);

      const index = this.workerPool.indexOf(deadWorker);
      if (index !== -1) {
        this.workerPool.splice(index, 1);
      }

      const newWorker = cluster.fork({
        config: JSON.stringify(this.config)
      });
      this.workerPool.push(newWorker);
      console.log(`New worker spawned with PID: ${newWorker.process.pid}`);
    });
  }
}
