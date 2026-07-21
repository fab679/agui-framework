# Architecture Overview

agui-framework is a TypeScript framework for building AI agent-powered applications. It integrates with multiple LLM providers and implements the AG-UI protocol for real-time communication between backends and frontends.

## System Design

```
agui-framework

  +----------+  +----------+  +----------+  +------------+
  |  Agent    |  | EventBus |  |  State   |  |  Protocol   |
  |           |  |          |  |  Manager |  |  Encoder    |
  | orchestr- |  | publish/ |  | thread-  |  | SSE encode/ |
  | ates LLM  |  | subscribe|  | isolated |  | decode      |
  | + tools   |  | history  |  | key-value|  | validation  |
  +-----+-----+  +----------+  +----------+  +------------+
        |
  +-----+----------------------------------------------+
  |              Provider Abstraction Layer              |
  |  +------+  +---------+  +------+  +----------+      |
  |  |OpenAI|  |Anthropic|  |Ollama|  |Fireworks |      |
  |  +------+  +---------+  +------+  +----------+      |
  +-----------------------------------------------------+

  +----------+  +--------------+  +--------------------+
  |Middleware |  |  MultiAgent  |  |  ThreadStore       |
  |  Chain    |  |  Manager     |  |  (Memory/Redis/PG) |
  +----------+  +--------------+  +--------------------+

  +--------------+  +----------------------------------+
  |  AguiClient  |  |  React Hooks (useAgent, useStream)|
  +--------------+  +----------------------------------+
  |  AguiWebSocketClient |  Live Agent State API  |
```

## Module Relationships

### Core Modules

| Module            | File                  | Responsibility                                         |
|-------------------|-----------------------|--------------------------------------------------------|
| `Agent`           | `src/agent.ts`        | Orchestrates LLM calls, tools, events, state, persistence |
| `EventBus`        | `src/events.ts`       | In-process pub/sub with history and compaction         |
| `SharedState`     | `src/state.ts`        | Versioned key-value store with diff/merge              |
| `StateManager`    | `src/state.ts`        | Thread-isolated SharedState manager                    |
| `ProtocolEncoder` | `src/protocol.ts`     | Event serialization, SSE, compaction                   |
| `ProtocolValidator`| `src/protocol.ts`    | Input validation, event validation                     |
| `MiddlewareChain` | `src/middleware.ts`    | Composable middleware pipeline                         |
| `MultiAgentManager`| `src/multi-agent.ts` | Agent delegation, cyclic handoff, capability routing, graph execution |
| `AgentGraph`      | `src/multi-agent.ts`  | Directed graph of agent nodes with conditions          |
| `DeepAgent`       | `src/multi-agent.ts`  | Autonomous agent with planning, code execution         |
| `AguiClient`      | `src/client/index.ts` | HTTP client for remote agent execution                 |
| `ThreadStore`     | `src/store/types.ts`  | Persistence interface (Memory, Redis, Postgres)        |
| `Model Catalog`   | `src/models/`         | 44 models across 4 providers with pricing, context windows, capabilities |
| `Cost Tracking`   | `src/models/cost.ts`  | Token usage cost calculation, formatCost, exceedsContextWindow |
| `AguiWebSocketClient`| `src/client/index.ts`| WebSocket client for real-time agent communication |
| `LiveState`       | `src/agent.ts`        | `getLiveState()` exposes pending interrupts, state snapshot, usage/cost mid-run |

### Provider Modules

| Provider            | File                         | Auth              |
|---------------------|------------------------------|-------------------|
| `BaseLLMProvider`   | `src/providers/base.ts`      | Abstract base     |
| `OpenAIProvider`    | `src/providers/openai.ts`    | Bearer token      |
| `AnthropicProvider` | `src/providers/anthropic.ts` | `x-api-key`       |
| `OllamaProvider`    | `src/providers/ollama.ts`    | None              |
| `FireworksProvider` | `src/providers/fireworks.ts` | Bearer token      |

## Data Flow

### Non-Streaming Run

```
User Code          Agent            Provider         EventBus          Store
  |                 |                 |                 |                |
  |--run(prompt)-->|                 |                 |                |
  |                 |-----RUN_STARTED-+---------------->|                |
  |                 |                 |                 |                |
  |                 |--chatCompletion>|                 |                |
  |                 |<---response----|                 |                |
  |                 |                 |                 |                |
  |                 |-----STEP_STARTED+---------------->|                |
  |                 |-----STEP_FINISHED---------------->|                |
  |                 |                 |                 |                |
  |                 |--TEXT_MESSAGE_START-------------->|                |
  |                 |--TEXT_MESSAGE_CONTENT------------>|                |
  |                 |--TEXT_MESSAGE_END---------------->|                |
  |                 |                 |                 |                |
  |                 |-----RUN_FINISHED----------------->|                |
  |                 |                 |                 |--saveThread-->|
  |<---return str--|                 |                 |                |
```

### Streaming Run

```
User Code          Agent            Provider         EventBus
  |                 |                 |                 |
  |--stream(prompt)>|                 |                 |
  |                 |-----RUN_STARTED-+---------------->|
  |                 |                 |                 |
  |                 |--streamChatCompletion----------->|
  |                 |<--chunk--------|                 |
  |<--yield delta--|                 |                 |
  |                 |--TEXT_MESSAGE_CONTENT------------>|
  |                 |<--chunk--------|                 |
  |<--yield delta--|                 |                 |
  |                 |--TEXT_MESSAGE_CONTENT------------>|
  |                 |                 |                 |
  |                 |-----RUN_FINISHED----------------->|
```

## Thread-Based Isolation

Thread IDs identify conversation sessions. Each thread has:
- Isolated message history (`Map<string, Message[]>`)
- Isolated state (`StateManager` -> `SharedState`)
- Independent run lineage (via `parentRunId`)

This enables multi-tenant applications where each user session is fully isolated.

## Thread-Safety Model

- The `Agent` class is designed for single-threaded use (one `run()` or `stream()` at a time per agent instance)
- `EventBus` operations are synchronous and safe within a single execution context
- `SharedState` mutations are synchronous and not atomic across threads -- each agent instance should have its own state manager
- For concurrent access patterns, use separate agent instances or synchronize externally
- `ThreadStore` implementations (Redis, Postgres) handle concurrent write conflicts through their own mechanisms

## Middleware Pipeline

Middleware functions intercept the event generator. They compose as a chain:

```
agent.use(mw1, mw2, mw3)

Execution:
  -> mw1
    -> mw2
      -> mw3
        -> _executeRun() / _executeStream()
      <- events flow back
    <- events flow back
  <- events flow back
```

Each middleware receives the agent instance, prompt, context, and the next function. It can transform, filter, or augment the event stream.

## Live State Observation

Running agents can be tracked on the server via `LiveState`, which exposes mid-execution snapshots:

- **`getLiveState()`** — returns `pendingInterrupts`, a `stateSnapshot` of the current `SharedState`, and `usage`/`cost` accumulated so far
- **REST** — `GET /api/agents/:agentId/threads/:threadId/state` returns the live state payload
- **WebSocket** — The `AguiWebSocketClient` receives `state_sync` events that push live state deltas to connected clients in real-time
- The server tracks active runs in a `Map<runId, LiveStateEntry>`; when a run completes or errors, its entry is removed

```typescript
interface LiveState {
  runId: string
  threadId: string
  status: 'running' | 'waiting_for_input' | 'completed' | 'error'
  pendingInterrupts: InterruptRequest[]
  stateSnapshot: Record<string, unknown>
  usage: TokenUsage | null
  cost: number | null
}
```

The WebSocket `state_sync` flow:

```
Client              Server (WebSocket)
  |                       |
  |--subscribe:run:abc-->|
  |                       |-- run starts
  |<--state_sync--------|
  |   {status, state,    |
  |    usage, cost}      |
  |                       |-- tool call in progress
  |<--state_sync--------|
  |   {status, state,    |
  |    usage, cost}      |
  |                       |-- run finishes
  |<--state_sync--------|
  |   {status: completed}|
```

## Persistence Layer

The `ThreadStore` interface provides thread-based persistence with implementations:

| Store              | Package            | Use Case                    |
|--------------------|--------------------|-----------------------------|
| `MemoryThreadStore`| Built-in           | Development, single-instance|
| `RedisThreadStore` | `ioredis`          | Production, multi-replica   |
| `PostgresThreadStore` | `pg`           | Production, relational      |

```typescript
interface ThreadStore {
  connect(): Promise<void>
  disconnect(): Promise<void>
  createThread(threadId: string, metadata?, agentId?): Promise<ThreadData>
  getThread(threadId: string): Promise<ThreadData | null>
  listThreads(limit?, offset?): Promise<ThreadData[]>
  deleteThread(threadId: string): Promise<void>
  appendMessages(threadId: string, messages: Message[]): Promise<void>
  getMessages(threadId: string, limit?, offset?): Promise<Message[]>
  saveState(threadId: string, state: Record<string, unknown>): Promise<void>
  getState(threadId: string): Promise<Record<string, unknown> | null>
  saveRun(runId: string, threadId: string, data: RunData): Promise<void>
  getRun(runId: string): Promise<RunData | null>
  searchMessages(threadId: string, query: string, limit?): Promise<Message[]>
}
```

## Model Catalog & Cost Tracking

The `Model Catalog` (`src/models/`) indexes 44 models across 4 providers (OpenAI, Anthropic, Ollama, Fireworks) with metadata:

- **Pricing** — per-token input/output costs
- **Context windows** — max tokens per model
- **Capabilities** — streaming, tool calls, structured output, vision, reasoning

`calculateCost(provider, modelId, tokensUsed)` computes the token cost for a given model and usage, using the catalog's pricing table. Tokens used are returned in `TokenUsage` objects emitted on each `STEP_FINISHED` event.

`USAGE_UPDATE` events are emitted mid-run (after each provider round-trip) carrying the current accumulated `TokenUsage` and cost. Clients listening to the event bus or connected via WebSocket (`state_sync`) receive these updates for live cost display.

```typescript
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
}
```

Helper functions:
- **`formatCost(cost, currency)`** — formats a numeric cost to a display string (e.g. `"$0.0023"`)
- **`exceedsContextWindow(provider, modelId, tokenCount)`** — checks whether the given token count exceeds the model's context window limit

## Event Lifecycle

The event lifecycle within a single agent run follows this sequence:

1. `RUN_STARTED` emitted with thread and run identifiers
2. State synchronization (`STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`)
3. Provider call (non-streaming or streaming)
4. `STEP_STARTED`/`STEP_FINISHED` wrapping the provider interaction
5. Text message events (`TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT*`, `TEXT_MESSAGE_END`)
6. Optional: tool call events or reasoning events
7. `RUN_FINISHED` or `RUN_ERROR`
8. Persistence save (if store configured)

## Extension Points

| Point                | Mechanism                                    |
|----------------------|----------------------------------------------|
| Custom LLM provider | Extend `BaseLLMProvider`                     |
| Custom middleware    | Implement `MiddlewareFunction`                |
| Custom store         | Implement `ThreadStore` interface             |
| Custom tools         | Define `ToolConfig` with handler              |
| Custom events        | Emit `CUSTOM` events via `EventBus`           |
| Sub-agents           | Use `Agent.delegate()` or `AgentGraph`        |
| React integration    | Use hooks from `agui-framework/client/react`  |
