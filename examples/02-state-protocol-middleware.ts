/**
 * Example 02: State Management, Protocol, and Middleware
 *
 * Demonstrates:
 * - SharedState: versioned key-value store with diff/merge
 * - StateManager: thread-isolated state management
 * - ProtocolEncoder: event serialization, SSE, compaction
 * - ProtocolValidator: input/event/message validation
 * - MiddlewareChain: composable middleware pipeline
 * - Built-in middleware utilities
 */

import 'dotenv/config'
import {
  SharedState,
  StateManager,
  ProtocolEncoder,
  ProtocolValidator,
  MiddlewareChain,
  createFilterToolCallsMiddleware,
  createLoggingMiddleware,
  type AgentEvent,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// 1. SharedState
// ---------------------------------------------------------------------------

async function demonstrateSharedState() {
  console.log('\n=== 1. SharedState ===')

  // Create state with initial data
  const state = new SharedState(
    { count: 0, user: 'Alice', tags: ['new'] },
    { history: true },
    'thread-1',
  )

  console.log('  Initial data:', state.toObject())
  console.log('  Version:', state.getVersion())
  console.log('  Thread ID:', state.getThreadId())

  // Get/Set/Has
  state.set('count', 1)
  console.log('  count after set:', state.get('count'))
  console.log('  Has "user":', state.has('user'))
  console.log('  Missing key default:', state.get('nonexistent', 'fallback'))

  // Update (merge)
  state.update({ count: 2, role: 'admin' })
  console.log('  After update:', state.toObject())

  // Keys, values, entries
  console.log('  Keys:', state.keys())
  console.log('  Values:', state.values())
  console.log('  Size:', state.getSize())

  // Delete
  state.delete('role')
  console.log('  After delete:', state.has('role'))

  // Snapshot
  const snap = state.getSnapshot()
  console.log('  Snapshot version:', snap.version)
  console.log('  Snapshot timestamp:', new Date(snap.timestamp).toISOString())

  // History with snapshots
  state.takeSnapshot('first')
  state.set('count', 3)
  state.takeSnapshot('second')
  state.set('count', 4)
  state.takeSnapshot('third')
  console.log('  History count:', state.getHistory().length)
  console.log('  Last 2 snapshots:', state.getHistory(2).length)

  // JSON Patch computation
  state.set('count', 5)
  const patch = state.computePatch()
  console.log('  Compute patch ops:', patch)

  // Diff between states
  const otherState = new SharedState({ count: 10, user: 'Bob', extra: 'value' })
  const diff = state.diff(otherState)
  console.log('  Diff added:', JSON.stringify(diff.added))
  console.log('  Diff updated:', JSON.stringify(diff.updated))
  console.log('  Diff removed:', JSON.stringify(diff.removed))

  // Merge with conflict resolution
  const merged = state.merge(otherState, {
    deepMerge: true,
    mergeArrays: true,
    conflictResolution: 'merge',
  })
  console.log('  Merged state:', JSON.stringify(merged))
  console.log('  Version after merge:', state.getVersion())

  // Static conflict resolution
  const resolved = SharedState.resolveConflict('key', 'local', 'incoming', 'overwrite')
  console.log('  Conflict resolution (overwrite):', resolved)

  // Serialization
  const json = state.toJSON()
  console.log('  JSON:', json)

  const restored = new SharedState()
  restored.fromJSON(json)
  console.log('  Restored count:', restored.get('count'))

  // Subscription
  const calls: string[] = []
  const unsub = state.subscribe({
    callback: (data) => calls.push(`changed: ${JSON.stringify(data)}`),
    filter: (data) => 'count' in data,
  })
  state.set('count', 6)
  state.set('other', true) // won't trigger because filter checks for 'count'
  console.log('  Subscription calls (filtered):', calls.length)
  unsub()
  state.set('count', 7) // unsubscribed
  console.log('  Subscription calls after unsubscribe:', calls.length)

  // Clear
  state.clear()
  console.log('  After clear, size:', state.getSize())
  console.log('  Version after clear:', state.getVersion())
}

// ---------------------------------------------------------------------------
// 2. StateManager
// ---------------------------------------------------------------------------

async function demonstrateStateManager() {
  console.log('\n=== 2. StateManager ===')

  const manager = new StateManager()
  const managerEvents: string[] = []
  manager.onEvent = (event) => managerEvents.push(event.type)

  // Create states per thread
  const stateA = manager.getOrCreateState('thread-alpha')
  stateA.set('topic', 'AI')
  console.log('  Thread alpha state:', stateA.toObject())

  const stateB = manager.getOrCreateState('thread-beta')
  stateB.set('topic', 'Web Dev')
  console.log('  Thread beta state:', stateB.toObject())

  // Update state
  manager.updateState('thread-alpha', { language: 'TypeScript' })
  console.log('  Thread alpha after update:', manager.getOrCreateState('thread-alpha').toObject())

  // Check existence
  console.log('  Has thread-alpha:', manager.hasState('thread-alpha'))
  console.log('  All threads:', manager.getAllThreads())

  // Export/Import
  const exported = manager.exportState('thread-alpha')
  console.log('  Exported snapshot:', exported?.data)
  const imported = manager.importState('thread-gamma', exported!)
  console.log('  Imported thread-gamma:', imported.toObject())

  // Global subscription
  const globalCalls: string[] = []
  const unsubGlobal = manager.subscribe({
    callback: (data, tid) => globalCalls.push(`${tid}: ${JSON.stringify(data)}`),
  })
  stateA.set('newKey', true)
  console.log('  Global subscriptions fired:', globalCalls.length)
  unsubGlobal()

  // Events
  console.log('  Manager events:', managerEvents)

  // Cleanup
  manager.deleteState('thread-alpha')
  console.log('  Has thread-alpha after delete:', manager.hasState('thread-alpha'))
  manager.clearAll()
  console.log('  Threads after clearAll:', manager.getAllThreads().length)
}

// ---------------------------------------------------------------------------
// 3. ProtocolEncoder
// ---------------------------------------------------------------------------

async function demonstrateProtocolEncoder() {
  console.log('\n=== 3. ProtocolEncoder ===')

  const encoder = new ProtocolEncoder()

  // Create sample events
  const events: AgentEvent[] = [
    { type: 'RUN_STARTED', threadId: 't1', runId: 'r1', timestamp: Date.now() } as any,
    {
      type: 'TEXT_MESSAGE_START',
      messageId: 'msg1',
      role: 'assistant',
      timestamp: Date.now(),
    } as any,
    {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'msg1',
      delta: 'Hello, world!',
      timestamp: Date.now(),
    } as any,
    { type: 'TEXT_MESSAGE_END', messageId: 'msg1', timestamp: Date.now() } as any,
    {
      type: 'TOOL_CALL_START',
      toolCallId: 'tc1',
      toolCallName: 'get_weather',
      timestamp: Date.now(),
    } as any,
    {
      type: 'TOOL_CALL_ARGS',
      toolCallId: 'tc1',
      delta: '{"city":"London"}',
      timestamp: Date.now(),
    } as any,
    { type: 'TOOL_CALL_END', toolCallId: 'tc1', timestamp: Date.now() } as any,
    { type: 'RUN_FINISHED', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, timestamp: Date.now() } as any,
  ]

  // Encode/Decode single event
  const encodedEvent = encoder.encodeEvent(events[0])
  const decodedEvent = encoder.decodeEvent(encodedEvent)
  console.log('  Encoded event:', encodedEvent.substring(0, 100) + '...')
  console.log('  Decoded event type:', decodedEvent.type)

  // Encode/Decode stream
  const encodedStream = encoder.encodeStream(events)
  console.log('  Encoded stream (first 120 chars):', encodedStream.substring(0, 120))

  const decodedStream = encoder.decodeStream(encodedStream)
  console.log('  Decoded stream event count:', decodedStream.length)

  // SSE encoding
  const sseEvent = encoder.encodeSSE(events[0])
  console.log('  SSE format:', sseEvent.substring(0, 100) + '...')

  // RunInput encoding
  const runInput = {
    threadId: 't1',
    runId: 'r1',
    messages: [
      { id: 'm1', role: 'user' as const, content: 'Hello' },
      { id: 'm2', role: 'assistant' as const, content: 'Hi there!' },
    ],
  }
  const encodedRun = encoder.encodeRunInput(runInput)
  const decodedRun = encoder.decodeRunInput(encodedRun)
  console.log('  RunInput threadId:', decodedRun.threadId)

  // Message encoding
  const encodedMsg = encoder.encodeMessage(runInput.messages[0])
  const decodedMsg = encoder.decodeMessage(encodedMsg)
  console.log('  Message id:', decodedMsg.id)

  // Compact events
  const compacted = encoder.compactEvents(events)
  console.log('  Compacted event count:', compacted.length)
  console.log('  Compacted event types:', compacted.map((e: any) => e.type).join(', '))

  // Compact function
  const { compactEvents } = await import('../src/protocol.js')
  const compacted2 = compactEvents(events)
  console.log('  Compact events (fn) count:', compacted2.length)
}

// ---------------------------------------------------------------------------
// 4. ProtocolValidator
// ---------------------------------------------------------------------------

async function demonstrateProtocolValidator() {
  console.log('\n=== 4. ProtocolValidator ===')

  // Validate RunInput
  const validRunInput = {
    threadId: 't1',
    runId: 'r1',
    messages: [{ id: 'm1', role: 'user' as const, content: 'Hello' }],
  }
  const invalidRunInput = { threadId: 't1', runId: '' } as any

  console.log('  Valid run input:', ProtocolValidator.validateRunInput(validRunInput as any))
  console.log('  Invalid run input:', ProtocolValidator.validateRunInput(invalidRunInput))

  // Validate Resume
  const validResume = [{ interruptId: 'int_1', status: 'resolved' as const }]
  const invalidResume = [{ interruptId: '', status: 'unknown' as any }]

  console.log('  Valid resume:', ProtocolValidator.validateResume(validResume))
  console.log('  Invalid resume:', ProtocolValidator.validateResume(invalidResume))

  // Validate events
  const validEvent = { type: 'RUN_STARTED', threadId: 't1', runId: 'r1' }
  const invalidEvent = { type: 'RUN_STARTED' }
  const badTypeEvent = { type: 'UNKNOWN_TYPE' }

  console.log('  Valid event:', ProtocolValidator.validateEvent(validEvent as any))
  console.log('  Invalid event (missing runId):', ProtocolValidator.validateEvent(invalidEvent as any))
  console.log('  Bad type event:', ProtocolValidator.validateEvent(badTypeEvent as any))

  // Validate messages
  const validMsg = { id: 'm1', role: 'user' as const, content: 'Hello' }
  const invalidMsg = { id: '', role: 'unknown' as any }
  const toolMsg = { id: 'm2', role: 'tool' as const, content: 'result', toolCallId: 'tc1' }

  console.log('  Valid message:', ProtocolValidator.validateMessage(validMsg as any))
  console.log('  Invalid message:', ProtocolValidator.validateMessage(invalidMsg as any))
  console.log('  Tool message:', ProtocolValidator.validateMessage(toolMsg as any))

  // Check valid event types
  console.log('  Is RUN_STARTED valid?', ProtocolValidator.isValidEventType('RUN_STARTED'))
  console.log('  Is CUSTOM valid?', ProtocolValidator.isValidEventType('CUSTOM'))
  console.log('  Is INVALID valid?', ProtocolValidator.isValidEventType('INVALID'))
}

// ---------------------------------------------------------------------------
// 5. MiddlewareChain and Built-in Middleware
// ---------------------------------------------------------------------------

async function demonstrateMiddleware() {
  console.log('\n=== 5. Middleware ===')

  // Create middleware chain
  const chain = new MiddlewareChain()

  // Add built-in middleware
  chain.use(createLoggingMiddleware((msg) => console.log(`  ${msg}`)))
  chain.use(createFilterToolCallsMiddleware({
    disallowedToolCalls: ['dangerous_tool'],
  }))

  console.log('  Middleware count:', chain.count)

  // Compose with a mock executor
  const mockExecutor = async function* () {
    yield { type: 'RUN_STARTED', threadId: 't1', runId: 'r1', timestamp: Date.now() } as any
    yield {
      type: 'TOOL_CALL_START',
      toolCallId: 'tc1',
      toolCallName: 'safe_tool',
      timestamp: Date.now(),
    } as any
    yield { type: 'TOOL_CALL_ARGS', toolCallId: 'tc1', delta: '{}', timestamp: Date.now() } as any
    yield { type: 'TOOL_CALL_END', toolCallId: 'tc1', timestamp: Date.now() } as any
    yield {
      type: 'TOOL_CALL_START',
      toolCallId: 'tc2',
      toolCallName: 'dangerous_tool',
      timestamp: Date.now(),
    } as any
    yield {
      type: 'TEXT_MESSAGE_START',
      messageId: 'msg1',
      role: 'assistant',
      timestamp: Date.now(),
    } as any
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'msg1',
      delta: 'Hello!',
      timestamp: Date.now(),
    } as any
    yield { type: 'TEXT_MESSAGE_END', messageId: 'msg1', timestamp: Date.now() } as any
    yield {
      type: 'RUN_FINISHED',
      threadId: 't1',
      runId: 'r1',
      outcome: { type: 'success' },
      timestamp: Date.now(),
    } as any
  }

  const gen = chain.compose(
    { prompt: 'Test prompt', context: {} },
    mockExecutor(),
  )

  const collected: string[] = []
  for await (const event of gen) {
    collected.push(event.type)
  }
  console.log('  Filtered event types:', collected.join(', '))
  console.log('  (dangerous_tool should be filtered out)')
  console.log('  Contains dangerous_tool?', collected.includes('TOOL_CALL_START'))

  // Clear
  chain.clear()
  console.log('  Middleware count after clear:', chain.count)
}

// ---------------------------------------------------------------------------
// 6. Event Bus (from events.ts)
// ---------------------------------------------------------------------------

async function demonstrateEventBus() {
  console.log('\n=== 6. Event Bus ===')

  const { EventBus } = await import('../src/events.js')
  const bus = new EventBus(100)

  // Subscribe
  const runEvents: string[] = []
  bus.on('RUN_STARTED', (e) => runEvents.push((e as any).runId))
  bus.on('*', (e) => {
    /* wildcard */
  })

  // Emit
  bus.emit({ type: 'RUN_STARTED', threadId: 't1', runId: 'r1', timestamp: Date.now() } as any)
  bus.emit({ type: 'STEP_STARTED', stepName: 'gen', timestamp: Date.now() } as any)
  bus.emit({ type: 'RUN_FINISHED', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, timestamp: Date.now() } as any)

  console.log('  History count:', bus.getEventCount())
  console.log('  Run events:', runEvents)

  // Once
  let onceCalled = 0
  bus.once('RUN_FINISHED', () => onceCalled++)
  bus.emit({ type: 'RUN_FINISHED', threadId: 't1', runId: 'r2', outcome: { type: 'success' }, timestamp: Date.now() } as any)
  bus.emit({ type: 'RUN_FINISHED', threadId: 't1', runId: 'r3', outcome: { type: 'success' }, timestamp: Date.now() } as any)
  console.log('  Once called count:', onceCalled)

  // Pipe
  const piped = bus.pipe((event) => {
    if (event.type === 'STEP_STARTED') return null // filter out
    return event
  })
  console.log('  Piped bus created:', piped !== bus)

  // Listener count
  console.log('  RUN_STARTED listeners:', bus.listenerCount('RUN_STARTED'))
  console.log('  Total listeners:', bus.listenerCount())

  // Compact
  bus.compact()
  console.log('  History after compact:', bus.getEventCount())

  // toJSON / fromJSON
  const json = bus.toJSON()
  console.log('  Serialized history length:', json.length)

  const restoredBus = new EventBus()
  restoredBus.fromJSON(json)
  console.log('  Restored event count:', restoredBus.getEventCount())
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(72))
  console.log('AG-UI FRAMEWORK - Example 02: State, Protocol & Middleware')
  console.log('='.repeat(72))

  await demonstrateSharedState()
  await demonstrateStateManager()
  await demonstrateProtocolEncoder()
  await demonstrateProtocolValidator()
  await demonstrateMiddleware()
  await demonstrateEventBus()

  console.log('\n' + '='.repeat(72))
  console.log('Example 02 completed successfully!')
  console.log('='.repeat(72))
}

main().catch(console.error)
