# AG-UI Serialization Implementation

Serialization in agui-framework provides a standard way to persist and restore the event stream that drives an agent session. With a serialized stream you can restore chat history after reloads, create branches from any prior run, and compact stored history.

## Event Stream Serialization

The `ProtocolEncoder` provides methods for serializing and deserializing the full event history to and from JSON for storage.

### Basic Serialization

```typescript
import { ProtocolEncoder } from 'agui-framework'

const encoder = new ProtocolEncoder()
const events = eventBus.getHistory()

// Serialize to JSON string
const serialized = JSON.stringify(events)

// Store in database, file, etc.
await storage.save(threadId, serialized)

// Restore later
const restored = JSON.parse(await storage.load(threadId)) as AgentEvent[]
```

### Using the Encoder

```typescript
// Encode individual events
const json = encoder.encodeEvent(event)

// Encode run input for persistence
const inputJson = encoder.encodeRunInput(runInput)
const restoredInput = encoder.decodeRunInput(inputJson)
```

## Run Lineage and Branching

The `parentRunId` field on `RUN_STARTED` creates a git-like lineage. The stream becomes an immutable append-only log where each run can branch from any previous run.

```typescript
// Original run
{
  type: 'RUN_STARTED',
  threadId: 'thread1',
  runId: 'run1',
  input: { messages: ['Tell me about Paris'] },
}

// Branch from run1
{
  type: 'RUN_STARTED',
  threadId: 'thread1',
  runId: 'run2',
  parentRunId: 'run1',
  input: { messages: ['Actually, tell me about London instead'] },
}
```

Benefits:
- Multiple branches in the same serialized log
- Immutable history (append-only)
- Deterministic time travel to any point

## Event Compaction

`compactEvents()` reduces verbose event streams to snapshots while preserving semantics. Compaction is useful for reducing storage size and simplifying history for client consumption.

```typescript
import { compactEvents } from 'agui-framework'

const compacted = compactEvents(rawEvents)
```

### Compaction Rules

1. **Message streams** -- Combine `TEXT_MESSAGE_*` sequences into a single `MESSAGES_SNAPSHOT`; concatenate adjacent `TEXT_MESSAGE_CONTENT` for the same message
2. **Tool calls** -- Collapse `TOOL_CALL_START`/`TOOL_CALL_ARGS`/`TOOL_CALL_END`/`TOOL_CALL_RESULT` into a compact record
3. **State** -- Merge consecutive `STATE_DELTA` into a single final `STATE_SNAPSHOT` and discard superseded updates
4. **Reasoning** -- Consolidate `REASONING_*` sequences into a single entry
5. **Preserved events** -- `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `MESSAGES_SNAPSHOT`, `ACTIVITY_SNAPSHOT`

### Compaction Example

Before:

```typescript
[
  { type: 'TEXT_MESSAGE_START', messageId: 'msg1', role: 'user' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg1', delta: 'Hello ' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg1', delta: 'world' },
  { type: 'TEXT_MESSAGE_END', messageId: 'msg1' },
  { type: 'STATE_DELTA', delta: [{ op: 'add', path: '/foo', value: 1 }] },
  { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/foo', value: 2 }] },
]
```

After:

```typescript
[
  {
    type: 'MESSAGES_SNAPSHOT',
    messages: [{ id: 'msg1', role: 'user', content: 'Hello world' }],
  },
  {
    type: 'STATE_SNAPSHOT',
    snapshot: { foo: 2 },
  },
]
```

## EventBus Serialization

The `EventBus` itself can be serialized and restored:

```typescript
const bus = new EventBus()

// ... emit events ...

// Serialize the entire bus state
const json = bus.toJSON()

// Restore in a new instance
const restoredBus = new EventBus()
restoredBus.fromJSON(json)

// History is preserved
console.log(restoredBus.getHistory().length === bus.getHistory().length)  // true
```

## RunAgentInput Serialization

```typescript
import { ProtocolEncoder } from 'agui-framework'
import type { RunAgentInput } from 'agui-framework'

const encoder = new ProtocolEncoder()

const input: RunAgentInput = {
  threadId: 'thread-abc',
  runId: 'run-xyz',
  messages: [{ id: '1', role: 'user', content: 'Hello' }],
  capabilities: ['streaming'],
}

const json = encoder.encodeRunInput(input)
const decoded = encoder.decodeRunInput(json)
```

## Normalized Input for Branches

When branching, runs can omit messages already present in history:

```typescript
// First run includes full message
{
  type: 'RUN_STARTED',
  runId: 'run1',
  input: { messages: [{ id: 'msg1', role: 'user', content: 'Hello' }] },
}

// Second run omits already-present message
{
  type: 'RUN_STARTED',
  runId: 'run2',
  input: { messages: [{ id: 'msg2', role: 'user', content: 'How are you?' }] },
  // msg1 omitted; it already exists in history
}
```

## Implementation Notes

- Use `compactEvents()` before persisting long histories to reduce storage requirements
- Store streams append-only; prefer incremental writes when possible
- Consider compression when persisting very long histories
- Index by `threadId`, `runId`, and `timestamp` for fast retrieval
- The `agent.toJSON()` and `agent.fromJSON()` methods handle agent config and tool serialization

## TypeScript Interfaces

```typescript
interface RunStartedEvent extends BaseEvent {
  type: 'RUN_STARTED'
  threadId: string
  runId: string
  parentRunId?: string
  input?: {
    messages?: Message[]
    prompt?: string
    context?: Partial<RunContext>
  }
}
```
