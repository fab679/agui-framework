# AG-UI Core Architecture

agui-framework implements the AG-UI protocol as its native communication layer. This document covers how the framework's internals map to the AG-UI architectural concepts.

## Architecture Overview

```
agui-framework

  +-------------+     +--------------------------+
  |   Agent      |--->|    EventBus              |
  |  (Producer)  |     |  (Pub/Sub + History)     |
  +------+-------+     +----------+---------------+
         |                        |
         |              +---------+---------------+
         |              |  ProtocolEncoder         |
         |              |  (SSE Serialization)     |
         |              +-------------------------+
         |
  +------+----------------------------------+
  |  Provider Layer (OpenAI/Anthropic/etc)  |
  +-----------------------------------------+

  +-------------+  +--------------+  +--------------+
  | StateManager |  | Middleware   |  | ThreadStore   |
  | (Thread-     |  | (Event       |  | (Persistence) |
  |  isolated)   |  |  Transform)  |  |              |
  +-------------+  +--------------+  +--------------+
```

## Event-Driven Communication

The Agent class produces AG-UI events as async generators. The `EventBus` publishes these to subscribers:

```typescript
// Agent._executeRun() yields events
async function* _executeRun(prompt, context) {
  yield { type: 'RUN_STARTED', threadId, runId, ... }
  // ...
  yield { type: 'RUN_FINISHED', threadId, runId, outcome: { type: 'success' } }
}

// run() iterates the generator and publishes to EventBus
async run(prompt, context) {
  for await (const event of exec()) {
    this.events.emit(event)  // publishes to all subscribers
  }
}
```

## Protocol Layer

The `ProtocolEncoder` serializes events for SSE transport and the `ProtocolValidator` ensures event correctness:

```typescript
import { ProtocolEncoder, ProtocolValidator } from 'agui-framework'

const encoder = new ProtocolEncoder()
const sse = encoder.encodeSSE({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hi' })
// -> "data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"Hi"}\n\n"

const error = ProtocolValidator.validateEvent({ type: 'RUN_STARTED', threadId: 't1', runId: 'r1' })
// -> null (valid)
```

## Thread-Based Isolation

Each thread ID maps to isolated state and message history:

```
Agent
  +-- thread-abc --- Messages[...] + SharedState{...}
  +-- thread-xyz --- Messages[...] + SharedState{...}
  +-- thread-def --- Messages[...] + SharedState{...}
```

`StateManager` manages thread-isolated `SharedState` instances. Each run can optionally carry a `parentRunId` for lineage tracking.

## Middleware Layer

Middleware functions wrap the event generator, enabling event interception and transformation:

```typescript
import type { MiddlewareFunction } from 'agui-framework'

const mw: MiddlewareFunction = (agent, prompt, context, next) => async function* () {
  // Intercept and transform events
  for await (const event of next()) {
    yield event  // pass through
  }
}

agent.use(mw)
```

## Stores (Persistence)

The `ThreadStore` interface persists threads, messages, state, and run data. Implementations include in-memory, Redis, and Postgres backends. Agents auto-save after each run when a store is configured.

## Key Differences from Abstract Spec

| AG-UI Concept     | agui-framework Implementation                        |
|--------------------|------------------------------------------------------|
| `AbstractAgent`   | `Agent` class with concrete `run()`/`stream()`        |
| `run(input)`      | `run(prompt, context)` yielding AG-UI events internally |
| Observable-based  | AsyncGenerator-based (no RxJS dependency)            |
| Client SDK        | `AguiClient` + React hooks                           |
| Middleware        | `MiddlewareFunction` composition instead of class-based |

## Data Flow Diagram

### Request Lifecycle

```
Client (React/Frontend)            Server (Express/Next.js)         Provider (OpenAI/etc)
       |                                  |                              |
       |-- HTTP POST /api/run ----------->|                              |
       |                                  |-- Agent.run(prompt) -------->|
       |                                  |                              |
       |   <-- SSE: RUN_STARTED          |                              |
       |   <-- SSE: STATE_SNAPSHOT       |                              |
       |   <-- SSE: TEXT_MESSAGE_START   |                              |
       |   <-- SSE: TEXT_MESSAGE_CONTENT |                              |
       |   <-- SSE: TEXT_MESSAGE_END     |                              |
       |   <-- SSE: RUN_FINISHED         |                              |
```
