# agui-framework

A TypeScript SDK for building AI agent-powered applications. agui-framework provides a complete toolkit for creating, orchestrating, and deploying LLM-based agents with multi-provider support, real-time streaming, state management, persistence, and the AG-UI protocol for frontend communication.

## Features

- **Agent class** -- Central orchestrator for LLM interactions with run/stream/resume execution modes
- **Multi-LLM providers** -- OpenAI, Anthropic, Ollama, and Fireworks support with a common abstraction
- **Real-time streaming** -- AsyncGenerator-based streaming with event callbacks
- **Event system** -- Publish/subscribe EventBus with history, compaction, and piping
- **State management** -- Thread-isolated SharedState with versioning, diffing, merging, and conflict resolution
- **AG-UI protocol** -- Full SSE-based protocol encoding, validation, and event compaction
- **Multi-agent patterns** -- Delegation, cyclic handoff, capability routing, and directed graph workflows
- **Middleware pipeline** -- Composable event interception and transformation
- **Persistence** -- Memory, Redis, and Postgres thread stores
- **HTTP/WebSocket server** -- Express route handlers, WebSocket agent communication, model catalog API
- **Model catalog** -- 44 models across 4 providers with pricing, context windows, and capabilities
- **Cost & usage tracking** -- Per-run token usage, cost calculation, cumulative thread cost, budget limits
- **WebSocket client** -- Full-duplex agent communication with run/stream/resume/capabilities
- **React client hooks** -- useStream, useThread, useInterrupts, useCoAgent, useWebSocket, and more
- **Type safety** -- Full TypeScript with strict types across all modules

## Installation

```bash
npm install agui-framework
```

Requires Node.js 18+ for native `fetch` and `ReadableStream` support.

Optional persistence dependencies:

```bash
npm install ioredis          # RedisThreadStore
npm install pg               # PostgresThreadStore
```

## Quick Start

### 1. Basic Agent

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant.",
});

const response = await agent.run("What is the capital of France?");
console.log(response);
```

Set `OPENAI_API_KEY` in your environment.

### 2. Streaming Response

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "Tell a detailed story.",
});

for await (const chunk of agent.stream("Tell me about space exploration")) {
  process.stdout.write(chunk);
}
```

### 3. Agent with Tools

```typescript
import { Agent } from "agui-framework";
import type { ToolConfig } from "agui-framework";

const weatherTool: ToolConfig = {
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    type: "object",
    properties: { city: { type: "string", description: "City name" } },
    required: ["city"],
  },
  handler: async ({ city }) => ({ city, temperature: 22, conditions: "sunny" }),
};

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "Use the weather tool when asked about weather.",
  tools: [weatherTool],
});

const response = await agent.run("What is the weather in Paris?");
console.log(response);
```

### 4. Multi-Provider Configuration

```typescript
import { Agent } from "agui-framework";

// Anthropic
const agent = new Agent({
  model: "claude-3-5-sonnet-20240620",
  provider: "anthropic",
  instructions: "You are helpful.",
});

// Ollama (local)
const localAgent = new Agent({
  model: "llama3",
  provider: "ollama",
  instructions: "You are helpful.",
  baseUrl: "http://localhost:11434/v1",
});

// Fireworks
const fwAgent = new Agent({
  model: "accounts/fireworks/models/deepseek-v4-flash",
  provider: "fireworks",
  instructions: "You are helpful.",
});
```

### 5. Environment-Based Configuration

```env
AGUI_PROVIDER=openai
AGUI_MODEL=gpt-4o
AGUI_INSTRUCTIONS=You are a helpful assistant.
AGUI_MAX_TOKENS=1024
```

```typescript
import "dotenv/config";
import { Agent } from "agui-framework";

const agent = Agent.createFromEnv();
const reply = await agent.run("Tell me a joke");
console.log(reply);
```

## Configuration

### AgentConfig

| Option                   | Type                      | Default          | Description                                                                                   |
| ------------------------ | ------------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `name`                   | `string`                  | undefined        | Display name for the agent                                                                    |
| `model`                  | `string`                  | required         | LLM model identifier                                                                          |
| `provider`               | `ProviderType`            | required         | `openai`, `anthropic`, `ollama`, `fireworks`                                                  |
| `instructions`           | `string`                  | required         | System prompt                                                                                 |
| `tools`                  | `ToolConfig[]`            | `[]`             | Tool definitions                                                                              |
| `maxTokens`              | `number`                  | `1024`           | Maximum output tokens                                                                         |
| `temperature`            | `number`                  | `0.7`            | Sampling temperature (0-2)                                                                    |
| `topP`                   | `number`                  | undefined        | Nucleus sampling                                                                              |
| `stream`                 | `boolean`                 | `false`          | Enable streaming by default                                                                   |
| `apiKey`                 | `string`                  | env var          | API key for the provider                                                                      |
| `baseUrl`                | `string`                  | provider default | Custom API endpoint                                                                           |
| `store`                  | `ThreadStore`             | undefined        | Persistence backend                                                                           |
| `autoPersist`            | `boolean`                 | `true`           | Auto-save to store after runs                                                                 |
| `capabilities`           | `string[]`                | `[]`             | Custom capability flags                                                                       |
| `maxIterations`          | `number`                  | `10`             | Execution iteration limit                                                                     |
| `maxExecutionTime`       | `number`                  | `30000`          | Max wall-clock time in ms                                                                     |
| `structuredOutput`       | `boolean`                 | `false`          | JSON schema output support                                                                    |
| `outputSchema`           | `Record<string, unknown>` | `undefined`      | JSON Schema for enforced structured output                                                    |
| `supportedMimeTypes`     | `string[]`                | `['text/plain']` | Output MIME types                                                                             |
| `parallelCalls`          | `boolean`                 | `false`          | Parallel tool calls                                                                           |
| `clientProvidedTools`    | `boolean`                 | `false`          | Client-injectable tools                                                                       |
| `websocket`              | `boolean`                 | `false`          | WebSocket transport                                                                           |
| `codeExecution`          | `boolean`                 | `false`          | Declares an externally isolated code-execution capability; no in-process executor is supplied |
| `sandboxed`              | `boolean`                 | `false`          | Metadata for an externally sandboxed tool                                                     |
| `reasoningEncrypted`     | `boolean`                 | `false`          | Requires `reasoningEncryptionKey`; uses AES-256-GCM                                           |
| `reasoningEncryptionKey` | `string`                  | undefined        | Base64-encoded 32-byte AES-256-GCM key                                                        |
| `humanInterventions`     | `boolean`                 | `false`          | Mid-run intervention                                                                          |
| `humanFeedback`          | `boolean`                 | `false`          | Human feedback (ratings)                                                                      |
| `approveWithEdits`       | `boolean`                 | `false`          | Approve with edits                                                                            |

### Environment Variables

| Provider  | Variable            | AGUI prefix alternative                                                                   |
| --------- | ------------------- | ----------------------------------------------------------------------------------------- |
| OpenAI    | `OPENAI_API_KEY`    | `AGUI_PROVIDER`, `AGUI_MODEL`, `AGUI_INSTRUCTIONS`, `AGUI_MAX_TOKENS`, `AGUI_TEMPERATURE` |
| Anthropic | `ANTHROPIC_API_KEY` |                                                                                           |
| Ollama    | `OLLAMA_API_KEY`    |                                                                                           |
| Fireworks | `FIREWORKS_API_KEY` |                                                                                           |

## Architecture Overview

```
agui-framework
  Agent            -- Orchestrates LLM calls, tools, events, state, persistence
  EventBus         -- In-process pub/sub with history and compaction
  StateManager     -- Thread-isolated SharedState instances
  ProtocolEncoder  -- Event serialization and SSE encoding
  ProtocolValidator-- Input and event validation
  BaseLLMProvider  -- Abstract LLM provider (OpenAI, Anthropic, Ollama, Fireworks)
  MiddlewareChain  -- Composable middleware pipeline
  MultiAgentManager-- Agent delegation, cyclic handoff, capability routing, graph execution
  AgentGraph       -- Directed graph of agent nodes
  ThreadStore      -- Persistence interface (Memory, Redis, Postgres)
  AguiClient       -- HTTP client for remote agent execution
  React hooks      -- useStream, useThread, useInterrupts, useCoAgent
```

## Documentation

| Document                                                          | Description                                       |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| [Getting Started](docs/ag-ui-framworks-docs/getting-started.md)   | Installation, prerequisites, first agent          |
| [Agents](docs/ag-ui-framworks-docs/agents.md)                     | Agent class deep dive: config, tools, execution   |
| [Events](docs/ag-ui-framworks-docs/events.md)                     | EventBus API, event types, subscriptions          |
| [State Management](docs/ag-ui-framworks-docs/state-management.md) | SharedState, StateManager, thread isolation       |
| [Protocol](docs/ag-ui-framworks-docs/protocol.md)                 | ProtocolEncoder, SSE, validation                  |
| [Providers](docs/ag-ui-framworks-docs/providers.md)               | Provider architecture, custom providers           |
| [Tools](docs/ag-ui-framworks-docs/tools.md)                       | ToolConfig, handlers, interrupts, delegation      |
| [Architecture](docs/ag-ui-framworks-docs/architecture.md)         | Module relationships, data flow, extension points |
| [API Reference](docs/ag-ui-framworks-docs/api-reference.md)       | Complete API reference organized by module        |
| [Examples](docs/ag-ui-framworks-docs/examples.md)                 | Multi-agent, graph, persistence, React, Express   |
| [AG-UI Agents](docs/ag-ui/Agents.md)                              | AG-UI protocol agent implementation               |
| [AG-UI Events](docs/ag-ui/Events.md)                              | AG-UI event format and types implementation       |

## API Overview

### Agent

```typescript
class Agent {
  constructor(config: AgentConfig);
  run(prompt: string, context?: Partial<RunContext>): Promise<string>;
  stream(
    prompt: string,
    context?: Partial<RunContext>,
    options?: StreamingOptions,
  ): AsyncGenerator<string>;
  resume(
    interruptId: string,
    payload?: unknown,
    status?: "resolved" | "cancelled",
  ): Promise<string>;
  addTool(tool: ToolConfig): this;
  addCapability(capability: string): this;
  use(...middlewares: MiddlewareFunction[]): this;
  delegate(
    subAgent: Agent,
    prompt: string,
    config?: DelegationConfig,
  ): Promise<string>;
  createDelegationTool(
    toolName: string,
    description: string,
    subAgent: Agent,
  ): ToolConfig;
  createHandoffTool(
    toolName: string,
    description: string,
    targetAgent: Agent,
  ): ToolConfig;
  clone(): Agent;
  getCapabilities(
    peerDescriptors?: Map<string, AgentDescriptor>,
  ): AgentCapabilities;
  loadThread(threadId: string): Promise<void>;
  saveThread(threadId: string): Promise<void>;
  toJSON(): string;
  fromJSON(json: string): this;
  static create(config: AgentConfig): Agent;
  static createFromEnv(): Agent;
}

interface AgentConfig {
  name?: string;
  model: string;
  provider: ProviderType;
  instructions: string;
  tools?: ToolConfig[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  modelSettings?: Record<string, unknown>;
  capabilities?: string[];
  apiKey?: string;
  baseUrl?: string;
  store?: ThreadStore;
  autoPersist?: boolean;
  maxIterations?: number;
  maxExecutionTime?: number;
  structuredOutput?: boolean;
  supportedMimeTypes?: string[];
  parallelCalls?: boolean;
  clientProvidedTools?: boolean;
  websocket?: boolean;
  codeExecution?: boolean;
  sandboxed?: boolean;
  reasoningEncrypted?: boolean;
  humanInterventions?: boolean;
  humanFeedback?: boolean;
  approveWithEdits?: boolean;
  multimodalInput?: {
    image?: boolean;
    audio?: boolean;
    video?: boolean;
    pdf?: boolean;
    file?: boolean;
  };
  multimodalOutput?: { image?: boolean; audio?: boolean };
}
```

### EventBus

```typescript
class EventBus {
  constructor(maxHistory?: number);
  emit(event: AgentEvent): void;
  on(type: EventType | "*", listener: EventListener): () => void;
  once(type: EventType | "*", listener: EventListener): void;
  clear(): void;
  getHistory(): BaseEvent[];
  compact(): void;
  pipe(transform: (event: AgentEvent) => AgentEvent | null): EventBus;
  toJSON(): string;
  fromJSON(json: string): void;
}
```

### StateManager / SharedState

```typescript
class StateManager {
  constructor(defaultState?: SharedState);
  getOrCreateState(threadId: string): SharedState;
  updateState(threadId: string, updates: Partial<StateData>): SharedState;
  deleteState(threadId: string): void;
  hasState(threadId: string): boolean;
  getAllThreads(): string[];
  clearAll(): void;
  exportState(threadId: string): StateSnapshot | null;
  importState(threadId: string, snapshot: StateSnapshot): SharedState;
  subscribe(subscription: StateSubscription): () => void;
}

class SharedState {
  constructor(
    initialData?: StateData,
    options?: StateOptions,
    threadId?: string,
  );
  get<T>(key: string, defaultValue?: T): T;
  set(key: string, value: unknown): this;
  update(updates: Partial<StateData>): this;
  delete(key: string): this;
  has(key: string): boolean;
  clear(): void;
  takeSnapshot(label?: string): void;
  getSnapshot(): StateSnapshot;
  getHistory(limit?: number): StateSnapshot[];
  diff(other: SharedState): StateDiff;
  merge(
    other: SharedState,
    strategy?: StateMergeStrategy,
    conflictHandler?: Function,
  ): StateData;
  computePatch(): JsonPatchOperation[];
  getVersion(): string;
  subscribe(subscription: StateSubscription): () => void;
  toJSON(): string;
  fromJSON(json: string): this;
}
```

### Provider Types

```typescript
type ProviderType = "openai" | "anthropic" | "ollama" | "fireworks";

abstract class BaseLLMProvider {
  readonly type: ProviderType;
  config: ProviderConfig;
  chatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse>;
  streamChatCompletion(
    request: ChatCompletionRequest,
  ): AsyncGenerator<StreamChunk>;
  prepareMessages(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
  ): ChatMessage[];
}
```

### ThreadStore Interface

```typescript
interface ThreadStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createThread(
    threadId: string,
    metadata?: Record<string, unknown>,
    agentId?: string,
  ): Promise<ThreadData>;
  getThread(threadId: string): Promise<ThreadData | null>;
  listThreads(limit?: number, offset?: number): Promise<ThreadData[]>;
  deleteThread(threadId: string): Promise<void>;
  appendMessages(threadId: string, messages: Message[]): Promise<void>;
  getMessages(
    threadId: string,
    limit?: number,
    offset?: number,
  ): Promise<Message[]>;
  saveState(threadId: string, state: Record<string, unknown>): Promise<void>;
  getState(threadId: string): Promise<Record<string, unknown> | null>;
  saveRun(runId: string, threadId: string, data: RunData): Promise<void>;
  getRun(runId: string): Promise<RunData | null>;
  searchMessages(
    threadId: string,
    query: string,
    limit?: number,
  ): Promise<Message[]>;
}
```

Implementations: `MemoryThreadStore`, `RedisThreadStore`, `PostgresThreadStore`.

### Model Catalog & Cost Tracking

```typescript
import {
  getModel,
  calculateCost,
  formatCost,
  modelCatalog,
} from "agui-framework";

// Look up a model's pricing and capabilities
const model = getModel("gpt-5.6-luna");
console.log(model?.pricing); // { input: 1.00, output: 6.00, cachedInput: 0.10 }

// Calculate cost from token usage
const cost = calculateCost("deepseek-v4-flash", {
  promptTokens: 5000,
  completionTokens: 1200,
  totalTokens: 6200,
});
console.log(formatCost(cost!.totalCost)); // "$0.0010"

// Check context window limits
const { exceeds, limit } = exceedsContextWindow("llama-3.2-3b", 200_000);
console.log(exceeds); // true, limit is 128000

// Query from server
const client = new AguiClient("http://localhost:4124");
const models = await client.models();
const gptModel = await client.model("gpt-5.6-terra");
```

Costs are automatically tracked per run and accumulated per thread when a store is configured:

```
GET /api/threads              → includes totalCost, runCount, lastModelId
GET /api/threads/:id/runs     → includes usage + cost per run
```

### React Hooks

```typescript
// From 'agui-framework/client/react'
function useStream(): { start; stop; isLoading; error; result };
function useThread(options: UseThreadOptions): {
  threads;
  messages;
  loadMessages;
  createThread;
  currentThreadId;
};
function useInterrupts(): { interrupts; handleInterrupt; resolve; clear };
function useCoAgent(options: UseCoAgentOptions): UseCoAgentReturn;
function useCoAction(
  toolDef: ToolConfig & { handler: Function },
): UseCoActionReturn;
function useCapabilities(
  agentId: string,
  baseUrl: string,
): { caps; loading; error; refetch };
function useAgent(
  agentId: string,
  baseUrl: string,
): { meta; loading; error; refetch };
function useWebSocket(
  baseUrl: string,
  agentId: string,
): { connected; caps; connect; disconnect; on; off; run; resume };
```

## Event Types

| Category       | Events                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Run lifecycle  | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`                                                        |
| Steps          | `STEP_STARTED`, `STEP_FINISHED`                                                                   |
| Text messages  | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`                                  |
| Tool calls     | `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT`                          |
| State          | `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`                                              |
| Activity       | `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA`                                                             |
| Reasoning      | `REASONING_START`, `REASONING_END`, `REASONING_MESSAGE_*`, `REASONING_ENCRYPTED_VALUE`            |
| Multi-agent    | `AGENT_DELEGATION_START`, `AGENT_DELEGATION_END`, `AGENT_HANDOFF_REQUEST`, `AGENT_HANDOFF_RESULT` |
| Human-in-loop  | `HUMAN_INTERVENTION_REQUEST`, `HUMAN_INTERVENTION_RESULT`, `HUMAN_FEEDBACK`                       |
| Code execution | `CODE_EXECUTION_START`, `CODE_EXECUTION_RESULT`                                                   |
| Memory         | `MEMORY_SUMMARY`                                                                                  |
| Usage & cost   | `USAGE_UPDATE`                                                                                    |
| Custom         | `RAW`, `CUSTOM`                                                                                   |

## License

MIT
