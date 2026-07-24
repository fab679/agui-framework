# Client-Side Routing

Integrate `useChat` with your router so every conversation has a shareable URL. Streaming continues uninterrupted after navigation because the component does **not remount** — only the URL param changes.

## React Router (react-router-dom v6)

```tsx
import { useParams, useNavigate } from 'react-router-dom'
import { useChat } from 'agui-framework/client/react'

export default function ChatPage() {
  const { threadId } = useParams()
  const navigate = useNavigate()

  const {
    messages, sendMessage, isLoading, currentThreadId,
    streamingText, loadMessages,
  } = useChat({ baseUrl: 'http://localhost:4124', agentId: 'assistant' })

  // URL param → load thread on mount or direct visit
  useEffect(() => {
    if (threadId && threadId !== currentThreadId) {
      loadMessages(threadId)
    }
  }, [threadId])

  // currentThreadId → update URL after sendMessage creates one
  useEffect(() => {
    if (currentThreadId && currentThreadId !== threadId) {
      navigate(`/chat/${currentThreadId}`, { replace: true })
    }
  }, [currentThreadId, threadId])

  async function handleSend(content: string) {
    if (!currentThreadId && !threadId) {
      const newId = `thread_${Date.now()}`
      navigate(`/chat/${newId}`, { replace: true })
      setCurrentThreadId(newId)
    }
    sendMessage(content)
  }

  return (
    <div>
      {messages.map(m => <div key={m.id}>{m.content}</div>)}
      {isLoading && <div className="streaming">{streamingText}</div>}
      <button onClick={() => handleSend('Hello')} disabled={isLoading}>Send</button>
    </div>
  )
}
```

## Next.js App Router

```tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import { useChat } from 'agui-framework/client/react'

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const threadId = params.threadId as string | undefined

  const {
    messages, sendMessage, isLoading, currentThreadId,
    streamingText, loadMessages, setCurrentThreadId,
  } = useChat({ baseUrl: 'http://localhost:4124', agentId: 'assistant' })

  // URL param → load thread
  useEffect(() => {
    if (threadId && threadId !== currentThreadId) {
      loadMessages(threadId)
    }
  }, [threadId])

  // Hook created a thread → sync to URL without remount
  useEffect(() => {
    if (currentThreadId && currentThreadId !== threadId) {
      router.replace(`/chat/${currentThreadId}`, { scroll: false })
    }
  }, [currentThreadId, threadId])

  async function handleSend(content: string) {
    if (!currentThreadId && !threadId) {
      const newId = `thread_${Date.now()}`
      router.replace(`/chat/${newId}`, { scroll: false })
      setCurrentThreadId(newId)
    }
    sendMessage(content)
  }

  return (
    <div>
      {messages.map(m => <div key={m.id}>{m.content}</div>)}
      {isLoading && <div>{streamingText}</div>}
      <button onClick={() => handleSend('Hello')} disabled={isLoading}>Send</button>
    </div>
  )
}
```

## How It Works

1. **User clicks Send on a new chat** — `handleSend` generates `thread_<timestamp>`, calls `setCurrentThreadId(newId)`, then `sendMessage(content)`. The `useEffect` watching `currentThreadId` fires and calls `router.replace()` / `navigate()`.

2. **URL updates without remount** — because you're navigating to the **same route** (`/chat/:threadId`) with a different param, both React Router and Next.js keep the component alive. The stream that `sendMessage` started continues uninterrupted.

3. **Page refresh or direct link** — the `useEffect` watching `threadId` (from URL params) calls `loadMessages(threadId)` on mount, which fetches the thread's saved messages from the server and restores the conversation.

## Handling Branching

When forking from a checkpoint, the thread ID stays the same — only the checkpoint changes. If you want the URL to reflect the current branch:

```tsx
const { latestCheckpointId } = useChat({ ... })

useEffect(() => {
  if (currentThreadId) {
    const url = latestCheckpointId
      ? `/chat/${currentThreadId}?branch=${latestCheckpointId}`
      : `/chat/${currentThreadId}`
    router.replace(url, { scroll: false })
  }
}, [currentThreadId, latestCheckpointId])
```

## New Thread Button

```tsx
function handleNewChat() {
  const newId = `thread_${Date.now()}`
  createThread(newId)
  router.push(`/chat/${newId}`)
}
```
