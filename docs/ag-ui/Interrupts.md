# AG-UI Interrupt Implementation

The interrupt protocol is implemented through the agent's `requiresApproval` tool flag, `pendingInterrupts` map, and `resume()` method.

## Interrupt Lifecycle

### 1. Tool Definition

A tool with `requiresApproval: true` triggers the interrupt flow:

```typescript
const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are helpful.',
  tools: [{
    name: 'process_payment',
    description: 'Process a payment',
    parameters: {
      type: 'object',
      properties: { amount: { type: 'number' } },
      required: ['amount'],
    },
    requiresApproval: true,
    handler: async ({ amount }) => ({ success: true, amount }),
  }],
})
```

### 2. Interrupt Emission

When the LLM calls a tool with `requiresApproval`, the agent stores the interrupt and emits `RUN_FINISHED` with `outcome.type: 'interrupt'`:

```typescript
// From agent.ts _executeStream():
if (toolDef?.requiresApproval) {
  const interrupt: Interrupt = {
    id: `interrupt_${tc.id}`,
    reason: `Tool ${buf.name} requires approval`,
    toolCallId: buf.id,
    message: `Approve execution of ${buf.name}?`,
    metadata: { arguments: buf.args },
  }
  this.pendingInterrupts.set(interrupt.id, interrupt)
  interrupts.push(interrupt)
}

if (interrupts.length > 0) {
  yield { type: 'RUN_FINISHED', threadId, runId,
    outcome: { type: 'interrupt', interrupts } }
}
```

### 3. Resume

The `resume()` method sends a new run with resume entries:

```typescript
// Agent.resume():
async resume(interruptId, payload, status = 'resolved') {
  return this.run('(resumed)', {
    threadId: this.lastThreadId,
    resume: [{ interruptId, status, payload }],
  })
}
```

### 4. Resume Processing

On the resumed run, the agent processes the resume entries, executes the approved tool, and continues:

```typescript
// From _executeRun():
if (resumeEntries) {
  for (const entry of resumeEntries) {
    const interrupt = this.pendingInterrupts.find(entry.interruptId)
    this.pendingInterrupts.delete(entry.interruptId)
    if (entry.status === 'resolved' && interrupt?.toolCallId) {
      // Execute the tool handler
      const result = await toolDef.handler(args, context)
      yield { type: 'TOOL_CALL_RESULT', toolCallId: interrupt.toolCallId, content: resultStr }
    }
  }
  this.pendingInterrupts.clear()
}
```

## Interrupt Structure

```typescript
interface Interrupt {
  id: string                       // e.g., "interrupt_tc_abc123"
  reason: string                   // e.g., "Tool process_payment requires approval"
  message?: string                 // Human-readable prompt
  toolCallId?: string              // Links to the original TOOL_CALL_*
  responseSchema?: unknown         // Optional JSON Schema for payload
  expiresAt?: string               // ISO-8601 TTL
  metadata?: Record<string, unknown>  // Contains arguments, toolName, etc.
}
```

## Resume API

```typescript
// Method 1: direct resume
const result = await agent.resume('interrupt_abc123', { approved: true })

// Method 2: via run() with explicit resume
const result = await agent.run('(resumed)', {
  threadId: 'thread-1',
  resume: [{ interruptId: 'int-1', status: 'resolved', payload: { approved: true } }],
})

// Method 3: cancel the interrupt
const result = await agent.resume('interrupt_abc123', undefined, 'cancelled')
```

## Client-Side Handling

React hooks from `agui-framework/client/react` provide interrupt management:

```typescript
import { useInterrupts } from 'agui-framework/client/react'

function MyComponent() {
  const { interrupts, handleInterrupt, resolve } = useInterrupts()

  function onEvent(event) {
    if (event.type === 'RUN_FINISHED' && event.outcome?.type === 'interrupt') {
      for (const i of event.outcome.interrupts) {
        handleInterrupt(i)
      }
    }
  }

  function onApprove(interruptId) {
    const entry = resolve(interruptId, { approved: true })
    // Send entry back to server
  }
}
```

## State at Interrupt Boundary

Before emitting the interrupt `RUN_FINISHED`, the agent always emits a final `STATE_SNAPSHOT` and `MESSAGES_SNAPSHOT` to ensure the client has the complete state needed for resume:

```typescript
yield { type: 'RUN_FINISHED', threadId, runId, outcome: { type: 'interrupt', interrupts } }
yield* this.emitStateAndMessages(threadId)  // STATE_SNAPSHOT + MESSAGES_SNAPSHOT
```

## Interrupt Flow Diagram

```
LLM calls tool (requiresApproval: true)
  |
  +-- Store Interrupt in pendingInterrupts map
  +-- Emit RUN_FINISHED with outcome.type: 'interrupt'
  +-- Emit STATE_SNAPSHOT and MESSAGES_SNAPSHOT
  |
Client receives interrupt, shows approval UI
  |
User approves or cancels
  |
  +-- Client sends resume to server
  |
Agent.resume() called
  |
  +-- Processes resume entries
  |     +-- If resolved: executes tool handler
  |     +-- If cancelled: skips tool execution
  +-- Continues LLM loop with tool result
  +-- Emits remaining events
```
