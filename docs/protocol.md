# Protocol

The AG-UI protocol defines the wire format for communicating agent events between the server and clients. It uses Server-Sent Events (SSE) for streaming and provides encoding, validation, and compaction utilities.

## ProtocolEncoder

The `ProtocolEncoder` serializes and deserializes agent events for transport:

```typescript
import { ProtocolEncoder } from "agui-framework";

const encoder = new ProtocolEncoder();

// Encode an event for SSE
const sseEvent = encoder.encodeEvent({
  type: "TEXT_MESSAGE_CONTENT",
  data: "Hello, world!",
  timestamp: Date.now(),
});

// Decode an SSE event
const event = encoder.decodeEvent(sseData);

// Encode full run output
const encoded = encoder.encodeRunOutput(events);

// Decode run output
const decoded = encoder.decodeRunOutput(encoded);
```

### SSE Encoding Format

Events are encoded as SSE `data:` lines with `event:` type indicators:

```
event: TEXT_MESSAGE_CONTENT
data: {"type":"TEXT_MESSAGE_CONTENT","data":"Hello, world!","timestamp":1234567890}

```

## ProtocolValidator

The `ProtocolValidator` validates event payloads and run inputs:

```typescript
import { ProtocolValidator } from "agui-framework";

const validator = new ProtocolValidator();

// Validate a run input
const errors = validator.validateRunInput({
  prompt: "Hello",
  threadId: "thread-123",
});

// Validate an event
const eventErrors = validator.validateEvent(someEvent);

// Validate a message
const msgErrors = validator.validateMessage(someMessage);
```

Returns an array of validation errors (empty array means valid).

## Event Compaction

Reduce event stream size by removing redundant or intermediate events:

```typescript
import { compactEvents } from "agui-framework";

const compacted = compactEvents(events);
// Removes intermediate TEXT_MESSAGE_CONTENT events in favor of final result
// Removes redundant state snapshots
```

## Protocol Types

### BaseEvent

All events extend `BaseEvent`:

```typescript
interface BaseEvent {
  type: EventType;
  timestamp: number;
  threadId?: string;
  runId?: string;
  agentId?: string;
  [key: string]: unknown;
}
```

### EventType

```typescript
type EventType =
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "STEP_STARTED"
  | "STEP_FINISHED"
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "TOOL_CALL_RESULT"
  | "STATE_SNAPSHOT"
  | "STATE_DELTA"
  | "MESSAGES_SNAPSHOT"
  | "ACTIVITY_SNAPSHOT"
  | "ACTIVITY_DELTA"
  | "REASONING_START"
  | "REASONING_END"
  | "REASONING_MESSAGE_*"
  | "REASONING_ENCRYPTED_VALUE"
  | "AGENT_DELEGATION_START"
  | "AGENT_DELEGATION_END"
  | "AGENT_HANDOFF_REQUEST"
  | "AGENT_HANDOFF_RESULT"
  | "HUMAN_INTERVENTION_REQUEST"
  | "HUMAN_INTERVENTION_RESULT"
  | "HUMAN_FEEDBACK"
  | "CODE_EXECUTION_START"
  | "CODE_EXECUTION_RESULT"
  | "MEMORY_SUMMARY"
  | "USAGE_UPDATE"
  | "RAW"
  | "CUSTOM";
```

## AG-UI Protocol Specification

The AG-UI protocol defines a complete specification for agent-to-frontend communication. See the [AG-UI Protocol docs](ag-ui/Agents.md) for the full specification:

- [Agents](ag-ui/Agents.md) -- Agent implementation in the protocol
- [Events](ag-ui/Events.md) -- Event format and types
- [Messages](ag-ui/Messages.md) -- Message format
- [State Management](ag-ui/State%20Management.md) -- State protocol
- [Tools](ag-ui/Tools.md) -- Tool protocol
- [Middleware](ag-ui/Middleware.md) -- Middleware spec
- [Capabilities](ag-ui/Capabilities.md) -- Capability system
- [Interrupts](ag-ui/Interrupts.md) -- Interrupt handling
- [Reasoning](ag-ui/Reasoning.md) -- Reasoning content
- [Serialization](ag-ui/Serialization.md) -- Serialization format

## API Reference

### `ProtocolEncoder`

| Method | Description |
|--------|-------------|
| `encodeEvent(event)` | Encode event to SSE format |
| `decodeEvent(data)` | Decode SSE data to event |
| `encodeRunOutput(events)` | Encode run output for transport |
| `decodeRunOutput(data)` | Decode run output |

### `ProtocolValidator`

| Method | Description |
|--------|-------------|
| `validateRunInput(input)` | Validate run request input |
| `validateEvent(event)` | Validate an event |
| `validateMessage(message)` | Validate a message |

### Functions

| Function | Description |
|----------|-------------|
| `compactEvents(events)` | Compact event stream |
