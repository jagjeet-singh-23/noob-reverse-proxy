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
const server_schema_1 = require("./server-schema");
function createServer(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const { port, workerCount } = config;
        const WORKER_POOL = [];
        if (node_cluster_1.default.isPrimary) {
            console.log(`Master ${process.pid} is running`);
            for (let i = 0; i < workerCount; ++i) {
                const worker = node_cluster_1.default.fork({ config: JSON.stringify(config.config) });
                WORKER_POOL.push(worker);
                console.log(`Master Node Spinned up worker ${i}`);
            }
            const server = node_http_1.default.createServer((req, res) => {
                // select a random worker
                const index = Math.floor(Math.random() * WORKER_POOL.length);
                const worker = WORKER_POOL.at(index);
                if (!worker)
                    throw new Error(`Worker not found!`);
                const payload = {
                    requestType: "HTTP",
                    headers: req.headers,
                    body: null,
                    url: `${req.url}`,
                };
                worker.send(JSON.stringify(payload));
                worker.on("message", (workerReply) => __awaiter(this, void 0, void 0, function* () {
                    const reply = yield server_schema_1.workerMessageReplySchema.parseAsync(JSON.parse(workerReply));
                    if (reply.errorCode) {
                        res.writeHead(parseInt(reply.errorCode));
                        res.end(reply.error);
                        return;
                    }
                    res.writeHead(200);
                    res.end(reply.data);
                    return;
                }));
            });
            server.listen(port, () => {
                console.log(`Reverse Proxy Server is running on http://localhost:${port}`);
            });
        }
        else {
            console.log(`Worker ${process.pid} started`);
            const parseYAMLConfig = JSON.parse(process.env.config);
            const config = yield config_schema_1.rootConfigSchema.parseAsync(parseYAMLConfig);
            process.on("message", (message) => __awaiter(this, void 0, void 0, function* () {
                const validatedMessage = yield server_schema_1.workerMessageSchema.parseAsync(JSON.parse(message));
                const requestURL = validatedMessage.url;
                const rule = config.server.rules.find((e) => {
                    const regex = new RegExp(`^${e.path}.*$`);
                    return regex.test(requestURL);
                });
                // handle 404 error
                if (!rule) {
                    const reply = {
                        errorCode: "404",
                        error: `Rule not found for ${requestURL}`,
                    };
                    if (process.send)
                        return process.send(JSON.stringify(reply));
                }
                // Round Robin Upstream Selection
                let currentUpstreamIndex = 0;
                const upstreams = rule === null || rule === void 0 ? void 0 : rule.upstreams.map((upstreamId) => config.server.upstreams.find((u) => u.id === upstreamId)).filter(Boolean);
                if ((upstreams === null || upstreams === void 0 ? void 0 : upstreams.length) === 0) {
                    const reply = {
                        errorCode: "500",
                        error: `No valid upstreams found for rule: ${rule}`,
                    };
                    if (process.send)
                        return process.send(JSON.stringify(reply));
                }
                const activeUpstreams = new Set(rule === null || rule === void 0 ? void 0 : rule.upstreams);
                const upstream = upstreams[currentUpstreamIndex];
                currentUpstreamIndex = (currentUpstreamIndex + 1) % upstreams.length;
                const request = node_http_1.default.request({ host: upstream === null || upstream === void 0 ? void 0 : upstream.url, path: requestURL }, (proxyRes) => {
                    let body = "";
                    proxyRes.on("data", (chunk) => (body += chunk));
                    proxyRes.on("end", () => {
                        const reply = {
                            data: body,
                        };
                        if (process.send)
                            return process.send(JSON.stringify(reply));
                    });
                });
                const selectNextUpstream = (activeUpstreams, allUpstreams) => {
                    for (const upstreamId of allUpstreams) {
                        if (activeUpstreams.has(upstreamId)) {
                            return config.server.upstreams.find((u) => u.id === upstreamId);
                        }
                    }
                    return null; // No active upstreams available
                };
                // Modify the request handling to use the selectNextUpstream function
                request.on("error", (err) => {
                    console.error(`Request to upstream ${upstream === null || upstream === void 0 ? void 0 : upstream.id} failed: ${err.message}`);
                    activeUpstreams.delete(upstream.id); // Remove failed upstream from active list
                    // Select the next upstream if the current one fails
                    const nextUpstream = selectNextUpstream(activeUpstreams, rule.upstreams);
                    // handle if there are no active upstreams available
                    if (!nextUpstream) {
                        const reply = {
                            errorCode: "500",
                            error: `No active upstreams available for rule: ${rule}`,
                        };
                        if (process.send)
                            return process.send(JSON.stringify(reply));
                    }
                    else {
                        // retry the request with the next available upstream
                        const retryRequest = node_http_1.default.request({ host: nextUpstream.url, path: requestURL }, (proxyRes) => {
                            let body = "";
                            proxyRes.on("data", (chunk) => (body += chunk));
                            proxyRes.on("end", () => {
                                const reply = {
                                    data: body,
                                };
                                if (process.send)
                                    return process.send(JSON.stringify(reply));
                            });
                        });
                        retryRequest.on("error", (retryErr) => {
                            console.error(`Retry request to upstream ${nextUpstream.id} failed: ${retryErr.message}`);
                            const reply = {
                                errorCode: "500",
                                error: `No active upstreams available for rule: ${rule}`,
                            };
                            if (process.send)
                                return process.send(JSON.stringify(reply));
                        });
                        retryRequest.end();
                    }
                });
                request.end();
            }));
        }
    });
}
