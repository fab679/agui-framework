# AG-UI Event Implementation

The `EventBus` class and the agent's internal execution methods implement the full AG-UI event type system. Every event produced during `run()` and `stream()` conforms to the AG-UI protocol specification.

## Event Production

Events are produced as yielded objects from the internal generators `_executeRun()` and `_executeStream()`:

```typescript
// Inside _executeRun():
yield { type: 'RUN_STARTED', threadId, runId, parentRunId, input: { prompt, context } }
yield { type: 'STEP_STARTED', stepName: 'generating' }
yield { type: 'STEP_FINISHED', stepName: 'generating' }
yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' }
yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: content }
yield { type: 'TEXT_MESSAGE_END', messageId }
yield { type: 'RUN_FINISHED', threadId, runId, outcome: { type: 'success' } }
```

## EventBus

The `EventBus` receives all events from the agent and provides pub/sub, history, and compaction:

```typescript
import { EventBus } from 'agui-framework'

const bus = new EventBus(1000)

// Subscribe to specific event types
bus.on('TEXT_MESSAGE_CONTENT', (event) => {
  // event is type-narrowed to TextMessageContentEvent
  console.log(event.delta)
})

// Subscribe to all events
bus.on('*', (event) => {
  console.log(event.type)
})
```

## Event Types Implemented

### Run Lifecycle

| Event              | Produced By                  | Key Fields                             |
|--------------------|------------------------------|----------------------------------------|
| `RUN_STARTED`      | Both run modes               | `threadId`, `runId`, `parentRunId?`, `input?` |
| `RUN_FINISHED`     | Both run modes               | `threadId`, `runId`, `outcome?`, `result?` |
| `RUN_ERROR`        | Both run modes (catch block) | `threadId`, `runId`, `message`         |

### Steps

| Event              | Produced By                  | Key Fields          |
|--------------------|------------------------------|---------------------|
| `STEP_STARTED`     | Before provider call         | `stepName`          |
| `STEP_FINISHED`    | After provider call          | `stepName`          |

### Text Messages

| Event                    | Produced By                  | Key Fields               |
|--------------------------|------------------------------|--------------------------|
| `TEXT_MESSAGE_START`     | Before yielding content      | `messageId`, `role`      |
| `TEXT_MESSAGE_CONTENT`   | Per content chunk            | `messageId`, `delta`     |
| `TEXT_MESSAGE_END`       | After all content            | `messageId`              |

### Tool Calls

| Event                | Produced By                  | Key Fields                      |
|----------------------|------------------------------|----------------------------------|
| `TOOL_CALL_START`    | Per tool in LLM response     | `toolCallId`, `toolCallName`     |
| `TOOL_CALL_ARGS`     | Per argument chunk (stream)  | `toolCallId`, `delta`            |
| `TOOL_CALL_END`      | After arguments complete     | `toolCallId`                     |
| `TOOL_CALL_RESULT`   | After handler execution      | `messageId`, `toolCallId`, `content` |

### Reasoning

| Event                          | Produced By (stream only)       | Key Fields          |
|--------------------------------|----------------------------------|---------------------|
| `REASONING_START`              | On first reasoning delta         | `messageId`         |
| `REASONING_END`                | When reasoning delta stops       | `messageId`         |
| `REASONING_MESSAGE_START`      | Before reasoning content         | `messageId`, `role` |
| `REASONING_MESSAGE_CONTENT`    | Per reasoning chunk              | `messageId`, `delta`|
| `REASONING_MESSAGE_END`        | After reasoning content          | `messageId`         |
| `REASONING_ENCRYPTED_VALUE`    | Attach encrypted reasoning       | `subtype`, `entityId`, `encryptedValue` |

### State

| Event                | Produced By                  | Key Fields                      |
|----------------------|------------------------------|----------------------------------|
| `STATE_SNAPSHOT`     | Before/after each run        | `snapshot: Record<string, unknown>` |
| `STATE_DELTA`        | When state has changed       | `delta: JsonPatchOperation[]`      |
| `MESSAGES_SNAPSHOT`  | Before/after each run        | `messages: Message[]`              |

### Activity

| Event                | Produced By                  | Key Fields                             |
|----------------------|------------------------------|----------------------------------------|
| `ACTIVITY_SNAPSHOT`  | Before/after steps           | `messageId`, `activityType`, `content`, `replace?` |
| `ACTIVITY_DELTA`     | During activity updates      | `messageId`, `activityType`, `patch`  |

### Multi-Agent

| Event                      | Produced By                            | Key Fields                            |
|----------------------------|----------------------------------------|---------------------------------------|
| `AGENT_DELEGATION_START`   | `agent.delegate()`                     | `parentAgent`, `childAgent`, `input`  |
| `AGENT_DELEGATION_END`     | `agent.delegate()`                     | `parentAgent`, `childAgent`, `result`, `error?` |
| `AGENT_HANDOFF_REQUEST`    | `agent.createHandoffTool()` handler    | `fromAgent`, `toAgent`, `reason`      |
| `AGENT_HANDOFF_RESULT`     | `MultiAgentManager.handoff()`          | `fromAgent`, `toAgent`, `result`, `error?` |

## Event Compaction

The `EventBus.compact()` and `ProtocolEncoder.compactEvents()` methods implement AG-UI stream compaction rules:

```typescript
bus.compact()

// Or use the standalone function:
import { compactEvents } from 'agui-framework'
const compacted = compactEvents(rawEvents)
```

Compaction merges:
- Multiple `TEXT_MESSAGE_CONTENT` for the same `messageId` into a single event
- `STATE_DELTA` operations into a final `STATE_SNAPSHOT`
- Tool call sequences (`TOOL_CALL_START`/`ARGS`/`END`/`RESULT`) into compact representations
- Reasoning sequences into single entries
- Preserves `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `MESSAGES_SNAPSHOT`, `ACTIVITY_SNAPSHOT`

### Compaction Example

Before:

```typescript
[
  { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'user' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hello ' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'world' },
  { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
  { type: 'STATE_DELTA', delta: [{ op: 'add', path: '/foo', value: 1 }] },
  { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/foo', value: 2 }] },
]
```

After:

```typescript
[
  { type: 'MESSAGES_SNAPSHOT', messages: [{ id: 'm1', role: 'user', content: 'Hello world' }] },
  { type: 'STATE_SNAPSHOT', snapshot: { foo: 2 } },
]
```

## Event Validation

The `ProtocolValidator` validates each event type against its required fields:

```typescript
const error = ProtocolValidator.validateEvent({
  type: 'TOOL_CALL_START',
  toolCallId: 'tc-1',
  toolCallName: 'get_weather',
})
// -> null (valid)
```
