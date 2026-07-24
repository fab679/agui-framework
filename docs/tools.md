# Tools

Tools allow agents to interact with external systems, perform computations, and trigger side effects. The AGUI Framework supports multiple tool patterns including direct handlers, delegation, handoff, and interrupt-based approval flows.

## ToolConfig

Every tool is defined by a `ToolConfig`:

```typescript
import type { ToolConfig } from "agui-framework";

const weatherTool: ToolConfig = {
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
      units: { type: "string", enum: ["celsius", "fahrenheit"] },
    },
    required: ["city"],
  },
  handler: async ({ city, units }, context) => {
    // context.userId    → identity of the caller (from server resolveIdentity)
    // context.threadId  → current conversation thread
    // context.agentId   → which agent is running
    // context.runId     → unique run identifier
    // context.metadata  → custom data passed at runtime
    // context.signal    → AbortSignal for cancellation
    const temperature = units === "fahrenheit" ? 72 : 22;
    return { city, temperature, conditions: "sunny" };
  },
};
```

### Handler Signature

Every tool handler receives **two arguments**:

```typescript
handler: (
  args: Record<string, unknown>,         // Tool arguments from the LLM
  context: RunContext                     // Runtime context for the current run
) => Promise<unknown>
```

### RunContext

The `RunContext` interface provides full visibility into the current execution:

| Field | Type | Description |
|-------|------|-------------|
| `threadId` | `string` | Current conversation thread |
| `runId` | `string` | Unique run identifier |
| `parentRunId` | `string?` | Run ID of the delegating parent agent |
| `agentId` | `string?` | ID of the agent executing this run |
| `userId` | `string?` | Caller identity (resolved by server's `resolveIdentity` or falls back to IP) |
| `metadata` | `Record<string, unknown>?` | Arbitrary custom data passed at runtime |
| `signal` | `AbortSignal?` | Cancels provider I/O on client disconnect |
| `modelSettings` | `Record<string, unknown>?` | Model configuration overrides |
| `capabilities` | `string[]?` | Agent's capability strings |
| `deps` | `unknown?` | Shared dependency container |
| `clientTools` | `ToolConfig[]?` | Client-provided tools injected at runtime |
| `outputFormat` | `string?` | Requested output MIME type |
| `feedback` | `object?` | Human feedback for the current run |
| `resume` | `ResumeEntry[]?` | Pending resume entries for interrupted tools |

### Passing Custom Context

When calling `agent.run()` or `agent.stream()`, any extra keys you pass in the context object flow through to the tool handler:

```typescript
// From the server or direct agent usage
const context = {
  threadId: 'thread-123',
  userId: 'user_789',
  agentId: 'my-agent',
  metadata: { role: 'admin', tenant: 'acme-corp', requestId: 'req_001' },
};
await agent.run('Analyze this data', context);

// In your tool handler:
handler: async (args, context) => {
  context.metadata?.role      // 'admin'
  context.metadata?.tenant    // 'acme-corp'
}
```

### Handler Return Values

Handlers can return:
- An object (serialized to JSON for the LLM)
- A string (used directly)
- A value resolved from an interrupt payload

## Adding Tools

```typescript
const agent = new Agent({
  ...config,
  tools: [weatherTool, searchTool],
});

// Or add after construction
agent.addTool(anotherTool);
```

## Interrupts

Tools can interrupt execution for human approval:

```typescript
const approvalTool: ToolConfig = {
  name: "send_email",
  description: "Send an email",
  parameters: { ... },
  handler: async (args) => {
    // Execution pauses here until resume() is called
    return { interrupt: true, data: args };
  },
};

// Resume with approval
await agent.resume(interruptId, { approved: true }, "resolved");
```

## Delegation

Delegate work to a sub-agent:

```typescript
import { Agent } from "agui-framework";

const subAgent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a data analyst.",
});

const mainAgent = new Agent({
  ...config,
  tools: [mainAgent.createDelegationTool(
    "analyze_data",
    "Delegate data analysis to the analyst agent",
    subAgent,
  )],
});
```

## Handoff

Transfer control to another agent:

```typescript
const handoffTool = mainAgent.createHandoffTool(
  "escalate",
  "Escalate to senior support agent",
  seniorAgent,
);
```

Handoffs throw a `HandoffRequested` error that the runtime catches to transfer execution to the target agent.

## Shared State Access from Tools

Tools can read and write shared state when the agent has `sharedState` configured:

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  sharedState: { userProfile: {}, analytics: {} },
  tools: [{
    name: "update_profile",
    description: "Update the user's profile",
    parameters: { ... },
    handler: async ({ key, value }, context) => {
      // Read shared state
      const profile = agent.sharedState.get('userProfile');

      // Write shared state
      agent.sharedState.set('userProfile', { ...profile, [key]: value });

      // Using StateManager for thread-scoped state
      const stateManager = agent.stateManager;
      const threadData = await stateManager.get(context.threadId);
      await stateManager.set(context.threadId, { ...threadData, lastAction: key });

      return { success: true };
    },
  }],
});
```

> **Note:** When `sharedState` is configured, the agent auto-registers state management tools (`get_state`, `set_state`, `delete_state`, `list_state` keys) accessible to the LLM. See [State Management](state-management.md) for details.

## Filtering Tools

Use middleware to restrict which tools are available:

```typescript
import { createFilterToolCallsMiddleware } from "agui-framework";

agent.use(createFilterToolCallsMiddleware({
  allowedTools: ["get_weather", "web_search"],
}));
```

## MCP Tools

Tools can also come from MCP servers:

```typescript
const agent = new Agent({
  ...config,
  mcpServers: [
    { transport: "stdio", command: "node", args: ["mcp-server.js"] },
  ],
});

// MCP tools are auto-discovered and merged
const allTools = agent.getTools();
```

## Tool Execution Flow

1. LLM decides to call a tool
2. `TOOL_CALL_START` event emitted
3. Tool parameters are validated
4. `TOOL_CALL_ARGS` event emitted with the arguments
5. Handler is executed
6. `TOOL_CALL_RESULT` event emitted with the result
7. Result is returned to the LLM for continuation

## API Reference

### `ToolConfig`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique tool name |
| `description` | `string` | Description for the LLM |
| `parameters` | `JSONSchema` | JSON Schema for tool arguments |
| `handler` | `(args, context: RunContext) => Promise<any>` | Handler function receiving args + runtime context |
| `interrupt` | `boolean` | Whether tool requires interruption |
