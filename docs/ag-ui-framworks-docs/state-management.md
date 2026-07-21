# State Management

agui-framework provides two classes for managing agent state: `SharedState` (a versioned key-value store with diffing, merging, and subscriptions) and `StateManager` (a thread-isolated collection of `SharedState` instances).

## SharedState

`SharedState` is a key-value data store with change tracking, snapshot history, versioning, and subscriptions.

### Creating and Populating

```typescript
import { SharedState } from 'agui-framework'

const state = new SharedState(
  { theme: 'dark', count: 0 },   // initial data
  { history: true },              // options
  'thread-123',                   // optional thread ID
)
```

### CRUD Operations

```typescript
// Set
state.set('theme', 'light')

// Batch update
state.update({ score: 42, level: 'gold' })

// Get with optional default
const theme = state.get<string>('theme')       // 'light'
const score = state.get<number>('score', 0)    // 42

// Check existence
state.has('user')    // false

// Delete
state.delete('score')

// Clear all
state.clear()

// Inspection
state.keys()         // ['theme']
state.values()       // ['light']
state.entries()      // [['theme', 'light']]
state.toObject()     // { theme: 'light' }
state.getSize()      // 1
```

### Versioning

Every mutation increments the version string:

```typescript
const s = new SharedState({ x: 1 })
s.getVersion()       // '1.0'
s.set('x', 2)
s.getVersion()       // '1.1'
s.update({ y: 3 })
s.getVersion()       // '1.2'
```

### Snapshots and History

Snapshots capture the full state at a point in time:

```typescript
state.set('counter', 1)
state.takeSnapshot('first')

state.set('counter', 2)
state.takeSnapshot('second')

state.getSnapshot()
// { data: { counter: 2 }, timestamp: ..., version: '1.2', threadId: '...' }

const history = state.getHistory()
// [ snapshot1, snapshot2 ]

const lastTwo = state.getHistory(2)
```

History is capped at 100 entries. Set `{ history: false }` to disable.

### State Diffing

Compare two `SharedState` instances:

```typescript
const a = new SharedState({ x: 1, y: 2 })
const b = new SharedState({ y: 3, z: 4 })

const diff = a.diff(b)
// {
//   added:   { z: 4 },
//   updated: { y: 3 },
//   removed: { x: 1 },
//   threadId: undefined
// }
```

### Merging

Merge another `SharedState` into the current one with configurable conflict resolution:

```typescript
state.merge(otherState, {
  deepMerge: true,
  mergeArrays: true,
  conflictResolution: 'merge',  // 'ignore' | 'overwrite' | 'merge' | 'auto'
})
```

Custom conflict handler:

```typescript
state.merge(otherState, {}, (key, local, incoming, strategy) => {
  if (key === 'priority') return Math.max(local as number, incoming as number)
  return incoming
})
```

### Computing Patches

`computePatch()` returns a JSON Patch (RFC 6902) array of changes since the last patch computation:

```typescript
const patch = state.computePatch()
// [{ op: 'replace', path: '/theme', value: 'dark' }]
```

This is used internally to emit `STATE_DELTA` events.

### Subscriptions

Subscribe to state changes. Callbacks fire on every `set`, `update`, or `delete`:

```typescript
const unsub = state.subscribe({
  callback: (data, threadId) => {
    console.log('State changed:', data)
  },
  filter: (data) => data.count !== undefined,   // optional filter
  immediate: true,                                // fire with current data
})

unsub()  // unsubscribe
```

### Serialization

```typescript
const json = state.toJSON()
const restored = new SharedState()
restored.fromJSON(json)
```

## StateManager

`StateManager` manages thread-isolated `SharedState` instances. Each conversation thread gets its own independent state.

### Basic Usage

```typescript
import { StateManager, SharedState } from 'agui-framework'

const manager = new StateManager()

// Per-thread isolation
const stateA = manager.getOrCreateState('thread-A')
stateA.set('data', 'AAA')

const stateB = manager.getOrCreateState('thread-B')
stateB.set('data', 'BBB')

console.log(stateA.get('data'))  // 'AAA'
console.log(stateB.get('data'))  // 'BBB'
```

### CRUD via Manager

```typescript
// Get or create
const state = manager.getOrCreateState('user-123')

// Update directly
manager.updateState('user-123', { score: 100 })

// Check existence
manager.hasState('user-123')     // true

// Delete
manager.deleteState('user-123')

// List threads
manager.getAllThreads()          // ['thread-A', 'thread-B']

// Clear all
manager.clearAll()
```

### Default State

New threads inherit the default state:

```typescript
const defaults = new SharedState({ theme: 'light', lang: 'en' })
const manager = new StateManager(defaults)

const state = manager.getOrCreateState('new-thread')
state.get('theme')   // 'light'
state.get('lang')    // 'en'
```

### Export and Import

```typescript
// Export snapshot
const snapshot = manager.exportState('thread-abc')
// { data: {...}, timestamp: ..., version: '...', threadId: 'thread-abc' }

// Import into another thread
manager.importState('thread-xyz', snapshot)
```

### Global Subscriptions

React to changes across all threads:

```typescript
manager.subscribe({
  callback: (data, threadId) => {
    console.log(`Thread ${threadId} changed:`, data)
  },
  filter: (data, threadId) => threadId.startsWith('user-'),
})
```

## State Lifecycle Events

`StateManager.onEvent()` registers a global callback that fires on lifecycle events across all threads:

```typescript
manager.onEvent((event) => {
  if (event.type === 'state_created') {
    console.log(`State created for thread ${event.threadId}`)
  } else if (event.type === 'state_updated') {
    console.log(`State updated in thread ${event.threadId}:`, event.data)
  } else if (event.type === 'state_deleted') {
    console.log(`State deleted for thread ${event.threadId}`)
  } else if (event.type === 'state_error') {
    console.error(`Error in thread ${event.threadId}:`, event.error)
  }
})
```

The callback receives a `StateEvent` object with a `type` of `'state_created'`, `'state_updated'`, `'state_deleted'`, or `'state_error'`.

## Thread Isolation Diagram

```
StateManager
  +-- thread-abc --- SharedState { counter: 1, user: 'Alice' }
  +-- thread-xyz --- SharedState { counter: 99, lang: 'en' }
  +-- thread-def --- SharedState { items: [...] }
```

Each thread's state is fully independent.

## Global State Shared Across Agents

A `SharedState` can be passed directly to an agent via `AgentConfig.sharedState`. When set, the agent automatically registers three built-in tools (`setState`, `getState`, `deleteState`) that operate on that global state — independent of any thread.

Multiple agents or users can share the same `SharedState` instance, enabling cross-agent data sharing:

```typescript
import { Agent, SharedState } from 'agui-framework'

const globalState = new SharedState({ theme: 'dark', maxRetries: 3 })

const agentA = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are Agent A.',
  sharedState: globalState,
})

const agentB = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are Agent B.',
  sharedState: globalState,
})

// Both agents can read/write the same global state via tools:
//   setState("preferences", { color: "blue", fontSize: 14 })
//   getState("theme")         → "dark"
//   deleteState("maxRetries")

// Users can also update the state directly:
globalState.set('mode', 'production')
```

### Tool Reference

When `sharedState` is configured, the agent includes these tools:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `setState` | `key: string`, `value: any` | Stores any JSON value under a key |
| `getState` | `key: string` | Retrieves the value for a key |
| `deleteState` | `key: string` | Removes a key from the state |

The state shape is unknown ahead of time — any JSON-serializable value can be stored (strings, numbers, booleans, objects, arrays, null).

### Client-Side REST API

When using `AguiServer`, the shared state is also accessible via REST endpoints for client-side read/write without involving the LLM:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents/:id/state` | Returns the full shared state snapshot (or thread state if `?threadId=` is set) |
| `POST` | `/api/agents/:id/state` | Sets a key-value pair. Body: `{ key: string, value: any }` |
| `DELETE` | `/api/agents/:id/state/:key` | Deletes a key from the shared state |

**AguiClient methods:**

```typescript
const client = new AguiClient('http://localhost:4124')

// Read full state
const state = await client.getAgentState('agent-id')

// Write a value
await client.setAgentState('agent-id', 'theme', 'dark')

// Delete a key
await client.deleteAgentState('agent-id', 'theme')
```

**React hook:**

```typescript
import { useAgentState } from 'agui-framework/client/react'

function ThemeToggle({ agentId, baseUrl }: { agentId: string; baseUrl: string }) {
  const { state, setState, deleteState, loading } = useAgentState(agentId, baseUrl)

  if (loading) return <div>Loading...</div>

  return (
    <div>
      <p>Current theme: {state.theme as string}</p>
      <button onClick={() => setState('theme', 'light')}>Light</button>
      <button onClick={() => setState('theme', 'dark')}>Dark</button>
    </div>
  )
}
```

## Type Reference

```typescript
type StateData = Record<string, unknown>

interface StateOptions {
  isolation?: boolean
  validation?: boolean
  history?: boolean       // Enable snapshot history (default: true)
  version?: boolean
}

interface StateSnapshot {
  data: StateData
  timestamp: number
  version: string
  threadId?: string
}

interface StateDiff {
  added: StateData
  updated: StateData
  removed: StateData
  threadId?: string
}

interface StateSubscription {
  callback: (state: StateData, threadId: string) => void
  filter?: (state: StateData, threadId: string) => boolean
  immediate?: boolean
}

type StateConflictResolution = 'ignore' | 'overwrite' | 'merge' | 'prompt' | 'auto'

interface StateMergeStrategy {
  mergeArrays?: boolean
  deepMerge?: boolean
  conflictResolution?: StateConflictResolution
}

interface StateEvent {
  type: 'state_created' | 'state_updated' | 'state_deleted' | 'state_error'
  stateId?: string
  threadId?: string
  data?: StateData
  error?: Error
  timestamp?: number
}
```

The `StateEvent.type` field can be `'state_created' | 'state_updated' | 'state_deleted' | 'state_error'`.

## StateManager API

```typescript
class StateManager {
  constructor(defaultState?: SharedState)

  getOrCreateState(threadId: string): SharedState
  setState(threadId: string, state: SharedState): void
  updateState(threadId: string, updates: Partial<StateData>): SharedState
  deleteState(threadId: string): void
  hasState(threadId: string): boolean
  getAllThreads(): string[]
  clearAll(): void

  getDefaultState(): SharedState | undefined
  setDefaultState(state: SharedState): void

  exportState(threadId: string): StateSnapshot | null
  importState(threadId: string, snapshot: StateSnapshot): SharedState

  subscribe(subscription: StateSubscription): () => void
  onEvent(callback: (event: StateEvent) => void): void
}
```
