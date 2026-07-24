# Generative User Interfaces (GAI)

AI-generated interfaces without custom tool renderers.

## Overview

Generative User Interfaces (GAI) allow agents to dynamically generate forms, wizards, dashboards, and other interactive UI components at runtime — without requiring a programmer to pre-define custom tool renderers. The agent describes *what* UI it needs, and the framework generates the rendering specification automatically.

This capability is built on top of the existing tool-calling infrastructure. When enabled, the agent gains a `generateUserInterface` tool that it can call to produce interactive UIs on the fly.

## How It Works

The GAI flow follows a two-step generation process:

```
Agent needs UI
       │
       ▼
Step 1: What?
Agent calls generateUserInterface(description, data, output)
       │
       ▼
Step 2: How?
Secondary generator (LLM) builds actual UI spec
(JSON Schema + uiSchema + initialData)
       │
       ▼
Client renders the generated UI
       │
       ▼
User fills and submits form
       │
       ▼
Validated user input returned to Agent
```

### Step 1: The Agent Describes What It Needs

The agent calls the `generateUserInterface` tool with three arguments:

- **description**: A high-level description of the UI (e.g., "A form for entering the user's shipping address")
- **data**: Optional pre-populated data for the form fields
- **output**: A JSON Schema describing the data the agent expects the user to submit

### Step 2: The Framework Generates the UI

The tool handler sends the description and output schema to an LLM, which returns a structured UI specification containing:

- **jsonSchema**: A JSON Schema describing the form fields
- **uiSchema**: A layout specification (using JSON Forms pattern)
- **initialData**: Pre-populated values

### Client Rendering

The client intercepts the `TOOL_CALL_RESULT` event, parses the UI spec, and renders an interactive form. When the user submits, the form data is sent back to the agent as a new message.

## Enabling GAI

Add `generativeUI: true` to your agent configuration:

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant. Generate UIs when you need structured input.",
  generativeUI: true,  // enables the generateUserInterface tool
});
```

## Custom Generator Configuration

For more control, pass a configuration object:

```typescript
const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant.",
  generativeUI: {
    // Use a different model for UI generation (defaults to agent's model)
    generatorModel: "gpt-4o-mini",
    // Custom instructions for the UI generator
    generatorInstructions: "You generate simple, clean forms using JSON Schema.",
  },
});
```

### Custom Generator Function

You can provide a completely custom UI generator:

```typescript
import { Agent, createGenerateUITool } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "Generate UIs for structured data collection.",
  generativeUI: {
    customGenerator: async (args) => {
      // args.description, args.data, args.output
      return {
        jsonSchema: {
          type: "object",
          title: args.description,
          properties: {
            name: { type: "string", title: "Full Name" },
          },
          required: ["name"],
        },
        uiSchema: {
          type: "VerticalLayout",
          elements: [
            { type: "Control", scope: "#/properties/name" },
          ],
        },
        initialData: args.data || {},
      };
    },
  },
});
```

## Example: Address Collection Form

Here's a complete example showing how an agent generates an address form:

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: `You are a shipping assistant. 
When you need the user's address, call generateUserInterface 
with a clear description and complete output schema.
After receiving the form data, confirm the address.`,
  generativeUI: true,
});

const response = await agent.run(
  "I need to ship a package. Please ask the user for their shipping address."
);
```

## Example: Client-Side Rendering with React

When the agent has `generativeUI: true` configured, it can dynamically generate forms by calling the `generateUserInterface` tool. The `useChat` hook intercepts the tool result and sets `generatedUI` with the form spec.

The spec contains a **JSON Schema** — you render it into a form, let the user fill it, and submit back with `submitGeneratedUI`:

```tsx
import { useChat } from "agui-framework/client/react";

function ChatWithForms() {
  const {
    messages, sendMessage, isLoading,
    generatedUI, submitGeneratedUI, dismissGeneratedUI,
  } = useChat({
    baseUrl: "http://localhost:4124",
    agentId: "shipping-agent",
  });

  return (
    <div>
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>{msg.content}</div>
        ))}
      </div>

      {/* Generated UI form — rendered from JSON Schema */}
      {generatedUI && <GeneratedForm
        spec={generatedUI.spec}
        onSubmit={submitGeneratedUI}
        onDismiss={dismissGeneratedUI}
        disabled={isLoading}
      />}

      <input
        type="text"
        onKeyDown={(e) => {
          if (e.key === "Enter") { sendMessage(e.currentTarget.value); e.currentTarget.value = ""; }
        }}
      />
    </div>
  );
}

// Renders a dynamic form from a JSON Schema spec
function GeneratedForm({ spec, onSubmit, onDismiss, disabled }) {
  // spec.jsonSchema  → JSON Schema describing the fields
  // spec.uiSchema    → optional UI hints (layout, order)
  // spec.initialData → pre-populated default values
  const [formData, setFormData] = React.useState(spec.initialData || {});

  return (
    <div className="generated-form">
      <h3>{spec.jsonSchema.title || "Form"}</h3>
      <p>{spec.jsonSchema.description}</p>
      {Object.entries(spec.jsonSchema.properties || {}).map(([key, prop]: any) => (
        <label key={key}>
          {prop.title || key}:
          {prop.type === "boolean" ? (
            <input type="checkbox" checked={!!formData[key]}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })} />
          ) : prop.type === "number" ? (
            <input type="number" value={formData[key] ?? ""}
              onChange={(e) => setFormData({ ...formData, [key]: Number(e.target.value) })} />
          ) : prop.enum ? (
            <select value={formData[key] ?? ""}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}>
              <option value="">--</option>
              {prop.enum.map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input value={formData[key] ?? ""}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.value })} />
          )}
        </label>
      ))}
      <div className="form-actions">
        <button onClick={() => onSubmit(formData)} disabled={disabled}>Submit</button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}
```

The full flow:
1. Agent decides it needs structured input → calls `generateUserInterface` tool
2. LLM generates a JSON Schema describing the required fields
3. `useChat` sets `generatedUI` with `{ spec: { jsonSchema, uiSchema, initialData }, toolCallId }`
4. Your UI renders a form from `spec.jsonSchema.properties`
5. User fills it → `submitGeneratedUI(formData)` sends the data back as a `[Form submitted]` message
6. Agent receives the data and continues

### Using `useGeneratedUI` Separately

For manual scenarios (e.g. with `useStream` instead of `useChat`), call `handleToolResult` when you receive a `TOOL_CALL_RESULT` event, then render from `uiState.spec`:

```tsx
import { useGeneratedUI, useStream } from "agui-framework/client/react";

function GeneratedFormExample() {
  const { start, isLoading } = useStream();
  const { uiState, formData, setFormData, handleToolResult, clearUI } = useGeneratedUI();

  const handleRun = async () => {
    await start("I need your shipping address.", {
      baseUrl: "http://localhost:4124",
      agentId: "assistant",
      onEvent: (event) => {
        if (event.type === "TOOL_CALL_RESULT") {
          handleToolResult("generateUserInterface", event.content);
        }
      },
    });
  };

  if (!uiState.spec) {
    return <button onClick={handleRun} disabled={isLoading}>Start</button>;
  }

  const { jsonSchema } = uiState.spec;

  return (
    <form>
      <h3>{jsonSchema.title || uiState.description}</h3>
      {Object.entries(jsonSchema.properties || {}).map(([key, prop]: any) => (
        <label key={key}>
          {prop.title || key}:
          <input
            value={formData[key] ?? ""}
            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
          />
        </label>
      ))}
      <button onClick={clearUI}>Submit</button>
    </form>
  );
}
```

## API Reference

### `AgentConfig.generativeUI`

| Type | Default | Description |
|------|---------|-------------|
| `boolean \| GenerativeUIConfig` | `false` | Enables the `generateUserInterface` tool on the agent. |

### `GenerativeUIConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `generatorModel` | `string` | Agent's model | Model used for UI spec generation |
| `generatorInstructions` | `string` | Built-in prompt | Custom system prompt for the generator |
| `generatorApiKey` | `string` | Agent's API key | API key for the generator model |
| `customGenerator` | `(args: GenerateUIArgs) => Promise<UISpec>` | — | Complete custom generator function |

### `GenerateUIArgs`

| Property | Type | Description |
|----------|------|-------------|
| `description` | `string` | High-level description of the UI |
| `data` | `Record<string, unknown>` | Pre-populated data (optional) |
| `output` | `Record<string, unknown>` | JSON Schema of expected output |

### `UISpec`

| Property | Type | Description |
|----------|------|-------------|
| `jsonSchema` | `Record<string, unknown>` | JSON Schema describing form fields |
| `uiSchema` | `Record<string, unknown>` | Layout specification (JSON Forms pattern) |
| `initialData` | `Record<string, unknown>` | Pre-populated values |

### `createGenerateUITool(provider, config?)`

Creates a `ToolConfig` for generative UI. Used internally by the Agent when `generativeUI` is enabled, but available for custom agent setups.

### React Hooks

#### `useGeneratedUI()`

| Return | Type | Description |
|--------|------|-------------|
| `uiState` | `{ spec: UISpec \| null, description: string }` | Current UI spec |
| `formData` | `Record<string, unknown>` | Current form data |
| `setFormData` | `(data: Record<string, unknown>) => void` | Update form data |
| `handleToolResult` | `(toolCallName: string, content: string) => void` | Handle TOOL_CALL_RESULT event |
| `clearUI` | `() => void` | Clear the UI |

#### `useChat()` additional returns

When using `useChat`, the following GAI-related values are available:

| Return | Type | Description |
|--------|------|-------------|
| `generatedUI` | `{ spec: Record<string, unknown>; toolCallId: string } \| null` | Current generated UI spec |
| `submitGeneratedUI` | `(data: Record<string, unknown>) => Promise<void>` | Submit form data back to agent |
| `dismissGeneratedUI` | `() => void` | Dismiss the generated UI |

## Use Cases

### Dynamic Forms
Agents can generate forms on-the-fly based on conversation context without pre-defined schemas.

### Data Visualization
Generate structured data collection interfaces appropriate to the data being discussed.

### Interactive Workflows
Create multi-step wizards or guided processes tailored to user needs.

### Adaptive Interfaces
Generate different form layouts based on user preferences or device capabilities.

## Limitations

- **Tool Description Length**: OpenAI enforces a limit of 1024 characters for tool descriptions
- **Arguments JSON Schema**: Classes, nesting, `$ref`, and `oneOf` are not reliably supported across all LLM providers
- **Context Window**: Injecting a large UI description into an agent may reduce performance. Dedicated UI generation agents perform better than agents combining UI generation with other tasks
- **Security**: Generated UI schemas are rendered as-is. Validate or sanitize schemas in production environments

## Architecture

The GAI feature is implemented in three layers:

1. **Agent Tool Layer** (`src/generative-ui/index.ts`): Creates the `generateUserInterface` ToolConfig, injected into the agent when `generativeUI` is enabled. After generating the UI spec, it stores it in the thread's `SharedState` under the `__generatedUI` key, making it accessible across page reloads and within the thread's lifecycle.

2. **Generator Layer** (`src/generative-ui/generator.ts`): Calls an LLM (or custom function) to produce a UI spec from the agent's description.

3. **Client Layer** (`src/client/react.ts`): `useGeneratedUI` hook intercepts tool results and provides rendering state; `useChat` integrates it into the standard chat flow. On thread load (`loadMessages`), the client scans message history for unreplied `generateUserInterface` tool calls and recovers the UI spec — surviving page reloads and thread switches.

## Thread Lifecycle

Generated UIs are tracked per-thread through two mechanisms:

| Mechanism | Description | Survives page reload? |
|-----------|-------------|----------------------|
| **Thread SharedState** (`__generatedUI`) | The tool handler stores the UI spec in the thread's `StateManager` under a reserved key | Yes (while the server process lives) |
| **Message history recovery** | On thread load, the client scans messages for unreplied `generateUserInterface` tool results by checking if a `[Form submitted]` user message exists after the tool call | Yes (persisted in thread store) |

When the user switches threads, any pending generated UI is cleared. When they return to a thread, the system checks:
1. Is there an assistant message with a `generateUserInterface` tool call?
2. Does the tool call have a result (the UI spec)?
3. Is there a `[Form submitted]` user message after the tool call?
4. If no such user message exists → the UI spec is recovered and re-rendered

On form submission (`submitGeneratedUI`), the spec is cleared from state and a `[Form submitted]` message is sent to the agent. On dismissal (`dismissGeneratedUI`), the spec is removed from state without notifying the agent.