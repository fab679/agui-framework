# Server

AGUI Framework includes a built-in HTTP and WebSocket server for deploying agents as services.

## AguiServer

The `AguiServer` is an Express-based HTTP server with REST API, SSE streaming, WebSocket support, CORS, rate limiting, and API key authentication.

```typescript
import { AguiServer, Agent } from "agui-framework/server";

const agent = new Agent({
  name: "assistant",
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant.",
});

const server = new AguiServer({
  port: 4124,
  agents: [agent],
  apiKey: "optional-api-key",
});

await server.start();
console.log("Server running on http://localhost:4124");
```

## Server Configuration

```typescript
interface ServerConfig {
  port: number;             // Server port (default: 4124)
  agents: AgentRegistration[]; // Agent definitions or paths
  apiKey?: string;          // API key authentication
  cors?: CorsOptions;       // CORS configuration
  rateLimit?: RateLimitConfig; // Rate limiting
}
```

## Loading Agents

Agents can be loaded from files:

```typescript
import { AguiServer, loadAgents } from "agui-framework/server";

const agents = await loadAgents([
  { path: "./agents/basic-agent.ts", name: "assistant" },
  { path: "./agents/weather-agent.ts", name: "weather" },
]);

const server = new AguiServer({
  port: 4124,
  agents,
});
```

## REST API

The server exposes the following endpoints:

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List all agents and their capabilities |
| `GET` | `/api/agents/:id` | Get agent metadata |
| `GET` | `/api/agents/:id/capabilities` | Get agent capabilities |

### Execution

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agents/:id/run` | Execute agent (JSON response) |
| `POST` | `/api/agents/:id/stream` | Execute agent (SSE stream) |

Request body:

```json
{
  "prompt": "What is the capital of France?",
  "threadId": "optional-thread-id",
  "context": {
    "userId": "user-123"
  }
}
```

### Threads

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/threads` | List threads (with totalCost, runCount) |
| `GET` | `/api/threads/:id` | Get thread details |
| `POST` | `/api/threads` | Create a thread |
| `DELETE` | `/api/threads/:id` | Delete a thread |
| `GET` | `/api/threads/:id/messages` | Get thread messages |
| `GET` | `/api/threads/:id/runs` | Get run history (with usage/cost) |
| `GET` | `/api/threads/:id/state` | Get thread state |
| `PUT` | `/api/threads/:id/state` | Update thread state |
| `POST` | `/api/threads/:id/state` | Merge into thread state |

### Resuming

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/threads/:id/resume` | Resume an interrupted execution |

### Models

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/models` | List all models from catalog |
| `GET` | `/api/models/:id` | Get model details |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |

## WebSocket Server

The `AguiWebSocketServer` provides full-duplex real-time communication:

```typescript
import { AguiWebSocketServer } from "agui-framework/server";

const wsServer = new AguiWebSocketServer(server);
```

### WebSocket Protocol

Connected clients can:

- **Run agents** -- Send a run request and receive streaming events
- **Resume executions** -- Resume interrupted agent runs
- **List capabilities** -- Get agent capabilities
- **Subscribe to events** -- Receive real-time event updates

## CLI Usage

```bash
# Start the server with agent files
npx agui serve --port 4124 --agents ./agents/*.ts

# Or using the binary directly
agui serve -p 4124 -a ./agents
```

## Using the Client

```typescript
import { AguiClient, AguiWebSocketClient } from "agui-framework/client";

const client = new AguiClient("http://localhost:4124");

// List agents
const agents = await client.agents();

// Run an agent
const result = await client.run("assistant", {
  prompt: "What is the capital of France?",
});

// Stream an agent
const stream = client.stream("assistant", { prompt: "Tell a story" });
for await (const chunk of stream) {
  console.log(chunk);
}

// WebSocket
const ws = new AguiWebSocketClient("ws://localhost:4124", "agent-id");
await ws.connect();
ws.on("message", (msg) => console.log(msg));
```

## API Reference

### `AguiServer`

| Method | Description |
|--------|-------------|
| `constructor(config)` | Create server |
| `start()` | Start the server |
| `stop()` | Stop the server |
| `getApp()` | Get Express app instance |

### `AguiWebSocketServer`

| Method | Description |
|--------|-------------|
| `constructor(server)` | Create WebSocket server |
| `broadcast(event)` | Broadcast to all clients |

### Functions

| Function | Description |
|----------|-------------|
| `loadAgents(configs)` | Load agents from files or definitions |
| `normalizeAgent(config)` | Normalize agent registration |

### `AguiClient`

| Method | Description |
|--------|-------------|
| `agents()` | List agents |
| `agent(id)` | Get agent metadata |
| `run(id, options)` | Execute agent |
| `stream(id, options)` | Stream agent execution |
| `resume(threadId, options)` | Resume execution |
| `threads()` | List threads |
| `thread(id)` | Get thread details |
| `createThread(data?)` | Create thread |
| `deleteThread(id)` | Delete thread |
| `threadMessages(id)` | Get thread messages |
| `threadRuns(id)` | Get thread runs |
| `threadState(id)` | Get thread state |
| `updateThreadState(id, state)` | Update thread state |
| `models()` | List models |
| `model(id)` | Get model details |
