# Agent

The `Agent` class is the central orchestrator of the AGUI Framework. It manages LLM interactions, tool execution, event emission, middleware, state, persistence, MCP integration, and cost tracking.

## Creating an Agent

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  name: "my-assistant",
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant.",
  temperature: 0.7,
  maxTokens: 1024,
});
```

## Execution Modes

### `run()` -- Simple Execution

Returns the full text response as a string:

```typescript
const response = await agent.run("What is the capital of France?");
// "The capital of France is Paris."
```

### `stream()` -- Streaming Execution

Returns an `AsyncGenerator` that yields text chunks:

```typescript
for await (const chunk of agent.stream("Tell a story")) {
  process.stdout.write(chunk);
}
```

The `stream()` method also accepts `StreamingOptions`:

```typescript
for await (const chunk of agent.stream(prompt, context, {
  onEvent: (event) => console.log("Event:", event.type),
  onToolCall: (toolCall) => console.log("Tool:", toolCall.name),
})) {
  process.stdout.write(chunk);
}
```

### `resume()` -- Resuming After Interrupt

Resume an agent execution that was paused by an interrupt:

```typescript
const result = await agent.resume(
  interruptId,
  { approved: true, edits: "..." },
  "resolved",
);
```

## Tools

Tools allow agents to interact with external systems:

```typescript
import type { ToolConfig } from "agui-framework";

const searchTool: ToolConfig = {
  name: "web_search",
  description: "Search the web for information",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  handler: async ({ query }) => {
    // Perform web search
    return { results: [...] };
  },
};

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "Use search when needed.",
  tools: [searchTool],
});
```

Tools can be added after construction:

```typescript
agent.addTool(searchTool);
```

## Middleware

Middleware intercepts and transforms the event stream during agent execution:

```typescript
import { createLoggingMiddleware, createFilterToolCallsMiddleware } from "agui-framework";

agent.use(createLoggingMiddleware(console));
agent.use(createFilterToolCallsMiddleware({
  allowedTools: ["web_search"],
}));
```

## Cloning

Create a copy of an agent with the same configuration:

```typescript
const clonedAgent = agent.clone();
```

## Serialization

Agents can be serialized to JSON and restored:

```typescript
const json = agent.toJSON();
const restored = new Agent().fromJSON(json);
```

## Factory Methods

```typescript
// From environment variables
const agent = Agent.createFromEnv();

// Static factory
const agent = Agent.create({ ...config });
```

## Agent Capabilities

Agents can declare capabilities for discovery and routing:

```typescript
const agent = new Agent({
  ...config,
  capabilities: ["code-generation", "data-analysis"],
});

// Add capabilities dynamically
agent.addCapability("translation");
```

## Thread Persistence

Agents can automatically persist runs to a thread store:

```typescript
import { MemoryThreadStore } from "agui-framework";

const agent = new Agent({
  ...config,
  store: new MemoryThreadStore(),
  autoPersist: true,
});

// Manually save/load threads
await agent.saveThread("thread-123");
await agent.loadThread("thread-123");
```

## MCP Integration

Connect MCP servers for auto-discovered tools:

```typescript
const agent = new Agent({
  ...config,
  mcpServers: [
    { transport: "stdio", command: "node", args: ["mcp-server.js"] },
    { transport: "streamable-http", url: "https://mcp.example.com/tools" },
  ],
});
```

## Delegation and Handoff

Agents can delegate work to sub-agents:

```typescript
const subAgent = new Agent({ ... });

// Create a delegation tool
const tool = agent.createDelegationTool("analyze", "Analyze data", subAgent);

// Create a handoff tool
const handoff = agent.createHandoffTool("escalate", "Escalate to expert", subAgent);
```

## Structured Output

Enforce JSON Schema output:

```typescript
const agent = new Agent({
  ...config,
  structuredOutput: true,
  outputSchema: {
    name: "extract_person",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    },
  },
});

const response = await agent.run("Alice is 30.");
// JSON string: { "name": "Alice", "age": 30 }
```

## API Reference

### `Agent`

| Method | Signature | Description |
|--------|-----------|-------------|
| `run` | `(prompt: string, context?: Partial<RunContext>) => Promise<string>` | Execute agent and return text response |
| `stream` | `(prompt: string, context?: Partial<RunContext>, options?: StreamingOptions) => AsyncGenerator<string>` | Execute agent with streaming |
| `resume` | `(interruptId: string, payload?: unknown, status?: "resolved" \| "cancelled") => Promise<string>` | Resume after interrupt |
| `addTool` | `(tool: ToolConfig) => this` | Register a tool |
| `addCapability` | `(capability: string) => this` | Add a capability flag |
| `use` | `(...middlewares: MiddlewareFunction[]) => this` | Register middleware |
| `delegate` | `(subAgent: Agent, prompt: string, config?: DelegationConfig) => Promise<string>` | Delegate to sub-agent |
| `createDelegationTool` | `(name: string, desc: string, subAgent: Agent) => ToolConfig` | Create delegation tool |
| `createHandoffTool` | `(name: string, desc: string, target: Agent) => ToolConfig` | Create handoff tool |
| `clone` | `() => Agent` | Clone the agent |
| `getTools` | `() => ToolConfig[]` | Get registered tools |
| `getCapabilities` | `(peerDescriptors?: Map<string, AgentDescriptor>) => AgentCapabilities` | Get capabilities |
| `loadThread` | `(threadId: string) => Promise<void>` | Load thread from store |
| `saveThread` | `(threadId: string) => Promise<void>` | Save thread to store |
| `toJSON` | `() => string` | Serialize to JSON |
| `fromJSON` | `(json: string) => this` | Restore from JSON |
| `Agent.create` | `(config: AgentConfig) => Agent` | Static factory |
| `Agent.createFromEnv` | `() => Agent` | Create from env vars |
