# Join & Rejoin Streams

Disconnect from an agent stream without stopping the agent, then reconnect later to resume where execution left off.

## Overview

Join/Rejoin enables a client to leave an active streaming session while the agent continues running on the server. The client can later reconnect (rejoin) and receive all events generated during the absence, then continue receiving live events.

This is useful for:
- **Mobile apps**: user switches away from the app mid-stream, comes back later
- **Long-running agents**: agent takes minutes to complete; user wants to check progress
- **Page navigation**: user navigates away and returns to the same thread
- **Connection drops**: automatic reconnection without losing work

## How It Works

```
Client connects (stream)
        │
        ▼
Agent runs, events stream to client
        │
        ├── Client calls disconnect() ──── Agent continues running
        │                                    │
        │                                    ▼
        │                              Events buffered on server
        │
        ├── Client calls rejoin() ────────── Server replays buffer,
        │                              then streams new events live
        │
        └── Agent finishes ──────────── bufferComplete = true
                                         Rejoin returns final state
```

### Keys
- `disconnect()` — leaves the stream; the agent keeps executing server-side
- `rejoin()` — reconnects; receives buffered events then live events
- `stop()` (or `AbortController.abort()`) — cancels the run entirely

## Client API

### `AguiClient.streamDetached()`

Returns a `DetachedStreamHandle` with `disconnect()` and a `result` promise.

```typescript
interface DetachedStreamHandle {
  disconnect: () => void
  result: Promise<string>
}

const handle = client.streamDetached('agent-id', 'Hello', {
  onEvent: (event) => { /* ... */ },
  onChunk: (delta) => { /* ... */ },
  onDone: (result, threadId) => { /* ... */ },
  onError: (error) => { /* ... */ },
}, { threadId: 'my-thread' })

// Later, disconnect without cancelling
handle.disconnect()
```

The `disconnect: true` flag is automatically sent in the request body, telling the server not to abort the run when the client disconnects.

### `AguiClient.rejoin()`

Reconnects to a previously disconnected stream for a given thread.

```typescript
const handle = client.rejoin('agent-id', 'my-thread', {
  onEvent: (event) => { /* ... */ },
  onChunk: (delta) => { /* ... */ },
  onDone: (result, threadId) => { /* ... */ },
  onError: (error) => { /* ... */ },
})
```

On rejoin:
1. All events that were buffered while disconnected are delivered immediately.
2. If the agent has already completed, the final `done` event is delivered and the stream closes.
3. If the agent is still running, new events are streamed live until completion.

## React Hooks

### `useChat` — disconnect / rejoin

The `useChat` hook exposes `connectionStatus`, `disconnect()`, and `rejoin()`.

```typescript
import { useChat } from 'agui-framework/client/react'

function MyComponent() {
  const {
    connectionStatus,    // 'idle' | 'connected' | 'disconnected'
    sendMessage,
    disconnect,
    rejoin,
    messages,
  } = useChat({ baseUrl: 'http://localhost:4124', agentId: 'my-agent' })

  const handleDisconnect = () => {
    disconnect()  // Agent continues running
    // connectionStatus → 'disconnected'
  }

  const handleRejoin = async () => {
    await rejoin()  // Reconnects to the same thread
    // connectionStatus → 'connected'
  }

  return (
    <div>
      <p>Status: {connectionStatus}</p>
      <button onClick={() => sendMessage('Hello')}>Send</button>
      <button onClick={handleDisconnect}>Disconnect</button>
      <button onClick={handleRejoin}>Rejoin</button>
    </div>
  )
}
```

### ThreadId Persistence

When `disconnect()` is called, the current `threadId` is automatically saved to `sessionStorage` under the key `agui_rejoin_<agentId>`. On remount, `useChat` checks for a saved threadId and auto-loads the thread messages so the user can rejoin.

This means a user can:
1. Start a chat → agent begins streaming
2. Call `disconnect()` → threadId saved to sessionStorage
3. Navigate to another page (component unmounts)
4. Return to the page (component remounts)
5. `useChat` finds the saved threadId and loads messages
6. Call `rejoin()` to reconnect to the still-running agent

### TypeScript

```typescript
import { useChat, type ChatMessage } from 'agui-framework/client/react'

interface MyState {
  connectionStatus: 'idle' | 'connected' | 'disconnected'
  messages: ChatMessage[]
  sendMessage: (content: string) => Promise<void>
  disconnect: () => void
  rejoin: () => Promise<void>
}
```

## Server Endpoints

### `POST /api/agents/:id/runs/stream` (with disconnect mode)

Standard streaming endpoint. When `{ "disconnect": true }` is included in the request body, the server enters disconnect mode:

- Client disconnection does NOT abort the agent run
- Events are buffered in the `RunningAgent.eventBuffer`
- The agent is kept in the `runningAgents` registry under `agentId:threadId`

### `GET /api/agents/:id/runs/stream/rejoin?threadId=xxx`

Rejoin endpoint. Returns an SSE stream that:

1. Replays all buffered events from the disconnected session
2. If the agent has already completed, sends the final `done` event and closes
3. If the agent is still running, subscribes to new events and streams them live

Returns `404` if no running or buffered agent exists for the given thread.

## Lifecycle States

| State | Description |
|-------|-------------|
| `idle` | No active stream |
| `connected` | Client is receiving live events from the server |
| `disconnected` | Client left the stream; agent continues running server-side |

On the server, a `RunningAgent` tracks:

- `eventBuffer` — accumulated events during disconnect
- `disconnected` — whether the client has left
- `bufferComplete` — whether the agent has finished execution in the background

## Examples

### Basic disconnect/rejoin lifecycle

```typescript
import { AguiClient } from 'agui-framework/client'

const client = new AguiClient('http://localhost:4124')

// Start a detachable stream
const handle = client.streamDetached('analyst', 'Analyze this data', {
  onChunk: (delta) => console.log('chunk:', delta),
  onDone: (result) => console.log('done:', result),
}, { threadId: 'thread-123' })

// Leave the stream after 2 seconds
setTimeout(() => {
  console.log('Disconnecting...')
  handle.disconnect()
}, 2000)

// Rejoin 5 seconds later
setTimeout(async () => {
  console.log('Rejoining...')
  const rejoinHandle = client.rejoin('analyst', 'thread-123', {
    onChunk: (delta) => console.log('rejoin chunk:', delta),
    onDone: (result) => console.log('rejoin done:', result),
  })
  const finalResult = await rejoinHandle.result
  console.log('Final result:', finalResult)
}, 7000)
```

### React component with auto-rejoin

```typescript
function ChatView({ baseUrl, agentId }: { baseUrl: string; agentId: string }) {
  const { messages, connectionStatus, sendMessage, disconnect, rejoin } =
    useChat({ baseUrl, agentId })

  // Auto-rejoin on mount if disconnected
  useEffect(() => {
    if (connectionStatus === 'disconnected') {
      rejoin()
    }
  }, [])

  return (
    <div>
      <ConnectionIndicator status={connectionStatus} />
      <MessageList messages={messages} />
      <button onClick={() => sendMessage('Hello')}>Send</button>
      <button onClick={disconnect}>Disconnect</button>
      <button onClick={rejoin} disabled={connectionStatus !== 'disconnected'}>
        Rejoin
      </button>
    </div>
  )
}
```

## Notes

- `disconnect()` is distinct from `stop()`/`abort()` — it does NOT cancel the agent run
- The server keeps the agent registered and buffers events in memory
- Events buffered during disconnect are delivered in order on rejoin
- If the agent finishes before rejoin, the full final state is delivered immediately
- ThreadId persistence uses `sessionStorage` (browser only); it survives page navigations within the same tab
