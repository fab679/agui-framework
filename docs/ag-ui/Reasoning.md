# AG-UI Reasoning Implementation

agui-framework provides first-class support for LLM reasoning, enabling chain-of-thought visibility while maintaining privacy and state continuity across conversation turns.

## Overview

Modern LLMs increasingly use chain-of-thought reasoning to improve response quality. agui-framework's reasoning support addresses three key challenges:

- Reasoning visibility -- Surface reasoning signals (e.g., summaries) to users without exposing raw chain-of-thought
- State continuity -- Maintain reasoning context across turns using encrypted reasoning items
- Privacy compliance -- Support enterprise privacy requirements while preserving reasoning capabilities

Unlike Activity messages, Reasoning messages represent the agent's internal thought process and are sent back to the agent for further processing on subsequent turns.

## ReasoningMessage

```typescript
interface ReasoningMessage extends BaseMessage {
  id: string
  role: 'reasoning'
  content: string       // Reasoning content visible to the client
  encryptedValue?: string  // Optional encrypted chain-of-thought blob
}
```

Key characteristics:
- Separate from assistant messages to avoid polluting conversation history
- Streamable via `REASONING_MESSAGE_CONTENT` events
- Optional encryption for privacy-preserving state continuity

## Reasoning Events

### Event Flow

A typical reasoning flow follows this pattern:

```
REASONING_START
  +-- REASONING_MESSAGE_START (messageId, role)
  +-- REASONING_MESSAGE_CONTENT (delta: chunk)
  +-- REASONING_MESSAGE_CONTENT (delta: chunk)
  +-- REASONING_MESSAGE_END
  +-- REASONING_ENCRYPTED_VALUE (subtype, entityId, encryptedValue)
REASONING_END
```

### Event Types

| Event                          | Purpose                                         |
|--------------------------------|-------------------------------------------------|
| `REASONING_START`              | Marks beginning of reasoning phase              |
| `REASONING_END`                | Marks completion of reasoning                   |
| `REASONING_MESSAGE_START`      | Begins a streaming reasoning message            |
| `REASONING_MESSAGE_CONTENT`    | Delivers reasoning content chunks               |
| `REASONING_MESSAGE_END`        | Completes a reasoning message                   |
| `REASONING_MESSAGE_CHUNK`      | Convenience event that auto-manages lifecycle   |
| `REASONING_ENCRYPTED_VALUE`    | Attaches encrypted chain-of-thought             |

### Streaming Reasoning Example

```typescript
// Agent emits reasoning start
yield {
  type: 'REASONING_START',
  messageId: 'reasoning-001',
}

// Stream visible reasoning content
yield {
  type: 'REASONING_MESSAGE_START',
  messageId: 'msg-123',
  role: 'reasoning',
}

yield {
  type: 'REASONING_MESSAGE_CONTENT',
  messageId: 'msg-123',
  delta: 'Let me think through this step by step...',
}

yield {
  type: 'REASONING_MESSAGE_END',
  messageId: 'msg-123',
}

// End reasoning
yield {
  type: 'REASONING_END',
  messageId: 'reasoning-001',
}
```

### Encrypted Reasoning for State Continuity

When maintaining reasoning state across turns without exposing content:

```typescript
// Attach encrypted chain-of-thought to a reasoning message
yield {
  type: 'REASONING_ENCRYPTED_VALUE',
  subtype: 'message',
  entityId: 'msg-456',
  encryptedValue: 'eyJhbGciOiJBMjU2R0NNIiwiZW5jIjoiQTI1NkdDTSJ9...',
}
```

The client stores the encrypted blob and sends it back on subsequent turns. The agent can decrypt it to restore reasoning context.

### Attaching Encrypted Reasoning to Tool Calls

```typescript
// Tool call with encrypted reasoning
yield { type: 'TOOL_CALL_START', toolCallId: 'tool-123', toolCallName: 'search_database' }
yield { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-123', delta: '{"query": "preferences"}' }
yield { type: 'TOOL_CALL_END', toolCallId: 'tool-123' }

// Attach encrypted reasoning explaining why this tool was called
yield {
  type: 'REASONING_ENCRYPTED_VALUE',
  subtype: 'tool-call',
  entityId: 'tool-123',
  encryptedValue: 'encrypted-reasoning-about-tool-selection...',
}
```

## Convenience Chunk Event

The `REASONING_MESSAGE_CHUNK` event simplifies implementation by auto-managing message lifecycle:

```typescript
// First chunk starts the message automatically
yield { type: 'REASONING_MESSAGE_CHUNK', messageId: 'msg-789', delta: 'Analyzing...' }

// Subsequent chunks continue the stream
yield { type: 'REASONING_MESSAGE_CHUNK', messageId: 'msg-789', delta: ' Considering options...' }

// Empty delta closes the message
yield { type: 'REASONING_MESSAGE_CHUNK', messageId: 'msg-789', delta: '' }
```

## Client Integration

### Handling Reasoning Events

```typescript
function handleEvent(event: BaseEvent) {
  switch (event.type) {
    case 'REASONING_START':
      // Initialize reasoning UI
      break
    case 'REASONING_MESSAGE_CONTENT':
      // Append visible reasoning to UI
      break
    case 'REASONING_ENCRYPTED_VALUE':
      // Store encrypted value for the referenced entity
      break
    case 'REASONING_END':
      // Finalize reasoning UI
      break
  }
}
```

### Passing Encrypted Reasoning Back

```typescript
const response = await agent.run('Follow up question...', {
  messages: [
    ...previousMessages,
    {
      id: 'reasoning-002',
      role: 'reasoning',
      content: 'Analyzing your request...',
      encryptedValue: storedEncryptedBlob,
    },
  ],
})
```

## Privacy and Compliance

| Requirement       | Solution                                                    |
|-------------------|-------------------------------------------------------------|
| GDPR right to erasure | Encrypted content can be discarded without losing reasoning |
| SOC 2 data handling   | Reasoning content never stored in plaintext on client      |
| HIPAA minimum necessary | Only summaries exposed; detailed reasoning stays encrypted |
| Audit logging     | `REASONING_START`/`REASONING_END` events provide audit trail |

## Migration from THINKING Events

The `THINKING_*` events are deprecated. New implementations should use `REASONING_*` events:

| Deprecated Event              | Replacement                     |
|-------------------------------|---------------------------------|
| `THINKING_START`              | `REASONING_START`               |
| `THINKING_END`                | `REASONING_END`                 |
| `THINKING_TEXT_MESSAGE_START` | `REASONING_MESSAGE_START`       |
| `THINKING_TEXT_MESSAGE_CONTENT` | `REASONING_MESSAGE_CONTENT`   |
| `THINKING_TEXT_MESSAGE_END`   | `REASONING_MESSAGE_END`         |

## Best Practices

- Always pair start/end events -- Every `REASONING_START` should have a corresponding `REASONING_END`
- Use encrypted values for sensitive reasoning -- When chain-of-thought contains sensitive information, use `REASONING_ENCRYPTED_VALUE`
- Provide user feedback -- Even with encrypted reasoning, emit visible summaries so users know the agent is working
- Handle missing events gracefully -- Clients should be resilient to incomplete event streams
