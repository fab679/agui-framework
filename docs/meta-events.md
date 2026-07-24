# Meta Events

Annotations, signals, and feedback independent of agent runs.

## Overview

Meta Events are a class of events that can occur at any point in the event stream, independent of agent runs. They provide a standardized way to attach annotations, signals, or feedback to a conversation thread. Meta Events may originate from users, clients, or external systems rather than from agents.

Common use cases include:
- Thumbs up/down feedback on a message
- Notes and annotations on conversations
- Tags for categorization
- Analytics and tracking events
- Content moderation flags
- Audit trail entries

## Type Definition

```typescript
interface MetaEvent extends BaseEvent {
  type: 'META'
  /** Application-defined type of the meta event (e.g. "thumbs_up", "note", "tag") */
  metaType: string
  /** Application-defined payload — may reference entities or contain freeform data */
  payload: Record<string, unknown>
}
```

### Key Characteristics
- **Run-independent**: not tied to any specific agent run lifecycle
- **Position-flexible**: can appear before, between, or after runs
- **Origin-diverse**: may come from users, clients, or external systems
- **Extensible**: applications define their own `metaType` values and payload schemas

## Common Meta Event Types

| metaType | Description | Typical Payload |
|----------|-------------|-----------------|
| `thumbs_up` | Positive feedback | `{ messageId, userId }` |
| `thumbs_down` | Negative feedback | `{ messageId, userId, reason? }` |
| `note` | User annotation | `{ text, relatedId?, author }` |
| `tag` | Categorization | `{ tags[], targetId }` |
| `bookmark` | Save for later | `{ messageId, userId }` |
| `rating` | Numeric rating | `{ messageId, rating, maxRating }` |
| `analytics` | External analytics event | `{ event, properties }` |
| `moderation` | Content moderation flag | `{ action, messageId, category }` |

## API

### POST `/api/threads/:threadId/meta`

Submit a meta event for a thread.

```json
{
  "metaType": "thumbs_up",
  "payload": {
    "messageId": "msg_456",
    "userId": "user_789"
  }
}
```

Response `201`:
```json
{
  "metaEvent": {
    "type": "META",
    "metaType": "thumbs_up",
    "payload": { "messageId": "msg_456", "userId": "user_789" },
    "timestamp": 1714063982000
  }
}
```

### GET `/api/threads/:threadId/meta`

Fetch stored meta events for a thread, with optional pagination.

```
GET /api/threads/:threadId/meta?limit=50&offset=0
```

Response `200`:
```json
{
  "metaEvents": [
    { "type": "META", "metaType": "thumbs_up", "payload": {}, "timestamp": 100 },
    { "type": "META", "metaType": "note", "payload": {}, "timestamp": 200 }
  ],
  "count": 2
}
```

### GET `/api/threads/:threadId/meta/stream`

SSE stream for real-time meta event delivery. Meta events submitted via POST are pushed to all active SSE subscribers for the same thread.

```
GET /api/threads/:threadId/meta/stream
```

Each event is a standard SSE `data:` line:
```
data: {"type":"META","metaType":"thumbs_up","payload":{},"timestamp":1714063982000}
```

## Client SDK

### `AguiClient.sendMetaEvent(threadId, metaType, payload)`

```typescript
import { AguiClient } from 'agui-framework/client'

const client = new AguiClient('http://localhost:4124')

// Send thumbs up
await client.sendMetaEvent('thread-123', 'thumbs_up', {
  messageId: 'msg_456',
  userId: 'user_789',
})

// Add a note
await client.sendMetaEvent('thread-123', 'note', {
  text: 'Important question to revisit',
  author: 'user_123',
})
```

### `AguiClient.getMetaEvents(threadId, limit?, offset?)`

```typescript
const { metaEvents, count } = await client.getMetaEvents('thread-123', 50, 0)
// metaEvents: MetaEvent[]
// count: number
```

## React Hooks

### `useChat` — metaEvents and sendMetaEvent

The `useChat` hook exposes `metaEvents` state and a `sendMetaEvent` callback.

```typescript
import { useChat } from 'agui-framework/client/react'

function ChatView() {
  const { messages, metaEvents, sendMetaEvent } = useChat({
    baseUrl: 'http://localhost:4124',
    agentId: 'my-agent',
  })

  const handleThumbsUp = (messageId: string) => {
    sendMetaEvent('thumbs_up', { messageId })
  }

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>
          {msg.content}
          <button onClick={() => handleThumbsUp(msg.id)}>👍</button>
        </div>
      ))}
      <div>
        <h3>Meta Events ({metaEvents.length})</h3>
        {metaEvents.map((evt, i) => (
          <div key={i}>{evt.metaType}: {JSON.stringify(evt.payload)}</div>
        ))}
      </div>
    </div>
  )
}
```

Meta events received during streaming are automatically accumulated in the `metaEvents` array via the `META` event handler in the streaming event parser.

## Persistence

Meta events are stored in the thread store alongside other thread data:

- **MemoryThreadStore**: stored in an in-memory Map
- **RedisThreadStore**: stored in-memory (Redis-backed persistence TBD)
- **PostgresThreadStore**: stored in-memory (Postgres-backed persistence TBD)

The in-memory fallback ensures the API works without a persistent store; events are lost on server restart unless a persistent store is configured.

## Examples

### Thumbs up/down feedback

```typescript
// User gives thumbs up
await client.sendMetaEvent('thread-123', 'thumbs_up', {
  messageId: 'msg_456',
  userId: 'user_789',
})

// User gives thumbs down with reason
await client.sendMetaEvent('thread-123', 'thumbs_down', {
  messageId: 'msg_456',
  userId: 'user_789',
  reason: 'inaccurate',
  comment: 'The calculation seems incorrect',
})
```

### Tagging a conversation

```typescript
await client.sendMetaEvent('thread-123', 'tag', {
  tags: ['important', 'follow-up'],
  threadId: 'thread-123',
})
```

### External analytics event

```typescript
await client.sendMetaEvent('thread-123', 'analytics', {
  event: 'conversation_shared',
  properties: { shareMethod: 'link', recipientCount: 3 },
})
```
