import { program } from "commander";
import os from "os";
import { parseYAMLConfig, validateConfig } from "./core/config";
import { ProxyServerConfig } from "./core/models";
import { ClusterManager } from "./sever/clusterManager";

export async function createServer(config: ProxyServerConfig): Promise<void> {
  const clusterManager = new ClusterManager(config);
  await clusterManager.start();
}

async function main() {
  program.option("--config <path>");
  program.parse();

  const options = program.opts();

  if (!options || ("config" in options && !options.config)) {
    throw new Error("No config file provided");
  }

  const validatedConfig = await validateConfig(
    await parseYAMLConfig(options.config),
  );

  const port = validatedConfig.server.listen;
  const workerCount = validatedConfig.server.workers ?? os.cpus().length;
  const config = validatedConfig;

  await createServer({ port, workerCount, config });
}

main();
