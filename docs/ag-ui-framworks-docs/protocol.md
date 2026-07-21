# Protocol

The protocol layer defines how agent events are serialized, validated, and transported. It implements the AG-UI streaming protocol over Server-Sent Events (SSE).

## ProtocolEncoder

`ProtocolEncoder` handles encoding and decoding of agent events, SSE formatting, run input serialization, and event compaction.

```typescript
import { ProtocolEncoder } from 'agui-framework'

const encoder = new ProtocolEncoder()
```

### Event Encoding / Decoding

```typescript
const json = encoder.encodeEvent({
  type: 'TEXT_MESSAGE_CONTENT',
  messageId: 'msg_1',
  delta: 'Hello',
  timestamp: Date.now(),
})
// -> '{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_1","delta":"Hello","timestamp":...}'

const event = encoder.decodeEvent(json)
// -> parsed AgentEvent
```

### SSE (Server-Sent Events) Format

```typescript
// Single event as SSE
const sse = encoder.encodeSSE(event)
// -> "data: {"type":"TEXT_MESSAGE_CONTENT",...}\n\n"

// Multiple events as SSE stream
const stream = encoder.encodeStream([event1, event2])
// -> "data: {...}\ndata: {...}\n"

// Parse SSE stream back
const raw = `data: {"type":"RUN_STARTED","threadId":"t1","runId":"r1","timestamp":123}\n\ndata: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m1","delta":"Hi","timestamp":124}\n`
const events = encoder.decodeStream(raw)
// -> [RunStartedEvent, TextMessageContentEvent]
```

### Run Input Serialization

```typescript
import type { RunAgentInput } from 'agui-framework'

const input: RunAgentInput = {
  threadId: 'thread-abc',
  runId: 'run-xyz',
  messages: [{ id: '1', role: 'user', content: 'Hello' }],
  capabilities: ['streaming'],
}

const json = encoder.encodeRunInput(input)
const decoded = encoder.decodeRunInput(json)
```

### Message Encoding

```typescript
const msgJson = encoder.encodeMessage(message)
const msg = encoder.decodeMessage(msgJson)
```

### Event Compaction

`compactEvents()` reduces a list of events by merging `TEXT_MESSAGE_CONTENT` deltas for the same message ID, collapsing state operations, and consolidating tool call / reasoning sequences:

```typescript
const events = [
  { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hello ' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'world' },
  { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
  { type: 'STATE_SNAPSHOT', snapshot: { count: 1 } },
  { type: 'STATE_DELTA', delta: [{ op: 'replace', path: '/count', value: 2 }] },
  { type: 'RUN_FINISHED', threadId: 't1', runId: 'r1', outcome: { type: 'success' } },
]

const compacted = encoder.compactEvents(events)
// TEXT_MESSAGE_CONTENT deltas are merged into one.
// STATE_SNAPSHOT + STATE_DELTA become a single STATE_SNAPSHOT { count: 2 }.
```

There is also a standalone `compactEvents()` function:

```typescript
import { compactEvents } from 'agui-framework'
const result = compactEvents(rawEvents)
```

## ProtocolValidator

`ProtocolValidator` provides static methods for validating protocol inputs, events, and messages.

```typescript
import { ProtocolValidator } from 'agui-framework'
```

### Validate Run Input

```typescript
const error = ProtocolValidator.validateRunInput({
  threadId: '',
  runId: 'run-1',
  messages: [],
})
// -> 'threadId is required'

const valid = ProtocolValidator.validateRunInput({
  threadId: 't1',
  runId: 'r1',
  messages: [{ id: '1', role: 'user', content: 'Hi' }],
})
// -> null
```

### Validate Resume Payload

```typescript
const error = ProtocolValidator.validateResume([
  { interruptId: 'int-1', status: 'resolved', payload: { approved: true } },
])
// -> null

const error = ProtocolValidator.validateResume([
  { interruptId: 'int-1', status: 'unknown' as any },
])
// -> 'resume[].status must be "resolved" or "cancelled"'
```

### Validate Events

Validates individual event structure against the schema for its type:

```typescript
const error = ProtocolValidator.validateEvent({
  type: 'RUN_STARTED',
  threadId: 't1',
  runId: 'r1',
})
// -> null

const error = ProtocolValidator.validateEvent({
  type: 'RUN_STARTED',
  // missing threadId
})
// -> 'RUN_STARTED requires threadId'
```

### Validate Messages

```typescript
const error = ProtocolValidator.validateMessage({
  id: '1', role: 'user', content: 'Hi',
})
// -> null

const error = ProtocolValidator.validateMessage({
  id: '2', role: 'tool',
  // missing toolCallId
})
// -> 'tool message requires toolCallId'
```

### Check Event Types

```typescript
ProtocolValidator.isValidEventType('RUN_STARTED')    // true
ProtocolValidator.isValidEventType('INVALID')        // false
```

Valid event types:
- `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`
- `STEP_STARTED`, `STEP_FINISHED`
- `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, `TEXT_MESSAGE_CHUNK`
- `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT`, `TOOL_CALL_CHUNK`
- `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`
- `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA`
- `REASONING_START`, `REASONING_END`
- `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, `REASONING_MESSAGE_END`, `REASONING_MESSAGE_CHUNK`, `REASONING_ENCRYPTED_VALUE`
- `AGENT_HANDOFF_REQUEST`, `AGENT_HANDOFF_RESULT`
- `AGENT_DELEGATION_START`, `AGENT_DELEGATION_END`
- `HUMAN_INTERVENTION_REQUEST`, `HUMAN_INTERVENTION_RESULT`
- `HUMAN_FEEDBACK`
- `CODE_EXECUTION_START`, `CODE_EXECUTION_RESULT`
- `MEMORY_SUMMARY`
- `USAGE_UPDATE`
- `RAW`, `CUSTOM`

## RunAgentInput Format

```typescript
interface RunAgentInput {
  threadId: string
  runId: string
  messages: Message[]
  tools?: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  state?: Record<string, unknown>
  resume?: Array<{
    interruptId: string
    status: 'resolved' | 'cancelled'
    payload?: unknown
  }>
  capabilities?: string[]
  parentRunId?: string
  timestamp?: number
}
```

## SSE Integration Example

```typescript
import express from 'express'
import { Agent, ProtocolEncoder } from 'agui-framework'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const agent = new Agent({
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are helpful.',
  })

  const encoder = new ProtocolEncoder()

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const unsub = agent.events.on('*', (event) => {
    res.write(encoder.encodeSSE(event as any))
  })

  try {
    const output = await agent.run(req.body.prompt, {
      threadId: req.body.threadId,
    })
    res.write(encoder.encodeSSE({
      type: 'RUN_FINISHED' as any,
      threadId: req.body.threadId || 'default',
      runId: `run_${Date.now()}`,
      outcome: { type: 'success' },
      timestamp: Date.now(),
    }))
  } catch (err) {
    res.write(encoder.encodeSSE({
      type: 'RUN_ERROR' as any,
      threadId: req.body.threadId || 'default',
      runId: `run_${Date.now()}`,
      message: err instanceof Error ? err.message : 'Unknown error',
      timestamp: Date.now(),
    }))
  } finally {
    unsub()
    res.end()
  }
})
```
