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
  handler: async ({ city, units }) => {
    const temperature = units === "fahrenheit" ? 72 : 22;
    return { city, temperature, conditions: "sunny" };
  },
};
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
| `handler` | `(args) => Promise<any>` | Handler function |
| `interrupt` | `boolean` | Whether tool requires interruption |
