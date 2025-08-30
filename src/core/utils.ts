import { URL } from "node:url";
import { ParsedUpstreamOptions } from "./interfaces";

export function parseUpstream(
  upstreamUrl: string,
  path: string,
  method: string = "GET"
): ParsedUpstreamOptions {
  // Ensure URL has a scheme for parsing
  const normalizedUrl = upstreamUrl.startsWith("http")
    ? upstreamUrl
    : `http://${upstreamUrl}`;

  const urlObj = new URL(normalizedUrl);

  return {
    hostname: urlObj.hostname,
    port: urlObj.port ? parseInt(urlObj.port, 10) : urlObj.protocol === "https:" ? 443 : 80,
    path,
    method,
  };
}
