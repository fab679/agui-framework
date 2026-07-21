# Event System

The event system is built around the `EventBus` class -- an in-process publish/subscribe mechanism with history, compaction, and pipelining. Every agent action during `run()` and `stream()` emits typed events that external code can observe.

## EventBus API

```typescript
import { EventBus } from 'agui-framework'

const bus = new EventBus(maxHistory?: number)  // default: 1000
```

### Basic Usage

```typescript
// Subscribe to a specific event type
const unsub = bus.on('RUN_STARTED', (event) => {
  console.log('Run started:', event.threadId)
})

// Wildcard subscription
bus.on('*', (event) => {
  console.log('Event:', event.type)
})

// Fire once
bus.once('RUN_FINISHED', (event) => {
  console.log('Once:', event.outcome)
})

// Emit
bus.emit({
  type: 'RUN_STARTED',
  threadId: 't1',
  runId: 'r1',
  timestamp: Date.now(),
})

// Unsubscribe
unsub()

// Remove all listeners
bus.clear()
```

### Event History

```typescript
bus.getHistory()              // BaseEvent[]
bus.getEventCount()           // number
bus.listenerCount()           // total listeners
bus.listenerCount('RUN_STARTED')  // per-type count
```

### Serialization

```typescript
const json = bus.toJSON()
const restoredBus = new EventBus()
restoredBus.fromJSON(json)
```

### Compaction

`compact()` reduces history size by merging `TEXT_MESSAGE_CONTENT` deltas per message, collapsing `STATE_SNAPSHOT`/`STATE_DELTA` entries, and consolidating tool call and reasoning sequences:

```typescript
bus.compact()
// After compaction, multiple TEXT_MESSAGE_CONTENT events for the same
// messageId are merged into one. State deltas become a single snapshot.
```

### Piping

`pipe()` creates a transformed child `EventBus`:

```typescript
const filtered = bus.pipe((event) => {
  if (event.type === 'TOOL_CALL_START') return null  // filter out
  return event
})
```

## Event Types Reference

### Run Lifecycle

| Type             | Interface             | Key Fields                              |
|------------------|-----------------------|------------------------------------------|
| `RUN_STARTED`    | `RunStartedEvent`     | `threadId`, `runId`, `parentRunId?`, `input?` |
| `RUN_FINISHED`   | `RunFinishedEvent`    | `threadId`, `runId`, `result?`, `outcome?` |
| `RUN_ERROR`      | `RunErrorEvent`       | `threadId`, `runId`, `message`, `code?`  |

### Steps

| Type             | Interface              | Key Fields       |
|------------------|------------------------|------------------|
| `STEP_STARTED`   | `StepStartedEvent`     | `stepName`       |
| `STEP_FINISHED`  | `StepFinishedEvent`    | `stepName`       |

### Text Messages

| Type                    | Interface                   | Key Fields               |
|-------------------------|-----------------------------|--------------------------|
| `TEXT_MESSAGE_START`    | `TextMessageStartEvent`     | `messageId`, `role`      |
| `TEXT_MESSAGE_CONTENT`  | `TextMessageContentEvent`   | `messageId`, `delta`     |
| `TEXT_MESSAGE_END`      | `TextMessageEndEvent`       | `messageId`              |
| `TEXT_MESSAGE_CHUNK`    | (convenience)               | `messageId`, `delta`, `role?` |

### Tool Calls

| Type                | Interface                  | Key Fields                           |
|---------------------|----------------------------|--------------------------------------|
| `TOOL_CALL_START`   | `ToolCallStartEvent`       | `toolCallId`, `toolCallName`         |
| `TOOL_CALL_ARGS`    | `ToolCallArgsEvent`        | `toolCallId`, `delta`                |
| `TOOL_CALL_END`     | `ToolCallEndEvent`         | `toolCallId`                         |
| `TOOL_CALL_RESULT`  | `ToolCallResultEvent`      | `messageId`, `toolCallId`, `content` |
| `TOOL_CALL_CHUNK`   | (convenience)              | `toolCallId`, `delta`                |

### State

| Type               | Interface                | Key Fields                      |
|--------------------|--------------------------|---------------------------------|
| `STATE_SNAPSHOT`   | `StateSnapshotEvent`     | `snapshot: Record<string, unknown>` |
| `STATE_DELTA`      | `StateDeltaEvent`        | `delta: JsonPatchOperation[]`   |
| `MESSAGES_SNAPSHOT`| `MessagesSnapshotEvent`  | `messages: Message[]`           |

### Activity

| Type                | Interface              | Key Fields                         |
|---------------------|------------------------|------------------------------------|
| `ACTIVITY_SNAPSHOT` | (BaseEvent)            | `messageId`, `activityType`, `content`, `replace?` |
| `ACTIVITY_DELTA`    | (BaseEvent)            | `messageId`, `activityType`, `patch` |

### Reasoning

| Type                          | Key Fields                     |
|-------------------------------|--------------------------------|
| `REASONING_START`             | `messageId`                    |
| `REASONING_END`               | `messageId`                    |
| `REASONING_MESSAGE_START`     | `messageId`, `role`            |
| `REASONING_MESSAGE_CONTENT`   | `messageId`, `delta`           |
| `REASONING_MESSAGE_END`       | `messageId`                    |
| `REASONING_MESSAGE_CHUNK`     | `messageId`, `delta`           |
| `REASONING_ENCRYPTED_VALUE`   | `subtype`, `entityId`, `encryptedValue` |

### Multi-Agent

| Type                      | Interface               | Key Fields                          |
|---------------------------|-------------------------|-------------------------------------|
| `AGENT_DELEGATION_START`  | (BaseEvent)             | `parentAgent`, `childAgent`, `input` |
| `AGENT_DELEGATION_END`    | (BaseEvent)             | `parentAgent`, `childAgent`, `result`, `error?` |
| `AGENT_HANDOFF_REQUEST`   | (BaseEvent)             | `fromAgent`, `toAgent`, `reason`    |
| `AGENT_HANDOFF_RESULT`    | (BaseEvent)             | `fromAgent`, `toAgent`, `result`, `error?` |

### Human in the Loop

| Type | Interface | Key Fields |
|---|---|---|
| `HUMAN_INTERVENTION_REQUEST` | (BaseEvent) | `interruptId`, `toolCallId`, `toolName`, `arguments`, `reason` |
| `HUMAN_INTERVENTION_RESULT` | (BaseEvent) | `interruptId`, `status`, `edits?` |
| `HUMAN_FEEDBACK` | (BaseEvent) | `feedback: { rating?, comment?, category? }` |

### Code Execution

| Type | Interface | Key Fields |
|---|---|---|
| `CODE_EXECUTION_START` | (BaseEvent) | `code?`, `language?` |
| `CODE_EXECUTION_RESULT` | (BaseEvent) | `result?`, `error?` |

### Memory

| Type | Interface | Key Fields |
|---|---|---|
| `MEMORY_SUMMARY` | (BaseEvent) | `summary`, `operation` |

### Usage & Cost

| Type | Interface | Key Fields |
|---|---|---|
| `USAGE_UPDATE` | `UsageUpdateEvent` | `threadId`, `runId`, `usage: TokenUsage`, `cost?: CostBreakdown`, `modelId` |

### Custom

| Type      | Interface       | Key Fields        |
|-----------|-----------------|-------------------|
| `RAW`     | (BaseEvent)     | `rawEvent?`       |
| `CUSTOM`  | `CustomEvent`   | `name`, `value`   |

## Event Lifecycle Patterns

### Standard Run

```
RUN_STARTED
  +-- STATE_SNAPSHOT
  +-- MESSAGES_SNAPSHOT
  +-- STEP_STARTED (generating)
  +-- STEP_FINISHED (generating)
  +-- TEXT_MESSAGE_START
  +-- TEXT_MESSAGE_CONTENT
  +-- TEXT_MESSAGE_END
RUN_FINISHED (or RUN_ERROR)
```

### Tool Call Sequence

```
TOOL_CALL_START (toolCallId, toolCallName)
  +-- TOOL_CALL_ARGS (toolCallId, delta: JSON fragment)
  +-- TOOL_CALL_END (toolCallId)
  +-- TOOL_CALL_RESULT (toolCallId, content)
```

### Streaming with Reasoning

```
RUN_STARTED
  +-- TEXT_MESSAGE_START
  +-- REASONING_START
  |   +-- REASONING_MESSAGE_CONTENT (one or more)
  +-- REASONING_END
  +-- TEXT_MESSAGE_CONTENT (per chunk)
  +-- TEXT_MESSAGE_END
RUN_FINISHED
```

### Human Intervention Sequence

```
RUN_STARTED
  ...
  +-- TOOL_CALL_START / TOOL_CALL_ARGS / TOOL_CALL_END
  +-- HUMAN_INTERVENTION_REQUEST (agent pauses for approval)
RUN_FINISHED (outcome: interrupt)
  ... resume() called ...
RUN_STARTED (resumed)
  +-- HUMAN_INTERVENTION_RESULT
  +-- TOOL_CALL_RESULT
  +-- TEXT_MESSAGE_CONTENT
RUN_FINISHED
```

### Code Execution Sequence

```
CODE_EXECUTION_START
  +-- CODE_EXECUTION_RESULT
```

## Typed Event Handling

```typescript
bus.on('TEXT_MESSAGE_CONTENT', (event) => {
  // event is narrowed to TextMessageContentEvent
  console.log(event.delta)
})

bus.on('*', (event) => {
  switch (event.type) {
    case 'RUN_STARTED':
      console.log('Run:', (event as RunStartedEvent).runId)
      break
    case 'TOOL_CALL_START':
      console.log('Tool:', (event as ToolCallStartEvent).toolCallName)
      break
  }
})
```

## BaseEvent Structure

```typescript
interface BaseEvent {
  type: EventType
  timestamp?: number
  rawEvent?: unknown
}

type AgentEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent
  | HumanInterventionRequestEvent
  | HumanInterventionResultEvent
  | HumanFeedbackEvent
  | CodeExecutionStartEvent
  | CodeExecutionResultEvent
  | MemorySummaryEvent
  | UsageUpdateEvent
  | CustomEvent
```

All events share the `type` discriminator for type-safe switching.
