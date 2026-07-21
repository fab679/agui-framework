# API Reference

Complete reference for all public exports, classes, interfaces, types, enums, and constants in agui-framework.

## Package Entry Points

| Export Path               | Description                              |
|---------------------------|------------------------------------------|
| `agui-framework`          | Core framework (Agent, events, state, protocol, providers, tools, multi-agent, middleware, client, store) |
| `agui-framework/server`   | Server-side utilities (Express routes, WebSocket, loader) |
| `agui-framework/client`   | Client SDK (`AguiClient`)                |
| `agui-framework/client/react` | React hooks (`useAgent`, `useStream`, `useThread`, `useCoAgent`) |
| `agui-framework/store`    | Persistence stores (Redis, Postgres, semantic) |

## Classes

### Agent

```typescript
class Agent {
  constructor(config: AgentConfig)

  config: AgentConfig
  events: EventBus
  state: StateManager
  encoder: ProtocolEncoder
  pendingInterrupts: Map<string, Interrupt>
  stringCapabilities: string[]
  store?: ThreadStore
  autoPersist: boolean

  static create(config: AgentConfig): Agent
  static createFromEnv(): Agent
  static defaultStore?: ThreadStore

  addTool(tool: ToolConfig): this
  addCapability(capability: string): this
  getTools(): ToolConfig[]
  getCapabilities(peerDescriptors?: Map<string, AgentDescriptor>): AgentCapabilities
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
  loadThread(threadId: string): Promise<void>
  saveThread(threadId: string): Promise<void>
  toJSON(): string
  fromJSON(json: string): this
}
```

See [Agents](./agents.md) for detailed documentation.

### EventBus

```typescript
class EventBus {
  constructor(maxHistory?: number)

  emit(event: AgentEvent): void
  on(type: EventType | '*', listener: EventListener): () => void
  once(type: EventType | '*', listener: EventListener): void
  off(type: EventType | '*', listener: EventListener): void
  clear(): void
  getHistory(): BaseEvent[]
  getEventCount(): number
  listenerCount(type?: EventType | '*'): number
  compact(): void
  pipe(transform: (event: AgentEvent) => AgentEvent | null): EventBus
  subscribeToType<T>(type: string, callback: (event: T) => void): () => void
  toJSON(): string
  fromJSON(json: string): void
}
```

See [Events](./events.md) for detailed documentation.

### SharedState

```typescript
class SharedState {
  constructor(initialData?: StateData, options?: StateOptions, threadId?: string)

  get<T = unknown>(key: string, defaultValue?: T): T
  set(key: string, value: unknown): this
  update(updates: Partial<StateData>): this
  has(key: string): boolean
  delete(key: string): this
  clear(): void
  getSnapshot(): StateSnapshot
  takeSnapshot(label?: string): void
  computePatch(previous?: StateData): JsonPatchOperation[]
  getHistory(limit?: number): StateSnapshot[]
  diff(other: SharedState): StateDiff
  merge(other: SharedState, strategy?: StateMergeStrategy, conflictHandler?: Function): StateData
  static resolveConflict(key: string, local: unknown, incoming: unknown, resolution?: StateConflictResolution): unknown
  getVersion(): string
  getThreadId(): string | undefined
  setThreadId(threadId: string): void
  getSize(): number
  keys(): string[]
  values(): unknown[]
  entries(): Array<[string, unknown]>
  toObject(): StateData
  toJSON(): string
  fromJSON(json: string): this
  subscribe(subscription: StateSubscription): () => void
}
```

See [State Management](./state-management.md) for detailed documentation.

### StateManager

```typescript
class StateManager {
  constructor(defaultState?: SharedState)

  getOrCreateState(threadId: string): SharedState
  setState(threadId: string, state: SharedState): void
  updateState(threadId: string, updates: Partial<StateData>): SharedState
  deleteState(threadId: string): void
  hasState(threadId: string): boolean
  getAllThreads(): string[]
  clearAll(): void
  getDefaultState(): SharedState | undefined
  setDefaultState(state: SharedState): void
  exportState(threadId: string): StateSnapshot | null
  importState(threadId: string, snapshot: StateSnapshot): SharedState
  subscribe(subscription: StateSubscription): () => void
}
```

### ProtocolEncoder

```typescript
class ProtocolEncoder {
  encodeEvent(event: AgentEvent): string
  decodeEvent(data: string): AgentEvent
  encodeStream(events: AgentEvent[]): string
  encodeSSE(event: AgentEvent): string
  decodeStream(data: string): AgentEvent[]
  encodeRunInput(input: RunAgentInput): string
  decodeRunInput(data: string): RunAgentInput
  encodeMessage(msg: Message): string
  decodeMessage(data: string): Message
  compactEvents(events: AgentEvent[]): AgentEvent[]
}
```

### ProtocolValidator

```typescript
class ProtocolValidator {
  static validateRunInput(input: RunAgentInput): string | null
  static validateResume(resume: RunAgentInput['resume']): string | null
  static validateEvent(event: AgentEvent): string | null
  static validateMessage(msg: Message): string | null
  static isValidEventType(type: string): boolean
}
```

### BaseLLMProvider

```typescript
abstract class BaseLLMProvider {
  readonly type: ProviderType
  config: ProviderConfig

  constructor(type: ProviderType, config: ProviderConfig)
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>
  streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamChunk>
  prepareMessages(systemPrompt: string, messages: Array<{ role: string; content: string }>): ChatMessage[]
  protected abstract getDefaultBaseUrl(): string
  protected abstract getDefaultModel(): string
  protected getHeaders(): Record<string, string>
}
```

### Provider Implementations

```typescript
class OpenAIProvider extends BaseLLMProvider { constructor(config: ProviderConfig) }
class AnthropicProvider extends BaseLLMProvider { constructor(config: ProviderConfig) }
class OllamaProvider extends BaseLLMProvider { constructor(config: ProviderConfig) }
class FireworksProvider extends BaseLLMProvider { constructor(config: ProviderConfig) }
```

### Multi-Agent Classes

```typescript
class HandoffRequested extends Error {
  targetAgentId: string
  prompt: string
  threadId: string
  constructor(targetAgentId: string, prompt: string, threadId: string)
}
```

```typescript
class MultiAgentManager {
  agents: Map<string, Agent>
  agentDescriptors: Map<string, AgentDescriptor>
  events: EventBus
  activeAgentId?: string
  handoffStack: HandoffStackEntry[]
  handoffHistory: HandoffConfig[]
  delegationDepth: number
  maxDelegationDepth: number

  registerAgent(id: string, agent: Agent, description?: string): this
  getAgent(id: string): Agent | undefined
  getAllAgents(): Agent[]
  getAgentIds(): string[]
  getCapabilitySummary(excludeAgentId?: string): string
  registerHandoffTools(agentId: string): void
  runAgent(agentId: string, prompt: string, context?: Partial<RunContext>): Promise<string>
  streamAgent(agentId: string, prompt: string, context?: Partial<RunContext>, options?: StreamingOptions): Promise<string>
  createDelegationTool(delegateAgentId: string, toolName: string, description: string): ToolConfig
  handoff(fromAgentId: string, toAgentId: string, config: HandoffConfig): Promise<string>
}

class AgentGraph {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  startNode: string
  endNodes: Set<string>
  state: Record<string, unknown>
  currentNodeId: string
  events: EventBus
  maxIterations: number

  constructor(config: AgentGraphConfig)
  getNode(id: string): GraphNode | undefined
  getCurrentNode(): GraphNode | undefined
  isEnd(): boolean
  getOutgoingEdges(nodeId: string): GraphEdge[]
  addNode(node: GraphNode): this
  addEdge(edge: GraphEdge): this
  updateState(updates: Record<string, unknown>): void
  nextNode(): GraphNode | undefined
  reset(): void
  getProgress(): { current: string; completed: string[]; remaining: string[] }
  toJSON(): string
  static fromJSON(json: string, manager?: MultiAgentManager): AgentGraph
}

class DeepAgent {
  agent: Agent
  config: DeepAgentConfig
  events: EventBus
  plan: string[]
  currentStep: number

  constructor(agent: Agent, config?: DeepAgentConfig)
  enhanceWithDeepCapabilities(): void
  run(prompt: string, context?: Partial<RunContext>): Promise<string>
  stream(prompt: string, context?: Partial<RunContext>, options?: StreamingOptions): AsyncGenerator<string>
}
```

### Utility Classes

```typescript
class EventSource {
  emit(event: BaseEvent): void
  subscribe(listener: (event: BaseEvent) => void): () => void
  clear(): void
  getHistory(): BaseEvent[]
  getCount(): number
}

class EventTransformer {
  static normalizeEvent(event: BaseEvent): BaseEvent
  static splitByWords(text: string): string[]
  static generateEventId(event: BaseEvent): string
}

class ConnectionManager {
  connect(id: string, connection: { send: (event: BaseEvent) => void; close?: () => void }): void
  disconnect(id: string): void
  emitToAll(event: BaseEvent): void
  hasConnection(id: string): boolean
  getConnection(id: string): { send: (event: BaseEvent) => void; close?: () => void } | undefined
  getConnectionIds(): string[]
  clear(): void
}

class Validator {
  static isValidEvent(event: unknown): event is BaseEvent
  static isNonEmptyString(value: unknown): value is string
  static isObject(value: unknown): value is Record<string, unknown>
  static isArray(value: unknown): value is unknown[]
  static isNumber(value: unknown): value is number
  static isBoolean(value: unknown): value is boolean
  validateEvent(event: BaseEvent): void
}

class ProtocolError extends Error {
  constructor(message: string, code: string, event?: BaseEvent)
  code: string
  event?: BaseEvent
  name: 'ProtocolError'
}

class MiddlewareChain {
  use(...mw: MiddlewareFunction[]): void
  compose(input: { prompt: string }, finalExecutor: MiddlewareNext): AsyncGenerator<AgentEvent>
  clear(): void
  get count(): number
}

class HttpAgent extends Agent {
  constructor(config: HttpAgentConfig)
}

class AguiClient {
  constructor(baseUrl: string)
  agents(): Promise<AgentMetadata[]>
  agent(id: string): Promise<AgentMetadata>
  capabilities(agentId: string): Promise<AgentCapabilities>
  models(): Promise<ModelEntry[]>
  model(id: string): Promise<ModelEntry>
  modelsByProvider(provider: string): Promise<ModelEntry[]>
  getThreadRuns(threadId: string): Promise<RunData[]>
  getThreadStats(threadId: string): Promise<{ totalCost: number; runCount: number; lastModelId?: string } | null>
  listThreads(): Promise<ThreadData[]>
  getThreadMessages(threadId: string): Promise<Message[]>
  createThread(threadId: string): Promise<ThreadData>
  deleteThread(threadId: string): Promise<void>
  run(agentId: string, prompt: string, opts?: { apiKey?: string; model?: string; threadId?: string }): Promise<{ result: string; events: any[]; threadId?: string }>
  stream(agentId: string, prompt: string, callbacks: StreamCallbacks, opts?: { apiKey?: string; model?: string; threadId?: string; signal?: AbortSignal }): Promise<string>
  resume(agentId: string, interruptId: string, payload?: unknown, status?: 'resolved' | 'cancelled', opts?: { apiKey?: string; model?: string; threadId?: string }): Promise<{ result: string; events: any[]; threadId?: string }>
}
```

### AguiWebSocketClient

```typescript
class AguiWebSocketClient {
  constructor(serverUrl: string, agentId: string)
  connect(apiKey?, model?): Promise<void>
  run(prompt: string): Promise<string>
  stream(prompt: string): AsyncGenerator<string>
  resume(interruptId: string, payload?, status?): Promise<string>
  getCapabilities(): Promise<AgentCapabilities>
  on(type: string, handler: (data: any) => void): void
  off(type: string): void
  close(): void
}
```

### Store Classes

```typescript
class MemoryThreadStore implements ThreadStore { }
class RedisThreadStore implements ThreadStore {
  constructor(connectionStringOrConfig: string | RedisOptions, config?: StoreConfig)
}
class PostgresThreadStore implements ThreadStore {
  constructor(connectionString: string, config?: StoreConfig)
}

class OxigraphSemanticStore implements SemanticStore {
  constructor()
}
```

## Enums

```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'validation_error',
  ENCODING_ERROR = 'encoding_error',
  DECODING_ERROR = 'decoding_error',
  CONNECTION_ERROR = 'connection_error',
  STREAM_ERROR = 'stream_error',
  TIMEOUT_ERROR = 'timeout_error',
  INTERRUPT = 'interrupt',
  MAX_RETRIES_EXCEEDED = 'max_retries_exceeded',
}
```

## Factory Functions

```typescript
function createProvider(type: ProviderType, config: ProviderConfig): BaseLLMProvider
function compactEvents(events: AgentEvent[]): AgentEvent[]
function createClient(baseUrl: string): AguiClient
function createHandoffTool(name: string, description: string, targetAgentId: string, manager: MultiAgentManager): ToolConfig
function createFilterToolCallsMiddleware(options: FilterToolCallsOptions): MiddlewareFunction
function createLoggingMiddleware(logger?: (msg: string) => void): MiddlewareFunction
function createSummarizationMiddleware(config?: SummarizationConfig): MiddlewareFunction
function createLTMMiddleware(store: SemanticStore): MiddlewareFunction
function runAgentGraph(graph: AgentGraph, manager: MultiAgentManager, agents: Map<string, string>, initialInput?: string): Promise<string>
```

### Model Catalog Functions

```typescript
function getModel(id: string): ModelEntry | undefined
function getModelsByProvider(provider: string): ModelEntry[]
function getModelsWithCapability(key: string): ModelEntry[]
function calculateCost(modelId: string, usage: TokenUsage): CostBreakdown | null
function formatCost(cost: number): string
function exceedsContextWindow(modelId: string, tokens: number): { exceeds: boolean; limit: number }
```

## Conversion Functions

```typescript
function toOpenAIMessages(messages: Message[]): any[]
function toAnthropicMessages(messages: Message[]): any[]
function fromToolCallsToEvents(toolCalls: ToolCall[]): AgentEvent[]
function mergeMessages(...messageArrays: Message[][]): Message[]
```

## React Hooks

```typescript
// From 'agui-framework/client/react'

function useAguiClient(baseUrl: string): AguiClient
function useAgent(agentId: string, baseUrl: string): { meta: AgentMetadata | null; loading: boolean; error: Error | null; refetch: () => void }
function useCapabilities(agentId: string, baseUrl: string): { caps: AgentCapabilities | null; loading: boolean; error: Error | null; refetch: () => void }
function useAgents(baseUrl: string): { agents: AgentMetadata[]; loading: boolean; error: Error | null; refetch: () => void }
function useStream(): { start: (prompt: string, opts: UseStreamOptions) => void; stop: () => void; isLoading: boolean; error: Error | null; result: string }
function useThread(options: UseThreadOptions): { threads: ThreadInfo[]; currentThreadId, messages, loading, loadMessages, createThread, deleteThread, setCurrentThreadId }
function useInterrupts(): { interrupts: Interrupt[]; handleInterrupt: (i: Interrupt) => void; resolve: (id, payload?, status?) => void; clear: () => void }
function useCoAction(toolDef): { tool, pendingCall, result, error, execute, reset }
function useCoAgent(opts: UseCoAgentOptions): { messages, state, isLoading, error, intervention, feedback, codeExecution, usage, sendMessage, resume, registerTool, client, threadId }
function useWebSocket(baseUrl: string, agentId: string): { connected, caps, connect, disconnect, on, off, run, resume }
function useModels(baseUrl: string): { models: ModelEntry[]; loading: boolean; error: Error | null; refetch: () => void }
function useModel(baseUrl: string, modelId: string): { model: ModelEntry | null; loading: boolean; error: Error | null; refetch: () => void }
function useModelsByProvider(baseUrl: string, provider: string): { models: ModelEntry[]; loading: boolean; error: Error | null; refetch: () => void }
function useThreadRuns(baseUrl: string, threadId: string): { runs: RunData[]; loading: boolean; error: Error | null; refetch: () => void }
function useThreadStats(baseUrl: string, threadId: string): { stats: { totalCost, runCount, lastModelId? } | null; loading: boolean; error: Error | null; refetch: () => void }
function useResume(baseUrl: string, agentId: string): { resume: (interruptId, payload?, status?, opts?) => Promise<...> }
function useLiveState(agentId: string, baseUrl: string, threadId?: string): { state: LiveAgentState | null; loading: boolean; error: Error | null; refetch: () => void; startPolling: (intervalMs?) => () => void }
function useRunningAgents(baseUrl: string): { agents: RunningAgent[]; loading: boolean; error: Error | null; refetch: () => void }
```

## Constants

```typescript
const PROVIDER_DEFAULTS: Record<ProviderType, { baseUrl: string; defaultModel: string }> = {
  openai:     { baseUrl: 'https://api.openai.com/v1',               defaultModel: 'gpt-4o' },
  anthropic:  { baseUrl: 'https://api.anthropic.com/v1',            defaultModel: 'claude-3-5-sonnet-20240620' },
  ollama:     { baseUrl: 'http://localhost:11434/v1',               defaultModel: 'llama3' },
  fireworks:  { baseUrl: 'https://api.fireworks.ai/inference/v1',   defaultModel: 'accounts/fireworks/models/deepseek-v4-flash' },
}
```

## Type Index

### Agent Types

```typescript
type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'fireworks'
type RunAgentFunction = () => AsyncGenerator<AgentEvent>
type MiddlewareFunction = (agent: Agent, prompt: string, context: Partial<RunContext>, next: RunAgentFunction) => AsyncGenerator<AgentEvent>

interface AgentConfig {
  name?: string; model: string; provider: ProviderType; instructions: string
  tools?: ToolConfig[]; maxTokens?: number; temperature?: number; topP?: number
  stream?: boolean; modelSettings?: Record<string, unknown>; capabilities?: string[]
  apiKey?: string; baseUrl?: string; store?: ThreadStore; autoPersist?: boolean
  maxIterations?: number; maxExecutionTime?: number; structuredOutput?: boolean
  supportedMimeTypes?: string[]; parallelCalls?: boolean; clientProvidedTools?: boolean
  websocket?: boolean; codeExecution?: boolean; sandboxed?: boolean
  reasoningEncrypted?: boolean; humanInterventions?: boolean; humanFeedback?: boolean
  approveWithEdits?: boolean
  multimodalInput?: { image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean; file?: boolean }
  multimodalOutput?: { image?: boolean; audio?: boolean }
  costLimit?: number; maxContextWindow?: number; outputSchema?: Record<string, unknown>
  sharedState?: SharedState
}

interface RunContext {
  threadId: string; runId: string; agentId?: string; userId?: string
  deps?: unknown; modelSettings?: Record<string, unknown>
  capabilities?: string[]; metadata?: Record<string, unknown>
  resume?: Array<{ interruptId: string; status: 'resolved' | 'cancelled'; payload?: unknown }>
  clientTools?: ToolConfig[]; outputFormat?: string; feedback?: unknown
}

interface StreamingOptions {
  onStart?: () => void; onChunk?: (chunk: string, event?: BaseEvent) => void
  onComplete?: (result: unknown, context: RunContext) => void
  onError?: (error: Error, event?: BaseEvent) => void
  onInterrupt?: (interrupt: Interrupt, context: RunContext) => void
  onEvent?: (event: BaseEvent) => void; bufferSize?: number; encoding?: 'utf8' | 'base64'
}

interface DelegationConfig { agent: string; prompt: string; deps?: unknown; context?: RunContext }
interface HandoffConfig { fromAgent: string; toAgent: string; reason: string; context?: RunContext }
interface HandoffStackEntry { fromAgent: string; toAgent: string; reason: string; timestamp: number }
interface AgentDescriptor { id: string; name: string; description: string }
```

### Message Types

```typescript
type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'developer' | 'reasoning' | 'activity'

interface BaseMessage { id: string; role: MessageRole; content?: string | Record<string, unknown>; name?: string; encryptedContent?: string }
interface UserMessage extends BaseMessage { role: 'user'; content: string }
interface AssistantMessage extends BaseMessage { role: 'assistant'; content?: string; toolCalls?: ToolCall[] }
interface SystemMessage extends BaseMessage { role: 'system'; content: string }
interface ToolMessage extends BaseMessage { role: 'tool'; content: string; toolCallId: string; error?: string; encryptedValue?: string }
interface ReasoningMessage extends BaseMessage { role: 'reasoning'; content: string; encryptedValue?: string }
interface ActivityMessage extends BaseMessage { role: 'activity'; activityType: string; content: Record<string, unknown> }
type Message = UserMessage | AssistantMessage | SystemMessage | ToolMessage | ReasoningMessage | ActivityMessage
```

### Tool Types

```typescript
interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
interface ToolDefinition { name: string; description: string; parameters: ToolParameters }
interface ToolConfig {
  name: string; description: string; parameters: ToolParameters
  requiresApproval?: boolean; handler: (args: Record<string, unknown>, context: RunContext) => Promise<unknown>
}
interface ToolParameters { type: 'object'; properties?: Record<string, ParameterSpec>; required?: string[]; additionalProperties?: boolean }
```

### Event Types

```typescript
type EventType =
  | 'RUN_STARTED' | 'RUN_FINISHED' | 'RUN_ERROR'
  | 'STEP_STARTED' | 'STEP_FINISHED'
  | 'TEXT_MESSAGE_START' | 'TEXT_MESSAGE_CONTENT' | 'TEXT_MESSAGE_END' | 'TEXT_MESSAGE_CHUNK'
  | 'TOOL_CALL_START' | 'TOOL_CALL_ARGS' | 'TOOL_CALL_END' | 'TOOL_CALL_RESULT' | 'TOOL_CALL_CHUNK'
  | 'STATE_SNAPSHOT' | 'STATE_DELTA' | 'MESSAGES_SNAPSHOT'
  | 'ACTIVITY_SNAPSHOT' | 'ACTIVITY_DELTA'
  | 'REASONING_START' | 'REASONING_END'
  | 'REASONING_MESSAGE_START' | 'REASONING_MESSAGE_CONTENT' | 'REASONING_MESSAGE_END'
  | 'REASONING_MESSAGE_CHUNK' | 'REASONING_ENCRYPTED_VALUE'
  | 'AGENT_HANDOFF_REQUEST' | 'AGENT_HANDOFF_RESULT'
  | 'AGENT_DELEGATION_START' | 'AGENT_DELEGATION_END'
  | 'HUMAN_INTERVENTION_REQUEST' | 'HUMAN_INTERVENTION_RESULT' | 'HUMAN_FEEDBACK'
  | 'CODE_EXECUTION_START' | 'CODE_EXECUTION_RESULT'
  | 'MEMORY_SUMMARY' | 'USAGE_UPDATE'
  | 'RAW' | 'CUSTOM'
```

### Store Types

```typescript
interface ThreadData { threadId: string; createdAt: string; updatedAt: string; metadata?: Record<string, unknown>; messageCount?: number; agentId?: string }
interface RunData { runId: string; threadId: string; agentId?: string; input?: unknown; output?: unknown; outcome?: unknown; startedAt: string; finishedAt?: string; duration?: number; eventCount?: number; parentRunId?: string; modelId?: string; usage?: TokenUsage; cost?: CostBreakdown }
interface StoreConfig { tablePrefix?: string; autoCreateTables?: boolean; maxMessageLength?: number; connectionPoolSize?: number }

interface ThreadStore {
  connect(): Promise<void>; disconnect(): Promise<void>
  createThread(threadId, metadata?, agentId?): Promise<ThreadData>
  getThread(threadId): Promise<ThreadData | null>
  listThreads(limit?, offset?): Promise<ThreadData[]>
  deleteThread(threadId): Promise<void>
  appendMessage(threadId, message): Promise<void>
  appendMessages(threadId, messages): Promise<void>
  getMessages(threadId, limit?, offset?): Promise<Message[]>
  saveState(threadId, state): Promise<void>
  getState(threadId): Promise<Record<string, unknown> | null>
  appendEvent(threadId, event): Promise<void>
  saveRun(runId, threadId, data): Promise<void>
  getRun(runId): Promise<RunData | null>
  searchMessages(threadId, query, limit?): Promise<Message[]>
}

interface Fact {
  subject: string; predicate: string; object: string
  timestamp: number; ttl?: number
}

interface SemanticMemoryQuery {
  predicates?: string[]; limit?: number
}

interface SemanticStore {
  remember(userId: string, facts: Fact[]): Promise<void>
  recall(userId: string, query?: SemanticMemoryQuery): Promise<Fact[]>
  forget(userId: string, predicate?: string): Promise<void>
}
```

### Model Entry and Related Types

```typescript
interface ModelEntry {
  id: string
  provider: ProviderType
  name: string
  contextWindow: number
  maxOutput?: number
  pricing: ModelPricing
  capabilities: ModelCapabilities
  hosting?: ModelHosting
  description?: string
  aliases?: string[]
}

interface ModelPricing {
  input: number
  output: number
  cachedInput?: number
  longContextMultiplier?: { input: number; output: number }
}

interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedPromptTokens?: number
}

interface CostBreakdown {
  currency: 'USD'
  inputCost: number
  outputCost: number
  cachedInputCost?: number
  totalCost: number
  modelId: string
  tokenUsage: TokenUsage
}
```

### AgentCapabilities

In addition to the standard capability fields, the `model` block within `AgentCapabilities` may contain pricing and context window information for the agent's current model.

### Server Types

Server-side types include `RunningAgent` and `LiveAgentState`, used by the endpoints `GET /api/agents/:id/state` and `GET /api/running-agents`.

### Run Input

```typescript
interface RunAgentInput {
  threadId: string; runId: string; messages: Message[]
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  state?: Record<string, unknown>
  resume?: Array<{ interruptId: string; status: 'resolved' | 'cancelled'; payload?: unknown }>
  capabilities?: string[]; parentRunId?: string; timestamp?: number
}
```
