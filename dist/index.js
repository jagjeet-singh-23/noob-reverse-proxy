"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const commander_1 = require("commander");
const os_1 = __importDefault(require("os"));
const config_1 = require("./core/config");
const clusterManager_1 = require("./sever/clusterManager");
function createServer(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const clusterManager = new clusterManager_1.ClusterManager(config);
        yield clusterManager.start();
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        commander_1.program.option("--config <path>");
        commander_1.program.parse();
        const options = commander_1.program.opts();
        if (!options || ("config" in options && !options.config)) {
            throw new Error("No config file provided");
        }
        const parsedConfig = yield (0, config_1.parseYAMLConfig)(options.config);
        const validatedConfig = yield (0, config_1.validateConfig)(parsedConfig);
        const port = validatedConfig.server.listen;
        const workerCount = (_a = validatedConfig.server.workers) !== null && _a !== void 0 ? _a : os_1.default.cpus().length;
        const config = validatedConfig;
        yield createServer({ port, workerCount, config });
    });
}
main().catch(error => {
    process.exit(1);
});
