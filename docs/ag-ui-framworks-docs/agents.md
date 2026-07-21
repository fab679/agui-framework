# Agents

Deep dive into the `Agent` class -- the central orchestrator of agui-framework. The Agent manages LLM provider communication, tool execution, event emission, state synchronization, message history, middleware, and thread persistence.

## Class Overview

```typescript
class Agent {
  public config: AgentConfig
  public readonly events: EventBus
  public readonly state: StateManager
  public readonly encoder: ProtocolEncoder
  public pendingInterrupts: Map<string, Interrupt>
  public stringCapabilities: string[]
  public store?: ThreadStore
  public autoPersist: boolean

  constructor(config: AgentConfig)

  static create(config: AgentConfig): Agent
  static createFromEnv(): Agent
  static defaultStore?: ThreadStore

  addTool(tool: ToolConfig): this
  addCapability(capability: string): this
  getTools(): ToolConfig[]
  getCapabilities(): AgentCapabilities
  getProvider(): BaseLLMProvider
  checkInterrupts(): Interrupt[]
  getLastUsage(): TokenUsage | null
  getLastCost(): CostBreakdown | null
  getLiveState(threadId?: string): { threadId, runId?, pendingInterrupts, stateSnapshot, usage, cost }

  use(...middlewares: MiddlewareFunction[]): this

  run(prompt: string, context?: Partial<RunContext>): Promise<string>
  stream(prompt: string, context?: Partial<RunContext>, options?: StreamingOptions): AsyncGenerator<string>
  resume(interruptId: string, payload?: unknown, status?: 'resolved' | 'cancelled'): Promise<string>

  delegate(subAgent: Agent, prompt: string, config?: DelegationConfig): Promise<string>
  createDelegationTool(toolName: string, description: string, subAgent: Agent, deps?: unknown): ToolConfig
  createHandoffTool(toolName: string, description: string, targetAgent: Agent): ToolConfig

  clone(): Agent

  setMessageHistory(threadId: string, messages: Message[]): void
  getMessageHistory(threadId: string): Message[]
  get messages(): Message[]
  set messages(msgs: Message[])

  loadThread(threadId: string): Promise<void>
  saveThread(threadId: string): Promise<void>

  toJSON(): string
  fromJSON(json: string): this
}
```

## Configuration

```typescript
interface AgentConfig {
  name?: string                           // Display name
  model: string                           // LLM model ID (e.g., 'gpt-4o', 'claude-3-5-sonnet-20240620')
  provider: ProviderType                  // 'openai' | 'anthropic' | 'ollama' | 'fireworks'
  instructions: string                    // System prompt
  tools?: ToolConfig[]                    // Initial tool set
  maxTokens?: number                      // Max output tokens (default: 1024)
  temperature?: number                    // Sampling temperature (default: 0.7)
  topP?: number                           // Nucleus sampling
  stream?: boolean                        // Enable streaming by default
  modelSettings?: Record<string, unknown> // Additional LLM params
  capabilities?: string[]                 // Custom capability flags
  apiKey?: string                         // API key (falls back to env var)
  baseUrl?: string                        // Custom base URL
  store?: ThreadStore                     // Persistence backend
  autoPersist?: boolean                   // Auto-save to store (default: true)

  // Capabilities configuration
  maxIterations?: number                  // Execution iteration limit (default: 10)
  maxExecutionTime?: number               // Max wall-clock time in ms (default: 30000)
  structuredOutput?: boolean              // Support JSON schema output
  outputSchema?: Record<string, unknown>  // JSON Schema for enforced structured output via response_format
  supportedMimeTypes?: string[]           // Output MIME types (default: ['text/plain'])
  parallelCalls?: boolean                 // Parallel tool calls
  clientProvidedTools?: boolean           // Client can inject tools at runtime
  websocket?: boolean                     // WebSocket transport support
  codeExecution?: boolean                 // Declares external code-execution capability; no in-process runtime is included
  sandboxed?: boolean                     // Metadata for an externally isolated tool
  reasoningEncrypted?: boolean            // Requires reasoningEncryptionKey; AES-256-GCM encrypted
  humanInterventions?: boolean            // Mid-run human intervention
  humanFeedback?: boolean                 // Human feedback (ratings)
  approveWithEdits?: boolean              // Approve with edits
  multimodalInput?: { image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean; file?: boolean }
  multimodalOutput?: { image?: boolean; audio?: boolean }
  costLimit?: number                    // Runtime cost limit in USD (0 = no limit)
  maxContextWindow?: number             // Override model's context window from catalog
  outputSchema?: Record<string, unknown> // JSON Schema for structured output
}
```

## Execution Modes

### run() -- Non-Streaming

Sends the prompt, waits for the full LLM response, and returns the result string. Internally it iterates the event generator and concatenates `TEXT_MESSAGE_CONTENT` deltas.

```typescript
const response = await agent.run('What is TypeScript?')
console.log(response)
```

### stream() -- Streaming

Returns an `AsyncGenerator` that yields text chunks as they arrive from the provider. Events are emitted on the `EventBus` in real-time.

```typescript
for await (const chunk of agent.stream('Tell me a story')) {
  process.stdout.write(chunk)
}
```

#### StreamingOptions

```typescript
interface StreamingOptions {
  onStart?: () => void
  onChunk?: (chunk: string, event?: BaseEvent) => void
  onComplete?: (result: unknown, context: RunContext) => void
  onError?: (error: Error, event?: BaseEvent) => void
  onInterrupt?: (interrupt: Interrupt, context: RunContext) => void
  onEvent?: (event: BaseEvent) => void
  bufferSize?: number
  encoding?: 'utf8' | 'base64'
}
```

### resume() -- Interrupt Handling

Resumes execution after a human-in-the-loop interrupt. Use when a tool with `requiresApproval: true` was called and paused the agent.

```typescript
const result = await agent.resume('interrupt_abc123', { approved: true }, 'resolved', 'thread-1')
```

## RunContext

```typescript
interface RunContext {
  threadId: string
  runId: string
  agentId?: string
  userId?: string
  deps?: unknown
  modelSettings?: Record<string, unknown>
  capabilities?: string[]
  metadata?: Record<string, unknown>
  resume?: Array<{
    interruptId: string
    status: 'resolved' | 'cancelled'
    payload?: unknown
  }>
  clientTools?: Array<{ name, description, parameters, handler }>  // Client-injected tools
  outputFormat?: string
  feedback?: { rating?: number; comment?: string; category?: string }
}
```

## Tool Definition

Tools can be added at construction or at runtime via `addTool()`:

```typescript
const agent = new Agent({ model: 'gpt-4o', provider: 'openai', instructions: '...' })
agent.addTool({
  name: 'search',
  description: 'Search the web',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  handler: async ({ query }) => {
    return { results: [`Result for ${query}`] }
  },
})
```

See [Tools](./tools.md) for the full specification.

## Middleware

Middleware intercepts the event generator during `run()` and `stream()` calls. Use `agent.use()` to register middleware functions:

```typescript
import type { MiddlewareFunction } from 'agui-framework'

const loggingMiddleware: MiddlewareFunction = (agent, prompt, context, next) =>
  async function* () {
    console.log(`[${agent.config.name}] Starting run: "${prompt.slice(0, 50)}..."`)
    let count = 0
    for await (const event of next()) {
      count++
      yield event
    }
    console.log(`[${agent.config.name}] Done. ${count} events emitted.`)
  }()

agent.use(loggingMiddleware)
```

Multiple middleware functions compose in order. Each receives the next function in the chain.

### Summarization Middleware

The built-in `createSummarizationMiddleware` automatically compresses conversation history when the context window approaches its limit. It uses a separate LLM call to condense history, preserving key facts and context.

```typescript
import { createSummarizationMiddleware } from 'agui-framework'

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a helpful assistant.',
})

// Auto-summarize when context reaches 90%
agent.use(createSummarizationMiddleware())

// Or with explicit config for the summarization model
agent.use(createSummarizationMiddleware({
  model: 'gpt-4o-mini',           // Cheaper model for summaries
  provider: 'openai',
  threshold: 0.85,                 // Trigger at 85% instead of 90%
}))
```

When the context window reaches the threshold (default 90%), the middleware:
1. Emits a `MEMORY_SUMMARY` event with `operation: 'summarize'`
2. Calls the summarization LLM with the full conversation history
3. Replaces the thread's message history with a single system message containing the summary
4. Emits a second `MEMORY_SUMMARY` event with `operation: 'compressed'`

All summarization config fields are optional. When omitted, the middleware inherits the parent agent's model, provider, and API key. The summarization prompt can be customized via the `prompt` config field — use `{{history}}` as a placeholder for the serialized messages.

## Capabilities Declaration

`getCapabilities()` returns a structured `AgentCapabilities` object describing what the agent supports. Clients (e.g., React UIs) consume this to adapt behavior.

```typescript
const caps = agent.getCapabilities()
// {
//   identity: { name: 'gpt-4o', type: 'agui-framework', version: '0.2.0', provider: 'openai' },
//   transport: { streaming: true, resumable: true },
//   tools: { supported: true, items: [...] },
//   state: { snapshots: true, deltas: true, memory: true },
//   multiAgent: { supported: true, delegation: true, handoffs: true },
//   reasoning: { supported: true, streaming: true },
//   humanInTheLoop: { supported: true, approvals: true, interrupts: true },
//   execution: { maxIterations: 10, maxExecutionTime: 30000 },
// }
```

Custom capabilities can be added with `agent.addCapability('vision')`.

## Live State Observation

The agent exposes its live execution state for external observation. This enables UI components to show real-time progress, pending approvals, and cost information.

```typescript
const liveState = agent.getLiveState('thread-1')
// {
//   threadId: 'thread-1',
//   runId: 'run_123',
//   pendingInterrupts: [{ id: 'int_1', toolCallId: 'call_1', ... }],
//   stateSnapshot: { counter: 5, theme: 'dark' },
//   usage: { promptTokens: 150, completionTokens: 300, totalTokens: 450 },
//   cost: { currency: 'USD', totalCost: 0.002, inputCost: 0.001, outputCost: 0.001, modelId: 'gpt-4o' },
// }
```

On the server, the state is exposed via:

```
GET /api/agents/:id/state?threadId=...
```

Response:
```json
{
  "state": {
    "status": "streaming",
    "agentId": "my-agent",
    "threadId": "thread-1",
    "runId": "run_123",
    "startedAt": 1719000000000,
    "pendingInterrupts": [...],
    "stateSnapshot": {...},
    "usage": {...},
    "cost": {...}
  }
}
```

When a WebSocket client subscribes to an agent that is actively running, a `state_sync` message is automatically sent with the current execution snapshot.

## Event Lifecycle

### Non-Streaming Run

```
RUN_STARTED
  +-- STATE_SNAPSHOT / STATE_DELTA
  +-- MESSAGES_SNAPSHOT
  +-- STEP_STARTED (generating)
  +-- STEP_FINISHED (generating)
  +-- [if tool calls]
  |    +-- TOOL_CALL_START
  |    +-- TOOL_CALL_ARGS
  |    +-- TOOL_CALL_END
  +-- TEXT_MESSAGE_START
  +-- TEXT_MESSAGE_CONTENT
  +-- TEXT_MESSAGE_END
RUN_FINISHED or RUN_ERROR
```

### Streaming Run

```
RUN_STARTED
  +-- STATE_SNAPSHOT
  +-- MESSAGES_SNAPSHOT
  +-- STEP_STARTED (streaming)
  +-- TEXT_MESSAGE_START
  +-- TEXT_MESSAGE_CONTENT (per chunk)
  +-- [...] REASONING_START / REASONING_MESSAGE_CONTENT (if supported)
  +-- TOOL_CALL_START / TOOL_CALL_ARGS / TOOL_CALL_END (if tool calls)
  +-- TEXT_MESSAGE_END
RUN_FINISHED or RUN_ERROR
```

## Serialization

```typescript
// Serialize config, tools, and capabilities
const json = agent.toJSON()

// Restore on a new instance
const restored = new Agent({ model: '...', provider: '...', instructions: '...' })
restored.fromJSON(json)
```

## Thread Persistence

Agents can persist message history and state to a `ThreadStore`:

```typescript
import { MemoryThreadStore } from 'agui-framework'

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are helpful.',
  store: new MemoryThreadStore(),
  autoPersist: true,
})

// Load existing conversation
await agent.loadThread('thread-123')

// Agent auto-saves after each run
await agent.run('Remember this fact', { threadId: 'thread-123' })
```

Available stores: `MemoryThreadStore`, `RedisThreadStore`, `PostgresThreadStore`.

## Multi-Agent Delegation

The agent supports delegating tasks to sub-agents and creating delegation tools:

```typescript
const researcher = new Agent({
  model: 'gpt-4o', provider: 'openai',
  instructions: 'Research topics thoroughly.',
})
const writer = new Agent({
  model: 'gpt-4o', provider: 'openai',
  instructions: 'Write clear prose.',
})

// Create delegation tool on the writer
const delegateTool = writer.createDelegationTool(
  'delegate_to_researcher',
  'Delegate research tasks to the researcher agent',
  researcher,
)

writer.addTool(delegateTool)
```

## Handoff Tools

Handoff transfers the conversation entirely to another agent (permanent control transfer, not call/return):

```typescript
const handoffTool = writer.createHandoffTool(
  'handoff_to_support',
  'Hand off the conversation to a support specialist',
  supportAgent,
)

writer.addTool(handoffTool)
```

When the LLM invokes the handoff tool, the handler throws a `HandoffRequested` error containing the target agent name, prompt, and thread ID. The `Agent.run()`/`stream()` methods propagate this error upward without swallowing it. A `MultiAgentManager` orchestrator running the agent catches the error, looks up the target agent, copies message history, pushes a `HandoffStackEntry`, sets `activeAgentId` to the target, and continues execution with the target agent.

This enables **cyclic handoff chains** (e.g., Agent A → B → C or A → B → A) where control can flow arbitrarily between registered agents.

Handoff emits `AGENT_HANDOFF_REQUEST` events when the tool is invoked. The `MultiAgentManager` emits `AGENT_HANDOFF_RESULT` after the target agent completes.

## Cloning

Clone an agent with all its configuration, tools, and capabilities:

```typescript
const cloned = agent.clone()
```

## Factory Methods

```typescript
// From explicit config
const agent = Agent.create({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are helpful.',
})

// From environment variables
// AGUI_PROVIDER=openai AGUI_MODEL=gpt-4o AGUI_INSTRUCTIONS="..."
const agent = Agent.createFromEnv()
```

## Usage & Cost Tracking

The agent tracks token usage and monetary cost for every provider interaction:

- `getLastUsage()` returns `TokenUsage | null` with `promptTokens`, `completionTokens`, and `totalTokens` counts
- `getLastCost()` returns `CostBreakdown | null` with `inputCost`, `outputCost`, and `totalCost` in USD
- `AgentConfig.costLimit` enforces a budget cap per run — execution is halted if the cost exceeds the limit
- The agent emits `USAGE_UPDATE` events after every provider response with the latest token and cost data
- Cost is persisted in `RunData` and thread metadata accumulates `totalCost`, `runCount`, and `lastModelId` across runs
```
