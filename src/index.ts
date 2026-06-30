#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDiscoveryTools } from "./discovery-tools.js";
import { registerMediaTools } from "./media-tools.js";
import { registerMediaConvenienceTools } from "./media-convenience-tools.js";
import { registerWorkoutTools } from "./workout-tools.js";

const server = new McpServer({
  name: "ryot-mcp-starter",
  version: "0.4.0",
});

registerDiscoveryTools(server);
registerWorkoutTools(server);
registerMediaTools(server);
registerMediaConvenienceTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
