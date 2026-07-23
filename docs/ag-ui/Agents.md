# AG-UI Agent Implementation

The `Agent` class in agui-framework implements the AG-UI protocol's agent specification. It manages LLM communication, tool execution, event emission, state synchronization, and interrupt handling -- all conforming to the AG-UI event stream format.

## Core Interface

Every agent implements the `run()` method which returns an async generator of AG-UI events:

```typescript
import { Agent } from 'agui-framework'

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a helpful assistant.',
})

// The run() method internally generates an AG-UI compliant event stream
const response = await agent.run('Hello')
```

### Event Stream Generation

Under the hood, `_executeRun()` and `_executeStream()` yield AG-UI typed events:

```typescript
// Internal event generation pattern
async function* _executeRun(prompt: string, context: RunContext) {
  yield { type: 'RUN_STARTED', threadId, runId, parentRunId, input: { prompt, context } }
  yield { type: 'STEP_STARTED', stepName: 'generating' }
  // ... LLM call ...
  yield { type: 'STEP_FINISHED', stepName: 'generating' }
  yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' }
  yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: content }
  yield { type: 'TEXT_MESSAGE_END', messageId }
  yield { type: 'RUN_FINISHED', threadId, runId, outcome: { type: 'success' } }
}
```

## State and Messages Synchronization

Before each run, the agent emits `STATE_SNAPSHOT`, `STATE_DELTA`, and `MESSAGES_SNAPSHOT` events to synchronize the client:

```typescript
// From agent.ts internals:
yield { type: 'STATE_DELTA', delta: statePatch }
yield { type: 'STATE_SNAPSHOT', snapshot: state.toObject() }
yield { type: 'MESSAGES_SNAPSHOT', messages: getMessageHistory(threadId) }
```

This follows the AG-UI snapshot/delta pattern for state management synchronization.

## Tool Call Lifecycle

When the LLM indicates a tool call, the agent emits the standard AG-UI tool call sequence:

```typescript
yield { type: 'TOOL_CALL_START', toolCallId: tc.id, toolCallName: tc.function.name }
yield { type: 'TOOL_CALL_ARGS', toolCallId: tc.id, delta: tc.function.arguments }
yield { type: 'TOOL_CALL_END', toolCallId: tc.id }
// After handler execution:
yield { type: 'TOOL_CALL_RESULT', messageId, toolCallId: tc.id, content: resultStr }
```

## Capabilities Declaration

`getCapabilities()` returns a structured `AgentCapabilities` object conforming to the AG-UI capabilities spec:

```typescript
const caps = agent.getCapabilities()
// {
//   identity: { name: 'gpt-4o', type: 'agui-framework', version: '0.2.9', provider: 'openai' },
//   transport: { streaming: true, resumable: true },
//   tools: { supported: true, items: [...] },
//   state: { snapshots: true, deltas: true, memory: true },
//   multiAgent: { supported: true, delegation: true, handoffs: true },
//   humanInTheLoop: { supported: true, approvals: true, interrupts: true },
//   ...
// }
```

## Interrupt Handling

Agents support the AG-UI interrupt protocol for human-in-the-loop workflows. Tools marked with `requiresApproval: true` generate interrupts automatically:

```typescript
const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Use tools carefully.',
  tools: [{
    name: 'send_email',
    description: 'Send an email',
    parameters: { type: 'object', properties: { to: { type: 'string' } }, required: ['to'] },
    requiresApproval: true,
    handler: async ({ to }) => ({ sent: true, to }),
  }],
})

// If LLM calls send_email, the agent emits:
// RUN_FINISHED { outcome: { type: 'interrupt', interrupts: [{ id, reason, toolCallId, message }] } }

// Resume with:
const result = await agent.resume('interrupt_abc', { approved: true })
```

## Multi-Agent Events

Delegation and handoff operations emit AG-UI multi-agent events:

```typescript
// On delegation:
{ type: 'AGENT_DELEGATION_START', parentAgent, childAgent, threadId, runId, input }
{ type: 'AGENT_DELEGATION_END', parentAgent, childAgent, threadId, runId, result }

// On handoff:
{ type: 'AGENT_HANDOFF_REQUEST', fromAgent, toAgent, threadId, reason }
{ type: 'AGENT_HANDOFF_RESULT', fromAgent, toAgent, threadId, result }
```

## Run Lineage

Each run carries a `parentRunId` for branching and time-travel support:

```typescript
yield { type: 'RUN_STARTED', threadId, runId, parentRunId: previousRunId, input: { ... } }
```

The agent tracks `lastRunId` and passes it as `parentRunId` on subsequent runs, creating an append-only lineage within each thread.

## Configuration Mapping

| AG-UI Protocol Concept | agui-framework Implementation                             |
|------------------------|-----------------------------------------------------------|
| `AbstractAgent`        | `Agent` class with `run()`/`stream()`/`resume()`          |
| `runAgent(input)`      | `run(prompt, context)` yielding AG-UI events internally   |
| Observable-based events| AsyncGenerator-based (no RxJS dependency)                 |
| Middleware             | `MiddlewareFunction` composition instead of class-based   |
| Client SDK             | `AguiClient` + React hooks from `agui-framework/client/react` |
