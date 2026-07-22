# AG-UI Message Implementation

agui-framework implements the full AG-UI message type system, providing vendor-neutral message structures that can be mapped to and from proprietary LLM provider formats.

## Message Structure

AG-UI messages follow a vendor-neutral format with a base interface and role-specific extensions:

```typescript
interface BaseMessage {
  id: string
  role: string
  content?: string | Record<string, unknown>
  name?: string
  encryptedContent?: string
}
```

### Message Role Types

```typescript
type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'developer' | 'reasoning' | 'activity'
```

Each role extends the base with type-specific fields needed for proper handling.

## User Messages

Messages from the end user to the agent:

```typescript
interface UserMessage extends BaseMessage {
  role: 'user'
  content: string
  name?: string
}
```

## Assistant Messages

Messages from the AI assistant to the user:

```typescript
interface AssistantMessage extends BaseMessage {
  role: 'assistant'
  content?: string
  name?: string
  toolCalls?: ToolCall[]
  encryptedContent?: string
}
```

Tool calls are embedded within assistant messages when the LLM decides to invoke a function:

```typescript
interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string  // JSON-encoded string
  }
}
```

### System Messages

Instructions or context provided to the agent:

```typescript
interface SystemMessage extends BaseMessage {
  role: 'system'
  content: string
  name?: string
}
```

## Tool Messages

Results from tool executions:

```typescript
interface ToolMessage extends BaseMessage {
  role: 'tool'
  content: string
  toolCallId: string
  error?: string
  encryptedValue?: string
}
```

Key points:
- `toolCallId` links the result back to the original tool call
- `error` indicates tool execution failures
- `encryptedValue` carries encrypted chain-of-thought related to tool processing

## Reasoning Messages

Messages representing the agent's internal chain-of-thought process:

```typescript
interface ReasoningMessage extends BaseMessage {
  role: 'reasoning'
  content: string
  encryptedValue?: string
}
```

Reasoning messages are separate from assistant messages to avoid polluting conversation history. They are emitted via `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, and `REASONING_MESSAGE_END` events.

## Activity Messages

Structured UI messages that exist only on the frontend:

```typescript
interface ActivityMessage extends BaseMessage {
  role: 'activity'
  activityType: string  // e.g., "PLAN", "SEARCH", "SCRAPE"
  content: Record<string, unknown>
}
```

Key characteristics:
- Emitted via `ACTIVITY_SNAPSHOT` and `ACTIVITY_DELTA` events
- Frontend-only: never forwarded to the agent
- Customizable: define your own `activityType` and render a matching UI component

## Developer Messages

Internal messages used for development or debugging:

```typescript
interface DeveloperMessage extends BaseMessage {
  role: 'developer'
  content: string
  name?: string
}
```

## Vendor Neutrality

AG-UI messages can be easily mapped to and from proprietary formats:

```typescript
// Converting AG-UI messages to OpenAI format
const openaiMessages = agUiMessages
  .filter((msg) => ['user', 'system', 'assistant'].includes(msg.role))
  .map((msg) => ({
    role: msg.role as 'user' | 'system' | 'assistant',
    content: msg.content || '',
    ...(msg.role === 'assistant' && msg.toolCalls
      ? {
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        }
      : {}),
  }))

// Converting to Anthropic format
import { toAnthropicMessages } from 'agui-framework'
const anthropicMessages = toAnthropicMessages(agUiMessages)
```

## Message Synchronization

### Complete Snapshots

The `MESSAGES_SNAPSHOT` event provides a complete view of all messages in a conversation:

```typescript
interface MessagesSnapshotEvent {
  type: 'MESSAGES_SNAPSHOT'
  messages: Message[]
}
```

Used when initializing a conversation, after connection interruptions, or when major state changes occur.

### Streaming Messages

For real-time interactions, messages are streamed as they are generated:

```typescript
// Start a message
interface TextMessageStartEvent {
  type: 'TEXT_MESSAGE_START'
  messageId: string
  role: string
}

// Stream content chunks
interface TextMessageContentEvent {
  type: 'TEXT_MESSAGE_CONTENT'
  messageId: string
  delta: string
}

// End a message
interface TextMessageEndEvent {
  type: 'TEXT_MESSAGE_END'
  messageId: string
}
```

## Practical Example

```typescript
// Complete conversation with tool usage
const messages: Message[] = [
  // User query
  { id: 'msg_1', role: 'user', content: "What's the weather in New York?" },

  // Assistant response with tool call
  { id: 'msg_2', role: 'assistant', content: 'Let me check the weather for you.',
    toolCalls: [{
      id: 'call_1',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"location":"New York","unit":"celsius"}' },
    }],
  },

  // Tool result
  { id: 'result_1', role: 'tool', content: '{"temperature":22,"condition":"Partly Cloudy"}',
    toolCallId: 'call_1',
  },

  // Assistant's final response
  { id: 'msg_3', role: 'assistant',
    content: 'The weather in New York is partly cloudy with a temperature of 22 degrees Celsius.',
  },
]
```

## TypeScript Discriminated Union

```typescript
type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ToolMessage
  | ReasoningMessage
  | ActivityMessage
  | DeveloperMessage
```
