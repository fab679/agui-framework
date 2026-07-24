# Persistence & Storage

AGUI Framework provides pluggable persistence backends for thread data, state, and long-term memory.

## ThreadStore Interface

All thread stores implement the `ThreadStore` interface:

```typescript
interface ThreadStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Thread CRUD
  createThread(threadId: string, metadata?: Record<string, unknown>, agentId?: string, ownerId?: string): Promise<ThreadData>;
  getThread(threadId: string): Promise<ThreadData | null>;
  listThreads(limit?: number, offset?: number, agentId?: string, userId?: string): Promise<ThreadData[]>;
  deleteThread(threadId: string): Promise<void>;

  // Messages
  appendMessages(threadId: string, messages: Message[]): Promise<void>;
  getMessages(threadId: string, limit?: number, offset?: number): Promise<Message[]>;
  searchMessages(threadId: string, query: string, limit?: number): Promise<Message[]>;

  // State
  saveState(threadId: string, state: Record<string, unknown>): Promise<void>;
  getState(threadId: string): Promise<Record<string, unknown> | null>;

  // Runs
  saveRun(runId: string, threadId: string, data: RunData): Promise<void>;
  getRun(runId: string): Promise<RunData | null>;
}
```

## MemoryThreadStore

In-memory store for development and testing:

```typescript
import { MemoryThreadStore } from "agui-framework";

const store = new MemoryThreadStore();
await store.connect();

// Use with agent
const agent = new Agent({
  ...config,
  store,
  autoPersist: true,
});
```

## RedisThreadStore

Redis-backed persistence for production deployments:

```typescript
import { RedisThreadStore } from "agui-framework";

const store = new RedisThreadStore({
  host: "localhost",
  port: 6379,
  password: "optional",
});

await store.connect();
```

Requires: `npm install ioredis`

## PostgresThreadStore

PostgreSQL-backed persistence for relational data:

```typescript
import { PostgresThreadStore } from "agui-framework";

const store = new PostgresThreadStore({
  host: "localhost",
  port: 5432,
  database: "agui",
  user: "postgres",
  password: "secret",
});

await store.connect();
```

Requires: `npm install pg`

### Schema

The PostgresThreadStore uses the following tables:
- `threads` -- Thread metadata
- `messages` -- Message history
- `state` -- Thread state
- `runs` -- Run data and metrics

Tables are auto-created on first connect.

## OxigraphSemanticStore

RDF-based semantic memory using Oxigraph (WASM):

```typescript
import { OxigraphSemanticStore } from "agui-framework";

const store = new OxigraphSemanticStore();
await store.remember("alice", [
  { subject: "alice", predicate: "prefersModel", object: "gpt-4o", timestamp: Date.now() },
]);

const facts = await store.recall("alice");
await store.forget("alice", "prefersModel");
```

Requires: `npm install oxigraph` (optional peer dependency)

### LTM Middleware

The `createLTMMiddleware` wraps the semantic store into the agent's execution pipeline, injecting autonomous memory management tools:

```typescript
import { Agent, OxigraphSemanticStore, createLTMMiddleware } from "agui-framework";

const store = new OxigraphSemanticStore();
const agent = new Agent({ ...config });

agent.use(createLTMMiddleware(store));

// The agent autonomously calls remember/recall/forget tools
const reply = await agent.run("Remember I prefer short answers.", { userId: "alice" });
```

## Agent Persistence Integration

```typescript
const agent = new Agent({
  ...config,
  store: new RedisThreadStore({ host: "localhost" }),
  autoPersist: true, // auto-save after each run
});

// Manual persistence
await agent.saveThread("thread-123");
await agent.loadThread("thread-123");
```

## API Reference

### `MemoryThreadStore`

In-memory implementation of `ThreadStore`.

### `RedisThreadStore`

| Constructor Param | Type | Default | Description |
|------------------|------|---------|-------------|
| `host` | `string` | `"localhost"` | Redis host |
| `port` | `number` | `6379` | Redis port |
| `password` | `string` | undefined | Redis password |
| `keyPrefix` | `string` | `"agui:"` | Key namespace |

### `PostgresThreadStore`

| Constructor Param | Type | Default | Description |
|------------------|------|---------|-------------|
| `host` | `string` | `"localhost"` | Postgres host |
| `port` | `number` | `5432` | Postgres port |
| `database` | `string` | `"agui"` | Database name |
| `user` | `string` | `"postgres"` | Database user |
| `password` | `string` | required | Database password |

### `OxigraphSemanticStore`

| Method | Description |
|--------|-------------|
| `remember(userId, facts)` | Store facts for a user |
| `recall(userId, predicate?)` | Retrieve facts |
| `forget(userId, predicate?)` | Delete facts |
| `clear()` | Clear all data |

### Functions

| Function | Description |
|----------|-------------|
| `createLTMMiddleware(store, config?)` | Create LTM middleware for agent use |
