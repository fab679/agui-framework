# AG-UI State Management Implementation

agui-framework implements the AG-UI state synchronization protocol through the `SharedState` class and `StateManager`. These provide snapshot and delta-based state synchronization between agents and frontends.

## Shared State Architecture

In AG-UI, state is a structured data object that:

- Persists across interactions with an agent
- Can be accessed by both the agent and the frontend
- Updates in real-time as the interaction progresses
- Provides context for decision-making on both sides

## State Synchronization Methods

### State Snapshots

The `STATE_SNAPSHOT` event delivers a complete representation of the agent's current state:

```typescript
interface StateSnapshotEvent {
  type: 'STATE_SNAPSHOT'
  snapshot: Record<string, unknown>
}
```

Snapshots are used at the beginning of an interaction to establish the initial state, after connection interruptions, and to establish a new baseline for future delta updates.

### State Deltas

The `STATE_DELTA` event delivers incremental updates using JSON Patch format (RFC 6902):

```typescript
interface StateDeltaEvent {
  type: 'STATE_DELTA'
  delta: JsonPatchOperation[]
}
```

Deltas are bandwidth-efficient, sending only what has changed rather than the entire state.

### JSON Patch Format

```typescript
interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  path: string    // JSON Pointer (RFC 6901) to the target location
  value?: unknown // The value to apply (for add, replace)
  from?: string   // Source path (for move, copy)
}
```

Common operations:

```typescript
{ op: 'add', path: '/user/preferences', value: { theme: 'dark' } }
{ op: 'replace', path: '/conversation_state', value: 'paused' }
{ op: 'remove', path: '/temporary_data' }
```

## SharedState Implementation

`SharedState` is a versioned key-value store that supports snapshots, diffs, merges, and patch computation.

### Creating and Managing State

```typescript
import { SharedState } from 'agui-framework'

const state = new SharedState(
  { theme: 'dark', count: 0 },
  { history: true },
  'thread-123',
)

// Mutations automatically track versioning
state.set('theme', 'light')
state.update({ score: 42 })

// Take a snapshot at any point
state.takeSnapshot('after-update')

// Get the current snapshot
const snapshot = state.getSnapshot()
// { data: { theme: 'light', score: 42 }, version: '1.2', timestamp: ..., threadId: 'thread-123' }
```

### Computing Patches for Deltas

```typescript
const patch = state.computePatch()
// [{ op: 'replace', path: '/theme', value: 'light' }]
```

This is used internally to emit `STATE_DELTA` events during agent runs.

### Subscriptions

Subscribe to state changes across all mutations:

```typescript
const unsub = state.subscribe({
  callback: (data, threadId) => {
    console.log('State changed:', data)
  },
})
```

Supports optional `filter` and `immediate` flags:

```typescript
state.subscribe({
  callback: (data, threadId) => { /* ... */ },
  filter: (data, threadId) => data.hasOwnProperty('counter'), // only fire on counter changes
  immediate: true, // also fire immediately with current state
})
```

### Diffing Between States

```typescript
const a = new SharedState({ x: 1, y: 2 })
const b = new SharedState({ y: 3, z: 4 })
const diff = a.diff(b)
// { added: { z: 4 }, updated: { y: 3 }, removed: { x: 1 } }
```

### Merging with Conflict Resolution

```typescript
state.merge(otherState, {
  deepMerge: true,
  mergeArrays: true,
  conflictResolution: 'merge',  // 'ignore' | 'overwrite' | 'merge' | 'prompt' | 'auto'
})
```

Strategies:
- `ignore` — keep the local value
- `overwrite` — replace with the incoming value
- `merge` — deep-merge objects

## StateManager Implementation

`StateManager` manages thread-isolated `SharedState` instances, providing the AG-UI thread-based isolation model.

```typescript
import { StateManager, SharedState } from 'agui-framework'

const manager = new StateManager()

// Each thread gets its own isolated state
const stateA = manager.getOrCreateState('thread-A')
stateA.set('data', 'AAA')

const stateB = manager.getOrCreateState('thread-B')
stateB.set('data', 'BBB')

console.log(stateA.get('data'))  // 'AAA'
console.log(stateB.get('data'))  // 'BBB'
```

### Thread Isolation Model

```
StateManager
  +-- thread-abc --- SharedState { counter: 1, user: 'Alice' }
  +-- thread-xyz --- SharedState { counter: 99, lang: 'en' }
  +-- thread-def --- SharedState { items: [...] }
```

### Global Subscriptions (New)

The `StateManager` supports global subscriptions that fire on changes across **all** threads. Each `SharedState` created or assigned through the manager is automatically wired to relay changes to the global subscription set:

```typescript
const unsub = manager.subscribe({
  callback: (data, threadId) => {
    console.log(`State changed in thread ${threadId}:`, data)
  },
})

// Changes in any thread now trigger the global callback
manager.getOrCreateState('thread-A').set('key', 'val')
```

### Lifecycle Events (New)

The `StateManager` exposes an `onEvent` callback for state lifecycle events:

```typescript
manager.onEvent = (event) => {
  switch (event.type) {
    case 'state_created':
      console.log(`State created for thread ${event.threadId}`)
      break
    case 'state_updated':
      console.log(`State updated:`, event.data)
      break
    case 'state_deleted':
      console.log(`State deleted for thread ${event.threadId}`)
      break
  }
}
```

The event type:

```typescript
interface StateEvent {
  type: 'state_created' | 'state_updated' | 'state_deleted' | 'state_error'
  threadId?: string
  data?: Record<string, unknown>
  error?: Error
  timestamp?: number
}
```

### Export and Import

```typescript
// Export state for a thread
const snapshot = manager.exportState('thread-abc')
// { data: {...}, timestamp: ..., version: '...', threadId: 'thread-abc' }

// Import into another thread
manager.importState('thread-xyz', snapshot)
```

## Agent Integration

During `run()` and `stream()`, the agent emits state events automatically:

```typescript
// Emitted at start of each run
yield { type: 'STATE_DELTA', delta: statePatch }
yield { type: 'STATE_SNAPSHOT', snapshot: state.toObject() }
yield { type: 'MESSAGES_SNAPSHOT', messages: getMessageHistory(threadId) }
```

### Cost and Usage in State (New)

When a store is configured, each run's token usage and cost are persisted into `RunData` and accumulated into thread metadata:

```typescript
// RunData now includes:
interface RunData {
  modelId?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  cost?: { currency: 'USD'; inputCost: number; outputCost: number; totalCost: number }
}

// Thread metadata accumulates:
interface ThreadMetadata {
  totalCost: number    // cumulative USD across all runs
  runCount: number     // number of runs in this thread
  lastModelId: string  // model used in the most recent run
}
```

Accessible via the server API:

```
GET /api/threads              → includes totalCost, runCount, lastModelId per thread
GET /api/threads/:id/runs     → returns all runs with usage + cost
```

Or via the agent directly:

```typescript
const usage = agent.getLastUsage()  // TokenUsage | null
const cost = agent.getLastCost()    // CostBreakdown | null
```

## Best Practices

- Use snapshots judiciously — Full snapshots should be sent only when necessary to establish a baseline
- Prefer deltas for incremental changes — Small state updates should use deltas to minimize data transfer
- Structure state thoughtfully — Design state objects to support partial updates and minimize patch complexity
- Handle state conflicts — Use the merge conflict resolution strategies for concurrent updates
- Include error recovery — Provide mechanisms to resynchronize state if inconsistencies are detected
- Avoid storing sensitive information in shared state
- Use `AgentConfig.costLimit` to enforce budget caps per run
