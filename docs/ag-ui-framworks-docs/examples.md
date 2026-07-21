# Examples

Real-world usage patterns for agui-framework.

## Multi-Agent Delegation

Orchestrate multiple specialized agents with delegation tools:

```typescript
import 'dotenv/config'
import { Agent } from 'agui-framework'

const researcher = new Agent({
  name: 'researcher',
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a research specialist. Find detailed information and return comprehensive findings.',
})

const writer = new Agent({
  name: 'writer',
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a writer. Create engaging content based on research findings.',
})

const editor = new Agent({
  name: 'editor',
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are an editor. Review and polish content for clarity, grammar, and style.',
})

// Give the writer a delegation tool for research
const researchTool = writer.createDelegationTool(
  'delegate_research',
  'Delegate a research task to the research specialist. Use this when you need detailed information.',
  researcher,
)

// Give the editor a delegation tool for research if needed
const editorResearchTool = editor.createDelegationTool(
  'delegate_research',
  'Delegate a research task if more information is needed.',
  researcher,
)

writer.addTool(researchTool)
editor.addTool(editorResearchTool)

async function main() {
  const result = await writer.run(
    'Write a blog post about quantum computing breakthroughs in 2025.',
  )
  console.log(result)
}

main().catch(console.error)
```

## Graph-Based Workflows

Define a directed graph of agents where traversal is conditional:

```typescript
import { AgentGraph, MultiAgentManager, runAgentGraph, Agent } from 'agui-framework'
import type { GraphNode, GraphEdge } from 'agui-framework'

const manager = new MultiAgentManager()

const research = new Agent({
  name: 'research', model: 'gpt-4o', provider: 'openai',
  instructions: 'Research the given topic thoroughly.',
})
const analyze = new Agent({
  name: 'analyze', model: 'gpt-4o', provider: 'openai',
  instructions: 'Analyze the research findings and extract key insights.',
})
const write = new Agent({
  name: 'write', model: 'gpt-4o', provider: 'openai',
  instructions: 'Write a final report based on the analysis.',
})

manager.registerAgent('research', research)
manager.registerAgent('analyze', analyze)
manager.registerAgent('write', write)

const nodes: GraphNode[] = [
  { id: 'research', type: 'agent', label: 'Research Phase', nextNodes: ['analyze'] },
  { id: 'analyze', type: 'agent', label: 'Analysis Phase', nextNodes: ['write'] },
  { id: 'write', type: 'agent', label: 'Writing Phase', nextNodes: ['end'] },
  { id: 'end', type: 'end', label: 'Complete' },
]

const edges: GraphEdge[] = [
  { from: 'research', to: 'analyze' },
  { from: 'analyze', to: 'write' },
  { from: 'write', to: 'end' },
]

const graph = new AgentGraph({ nodes, edges, startNode: 'research', endNodes: ['end'] })
const agentMap = new Map<string, string>([
  ['research', 'research'],
  ['analyze', 'analyze'],
  ['write', 'write'],
])

async function main() {
  const result = await runAgentGraph(graph, manager, agentMap, 'Climate change solutions')
  console.log('Final report:', result)
}

main().catch(console.error)
```

## Persistence with Stores

```typescript
import 'dotenv/config'
import { Agent, MemoryThreadStore } from 'agui-framework'

const store = new MemoryThreadStore()

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a helpful assistant.',
  store,
  autoPersist: true,
})

async function main() {
  // First conversation
  await agent.run('My name is Alice and I like hiking.', { threadId: 'user-alice' })
  console.log(await agent.getMessageHistory('user-alice'))

  // Second conversation (isolated)
  await agent.run('My name is Bob.', { threadId: 'user-bob' })
  console.log(await agent.getMessageHistory('user-bob'))

  // Alice's history is preserved
  await agent.run('What is my name?', { threadId: 'user-alice' })
  // -> "Your name is Alice. You also mentioned you like hiking."
}

main().catch(console.error)
```

### Redis Store (Production)

```typescript
import { Agent, RedisThreadStore } from 'agui-framework'

const store = new RedisThreadStore('redis://localhost:6379', {
  tablePrefix: 'myapp:',
})

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are helpful.',
  store,
})

// Load existing thread
await agent.loadThread('existing-thread-id')

// All runs are automatically persisted
await agent.run('Continue where we left off.', { threadId: 'existing-thread-id' })
```

### Postgres Store

```typescript
import { Agent, PostgresThreadStore } from 'agui-framework'

const store = new PostgresThreadStore('postgresql://user:pass@localhost:5432/mydb', {
  autoCreateTables: true,
})

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are helpful.',
  store,
})

await agent.run('Hello, this is a persisted conversation.', { threadId: 'pg-thread-1' })
```

## Custom Provider

Create a custom provider for any OpenAI-compatible API:

```typescript
import { BaseLLMProvider, Agent } from 'agui-framework'
import type { ProviderConfig } from 'agui-framework'

class GroqProvider extends BaseLLMProvider {
  constructor(config: ProviderConfig) {
    super('openai' as any, { ...config, baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1' })
  }

  protected getDefaultBaseUrl(): string {
    return 'https://api.groq.com/openai/v1'
  }

  protected getDefaultModel(): string {
    return 'llama3-70b-8192'
  }
}

const agent = new Agent({
  model: 'llama3-70b-8192',
  provider: 'openai',
  instructions: 'You are helpful.',
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
})

const response = await agent.run('Explain quantum physics simply.')
console.log(response)
```

## React Integration

```typescript
// app/chat.tsx
'use client'

import { useStream, useThread, useInterrupts } from 'agui-framework/client/react'

export default function ChatPage() {
  const { start, stop, isLoading, error, result } = useStream()
  const { threads, messages, loadMessages, createThread, currentThreadId } = useThread({
    baseUrl: 'http://localhost:3000',
  })
  const { interrupts, handleInterrupt, resolve } = useInterrupts()

  async function handleSubmit(prompt: string) {
    start(prompt, {
      baseUrl: 'http://localhost:3000',
      agentId: 'my-agent',
      onChunk: (delta) => {
        // Streaming text updates
      },
      onInterrupt: (interrupt) => {
        handleInterrupt(interrupt)
      },
      onComplete: (result) => {
        console.log('Done:', result)
      },
    })
  }

  function handleApprove(interruptId: string) {
    const resumeEntry = resolve(interruptId, { approved: true })
    // Send resumeEntry back to the server
  }

  return (
    <div>
      <button onClick={stop} disabled={!isLoading}>Stop</button>
      <div>{result}</div>
      {interrupts.map(i => (
        <div key={i.id}>
          <p>{i.message}</p>
          <button onClick={() => handleApprove(i.id)}>Approve</button>
        </div>
      ))}
    </div>
  )
}
```

## Express Server with SSE

```typescript
import 'dotenv/config'
import express from 'express'
import { Agent, ProtocolEncoder, MemoryThreadStore } from 'agui-framework'

const app = express()
app.use(express.json())

const store = new MemoryThreadStore()

app.post('/api/agents/:agentId/runs', async (req, res) => {
  const { prompt, threadId, tools } = req.body

  const agent = new Agent({
    name: req.params.agentId,
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are a helpful assistant.',
    store,
  })

  try {
    const result = await agent.run(prompt, { threadId })
    const events = agent.events.getHistory()
    res.json({ result, events, threadId: threadId || agent['lastThreadId'] })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Run failed' })
  }
})

app.post('/api/agents/:agentId/runs/stream', async (req, res) => {
  const { prompt, threadId } = req.body

  const agent = new Agent({
    name: req.params.agentId,
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are a helpful assistant.',
  })

  const encoder = new ProtocolEncoder()

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  try {
    for await (const chunk of agent.stream(prompt, { threadId })) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', delta: chunk })}\n\n`)
    }
    res.write(`data: ${JSON.stringify({ type: 'done', result: '' })}\n\n`)
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'Error' })}\n\n`)
  } finally {
    res.end()
  }
})

app.post('/api/agents/:agentId/resume', async (req, res) => {
  const { interruptId, payload, threadId, status } = req.body
  const agent = new Agent({
    name: req.params.agentId,
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are helpful.',
  })

  try {
    const result = await agent.resume(interruptId, payload, status)
    res.json({ result, threadId: agent['lastThreadId'] })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Resume failed' })
  }
})

app.get('/api/agents', async (_req, res) => {
  const threads = await store.listThreads()
  res.json({ agents: threads.map(t => ({ id: t.agentId || 'default', threadId: t.threadId })) })
})

app.listen(3000, () => console.log('Server on http://localhost:3000'))
```

## Client-Side SSE Consumer

```typescript
import { AguiClient } from 'agui-framework'

const client = new AguiClient('http://localhost:3000')

// List available agents
const agents = await client.agents()
console.log('Agents:', agents)

// Run an agent (non-streaming)
const { result, events } = await client.run('my-agent', 'Hello!', {
  threadId: 'session-1',
})

// Stream an agent response
let full = ''
await client.stream('my-agent', 'Tell me a story', {
  onChunk: (delta) => {
    full += delta
    process.stdout.write(delta)
  },
  onDone: (result) => console.log('\nDone:', result),
  onError: (err) => console.error(err),
}, { threadId: 'session-1' })
```

## Live State Observation

Poll an agent's live execution state during a run to show real-time progress in the UI:

```typescript
import { useLiveState } from 'agui-framework/client/react'

function AgentMonitor({ agentId, baseUrl, threadId }: { agentId: string; baseUrl: string; threadId: string }) {
  const { state, loading, error, startPolling } = useLiveState(agentId, baseUrl, threadId)

  useEffect(() => {
    const stop = startPolling(2000) // poll every 2s
    return () => stop()
  }, [startPolling])

  if (loading && !state) return <div>Loading state...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!state) return <div>No active run</div>

  return (
    <div>
      <h3>Status: {state.status}</h3>
      {state.runId && <p>Run: {state.runId}</p>}
      {state.pendingInterrupts.length > 0 && (
        <div>
          <h4>Pending Approvals:</h4>
          {state.pendingInterrupts.map(i => (
            <div key={i.id}>
              <p>Tool: {i.toolName}</p>
              <p>Args: {i.arguments}</p>
            </div>
          ))}
        </div>
      )}
      {state.cost && <p>Cost: ${state.cost.totalCost.toFixed(4)}</p>}
      {state.usage && <p>Tokens: {state.usage.totalTokens}</p>}
    </div>
  )
}
```

For non-React usage:

```typescript
const res = await fetch('/api/agents/my-agent/state?threadId=thread-1')
const { state } = await res.json()
console.log('Status:', state.status)
console.log('Pending:', state.pendingInterrupts)
console.log('Cost:', state.cost)
```

## Summarization Middleware

Automatically compress long conversations to stay within the context window:

```typescript
import { Agent, createSummarizationMiddleware } from 'agui-framework'

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a helpful assistant.',
})

// Inherits model/provider from the agent (uses gpt-4o for summaries too)
agent.use(createSummarizationMiddleware())

async function main() {
  // Long conversation — middleware automatically summarizes when context hits 90%
  for (let i = 0; i < 50; i++) {
    await agent.run(`This is message number ${i}. Remember this detail: item-${i}.`, {
      threadId: 'long-conversation',
    })
  }

  const history = agent.getMessageHistory('long-conversation')
  console.log('After 50 messages, history is compressed to:', history.length, 'messages')
  console.log('First message:', history[0])
}

main().catch(console.error)
```

## DeepAgent with Planning

```typescript
import 'dotenv/config'
import { Agent, DeepAgent } from 'agui-framework'

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are an autonomous research assistant.',
})

const deepAgent = new DeepAgent(agent, {
  planning: true,
  contextManagement: true,
  maxPlanningSteps: 10,
})

deepAgent.enhanceWithDeepCapabilities()

async function main() {
  const result = await deepAgent.run(
    'Research and write a summary about renewable energy trends in 2025.',
  )
  console.log(result)
}

main().catch(console.error)
```
