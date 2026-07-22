# AG-UI Middleware Implementation

Middleware in agui-framework provides a way to transform, filter, and augment the event streams that flow through agents. It enables cross-cutting concerns like logging, authentication, rate limiting, and event filtering without modifying core agent logic.

## What is Middleware?

Middleware sits between the agent execution and the event consumer, allowing you to:

- Transform events -- Modify or enhance events as they flow through the pipeline
- Filter events -- Selectively allow or block certain events
- Add metadata -- Inject additional context or tracking information
- Handle errors -- Implement custom error recovery strategies
- Monitor execution -- Add logging, metrics, or debugging capabilities

## How Middleware Works

Middleware forms a chain where each middleware wraps the next, creating layers of functionality. agui-framework uses function-based middleware with `AsyncGenerator` composition:

```typescript
import type { MiddlewareFunction } from 'agui-framework'

const loggingMiddleware: MiddlewareFunction = (agent, prompt, context, next) =>
  async function* () {
    console.log(`[${agent.config.name}] Starting run: "${prompt.slice(0, 50)}..."`)
    let count = 0
    for await (const event of next()) {
      count++
      yield event
    }
    console.log(`[${agent.config.name}] Done. ${count} events emitted.`)
  }()

agent.use(loggingMiddleware)
```

## MiddlewareFunction Signature

```typescript
type MiddlewareFunction = (
  agent: Agent,
  prompt: string,
  context: Partial<RunContext>,
  next: RunAgentFunction
) => AsyncGenerator<AgentEvent>

type RunAgentFunction = () => AsyncGenerator<AgentEvent>
```

## Execution Order

Middleware executes in the order it is added, with each middleware wrapping the next:

```
agent.use(middleware1, middleware2, middleware3)

Execution flow:
  -> middleware1
    -> middleware2
      -> middleware3
        -> agent._executeRun()
      <- events flow back through middleware3
    <- events flow back through middleware2
  <- events flow back through middleware1
```

## Built-in Middleware

### FilterToolCallsMiddleware

Filter tool calls based on allowed or disallowed lists:

```typescript
import { createFilterToolCallsMiddleware } from 'agui-framework'

// Only allow specific tools
const allowedFilter = createFilterToolCallsMiddleware({
  allowedToolCalls: ['search', 'calculate'],
})

agent.use(allowedFilter)
```

### LoggingMiddleware

Add logging to all agent runs:

```typescript
import { createLoggingMiddleware } from 'agui-framework'

const logMiddleware = createLoggingMiddleware(console.log)
agent.use(logMiddleware)
```

## Combining Middleware

Multiple middleware can be combined to create sophisticated processing pipelines:

```typescript
const loggingMiddleware: MiddlewareFunction = (agent, prompt, context, next) =>
  async function* () {
    console.log('Starting...')
    for await (const event of next()) yield event
  }()

const metricsMiddleware: MiddlewareFunction = (agent, prompt, context, next) =>
  async function* () {
    const start = Date.now()
    let count = 0
    for await (const event of next()) {
      count++
      yield event
    }
    console.log(`Metrics: ${count} events in ${Date.now() - start}ms`)
  }()

agent.use(loggingMiddleware, metricsMiddleware)
```

## Example: Event Filtering

```typescript
const filterMiddleware: MiddlewareFunction = (agent, prompt, context, next) =>
  async function* () {
    for await (const event of next()) {
      // Filter out state events to reduce noise
      if (event.type === 'STATE_DELTA' || event.type === 'STATE_SNAPSHOT') continue
      yield event
    }
  }()

agent.use(filterMiddleware)
```

## Example: Event Augmentation

```typescript
const augmentMiddleware: MiddlewareFunction = (agent, prompt, context, next) =>
  async function* () {
    for await (const event of next()) {
      yield {
        ...event,
        metadata: {
          ...(event as any).metadata,
          agentName: agent.config.name,
          timestamp: Date.now(),
        },
      }
    }
  }()

agent.use(augmentMiddleware)
```

## Best Practices

- Keep middleware focused -- Each middleware should have a single responsibility
- Handle errors gracefully -- Use try/catch around the inner generator
- Avoid side effects in transformations -- Prefer pure event transformations
- Document side effects -- Clearly indicate if middleware modifies state
- Consider performance -- Be mindful of processing overhead in the event stream

## Key Differences from AG-UI Spec

| AG-UI Middleware Concept | agui-framework Implementation                       |
|--------------------------|------------------------------------------------------|
| Class-based Middleware   | Function-based `MiddlewareFunction`                  |
| RxJS Observable-based    | `AsyncGenerator`-based                               |
| `next.run(input)`        | `next()` returning `AsyncGenerator<AgentEvent>`      |
| `FilterToolCallsMiddleware` class | `createFilterToolCallsMiddleware()` factory   |
