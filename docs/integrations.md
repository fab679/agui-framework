# Integrations

AGUI Framework integrates with popular front-end frameworks and tooling for building full-stack AI applications.

## React

The framework provides first-class React hooks via `agui-framework/client/react`:

### Installation

```bash
npm install agui-framework react
```

### Basic Chat Interface

```tsx
import { useChat } from 'agui-framework/client/react'

function Chat() {
  const { messages, sendMessage, isLoading, streamingText } = useChat({
    agentId: 'assistant',
    baseUrl: 'http://localhost:4124',
  })

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          {msg.agentId && <strong>{msg.agentId}: </strong>}
          {msg.role}: {msg.content}
        </div>
      ))}
      {isLoading && <p>Streaming: {streamingText}</p>}
      <button onClick={() => sendMessage('Tell me about AI')} disabled={isLoading}>
        Send
      </button>
    </div>
  )
}
```

### Streaming with Interrupts

```tsx
import { useStream } from 'agui-framework/client/react'

function StreamingAgent() {
  const { start, stop, isLoading, result } = useStream()

  return (
    <div>
      <button onClick={() => start('Analyze this data', {
        baseUrl: 'http://localhost:4124',
        agentId: 'analyst',
        onChunk: (delta) => console.log('token:', delta),
        onInterrupt: (interrupt) => console.log('needs approval:', interrupt),
      })} disabled={isLoading}>
        Start
      </button>
      <button onClick={stop}>Stop</button>
      <pre>{result}</pre>
    </div>
  )
}
```

### Multi-Agent Chat

```tsx
import { useChat } from 'agui-framework/client/react'

function MultiAgentChat() {
  const coordinator = useChat({ agentId: 'coordinator', baseUrl: 'http://localhost:4124' })
  const researcher = useChat({ agentId: 'researcher', baseUrl: 'http://localhost:4124' })

  return (
    <div>
      <h2>Coordinator</h2>
      {coordinator.messages.map((m, i) => (
        <div key={i}>{m.agentId}: {m.content}</div>
      ))}
      <button onClick={() => coordinator.sendMessage('Research AI trends')}>
        Ask Coordinator
      </button>

      <h2>Researcher (direct)</h2>
      {researcher.messages.map((m, i) => (
        <div key={i}>{m.agentId}: {m.content}</div>
      ))}
      <button onClick={() => researcher.sendMessage('Find papers on transformers')}>
        Ask Researcher
      </button>
    </div>
  )
}
```

### Agent State Management

```tsx
import { useAgentState, useChat } from 'agui-framework/client/react'

function StatefulAgent() {
  const { state, setState } = useAgentState('assistant', 'http://localhost:4124')
  const { messages, sendMessage } = useChat({
    agentId: 'assistant',
    baseUrl: 'http://localhost:4124',
  })

  return (
    <div>
      <p>Theme: {state?.theme}</p>
      <button onClick={() => setState({ theme: 'dark' })}>Dark Mode</button>
      <button onClick={() => sendMessage(`My theme is ${state?.theme || 'light'}`)}>
        Send Context
      </button>
    </div>
  )
}
```

## Next.js

AGUI Framework works naturally with both Pages Router and App Router in Next.js.

### App Router — API Route

```typescript
// app/api/agents/[id]/stream/route.ts
import { Agent } from 'agui-framework'
import { NextRequest } from 'next/server'

const agent = new Agent({
  model: process.env.MODEL || 'gpt-4o',
  provider: (process.env.PROVIDER as any) || 'openai',
  instructions: 'You are a helpful assistant.',
  maxTokens: 1024,
})

export async function POST(req: NextRequest) {
  const { prompt, threadId } = await req.json()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of agent.stream(prompt, { threadId })) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk })}\n\n`))
        }
        controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`))
      } catch (err) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

### App Router — Client Component

```tsx
// app/chat/page.tsx
'use client'

import { useChat } from 'agui-framework/client/react'

export default function ChatPage() {
  const { messages, sendMessage, isLoading } = useChat({
    agentId: 'assistant',
    baseUrl: '/api/agents',
  })

  return (
    <div>
      {messages.map((m, i) => (
        <div key={i} className={m.role}>
          {m.agentId && <span className="badge">{m.agentId}</span>}
          {m.content}
        </div>
      ))}
      <button onClick={() => sendMessage('Hello')} disabled={isLoading}>
        {isLoading ? 'Thinking...' : 'Send'}
      </button>
    </div>
  )
}
```

### App Router — Server Component + Streaming

```tsx
// app/actions.ts
'use server'

import { Agent } from 'agui-framework'

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a helpful assistant.',
})

export async function chat(prompt: string, threadId: string): Promise<string> {
  let result = ''
  for await (const chunk of agent.stream(prompt, { threadId })) {
    result += chunk
  }
  return result
}
```

## Semantic RAG

The Semantic RAG module integrates RDF knowledge graph capabilities:

```typescript
import { Agent, SparqlEngine, Reasoner, createTools } from 'agui-framework'

const engine = new SparqlEngine()
await engine.load(RDF_DATA, 'text/turtle')
const tools = createTools(engine, new Reasoner(engine))

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Explore the knowledge graph using discover_schema() first.',
  tools,
})
```

See [Semantic RAG Example](examples/semantic-rag.md) for full details.

## Express.js

```typescript
import { Agent } from 'agui-framework'
import express from 'express'

const app = express()
const agent = new Agent({ model: 'gpt-4o', provider: 'openai', instructions: '...' })

app.post('/chat', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for await (const chunk of agent.stream(req.body.prompt)) {
    res.write(`data: ${chunk}\n\n`)
  }
  res.end()
})
```

See [Server documentation](server.md) for the built-in `AguiServer` with REST, SSE, and WebSocket support.
