# Client SDK

The AGUI Framework client SDK provides HTTP and WebSocket clients for communicating with remote agent servers.

## AguiClient

The `AguiClient` is an HTTP REST client for the AguiServer:

```typescript
import { AguiClient } from "agui-framework/client";

const client = new AguiClient("http://localhost:4124");
```

### Listing Agents

```typescript
const agents = await client.agents();
console.log(agents);
// [{ id: "assistant", name: "assistant", capabilities: [...] }]

const meta = await client.agent("assistant");
console.log(meta);
// { id, name, capabilities, model, provider, instructions }
```

### Running Agents

```typescript
// Non-streaming run
const result = await client.run("assistant", {
  prompt: "What is the capital of France?",
  threadId: "optional-thread-id",
});

// Streaming run
const stream = client.stream("assistant", {
  prompt: "Tell me a story",
  threadId: "thread-123",
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### Resuming Executions

```typescript
const result = await client.resume("thread-123", {
  interruptId: "interrupt-uuid",
  payload: { approved: true },
  status: "resolved",
});
```

### Thread Management

```typescript
// List threads
const threads = await client.threads();

// Get thread details
const thread = await client.thread("thread-123");

// Create thread
const newThread = await client.createThread({
  metadata: { userId: "alice" },
});

// Delete thread
await client.deleteThread("thread-123");

// Get messages — each message carries an optional agentId identifying which agent produced it
const messages = await client.threadMessages("thread-123");
for (const msg of messages) {
  console.log(msg.agentId ? `[${msg.agentId}]` : '', msg.role, ':', msg.content);
}

// Get runs (with usage/cost data)
const runs = await client.threadRuns("thread-123");
```

### State Management

```typescript
// Get state
const state = await client.threadState("thread-123");

// Update state
await client.updateThreadState("thread-123", { theme: "dark" });
```

### Model Catalog

```typescript
// List all models
const models = await client.models();

// Get specific model
const model = await client.model("gpt-5.6-terra");

// Get models by provider
const fwModels = await client.modelsByProvider("fireworks");
```

## AguiWebSocketClient

The `AguiWebSocketClient` provides full-duplex real-time communication:

```typescript
import { AguiWebSocketClient } from "agui-framework/client";

const ws = new AguiWebSocketClient("ws://localhost:4124", "assistant");

await ws.connect();
console.log("Connected:", ws.connected);

// Get capabilities
const caps = await ws.capabilities();

// Run agent via WebSocket
await ws.run("What is the capital of France?");

// Stream via WebSocket
await ws.stream("Tell me a story");

// Resume
await ws.resume("thread-123", { interruptId: "...", status: "resolved" });

// Listen for events
ws.on("event", (event) => {
  console.log("Event:", event.type);
});

ws.on("message", (msg) => {
  process.stdout.write(msg);
});

// Disconnect
await ws.disconnect();
```

## createClient Factory

```typescript
import { createClient } from "agui-framework/client";

const client = createClient("http://localhost:4124");
// Returns an AguiClient instance
```

## Stream Callbacks

The `stream()` method accepts a `StreamCallbacks` object:

```typescript
interface StreamCallbacks {
  onEvent?: (event: AgentEvent) => void    // Raw agent events (tool calls, state snapshots, delegations, handoffs, etc.)
  onChunk?: (delta: string) => void         // Text content deltas as they stream
  onDone?: (result: string, threadId?: string) => void  // Stream completed
  onError?: (error: Error) => void           // Stream error
}
```

```typescript
import { AguiClient } from "agui-framework/client";
import type { AgentEvent } from "agui-framework";

const client = new AguiClient("http://localhost:4124");

client.stream("assistant", "Tell me a story", {
  onChunk: (chunk) => process.stdout.write(chunk),
  onEvent: (event: AgentEvent) => console.log("Event:", event.type),
  onDone: (result) => console.log("Done:", result),
  onError: (error) => console.error("Error:", error),
}, {
  threadId: "thread-123",
});
```

## API Reference

### `AguiClient`

| Method | Description |
|--------|-------------|
| `constructor(baseUrl, options?)` | Create client |
| `agents()` | List agents |
| `agent(id)` | Get agent metadata |
| `run(id, options)` | Execute agent |
| `stream(id, options)` | Stream agent execution |
| `resume(threadId, options)` | Resume execution |
| `threads()` | List threads |
| `thread(id)` | Get thread details |
| `createThread(data?)` | Create thread |
| `deleteThread(id)` | Delete thread |
| `threadMessages(id)` | Get messages |
| `threadRuns(id)` | Get run history |
| `threadState(id)` | Get thread state |
| `updateThreadState(id, state)` | Update state |
| `models()` | List models |
| `model(id)` | Get model details |
| `modelsByProvider(provider)` | Get models by provider |

### `AguiWebSocketClient`

| Method | Description |
|--------|-------------|
| `constructor(url, agentId)` | Create WS client |
| `connect()` | Connect to server |
| `disconnect()` | Disconnect |
| `capabilities()` | Get agent capabilities |
| `run(prompt, context?)` | Run agent |
| `stream(prompt, context?)` | Stream agent |
| `resume(threadId, options)` | Resume execution |
| `on(event, handler)` | Listen for events |

### Functions

| Function | Description |
|----------|-------------|
| `createClient(baseUrl)` | Create an AguiClient instance |
