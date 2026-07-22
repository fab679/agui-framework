# Architecture

AGUI Framework follows a modular, event-driven architecture where all agent operations flow through a middleware pipeline and emit typed events on an EventBus.

## Module Overview

```
agui-framework/
  Agent              → Central orchestrator
  EventBus           → Pub/sub event system
  StateManager       → Thread-isolated state management
  SharedState        → Versioned key-value store
  ProtocolEncoder    → SSE serialization
  ProtocolValidator  → Input validation
  BaseLLMProvider    → LLM abstraction (OpenAI, Anthropic, Ollama, Fireworks)
  MiddlewareChain    → Composable event pipeline
  MCPClientManager   → MCP tool discovery
  MultiAgentManager  → Multi-agent orchestration
  AgentGraph         → Directed graph workflows
  ThreadStore        → Persistence interface
  SemanticStore      → Long-term memory interface
  AguiServer         → HTTP/WebSocket server
  AguiClient         → HTTP client
```

## Data Flow

### Agent Execution Flow

```
User Input
     │
     ▼
  Agent.run()/stream()/resume()
     │
     ▼
  Middleware Pipeline (transform events)
     │
     ▼
  _executeRun() - Core execution loop
     │
     ├─► Provider.chatCompletion() / streamChatCompletion()
     │       │
     │       ▼
     │   LLM Response
     │       │
     │       ▼
     ├─► Tool Execution (if tool call)
     │       │
     │       ▼
     │   Tool Result
     │
     └─► EventBus.emit() → all subscribers
             │
             ▼
         SSE Encoding → Client
```

### Server Architecture

```
Client (HTTP/WebSocket)
     │
     ▼
  AguiServer (Express + WS)
     │
     ├─► REST API (/api/agents, /api/threads, /api/models)
     │
     ├─► SSE Stream (/api/agents/:id/run)
     │
     └─► WebSocket (/ws)
             │
             ▼
         Agent Execution
             │
             ▼
         ThreadStore (Memory/Redis/Postgres)
```

## Middleware Pipeline

Middleware wraps the core execution generator, allowing interception and transformation:

```typescript
// Execution order
Input → Middleware 1 → Middleware 2 → ... → Core Execution → ... → Middleware 2 → Middleware 1 → Output
```

Each middleware is a function that receives a generator and returns a wrapped generator:

```typescript
type MiddlewareFunction = (
  generator: AsyncGenerator<AgentEvent>,
  context: RunContext,
) => AsyncGenerator<AgentEvent>;
```

## State Architecture

```
StateManager
     │
     ├─► Thread "abc" → SharedState (isolated)
     │
     ├─► Thread "def" → SharedState (isolated)
     │
     └─► Global SharedState (optional, agent-accessible via tools)
              │
              ├─► Agent A reads/writes
              └─► Agent B reads/writes
```

## Multi-Agent Architecture

```
MultiAgentManager
     │
     ├─► Agent A (capabilities: [research])
     │       │
     │       ├─► Delegation to Agent B
     │       └─► Handoff to Agent C
     │
     ├─► Agent B (capabilities: [analysis])
     │
     └─► Agent Graph
             │
             ├─► Node 1 → Agent A
             ├─► Node 2 → Agent B
             └─► Edge 1→2 → conditional
```

## Extension Points

1. **Custom Providers** -- Extend `BaseLLMProvider` for new LLM backends
2. **Custom Middleware** -- Write functions that wrap the event generator
3. **Custom Thread Stores** -- Implement `ThreadStore` interface
4. **Custom Semantic Stores** -- Implement `SemanticStore` interface
5. **Custom Tools** -- Define `ToolConfig` with handlers
6. **Custom MCP Servers** -- Connect any MCP-compatible server

## Module Dependencies

```
Agent
  ├─► BaseLLMProvider (via createProvider)
  ├─► EventBus
  ├─► StateManager / SharedState
  ├─► MCPClientManager
  ├─► MiddlewareChain
  ├─► ThreadStore (optional)
  └─► ProtocolEncoder
