# MCP Integration

The Model Context Protocol (MCP) integration allows agents to connect to external tool servers, auto-discover available tools, and use them during execution.

## MCPClientManager

The `MCPClientManager` handles connections to MCP servers via stdio or streamable HTTP:

```typescript
import { MCPClientManager, MCPServerConfig } from "agui-framework";

const manager = new MCPClientManager();

const config: MCPServerConfig = {
  transport: "stdio",
  command: "node",
  args: ["path/to/mcp-server.js"],
};

await manager.connect(config);
const tools = manager.getTools(); // Auto-discovered ToolConfig[]
```

## Agent Integration

Agents can be configured with MCP servers directly:

```typescript
const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You have access to MCP tools.",
  mcpServers: [
    {
      transport: "stdio",
      command: "node",
      args: ["path/to/mcp-server.js"],
    },
    {
      transport: "streamable-http",
      url: "https://mcp.example.com/tools",
    },
  ],
});

// MCP tools are auto-discovered and merged into the agent's tool list
const tools = agent.getTools(); // includes MCP tools + any configured tools
```

## Transport Types

### stdio

Launches a subprocess and communicates via stdin/stdout:

```typescript
{
  transport: "stdio",
  command: "node",
  args: ["server.js"],
  env: { CUSTOM_VAR: "value" }, // optional
}
```

### streamable-http

Connects to a remote HTTP server:

```typescript
{
  transport: "streamable-http",
  url: "https://mcp.example.com/tools",
  headers: { Authorization: "Bearer token" }, // optional
}
```

## MCP Server Configuration

```typescript
interface MCPServerConfig {
  transport: "stdio" | "streamable-http";
  command?: string;       // for stdio
  args?: string[];        // for stdio
  url?: string;           // for streamable-http
  headers?: Record<string, string>; // for streamable-http
  env?: Record<string, string>;     // for stdio
}
```

## Combining MCP Tools with Local Tools

MCP tools are merged with locally configured tools:

```typescript
const agent = new Agent({
  ...config,
  tools: [localTool],
  mcpServers: [mcpConfig],
});
// agent.getTools() → [localTool, mcpTool1, mcpTool2, ...]
```

## Event Flow

```
Agent Initialization
     │
     ▼
  MCPClientManager.connect(servers)
     │
     ├─► Spawn stdio subprocess / Connect HTTP
     │
     ├─► List available tools
     │
     └─► Register tools as ToolConfig[]
              │
              ▼
          Agent Execution
              │
              ├─► LLM calls MCP tool
              ├─► Tool executed via MCP
              └─► Result returned to LLM
```

## API Reference

### `MCPClientManager`

| Method | Description |
|--------|-------------|
| `connect(config)` | Connect to an MCP server |
| `disconnect(name?)` | Disconnect from server(s) |
| `getTools()` | Get all discovered tools |
| `listConnections()` | List active connections |

### Types

| Type | Description |
|------|-------------|
| `MCPServerConfig` | MCP server configuration |
| `MCSTransportType` | `"stdio"` \| `"streamable-http"` |

### Related

- `MCPClientManager` is automatically used by `Agent` when `mcpServers` is configured
- Tools are merged with locally configured tools on `agent.getTools()`
- Each connection is tracked independently; disconnect by server name
