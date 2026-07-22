# Events

The `EventBus` provides an in-process publish/subscribe system for all agent operations. Every agent action emits typed events that can be observed, transformed, and piped.

## EventBus

```typescript
import { EventBus } from "agui-framework";

const bus = new EventBus();

// Subscribe to all events
const unsubscribe = bus.on("*", (event) => {
  console.log(event.type, event);
});

// Subscribe to specific event types
bus.on("RUN_STARTED", (event) => {
  console.log("Run started:", event.timestamp);
});

// Subscribe once
bus.once("RUN_FINISHED", (event) => {
  console.log("Final result:", event.result);
});

// Clear all listeners
bus.clear();
```

## Event Types

| Category | Events |
|----------|--------|
| **Run lifecycle** | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR` |
| **Steps** | `STEP_STARTED`, `STEP_FINISHED` |
| **Text messages** | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END` |
| **Tool calls** | `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT` |
| **State** | `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT` |
| **Activity** | `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA` |
| **Reasoning** | `REASONING_START`, `REASONING_END`, `REASONING_MESSAGE_*`, `REASONING_ENCRYPTED_VALUE` |
| **Multi-agent** | `AGENT_DELEGATION_START`, `AGENT_DELEGATION_END`, `AGENT_HANDOFF_REQUEST`, `AGENT_HANDOFF_RESULT` |
| **Human-in-loop** | `HUMAN_INTERVENTION_REQUEST`, `HUMAN_INTERVENTION_RESULT`, `HUMAN_FEEDBACK` |
| **Code execution** | `CODE_EXECUTION_START`, `CODE_EXECUTION_RESULT` |
| **Memory** | `MEMORY_SUMMARY` |
| **Usage & cost** | `USAGE_UPDATE` |
| **Custom** | `RAW`, `CUSTOM` |

## History

The EventBus maintains an in-memory history (configurable, default 1000 entries):

```typescript
const bus = new EventBus(500); // max 500 events

// Get full history
const history = bus.getHistory();

// Compact history (removes redundant events)
bus.compact();
```

## Piping

Transform events through a pipe:

```typescript
bus.pipe((event) => {
  // Transform or filter events
  if (event.type === "TEXT_MESSAGE_CONTENT") {
    return { ...event, data: event.data.toUpperCase() };
  }
  // Return null to drop the event
  return event;
});
```

## Using Events with Agent

The Agent exposes its internal EventBus for observation:

```typescript
const agent = new Agent({ ...config });

// Access the agent's event bus
agent.bus.on("TOOL_CALL_START", (event) => {
  console.log("Tool called:", event.toolName);
});

agent.bus.on("USAGE_UPDATE", (event) => {
  console.log("Tokens used:", event.tokens);
});
```

## Serialization

```typescript
const json = bus.toJSON();
const restoredBus = new EventBus().fromJSON(json);
```

## API Reference

### `EventBus`

| Method | Description |
|--------|-------------|
| `constructor(maxHistory?: number)` | Create event bus with optional history limit |
| `emit(event: AgentEvent)` | Emit an event to all subscribers |
| `on(type, listener)` | Subscribe to event type (returns unsubscribe function) |
| `once(type, listener)` | Subscribe for single event |
| `clear()` | Remove all listeners |
| `getHistory()` | Get event history |
| `compact()` | Remove redundant events |
| `pipe(transform)` | Add event transformation pipe |
| `toJSON()` | Serialize to JSON |
| `fromJSON(json)` | Restore from JSON |
