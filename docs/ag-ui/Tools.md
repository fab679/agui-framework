# AG-UI Tool Implementation

Tools in agui-framework enable AI agents to interact with external systems and incorporate human judgment into their workflows. The framework supports both backend-defined tools and the AG-UI protocol for tool calling.

## Tool Structure

Tools follow a consistent structure that defines their name, purpose, and expected parameters:

```typescript
interface ToolConfig {
  name: string                              // Unique identifier for the tool
  description: string                       // Human-readable explanation
  parameters: ToolParameters                 // JSON Schema for arguments
  requiresApproval?: boolean                 // Human-in-the-loop flag
  handler: (args: Record<string, unknown>, context: RunContext) => Promise<unknown>
}

interface ToolParameters {
  type: 'object'
  properties?: Record<string, ParameterSpec>
  required?: string[]
  additionalProperties?: boolean
}

interface ParameterSpec {
  type: string
  description?: string
  enum?: string[]
  default?: unknown
  items?: unknown
  pattern?: string
  minimum?: number
  maximum?: number
}
```

## Tool Call Lifecycle

When an agent needs to use a tool, it follows a standardized sequence of events conforming to the AG-UI protocol:

```typescript
// 1. Tool call start
yield {
  type: 'TOOL_CALL_START',
  toolCallId: 'tool-123',
  toolCallName: 'get_weather',
  parentMessageId: 'msg-456',
}

// 2. Stream arguments
yield { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-123', delta: '{"cit' }
yield { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-123', delta: 'y":"Paris"}' }

// 3. Tool call end
yield { type: 'TOOL_CALL_END', toolCallId: 'tool-123' }

// 4. After handler execution, tool result
yield {
  type: 'TOOL_CALL_RESULT',
  messageId: 'result-1',
  toolCallId: 'tool-123',
  content: '{"temperature": 22, "conditions": "sunny"}',
}
```

### Event Interfaces

```typescript
interface ToolCallStartEvent {
  type: 'TOOL_CALL_START'
  toolCallId: string
  toolCallName: string
  parentMessageId?: string
}

interface ToolCallArgsEvent {
  type: 'TOOL_CALL_ARGS'
  toolCallId: string
  delta: string
}

interface ToolCallEndEvent {
  type: 'TOOL_CALL_END'
  toolCallId: string
}

interface ToolCallResultEvent {
  type: 'TOOL_CALL_RESULT'
  messageId: string
  toolCallId: string
  content: string
  role?: string
}
```

## Backend-Defined Tools

Tools are defined in the backend and passed to the agent during construction or at runtime:

```typescript
import { Agent } from 'agui-framework'
import type { ToolConfig } from 'agui-framework'

const weatherTool: ToolConfig = {
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  },
  handler: async ({ city }) => {
    return { city, temperature: 22, conditions: 'sunny' }
  },
}

// Add at construction
const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Use tools when needed.',
  tools: [weatherTool],
})

// Or add at runtime
agent.addTool(anotherTool)
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

When triggered, the agent emits `RUN_FINISHED` with `outcome: { type: 'interrupt', interrupts: [...] }`.

### Resume with Approval

```typescript
const result = await agent.resume('interrupt_abc123', { approved: true })
```

## Delegation Tools

Tools that delegate to sub-agents follow the AG-UI multi-agent event pattern:

```typescript
const researcher = new Agent({
  model: 'gpt-4o', provider: 'openai',
  instructions: 'Research topics thoroughly.',
})

const writer = new Agent({
  model: 'gpt-4o', provider: 'openai',
  instructions: 'Write clear prose.',
})

// Creates a backend tool that delegates to researcher
const researchTool = writer.createDelegationTool(
  'delegate_research',
  'Delegate a research task to the specialist',
  researcher,
)

writer.addTool(researchTool)
```

Events emitted on delegation:

```typescript
{ type: 'AGENT_DELEGATION_START', parentAgent, childAgent, input }
{ type: 'AGENT_DELEGATION_END', parentAgent, childAgent, result }
```

## Handoff Tools

Handoff transfers the entire conversation to another agent:

```typescript
const handoffTool = writer.createHandoffTool(
  'handoff_to_support',
  'Hand off to a support specialist',
  supportAgent,
)

writer.addTool(handoffTool)
```

Events emitted on handoff:

```typescript
{ type: 'AGENT_HANDOFF_REQUEST', fromAgent, toAgent, reason }
{ type: 'AGENT_HANDOFF_RESULT', fromAgent, toAgent, result }
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
  |
  +-- Second LLM call with tool result -> produces final text
  +-- Returns response to caller
```

## Best Practices

- Clear naming -- Use descriptive, action-oriented names for tools
- Detailed descriptions -- Include thorough descriptions to help the LLM understand when and how to use each tool
- Structured parameters -- Define precise parameter schemas with descriptive field names and constraints
- Required fields -- Only mark parameters as required if they are truly necessary
- Error handling -- Implement robust error handling in tool execution code
- Use `requiresApproval` for sensitive operations -- Always flag payment, deletion, or modification tools for human approval
