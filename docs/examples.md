# Examples

The framework includes several comprehensive examples in the `examples/` directory demonstrating different capabilities.

## Running Examples

```bash
# Run a specific example
npx tsx examples/01-basic-agent.ts

# Or using npm scripts
npm run example          # examples/basic.ts
npm run example:stream   # examples/streaming.ts
npm run example:providers # examples/multi-provider.ts
npm run example:express  # examples/express-integration.ts
```

## Example Files

The `examples/` directory contains four increasingly complex examples:

### 01-basic-agent.ts

Demonstrates:
- Agent creation with `Agent`
- Tool definitions and handlers
- Streaming responses with `for await`
- Event emission and subscription
- Capability declarations
- Middleware usage
- Agent cloning

### 02-state-protocol-middleware.ts

Demonstrates:
- `SharedState` versioning and snapshots
- `StateManager` thread isolation
- `ProtocolEncoder` and SSE encoding
- `ProtocolValidator` input validation
- `MiddlewareChain` composable pipeline
- Event pipe transformation

### 03-multi-agent.ts

Demonstrates:
- `MultiAgentManager` orchestration
- `AgentGraph` directed graph workflows
- `DeepAgent` autonomous planning
- Agent handoff and delegation
- Capability-based routing

### 04-persistence-http-client.ts

Demonstrates:
- `MemoryThreadStore` persistence
- `HttpAgent` remote agent communication
- `AguiClient` REST API usage
- `AguiWebSocketClient` WebSocket usage
- Thread CRUD operations

## Quick Recipes

### Basic Agent with Tool

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant with weather knowledge.",
  tools: [{
    name: "get_weather",
    description: "Get weather for a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
    handler: async ({ city }) => ({ city, temperature: 22 }),
  }],
});

const response = await agent.run("What's the weather in Paris?");
console.log(response);
```

### Multi-Provider Setup

```typescript
import { Agent } from "agui-framework";

const agents = {
  openai: new Agent({
    model: "gpt-4o",
    provider: "openai",
    instructions: "You are helpful.",
  }),
  anthropic: new Agent({
    model: "claude-3-5-sonnet-20240620",
    provider: "anthropic",
    instructions: "You are helpful.",
  }),
  local: new Agent({
    model: "llama3",
    provider: "ollama",
    baseUrl: "http://localhost:11434/v1",
  }),
};

for (const [name, agent] of Object.entries(agents)) {
  const response = await agent.run("Say hello!");
  console.log(`${name}: ${response}`);
}
```

### Server with Multiple Agents

```typescript
import { AguiServer, Agent } from "agui-framework/server";

const assistant = new Agent({
  name: "assistant",
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a general assistant.",
});

const coder = new Agent({
  name: "coder",
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a coding specialist.",
  capabilities: ["code-generation"],
});

const server = new AguiServer({
  port: 4124,
  agents: [assistant, coder],
});

await server.start();
```

### Express Integration

The `example:express` script demonstrates integrating the AguiServer with an existing Express application, including:
- Custom route middleware
- File upload handling
- Session management
- Template rendering with agent data
