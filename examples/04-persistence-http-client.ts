/**
 * Example 04: Persistence, HTTP Agent, and Client SDK
 *
 * Demonstrates:
 * - MemoryThreadStore: full CRUD operations
 * - Agent thread persistence (loadThread, saveThread)
 * - HttpAgent: remote agent communication
 * - AguiClient: HTTP client for agent server
 * - AguiWebSocketClient: WebSocket client
 * - Store types and interfaces
 */

import 'dotenv/config'
import {
  Agent,
  MemoryThreadStore,
  HttpAgent,
  AguiClient,
  type ToolConfig,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// 1. MemoryThreadStore
// ---------------------------------------------------------------------------

async function demonstrateMemoryStore() {
  console.log('\n=== 1. MemoryThreadStore ===')

  const store = new MemoryThreadStore()
  await store.connect()
  console.log('  Store connected')

  // Create threads
  const thread1 = await store.createThread('thread-1', { source: 'web' }, 'agent-1')
  console.log('  Created thread:', thread1.threadId)
  console.log('  Thread metadata:', JSON.stringify(thread1.metadata))
  console.log('  Thread agentId:', thread1.agentId)

  const thread2 = await store.createThread('thread-2', { source: 'api' }, 'agent-2')

  // List threads
  const threads = await store.listThreads()
  console.log('  Total threads:', threads.length)

  // Get thread
  const got = await store.getThread('thread-1')
  console.log('  Got thread:', got?.threadId)

  // Update metadata
  await store.updateThreadMetadata('thread-1', { priority: 'high' })
  const updated = await store.getThread('thread-1')
  console.log('  Updated metadata:', JSON.stringify(updated?.metadata))

  // Messages
  await store.appendMessages('thread-1', [
    { id: 'm1', role: 'user', content: 'Hello' },
    { id: 'm2', role: 'assistant', content: 'Hi there!' },
    { id: 'm3', role: 'user', content: 'What is AI?' },
  ] as any)
  const msgs = await store.getMessages('thread-1')
  console.log('  Thread-1 messages:', msgs.length)
  console.log('  Last message:', (msgs[msgs.length - 1] as any).content)
  console.log('  Message count:', await store.getMessageCount('thread-1'))

  // Search messages
  const results = await store.searchMessages('thread-1', 'AI')
  console.log('  Search results for "AI":', results.length)
  console.log('  Search match:', (results[0] as any).content)

  // State
  await store.saveState('thread-1', { count: 5, status: 'active' })
  const state = await store.getState('thread-1')
  console.log('  Saved state:', JSON.stringify(state))

  // Events
  await store.appendEvents('thread-1', [
    { type: 'RUN_STARTED', threadId: 'thread-1', runId: 'r1', timestamp: Date.now() },
    { type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'r1', outcome: { type: 'success' }, timestamp: Date.now() },
  ] as any)
  const events = await store.getEvents('thread-1')
  console.log('  Events stored:', events.length)
  console.log('  Event count:', await store.getEventCount('thread-1'))

  // Runs
  await store.saveRun('run-1', 'thread-1', {
    input: { prompt: 'Hello' },
    output: 'Hi there!',
    outcome: { type: 'success' },
    startedAt: new Date().toISOString(),
  })
  await store.saveRun('run-2', 'thread-1', {
    input: { prompt: 'What is AI?' },
    output: 'AI is...',
    outcome: { type: 'success' },
    startedAt: new Date().toISOString(),
  })
  const runs = await store.listRuns('thread-1')
  console.log('  Runs stored:', runs.length)

  const run = await store.getRun('run-1')
  console.log('  Retrieved run:', run?.runId, '- output:', (run as any)?.output)

  // Delete messages
  // await store.deleteMessages('thread-1')
  // console.log('  Messages after delete:', await store.getMessageCount('thread-1'))

  // Delete thread
  // await store.deleteThread('thread-1')
  // console.log('  Threads after delete:', (await store.listThreads()).length)

  await store.disconnect()
  console.log('  Store disconnected')
}

// ---------------------------------------------------------------------------
// 2. Agent Thread Persistence
// ---------------------------------------------------------------------------

async function demonstrateAgentPersistence() {
  console.log('\n=== 2. Agent Thread Persistence ===')

  const store = new MemoryThreadStore()

  const agent = new Agent({
    name: 'persistent-agent',
    model: process.env.AGUI_MODEL || 'gpt-4o',
    provider: (process.env.AGUI_PROVIDER || 'openai') as any,
    instructions: 'You are a persistent assistant. Remember context across conversations.',
    store,
    autoPersist: true,
  })

  console.log('  Agent created with store')

  // Set some initial history manually
  agent.setMessageHistory('persist-thread', [
    { id: 'p1', role: 'user', content: 'My name is Alice.' } as any,
    { id: 'p2', role: 'assistant', content: 'Nice to meet you, Alice!' } as any,
  ])

  console.log('  Manual history set:', agent.getMessageHistory('persist-thread').length)

  // Save thread explicitly
  await agent.saveThread('persist-thread')
  const savedMsgs = await store.getMessages('persist-thread')
  console.log('  Persisted messages:', savedMsgs.length)

  // Load thread on a fresh agent (but same store)
  const freshAgent = new Agent({
    name: 'fresh-agent',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'Fresh agent.',
    store,
  })

  // Simulate loadThread
  await freshAgent.loadThread('persist-thread')
  console.log('  Loaded history:', freshAgent.getMessageHistory('persist-thread').length)
  const loadedMsgs = freshAgent.getMessageHistory('persist-thread')
  console.log('  First user msg:', (loadedMsgs[0] as any).content)

  // Run with persistence (requires API key)
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.FIREWORKS_API_KEY
  if (apiKey) {
    try {
      const result = await agent.run(
        'What is my name?',
        { threadId: 'persist-thread-2', runId: 'persist-run-1' },
      )
      console.log('  Persisted run result:', result.substring(0, 200))

      // Check state was saved
      const threadState = await store.getState('persist-thread-2')
      console.log('  Persisted state:', JSON.stringify(threadState))
    } catch (err) {
      console.log('  Persistence run error:', err instanceof Error ? err.message : err)
    }
  } else {
    console.log('  [SKIP] No API key found.')
  }
}

// ---------------------------------------------------------------------------
// 3. HttpAgent
// ---------------------------------------------------------------------------

async function demonstrateHttpAgent() {
  console.log('\n=== 3. HttpAgent ===')

  const httpAgent = new HttpAgent({
    url: 'http://localhost:3000/api/agents/my-agent/runs',
    agentId: 'my-agent',
    threadId: 'http-thread-1',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`,
    },
    timeout: 30000,
  })

  console.log('  HttpAgent created')
  console.log('  Base URL:', httpAgent.config.url)
  console.log('  Thread ID:', httpAgent.threadId)

  // Get capabilities (will fail if no server running, which is expected)
  try {
    const caps = await httpAgent.getCapabilities()
    console.log('  Capabilities:', caps ? 'retrieved' : 'null')
  } catch (err) {
    console.log('  Get capabilities (expected to fail without server):', err instanceof Error ? err.message : 'Error')
  }

  // Run agent (will fail if no server)
  try {
    const result = await httpAgent.runAgent({
      messages: [{ id: 'm1', role: 'user', content: 'Hello from HttpAgent!' } as any],
      context: { threadId: 'http-test' },
    })
    console.log('  HttpAgent result:', result)
  } catch (err) {
    console.log('  HttpAgent run (expected to fail without server):', err instanceof Error ? err.message : 'Error')
  }

  // Show the encoder/state from HttpAgent
  console.log('  Encoder type:', httpAgent.encoder.constructor.name)
  console.log('  State has thread:', httpAgent.state.hasState(httpAgent.threadId))

  // Change thread
  httpAgent.threadId = 'new-thread-id'
  console.log('  New thread ID:', httpAgent.threadId)
}

// ---------------------------------------------------------------------------
// 4. AguiClient
// ---------------------------------------------------------------------------

async function demonstrateAguiClient() {
  console.log('\n=== 4. AguiClient ===')

  const client = new AguiClient('http://localhost:3000')
  console.log('  AguiClient created for base URL:', (client as any).baseUrl)

  // List agents (will fail without server)
  try {
    const agents = await client.agents()
    console.log('  Agents:', agents.map(a => a.id).join(', '))
  } catch (err) {
    console.log('  List agents (expected to fail without server):', err instanceof Error ? err.message : 'Error')
  }

  // Get single agent
  try {
    const agentMeta = await client.agent('my-agent')
    console.log('  Agent metadata:', JSON.stringify(agentMeta))
  } catch (err) {
    console.log('  Get agent (expected to fail without server)')
  }

  // Run agent
  try {
    const { result, events, threadId } = await client.run('my-agent', 'Hello!', {
      threadId: 'client-thread-1',
      model: 'gpt-4o',
    })
    console.log('  Run result:', result)
    console.log('  Events count:', events.length)
  } catch (err) {
    console.log('  Run (expected to fail without server)')
  }

  // Stream (mock)
  let streamResult = ''
  try {
    streamResult = await client.stream(
      'my-agent',
      'Tell me a story',
      {
        onChunk: (delta) => { streamResult += delta },
        onDone: (result) => console.log('  Stream complete:', result.substring(0, 50)),
        onError: (err) => console.log('  Stream error:', err.message),
      },
      { threadId: 'stream-thread', signal: new AbortController().signal },
    )
  } catch (err) {
    console.log('  Stream (expected to fail without server)')
  }

  // Resume
  try {
    const resumed = await client.resume('my-agent', 'interrupt-1', { approved: true }, 'resolved')
    console.log('  Resume result:', resumed.result)
  } catch (err) {
    console.log('  Resume (expected to fail without server)')
  }

  // Thread management
  try {
    await client.createThread('api-thread-1', [
      { id: 'm1', role: 'user', content: 'Hello from client!' } as any,
    ])
    console.log('  Thread created')

    const threads = await client.listThreads()
    console.log('  Threads:', threads.length)
  } catch (err) {
    console.log('  Thread ops (expected to fail without server)')
  }

  // Models
  try {
    const models = await client.models()
    console.log('  Models:', models.length)
  } catch (err) {
    console.log('  Models (expected to fail without server)')
  }
}

// ---------------------------------------------------------------------------
// 5. AguiWebSocketClient
// ---------------------------------------------------------------------------

async function demonstrateWebSocketClient() {
  console.log('\n=== 5. WebSocket Client ===')

  const { AguiWebSocketClient } = await import('../src/client/index.js')

  const wsClient = new AguiWebSocketClient('ws://localhost:3000', 'my-agent')
  console.log('  WebSocket client created')

  // Register handlers
  wsClient.on('run_complete', (data) => console.log('  WS run complete:', data.result?.substring(0, 50)))
  wsClient.on('error', (err) => console.log('  WS error:', err.message))

  // Connect (will fail without a WebSocket server)
  try {
    await wsClient.connect(process.env.OPENAI_API_KEY)
    console.log('  WS connected')
    wsClient.close()
  } catch (err) {
    console.log('  WS connect (expected to fail without server):', err instanceof Error ? err.message : 'Error')
  }
}

// ---------------------------------------------------------------------------
// 6. Conversion Functions
// ---------------------------------------------------------------------------

async function demonstrateConversion() {
  console.log('\n=== 6. Conversion Functions ===')

  const {
    toOpenAIMessages,
    toAnthropicMessages,
    fromToolCallsToEvents,
    mergeMessages,
  } = await import('../src/conversion.js')

  // Sample messages in internal format
  const messages = [
    { id: 'sys1', role: 'system' as const, content: 'You are helpful.' },
    { id: 'u1', role: 'user' as const, content: 'What is TypeScript?' },
    { id: 'a1', role: 'assistant' as const, content: 'TypeScript is a typed superset of JavaScript.' },
    {
      id: 't1',
      role: 'tool' as const,
      content: '{"result":42}',
      toolCallId: 'tc1',
      name: 'calculate',
    },
  ]

  // Convert to OpenAI format
  const openaiMsgs = toOpenAIMessages(messages)
  console.log('  OpenAI messages:', openaiMsgs.length)
  console.log('  Last role:', openaiMsgs[openaiMsgs.length - 1].role)

  // Convert to Anthropic format
  const anthropic = toAnthropicMessages(messages)
  console.log('  Anthropic system:', anthropic.system?.substring(0, 20))
  console.log('  Anthropic messages:', anthropic.messages.length)

  // From tool calls to events
  const toolCalls = [
    { id: 'tc1', type: 'function' as const, function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
  ]
  const events = fromToolCallsToEvents(toolCalls)
  console.log('  Tool call events:', events.map(e => e.type).join(', '))

  // Merge messages
  const newMsgs = [
    { id: 'a2', role: 'assistant' as const, content: 'More info.' },
  ]
  const merged = mergeMessages(messages, newMsgs)
  console.log('  Merged messages count:', merged.length)
  console.log('  Merged ids:', merged.map(m => m.id).join(', '))
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(72))
  console.log('AG-UI FRAMEWORK - Example 04: Persistence, HTTP & Client')
  console.log('='.repeat(72))

  await demonstrateMemoryStore()
  await demonstrateAgentPersistence()
  await demonstrateHttpAgent()
  await demonstrateAguiClient()
  await demonstrateWebSocketClient()
  await demonstrateConversion()

  console.log('\n' + '='.repeat(72))
  console.log('Example 04 completed successfully!')
  console.log('='.repeat(72))
}

main().catch(console.error)
