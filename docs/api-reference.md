# API Reference

Complete API reference organized by module.

## Core (`agui-framework`)

### Agent

```typescript
class Agent {
  constructor(config: AgentConfig);
  run(prompt: string, context?: Partial<RunContext>): Promise<string>;
  stream(prompt: string, context?: Partial<RunContext>, options?: StreamingOptions): AsyncGenerator<string>;
  resume(interruptId: string, payload?: unknown, status?: "resolved" | "cancelled"): Promise<string>;
  addTool(tool: ToolConfig): this;
  addCapability(capability: string): this;
  use(...middlewares: MiddlewareFunction[]): this;
  delegate(subAgent: Agent, prompt: string, config?: DelegationConfig): Promise<string>;
  createDelegationTool(name: string, desc: string, subAgent: Agent): ToolConfig;
  createHandoffTool(name: string, desc: string, targetAgent: Agent): ToolConfig;
  clone(): Agent;
  getTools(): ToolConfig[];
  getCapabilities(peerDescriptors?: Map<string, AgentDescriptor>): AgentCapabilities;
  loadThread(threadId: string): Promise<void>;
  saveThread(threadId: string): Promise<void>;
  toJSON(): string;
  fromJSON(json: string): this;
  static create(config: AgentConfig): Agent;
  static createFromEnv(): Agent;
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

### SharedState

```typescript
class SharedState {
  constructor(initialData?: StateData, options?: StateOptions, threadId?: string);
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
  merge(other: SharedState, strategy?: StateMergeStrategy, conflictHandler?: Function): StateData;
  computePatch(): JsonPatchOperation[];
  getVersion(): string;
  subscribe(callback: StateSubscription): () => void;
  toJSON(): string;
  fromJSON(json: string): this;
}
```

### StateManager

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
  subscribe(callback: StateSubscription): () => void;
}
```

### ProtocolEncoder

```typescript
class ProtocolEncoder {
  encodeEvent(event: AgentEvent): string;
  decodeEvent(data: string): AgentEvent;
  encodeRunOutput(events: AgentEvent[]): string;
  decodeRunOutput(data: string): AgentEvent[];
}
```

### ProtocolValidator

```typescript
class ProtocolValidator {
  validateRunInput(input: unknown): ValidationError[];
  validateEvent(event: unknown): ValidationError[];
  validateMessage(message: unknown): ValidationError[];
}
```

### MiddlewareChain

```typescript
class MiddlewareChain {
  use(middleware: MiddlewareFunction): this;
  execute(generator: AsyncGenerator<AgentEvent>, context: RunContext): AsyncGenerator<AgentEvent>;
}
```

### MCPClientManager

```typescript
class MCPClientManager {
  connect(config: MCPServerConfig): Promise<void>;
  disconnect(name?: string): Promise<void>;
  getTools(): ToolConfig[];
  listConnections(): string[];
}
```

### MultiAgentManager

```typescript
class MultiAgentManager {
  registerAgent(agent: Agent): void;
  unregisterAgent(agentId: string): void;
  getAgent(agentId: string): Agent | undefined;
  getAgentsByCapability(capability: string): Agent[];
  getAllAgents(): Agent[];
}
```

### AgentGraph

```typescript
class AgentGraph {
  constructor(config: AgentGraphConfig);
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  run(input?: string): Promise<string>;
}
```

### DeepAgent

```typescript
class DeepAgent {
  constructor(agent: Agent, config?: DeepAgentConfig);
  run(prompt: string): Promise<string>;
  stream(prompt: string): AsyncGenerator<string>;
}
```

### Providers

```typescript
abstract class BaseLLMProvider {
  readonly type: ProviderType;
  config: ProviderConfig;
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamChunk>;
  prepareMessages(systemPrompt: string, messages: Message[]): ChatMessage[];
}

function createProvider(type: ProviderType, config: ProviderConfig): BaseLLMProvider;
```

### Conversion Utilities

```typescript
function toOpenAIMessages(messages: Message[]): any[];
function toAnthropicMessages(messages: Message[]): any[];
function fromToolCallsToEvents(toolCalls: any[]): AgentEvent[];
function mergeMessages(history: Message[], newMessages: Message[]): Message[];
```

### Middleware Utilities

```typescript
function createFilterToolCallsMiddleware(options: { allowedTools: string[] }): MiddlewareFunction;
function createLoggingMiddleware(logger?: Console): MiddlewareFunction;
function createSummarizationMiddleware(config?: SummarizationConfig): MiddlewareFunction;
function createLTMMiddleware(store: SemanticStore, config?: LTMConfig): MiddlewareFunction;
```

### Event Utilities

```typescript
function compactEvents(events: AgentEvent[]): AgentEvent[];
```

### Models & Cost

```typescript
function getModel(modelId: string): ModelEntry | undefined;
function getModelsByProvider(provider: ProviderType): ModelEntry[];
function getModelsWithCapability(capability: string): ModelEntry[];
function calculateCost(modelId: string, usage: TokenUsage): CostBreakdown | null;
function formatCost(cost: number): string;
function exceedsContextWindow(modelId: string, tokens: number): { exceeds: boolean; limit: number };
function createTokenUsage(promptTokens: number, completionTokens: number): TokenUsage;
```

### Types

```typescript
type ProviderType = "openai" | "anthropic" | "ollama" | "fireworks";
type EventType = "RUN_STARTED" | "RUN_FINISHED" | "RUN_ERROR" | /* ... all event types ... */;

interface AgentConfig { /* ... */ }
interface ToolConfig { /* ... */ }
interface RunContext { /* ... */ }
interface ThreadStore { /* ... */ }
interface SemanticStore { /* ... */ }
interface AgentCapabilities { /* ... */ }
interface ModelEntry { /* ... */ }
interface TokenUsage { /* ... */ }
```

## Server (`agui-framework/server`)

### AguiServer

```typescript
class AguiServer {
  constructor(config: ServerConfig);
  start(): Promise<void>;
  stop(): Promise<void>;
  getApp(): Express.Application;
}
```

### AguiWebSocketServer

```typescript
class AguiWebSocketServer {
  constructor(server: AguiServer);
  broadcast(event: AgentEvent): void;
}
```

### Functions

```typescript
function loadAgents(configs: AgentRegistration[]): Promise<Agent[]>;
function normalizeAgent(config: AgentRegistration): Agent;
```

### Types

```typescript
interface ServerConfig {
  port: number;
  agents: AgentRegistration[];
  apiKey?: string;
  cors?: CorsOptions;
  rateLimit?: RateLimitConfig;
}

interface AgentRegistration {
  path?: string;
  name?: string;
  agent?: Agent;
}
```

## Client (`agui-framework/client`)

### AguiClient

```typescript
class AguiClient {
  constructor(baseUrl: string, options?: ClientOptions);
  agents(): Promise<AgentDescriptor[]>;
  agent(id: string): Promise<AgentMetadata>;
  run(id: string, options: RunOptions): Promise<string>;
  stream(id: string, options: RunOptions): AsyncGenerator<string>;
  resume(threadId: string, options: ResumeOptions): Promise<string>;
  threads(): Promise<ThreadData[]>;
  thread(id: string): Promise<ThreadData>;
  createThread(data?: Partial<ThreadData>): Promise<ThreadData>;
  deleteThread(id: string): Promise<void>;
  threadMessages(id: string): Promise<Message[]>;
  threadRuns(id: string): Promise<RunData[]>;
  threadState(id: string): Promise<Record<string, unknown>>;
  updateThreadState(id: string, state: Record<string, unknown>): Promise<void>;
  models(): Promise<ModelEntry[]>;
  model(id: string): Promise<ModelEntry>;
  modelsByProvider(provider: ProviderType): Promise<ModelEntry[]>;
}
```

### AguiWebSocketClient

```typescript
class AguiWebSocketClient {
  constructor(url: string, agentId: string);
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  get connected(): boolean;
  capabilities(): Promise<AgentCapabilities>;
  run(prompt: string, context?: Partial<RunContext>): Promise<void>;
  stream(prompt: string, context?: Partial<RunContext>): Promise<void>;
  resume(threadId: string, options: ResumeOptions): Promise<void>;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
}
```

### Factory

```typescript
function createClient(baseUrl: string): AguiClient;
```

## Client React (`agui-framework/client/react`)

### Hooks

```typescript
function useChat(options: UseChatOptions): UseChatReturn;
function useStream(): UseStreamReturn;
function useThread(options: UseThreadOptions): UseThreadReturn;
function useInterrupts(options: UseInterruptsOptions): UseInterruptsReturn;
function useCoAgent(options: UseCoAgentOptions): UseCoAgentReturn;
function useCoAction(toolDef: ToolConfig & { handler: Function }): UseCoActionReturn;
function useAgentState(agentId: string, baseUrl: string): UseAgentStateReturn;
function useCapabilities(agentId: string, baseUrl: string): UseCapabilitiesReturn;
function useAgent(agentId: string, baseUrl: string): UseAgentReturn;
function useWebSocket(baseUrl: string, agentId: string): UseWebSocketReturn;
function useModels(baseUrl: string): UseModelsReturn;
function useModel(baseUrl: string, modelId: string): UseModelReturn;
function useModelsByProvider(baseUrl: string, provider: ProviderType): UseModelsReturn;
function useThreadRuns(baseUrl: string, threadId: string): UseThreadRunsReturn;
function useThreadStats(baseUrl: string, threadId: string): UseThreadStatsReturn;
function useResume(baseUrl: string): UseResumeReturn;
function useLiveState(baseUrl: string, agentId: string): UseLiveStateReturn;
function useRunningAgents(baseUrl: string): UseRunningAgentsReturn;
function useAgents(baseUrl: string): UseAgentsReturn;
function useAguiClient(baseUrl: string): AguiClient;
```

## Store (`agui-framework/store`)

### MemoryThreadStore

```typescript
class MemoryThreadStore implements ThreadStore {
  constructor();
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  // ... ThreadStore interface methods
}
```

### RedisThreadStore

```typescript
class RedisThreadStore implements ThreadStore {
  constructor(config: { host?: string; port?: number; password?: string; keyPrefix?: string });
  // ... ThreadStore interface methods
}
```

### PostgresThreadStore

```typescript
class PostgresThreadStore implements ThreadStore {
  constructor(config: { host: string; port: number; database: string; user: string; password: string });
  // ... ThreadStore interface methods
}
```

### OxigraphSemanticStore

```typescript
class OxigraphSemanticStore implements SemanticStore {
  constructor();
  remember(userId: string, facts: Fact[]): Promise<void>;
  recall(userId: string, predicate?: string): Promise<Fact[]>;
  forget(userId: string, predicate?: string): Promise<void>;
  clear(): Promise<void>;
}
```

### Types

```typescript
interface ThreadStore { /* ... */ }
interface SemanticStore { /* ... */ }
interface ThreadData { /* ... */ }
interface RunData { /* ... */ }
interface Fact { subject: string; predicate: string; object: string; timestamp?: number; }
interface StoreConfig { /* ... */ }
```
