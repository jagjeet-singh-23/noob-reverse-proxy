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
const node_cluster_1 = __importDefault(require("node:cluster"));
const node_http_1 = __importDefault(require("node:http"));
const config_schema_1 = require("./config-schema");
function createServer(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const { workerCount } = config;
        if (node_cluster_1.default.isPrimary) {
            console.log(`Master ${process.pid} is running`);
            for (let i = 0; i < workerCount; ++i) {
                node_cluster_1.default.fork({ config: JSON.stringify(config.config) });
                console.log(`Master Node Spinned up worker ${i}`);
            }
            const server = node_http_1.default.createServer(function (req, res) {
                // select a random worker
                const index = Math.floor(Math.random() * workerCount);
                const worker = Object.values(!node_cluster_1.default.workers)[index];
                worker.send({
                    requestType: "http",
                    headers: "",
                    body: "",
                    path: "",
                });
            });
        }
        else {
            console.log(`Worker ${process.pid} started`);
            const parseYAMLConfig = JSON.parse(process.env.config);
            const config = yield config_schema_1.rootConfigSchema.parseAsync(parseYAMLConfig);
        }
    });
}
