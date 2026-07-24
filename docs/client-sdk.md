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

### Capabilities

```typescript
const caps = await client.capabilities("assistant");
// { description, inputMimeTypes, outputMimeTypes, supportedMimeTypes, ... }
```

### Running Agents

```typescript
// Non-streaming run
const { result, events, threadId } = await client.run("assistant", "What is the capital of France?", {
  threadId: "my-thread",
  model: "gpt-4o",
});

// Streaming run with callbacks
client.stream("assistant", "Tell me a story", {
  onChunk: (delta) => process.stdout.write(delta),
  onEvent: (event) => console.log("Event:", event.type),
  onDone: (result, threadId) => console.log("Done:", result),
  onError: (error) => console.error("Error:", error),
}, {
  threadId: "thread-123",
  signal: abortController.signal,  // pass AbortSignal to cancel
});
```

### Resuming Interrupted Executions

```typescript
const { result, events } = await client.resume(
  "assistant",
  "interrupt-uuid",
  { approved: true },    // payload
  "resolved",            // status: 'resolved' | 'cancelled'
  { threadId: "thread-123" }
);
```

### Thread Management

```typescript
// List all threads
const threads = await client.listThreads();

// List threads for a specific agent
const threads = await client.listThreads({ agentId: "assistant" });

// List threads for a specific agent and user
const threads = await client.listThreads({ agentId: "assistant", userId: "alice" });

// Create a thread
await client.createThread("thread-123", [
  { role: "user", content: "Hello" }
], { userId: "alice" });

// Get messages
const messages = await client.getThreadMessages("thread-123");

// Get runs with usage/cost data
const runs = await client.getThreadRuns("thread-123");

// Get thread stats
const { totalCost, runCount } = await client.getThreadStats("thread-123");

// Delete thread
await client.deleteThread("thread-123");
```

### State Management (Agent-Level)

```typescript
// Get the full shared state snapshot
const state = await client.getAgentState("assistant");

// Set a key-value pair
await client.setAgentState("assistant", "theme", "dark");

// Delete a key
await client.deleteAgentState("assistant", "theme");
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

### Meta Events

```typescript
// Send a meta event (e.g. thumbs up, tag, note)
const metaEvent = await client.sendMetaEvent("thread-123", "thumbs_up", { rating: 5 });

// Retrieve meta events with optional pagination
const { metaEvents, count } = await client.getMetaEvents("thread-123", 20, 0);
```

### Detachable Streaming

```typescript
// Start a stream that can be disconnected from and later rejoined
const handle = client.streamDetached("assistant", "Process this data", {
  onChunk: (delta) => process.stdout.write(delta),
  onDone: (result) => console.log("Done:", result),
}, { threadId: "thread-123" });

// Disconnect without cancelling the agent run
handle.disconnect();

// The result promise still resolves when the agent finishes
const finalResult = await handle.result;

// Rejoin a previously detached stream
const rejoinHandle = client.rejoin("assistant", "thread-123", {
  onChunk: (delta) => process.stdout.write(delta),
  onDone: (result) => console.log("Complete:", result),
});
```

### Passing Custom Context to Tool Handlers

When you pass extra keys in the `opts` object of `stream()` or `run()`, they are sent to the server and made available in tool handlers via `context.metadata`:

```typescript
client.stream("assistant", "Analyze this", {
  onChunk: (delta) => process.stdout.write(delta),
  onDone: (result) => console.log("Done:", result),
}, {
  threadId: "thread-123",
  metadata: { tenant: "acme-corp", role: "admin" },  // forwarded to tool handlers
});
```

On the server side, every tool handler receives:
- `context.userId` — caller identity (resolved by `resolveIdentity` or fallback to IP)
- `context.threadId` — current conversation thread
- `context.agentId` — which agent is running
- `context.metadata` — custom data forwarded from the client

## AguiWebSocketClient

The `AguiWebSocketClient` provides full-duplex real-time communication:

```typescript
import { AguiWebSocketClient } from "agui-framework/client";

const ws = new AguiWebSocketClient("ws://localhost:4124", "assistant");

await ws.connect("optional-api-key", "model-id");
console.log("Connected");

// Get capabilities
const caps = await ws.getCapabilities();

// Run agent
await ws.run("What is the capital of France?");

// Stream via async generator
for await (const chunk of ws.stream("Tell me a story")) {
  process.stdout.write(chunk);
}

// Resume
await ws.resume("interrupt-id", { approved: true }, "resolved");

// Listen for events
ws.on("event", (event) => {
  console.log("Event:", event.type);
});

ws.on("chunk", (data) => {
  process.stdout.write(data.delta);
});

// Close connection
ws.close();
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

## RunOptions

```typescript
interface RunOptions {
  apiKey?: string
  model?: string
  threadId?: string
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  metadata?: Record<string, unknown>
  forkFrom?: { checkpointId: string }
}
```

## DetachedStreamHandle

```typescript
interface DetachedStreamHandle {
  disconnect: () => void                      // Gracefully disconnect without cancelling the run
  result: Promise<string>                     // Resolves when the agent finishes
}
```

## Branching Chat (Fork from Checkpoint)

Every run produces a `checkpointId`. Each message stores `parentCheckpointId` — the checkpoint its run forked from. To edit a message or regenerate a response, specify `forkFrom`:

```typescript
// Edit a user message — fork from its parent checkpoint
const result = await client.run("assistant", "Edited prompt", {
  threadId: "thread-123",
  forkFrom: { checkpointId: "cp_abc123" },
});

// Regenerate an AI response — same checkpoint, no new input
const handle = client.streamDetached("assistant", "", {
  onChunk: (delta) => console.log(delta),
  onDone: (result) => console.log("Done:", result),
}, {
  threadId: "thread-123",
  forkFrom: { checkpointId: "cp_def456" },
});
```

The server reconstructs the branch by walking message ancestry — only messages whose `parentCheckpointId` is reachable from the fork point are included in the run. Messages from other branches are isolated.

## API Reference

### `AguiClient`

| Method | Description |
|--------|-------------|
| `constructor(baseUrl)` | Create HTTP client |
| `agents()` | List all agents |
| `agent(id)` | Get single agent metadata |
| `capabilities(agentId)` | Get agent capabilities |
| `run(agentId, prompt, opts?)` | Execute agent (non-streaming). `opts.forkFrom` forks from a checkpoint |
| `stream(agentId, prompt, callbacks, opts?)` | Stream agent response via SSE. `opts.forkFrom` forks from a checkpoint |
| `resume(agentId, interruptId, payload?, status?, opts?)` | Resume interrupted execution |
| `streamDetached(agentId, prompt, callbacks, opts?)` | Detachable stream (supports rejoin). `opts.forkFrom` forks from a checkpoint |
| `rejoin(agentId, threadId, callbacks, opts?)` | Rejoin a detached stream |
| `listThreads(opts?)` | List threads, optionally filtered by `{ agentId?, userId? }` |
| `getThreadMessages(threadId)` | Get messages for a thread |
| `createThread(threadId, messages?, metadata?)` | Create a thread |
| `deleteThread(threadId)` | Delete a thread |
| `getThreadRuns(threadId)` | Get run history with usage/cost |
| `getThreadStats(threadId)` | Get cumulative cost and run count |
| `getAgentState(agentId)` | Read shared state snapshot |
| `setAgentState(agentId, key, value)` | Set a key in shared state |
| `deleteAgentState(agentId, key)` | Delete a key from shared state |
| `sendMetaEvent(threadId, metaType, payload)` | Submit a meta event |
| `getMetaEvents(threadId, limit?, offset?)` | Fetch meta events with pagination |
| `models()` | List all models |
| `model(id)` | Get model details |
| `modelsByProvider(provider)` | Get models by provider |

### `AguiWebSocketClient`

| Method | Description |
|--------|-------------|
| `constructor(url, agentId)` | Create WS client |
| `connect(apiKey?, model?)` | Connect and subscribe |
| `close()` | Close connection |
| `getCapabilities()` | Get agent capabilities |
| `run(prompt)` | Run agent |
| `stream(prompt)` | Stream agent (async generator) |
| `resume(interruptId, payload?, status?)` | Resume execution |
| `on(type, handler)` | Listen for message type |
| `off(type)` | Remove listener |
| `send(msg)` | Send raw message |

### Functions

| Function | Description |
|----------|-------------|
| `createClient(baseUrl)` | Create an AguiClient instance |
