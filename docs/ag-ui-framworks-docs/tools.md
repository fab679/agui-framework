# Tools

Tools (function calling) allow LLMs to invoke external functions, APIs, databases, or delegate to sub-agents. agui-framework provides a type-safe system for defining, executing, and observing tool calls.

## Defining Tools with ToolConfig

```typescript
import type { ToolConfig } from 'agui-framework'

const weatherTool: ToolConfig = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'The city name' },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius',
      },
    },
    required: ['city'],
  },
  handler: async (args, context) => {
    const { city, units = 'celsius' } = args
    // Call external API here
    return { temperature: 22, conditions: 'sunny', city, units }
  },
}
```

### ToolConfig Reference

```typescript
interface ToolConfig {
  name: string                              // Tool name (used by LLM)
  description: string                       // Description for LLM
  parameters: ToolParameters                 // JSON Schema for arguments
  requiresApproval?: boolean                 // HITL flag
  handler: (args: Record<string, unknown>, context: RunContext) => Promise<unknown>
}
```

### ToolParameters Reference

```typescript
interface ToolParameters {
  type: 'object'
  properties?: Record<string, ParameterSpec>
  required?: string[]
  additionalProperties?: boolean
}

interface ParameterSpec {
  type: string           // 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  default?: unknown
  items?: unknown
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}
```

## Adding Tools to an Agent

```typescript
import { Agent } from 'agui-framework'
import type { ToolConfig } from 'agui-framework'

// Option 1: At construction
const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Use tools when needed.',
  tools: [weatherTool],
})

// Option 2: At runtime
agent.addTool(weatherTool)
agent.addTool(searchTool)

// List all tools
const tools = agent.getTools()
```

## Tool Call Event Lifecycle

When the LLM calls a tool, these events are emitted:

```
TOOL_CALL_START (toolCallId, toolCallName)
  +-- TOOL_CALL_ARGS (toolCallId, delta: JSON fragment)
  +-- TOOL_CALL_END (toolCallId)
  +-- TOOL_CALL_RESULT (toolCallId, content: handler return value)
```

```typescript
agent.events.on('TOOL_CALL_START', (event) => {
  console.log(`Tool called: ${event.toolCallName}`)
})

agent.events.on('TOOL_CALL_RESULT', (event) => {
  console.log(`Result: ${event.content}`)
})
```

### Event Interfaces

```typescript
interface ToolCallStartEvent extends BaseEvent {
  type: 'TOOL_CALL_START'
  toolCallId: string
  toolCallName: string
  parentMessageId?: string
}

interface ToolCallArgsEvent extends BaseEvent {
  type: 'TOOL_CALL_ARGS'
  toolCallId: string
  delta: string
}

interface ToolCallEndEvent extends BaseEvent {
  type: 'TOOL_CALL_END'
  toolCallId: string
}

interface ToolCallResultEvent extends BaseEvent {
  type: 'TOOL_CALL_RESULT'
  messageId: string
  toolCallId: string
  content: string
  role?: string
}
```

## Human-in-the-Loop (Tool Approval)

Set `requiresApproval: true` to pause execution before a tool runs, emitting an interrupt:

```typescript
const paymentTool: ToolConfig = {
  name: 'process_payment',
  description: 'Process a payment transaction',
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Amount to charge' },
      currency: { type: 'string', enum: ['USD', 'EUR'], default: 'USD' },
    },
    required: ['amount'],
  },
  requiresApproval: true,
  handler: async ({ amount, currency }) => {
    return { success: true, transactionId: 'txn_123' }
  },
}
```

When triggered, the agent emits `RUN_FINISHED` with `outcome: { type: 'interrupt', interrupts: [...] }`. Resume with:

```typescript
const result = await agent.resume('interrupt_abc123', { approved: true })

// Or resume via run with explicit resume entries:
const result = await agent.run('(resumed)', {
  threadId: 'thread-1',
  resume: [{ interruptId: 'int-1', status: 'resolved', payload: { approved: true } }],
})
```

### Interrupt Structure

```typescript
interface Interrupt {
  id: string
  reason: string
  message?: string
  toolCallId?: string
  responseSchema?: unknown
  expiresAt?: string
  metadata?: Record<string, unknown>
}
```

## Delegation Tools

The `Agent` class provides delegation to sub-agents via `createDelegationTool()`:

```typescript
const researcher = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Research topics thoroughly and return findings.',
})

const writer = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Write clear, engaging prose.',
})

// Create a delegation tool on the writer that delegates to the researcher
const researchTool = writer.createDelegationTool(
  'delegate_research',
  'Delegate a research task to the research specialist',
  researcher,
)

writer.addTool(researchTool)
```

When the LLM calls `delegate_research`, the writer delegates the prompt to the researcher and receives the result. Delegation events `AGENT_DELEGATION_START` and `AGENT_DELEGATION_END` are emitted.

## Handoff Tools

Handoff transfers the conversation entirely to another agent (permanent control transfer, not call/return):

```typescript
const handoffTool = writer.createHandoffTool(
  'handoff_to_support',
  'Hand off the conversation to a support specialist',
  supportAgent,
)

writer.addTool(handoffTool)
```

When invoked, the tool emits `AGENT_HANDOFF_REQUEST` and throws a `HandoffRequested` error. The `Agent.run()`/`stream()` methods propagate this error upward. A `MultiAgentManager` catches it, looks up the target agent, copies message history, and continues execution with the target agent in a loop. This enables **cyclic handoff chains** (A → B → C or A → B → A).

### Programmatic Handoff

```typescript
const result = await manager.handoff('agent1', 'agent2', {
  fromAgent: 'agent1',
  toAgent: 'agent2',
  reason: 'Passing to specialist',
  context: { threadId: 'thread-1' },
})
```

The programmatic `handoff()` method runs synchronously and returns the target agent's result.

## Client-Provided Tools

Tools can be injected by the client at runtime via the `clientProvidedTools` config flag and the `clientTools` field in `RunContext`. When enabled, the server forwards tool definitions received from the HTTP request body but marks the handler as a no-op — an interrupt is sent to the client instead. The client receives `HUMAN_INTERVENTION_REQUEST` events, executes the tool locally, and then resumes execution via `client.resume()`.

```typescript
const result = await agent.run('What is my current location?', {
  clientProvidedTools: true,
  clientTools: [
    {
      name: 'get_location',
      description: 'Get the user\'s current geographic location',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ],
})
```

On the client side, listen for `HUMAN_INTERVENTION_REQUEST` events, execute the tool, and resume:

```typescript
agent.events.on('HUMAN_INTERVENTION_REQUEST', async (event) => {
  if (event.toolName === 'get_location') {
    const location = await getUserLocation()
    await client.resume(event.interruptId, { result: location })
  }
})
```

## Multi-AgentManager Tools

For larger orchestrations, use `MultiAgentManager` with automatic handoff tool injection:

```typescript
import { MultiAgentManager } from 'agui-framework'

const manager = new MultiAgentManager()
manager.registerAgent('researcher', researcher, 'Specializes in data analysis and research')
manager.registerAgent('writer', writer, 'Creates well-structured documents and reports')

// Auto-inject handoff_to_writer and handoff_to_researcher tools
manager.registerHandoffTools('researcher')
manager.registerHandoffTools('writer')

// Agents now have handoff tools for each peer with capability-aware descriptions
```

You can also create handoff tools manually:

```typescript
import { createHandoffTool } from 'agui-framework'

const handoffTool = createHandoffTool(
  'handoff_to_writer',
  'Hand off to the writer agent',
  'writer',
  manager,
)

researcher.addTool(handoffTool)
```

### Capability Summary

Generate a human-readable peer list for system prompt injection:

```typescript
const summary = manager.getCapabilitySummary()
// You are part of a team of AI agents. You can hand off tasks to other agents when needed.
// - researcher: Researcher — Specializes in data analysis and research
// - writer: Writer — Creates well-structured documents and reports
// To hand off, use the appropriate handoff_<agent_id> tool with the prompt the target agent needs.
```

## Complete Example

```typescript
import 'dotenv/config'
import { Agent } from 'agui-framework'
import type { ToolConfig } from 'agui-framework'

const calculator: ToolConfig = {
  name: 'calculate',
  description: 'Perform a mathematical calculation',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Math expression (e.g., "2 + 2")' },
    },
    required: ['expression'],
  },
  handler: async ({ expression }) => {
    try {
      const result = Function(`"use strict"; return (${expression})`)()
      return { result }
    } catch (e) {
      return { error: 'Invalid expression' }
    }
  },
}

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Use the calculator tool for math questions.',
  tools: [calculator],
})

const response = await agent.run('What is 123 * 456?')
console.log(response)
```

## Tool Call Flow

```
User: "What's 2 + 2?"
  |
  +-- Agent.run() -> Provider.chatCompletion({ tools: [calculator] })
  |     +-- LLM responds: tool_call -> calculate({"expression":"2 + 2"})
  |
  +-- EventBus.emit(TOOL_CALL_START)
  +-- EventBus.emit(TOOL_CALL_ARGS)
  +-- handler({"expression": "2 + 2"}, context) -> { result: 4 }
  +-- EventBus.emit(TOOL_CALL_END)
  +-- EventBus.emit(TOOL_CALL_RESULT)
  +-- EventBus.emit(USAGE_UPDATE)              // token usage after tool completion
  |
  +-- Second LLM call with tool result -> produces final text
  +-- Returns response to caller
```
