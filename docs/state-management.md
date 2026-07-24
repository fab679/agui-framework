# State Management

AGUI Framework provides two complementary state management systems: thread-isolated `SharedState` for per-thread state and a global `SharedState` accessible by agents via built-in tools.

## SharedState

`SharedState` is a versioned key-value store with snapshot history, diffing, merging, and conflict resolution.

```typescript
import { SharedState } from "agui-framework";

const state = new SharedState({ theme: "dark", maxRetries: 3 });

state.set("favoriteColor", "blue");
state.set("user", { name: "Alice", age: 30 });

const color = state.get<string>("favoriteColor"); // "blue"
const hasKey = state.has("user"); // true
state.delete("tempData");
```

### Snapshots

```typescript
state.takeSnapshot("initial-state");
state.set("theme", "light");
state.takeSnapshot("theme-changed");

const snapshots = state.getHistory(10);
const latest = state.getSnapshot();
```

### Diffing and Merging

```typescript
const otherState = new SharedState({ theme: "light", locale: "en-US" });
const diff = state.diff(otherState);

state.merge(otherState, "deepMerge", (conflict) => {
  // Custom conflict resolution
  return conflict.ours;
});
```

### Versioning

```typescript
const version = state.getVersion(); // UUID string
```

### Subscriptions

```typescript
const unsubscribe = state.subscribe((event) => {
  console.log("State changed:", event.key, event.value);
});
```

## StateManager

The `StateManager` creates and manages thread-isolated `SharedState` instances with global subscriptions.

```typescript
import { StateManager } from "agui-framework";

const manager = new StateManager();

// Create or get state for a thread
const state = manager.getOrCreateState("thread-123");
state.set("progress", 50);

// Update state
manager.updateState("thread-123", { progress: 75 });

// Export/import
const snapshot = manager.exportState("thread-123");
manager.importState("thread-456", snapshot);

// Global subscriptions
manager.subscribe(({ threadId, key, value }) => {
  console.log(`Thread ${threadId}: ${key} = ${value}`);
});

// Cleanup
manager.deleteState("thread-123");
manager.clearAll();
```

## Global Shared State (Agent Tools)

When a `SharedState` instance is passed to an agent via the `sharedState` config option, the agent automatically registers `setState`, `getState`, and `deleteState` tools that it can call autonomously:

```typescript
const shared = new SharedState({ theme: "dark", maxRetries: 3 });

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "Remember user preferences using setState.",
  sharedState: shared,
});

await agent.run("Remember my favorite color is blue.");
console.log(shared.get("favoriteColor")); // "blue"

// Another agent with the same shared state can read it
const agent2 = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You know the user's preferences.",
  sharedState: shared,
});

const reply = await agent2.run("What is my favorite color?");
// The agent calls getState("favoriteColor") and responds "blue"
```

This enables multi-agent scenarios where agents share context without explicit thread scoping.

## Accessing State from Tool Handlers

Tool handlers can access the agent's `SharedState` and `StateManager` directly:

```typescript
tools: [{
  name: "update_profile",
  description: "Update user profile",
  parameters: { ... },
  handler: async ({ key, value }, context) => {
    // Access agent-level shared state (all threads)
    const profile = agent.sharedState.get('userProfile')
    agent.sharedState.set('userProfile', { ...profile, [key]: value })

    // Access thread-scoped state via StateManager
    const threadData = await agent.stateManager.get(context.threadId)
    await agent.stateManager.set(context.threadId, {
      ...threadData, lastAction: key
    })

    return { success: true }
  },
}]
```

When `sharedState` is configured, the agent auto-registers `get_state`, `set_state`, `delete_state`, and `list_state_keys` tools for the LLM to use.

## Agent State via REST API

When using the `AguiServer`, agent state is accessible via REST:

```
GET    /api/agents/:id/state              → Get live execution state + shared state snapshot
POST   /api/agents/:id/state              → Set a key-value pair (body: { key, value })
DELETE /api/agents/:id/state/:key         → Delete a key from shared state
```

The `GET` endpoint optionally accepts `?threadId=` to scope results to a specific thread.

## API Reference

### `SharedState`

| Method | Description |
|--------|-------------|
| `constructor(initialData?, options?, threadId?)` | Create shared state |
| `get<T>(key, defaultValue?)` | Get a value |
| `set(key, value)` | Set a value |
| `update(updates)` | Batch update |
| `delete(key)` | Delete a key |
| `has(key)` | Check key existence |
| `clear()` | Clear all data |
| `takeSnapshot(label?)` | Create a snapshot |
| `getSnapshot()` | Get latest snapshot |
| `getHistory(limit?)` | Get snapshot history |
| `diff(other)` | Compute diff |
| `merge(other, strategy?, conflictHandler?)` | Merge states |
| `computePatch()` | Compute JSON Patch |
| `getVersion()` | Get version UUID |
| `subscribe(callback)` | Subscribe to changes |
| `toJSON()` | Serialize to JSON |
| `fromJSON(json)` | Restore from JSON |

### `StateManager`

| Method | Description |
|--------|-------------|
| `constructor(defaultState?)` | Create state manager |
| `getOrCreateState(threadId)` | Get or create thread state |
| `updateState(threadId, updates)` | Update thread state |
| `deleteState(threadId)` | Delete thread state |
| `hasState(threadId)` | Check thread state exists |
| `getAllThreads()` | List all threads |
| `clearAll()` | Clear all states |
| `exportState(threadId)` | Export snapshot |
| `importState(threadId, snapshot)` | Import snapshot |
| `subscribe(callback)` | Global subscription |
