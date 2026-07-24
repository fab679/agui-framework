# React Hooks

AGUI Framework provides React hooks for building agent-powered user interfaces. These hooks are accessed via the `agui-framework/client/react` sub-path export.

## Installation

```bash
npm install agui-framework react
```

Import from:

```typescript
import { useChat, useStream, useThread, useCoAgent, useWebSocket, ... } from "agui-framework/client/react";
```

## useChat

The primary chat hook for building conversational interfaces. Manages threads, streaming messages, agent state, interrupts, tool calls, delegations, and meta events.

```typescript
import { useChat } from "agui-framework/client/react";

function Chat() {
  const {
    messages, sendMessage, isLoading, input, setInput,   // core
    connectionStatus, disconnect, rejoin,                  // detachable streaming
    interrupts, resumeInterrupt,                           // human-in-the-loop
    metaEvents, sendMetaEvent,                             // meta events
    streamingText, streamingReasoning,                     // live streaming state
    streamingToolCalls, streamingDelegations, streamingHandoffs,
    agents, threads, currentThreadId,
    usage, cost, memorySummary, stateData, generatedUI,
    submitGeneratedUI, dismissGeneratedUI,
    loadMessages, createThread, deleteThread, setCurrentThreadId,
  } = useChat({
    agentId: "assistant",
    baseUrl: "http://localhost:4124",
  });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.role}: {msg.content}</div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={send} disabled={isLoading}>Send</button>
    </div>
  );
}
```

### useChat Return Value

| Field | Type | Description |
|-------|------|-------------|
| `agents` | `AgentMeta[]` | List of all available agents |
| `threads` | `ThreadInfo[]` | Threads for the current agent |
| `currentThreadId` | `string?` | Active thread ID |
| `messages` | `ChatMessage[]` | Messages in the active thread |
| `isLoading` | `boolean` | Whether a request is in flight |
| `error` | `string?` | Last error message |
| `connectionStatus` | `'idle' \| 'connected' \| 'disconnected'` | Status of detachable stream |
| `streamingText` | `string` | Text as it streams from the agent |
| `streamingReasoning` | `string` | Chain-of-thought reasoning while streaming |
| `showReasoning` | `boolean` | Whether reasoning is currently emitting |
| `streamingToolCalls` | `ToolCall[]?` | Tool calls as they execute |
| `streamingDelegations` | `Delegation[]?` | Agent delegations while streaming |
| `streamingHandoffs` | `Handoff[]?` | Agent handoffs while streaming |
| `streamingCodeExecs` | `CodeExec[]?` | Code executions while streaming |
| `streamingActivities` | `Activity[]?` | DeepAgent activity snapshots |
| `interrupts` | `InterruptInfo[]` | Pending human-in-the-loop interrupts |
| `usage` | `{ promptTokens, completionTokens, totalTokens }?` | Token usage for last run |
| `cost` | `{ totalCost, inputCost, outputCost, modelId }?` | Cost breakdown |
| `memorySummary` | `string?` | Latest memory summary |
| `stateData` | `Record<string, unknown>` | Agent state snapshots |
| `generatedUI` | `{ spec, toolCallId }?` | Latest generative UI spec |
| `metaEvents` | `MetaEvent[]` | Meta events for the thread |
| `latestCheckpointId` | `string?` | Checkpoint ID from the most recent run — used for branching/`forkFrom` |

| Method | Description |
|--------|-------------|
| `sendMessage(content, opts?)` | Send a user message (optionally with `opts.forkFrom` to fork from a checkpoint) |
| `disconnect()` | Disconnect from stream without cancelling the run |
| `rejoin()` | Rejoin a previously disconnected stream |
| `sendMetaEvent(metaType, payload)` | Emit a meta event (e.g. thumbs_up, tag) |
| `loadMessages(threadId)` | Load messages for a thread |
| `createThread(threadId)` | Create a new thread |
| `deleteThread(threadId)` | Delete a thread |
| `resumeInterrupt(interruptId, approved)` | Approve or deny an interrupt |
| `submitGeneratedUI(formData)` | Submit a generative UI form and send follow-up |
| `dismissGeneratedUI()` | Dismiss the current generative UI |
| `setCurrentThreadId(id)` | Switch active thread |
| `setInterrupts(interrupts)` | Manually set interrupt list |
| `setMessages(messages)` | Manually set messages |

### ChatMessage Type

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique message identifier |
| `role` | `string` | `user`, `assistant`, `system`, `tool`, etc. |
| `content` | `string` | Message text content |
| `agentId` | `string?` | Agent that produced this message |
| `runId` | `string?` | Unique run ID |
| `parentRunId` | `string?` | Parent delegation run ID |
| `parentCheckpointId` | `string?` | Checkpoint this message forked from — used for branching |
| `checkpointId` | `string?` | The run's checkpoint ID that produced this message |
| `toolCalls` | `ToolCall[]?` | Tool calls in this message |
| `reasoning` | `string?` | Chain-of-thought reasoning |
| `delegations` | `Delegation[]?` | Agent delegations |
| `handoffs` | `Handoff[]?` | Agent handoffs |
| `codeExecutions` | `CodeExec[]?` | Code executions |
| `activities` | `Activity[]?` | DeepAgent activity snapshots |

### Generative UI (Dynamic Forms)

When the agent has `generativeUI: true` configured, it can dynamically generate forms by calling the `generateUserInterface` tool. The hook intercepts the tool result and sets `generatedUI` with the form spec.

The spec contains a **JSON Schema** that you render into a form, let the user fill it, and submit back with `submitGeneratedUI`:

```tsx
function GeneratedForm() {
  const { generatedUI, submitGeneratedUI, dismissGeneratedUI, isLoading } = useChat({
    agentId: "assistant",
    baseUrl: "http://localhost:4124",
  });

  if (!generatedUI) return null;

  const { spec } = generatedUI;
  // spec.jsonSchema  → JSON Schema describing the fields
  // spec.uiSchema    → optional UI hints (layout, order, etc.)
  // spec.initialData → pre-populated default values

  const [formData, setFormData] = useState(spec.initialData || {});

  const handleSubmit = () => {
    submitGeneratedUI(formData);
  };

  return (
    <div className="generated-form">
      <h3>{spec.jsonSchema.title || "Form"}</h3>
      <p>{spec.jsonSchema.description}</p>
      {Object.entries(spec.jsonSchema.properties || {}).map(([key, prop]: any) => (
        <label key={key}>
          {prop.title || key}:
          {prop.type === "boolean" ? (
            <input
              type="checkbox"
              checked={!!formData[key]}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
            />
          ) : prop.type === "number" ? (
            <input
              type="number"
              value={formData[key] ?? ""}
              onChange={(e) => setFormData({ ...formData, [key]: Number(e.target.value) })}
            />
          ) : (
            <input
              value={formData[key] ?? ""}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
            />
          )}
        </label>
      ))}
      <div className="form-actions">
        <button onClick={handleSubmit} disabled={isLoading}>Submit</button>
        <button onClick={dismissGeneratedUI}>Dismiss</button>
      </div>
    </div>
  );
}
```

The flow:
1. Agent decides it needs structured input → calls `generateUserInterface` tool
2. LLM generates a JSON Schema describing the required fields
3. `useChat` sets `generatedUI` with `{ spec: { jsonSchema, uiSchema, initialData }, toolCallId }`
4. Your UI renders a form from `spec.jsonSchema.properties`
5. User fills it → `submitGeneratedUI(formData)` sends the data back as `[Form submitted] User submitted form data: ...`
6. Agent receives the data and continues

### Passing Custom Context

When sending a message, the `opts` object on `sendMessage()` forwards extra keys to the server, making them available to tool handlers via `context.metadata`:

```typescript
sendMessage("Analyze this", {
  model: "gpt-4o",
  metadata: { tenant: "acme-corp", role: "admin" },  // forwarded to tool handlers
});
```

Tool handlers on the server receive:
- `context.userId` — caller identity
- `context.threadId` — current thread
- `context.agentId` — running agent
- `context.metadata` — custom data from the client

### Branching Chat (Fork from Checkpoint)

Each run produces a unique `checkpointId`. Every message stores the `parentCheckpointId` — the checkpoint its run forked from. To edit a previous user message or regenerate an AI response, pass `forkFrom` to `sendMessage`:

```typescript
// Edit a message — get its parentCheckpointId and fork from there
function handleEdit(msg: ChatMessage, newText: string) {
  sendMessage(newText, {
    forkFrom: { checkpointId: msg.parentCheckpointId! },
  });
}

// Regenerate an AI response — fork from its checkpoint
function handleRegenerate(msg: ChatMessage) {
  sendMessage("", {
    forkFrom: { checkpointId: msg.parentCheckpointId! },
  });
}
```

When forking, the hook trims messages after the fork point and the server replays the thread from that checkpoint. Use `latestCheckpointId` from the hook return value to track the active checkpoint after each run.

### Join / Rejoin (Detachable Streaming)

`useChat` uses `streamDetached()` internally, which allows disconnecting without cancelling the agent run:

```typescript
// Disconnect — agent keeps running on the server
disconnect();
// connectionStatus → 'disconnected'

// Rejoin to resume receiving events
await rejoin();
```

The active thread ID is persisted to `sessionStorage` so rejoining survives page refreshes.

### Meta Events

Meta events let the client attach non-conversational data to a thread:

```typescript
// Send feedback or context
sendMetaEvent("thumbs_up", { rating: 5 });

sendMetaEvent("note", { text: "User requested a follow-up" });

sendMetaEvent("tag", { tags: ["bug", "urgent"] });

// Meta events are available via the metaEvents array
```

## useStream

Stream agent responses token by token with imperative start/stop controls:

```typescript
import { useStream } from "agui-framework/client/react";

function StreamingChat() {
  const { start, stop, isLoading, error, result } = useStream();

  const handleSend = () => {
    start("Tell me a story", {
      baseUrl: "http://localhost:4124",
      agentId: "assistant",
      onChunk: (delta) => console.log("token:", delta),
      onInterrupt: (interrupt) => console.log("interrupt:", interrupt),
      onComplete: (text) => console.log("done:", text),
    });
  };
}
```

## useThread

Manage conversation threads:

```typescript
import { useThread } from "agui-framework/client/react";

function ThreadManager() {
  const {
    threads, messages, loadMessages, createThread, deleteThread,
    currentThreadId, loading, error, setCurrentThreadId,
  } = useThread({
    baseUrl: "http://localhost:4124",
  });
}
```

## useInterrupts

Handle human-in-the-loop interrupts without an HTTP dependency:

```typescript
import { useInterrupts } from "agui-framework/client/react";

function InterruptHandler() {
  const { interrupts, handleInterrupt, resolve, clear } = useInterrupts();

  // handleInterrupt — add a new interrupt to the list
  // resolve(id, payload?, status?) — remove and return resolution
  // clear — clear all interrupts
}
```

## useCoAgent

Collaborative agent with shared state, client-side tools, and event handling:

```typescript
import { useCoAgent } from "agui-framework/client/react";

function CollaborativeAgent() {
  const {
    messages, state, isLoading, error,
    intervention, feedback, codeExecution, usage,
    sendMessage, resume, registerTool, client, threadId,
  } = useCoAgent({
    agentId: "assistant",
    baseUrl: "http://localhost:4124",
    tools: [{ name: "get_weather", description: "...", parameters: {...}, handler: async (args) => {...} }],
  });
}
```

## useCoAction

Define a client-side tool action with execute/reset lifecycle:

```typescript
import { useCoAction } from "agui-framework/client/react";

function WeatherAction() {
  const { execute, result, error, pendingCall, reset } = useCoAction({
    name: "get_weather",
    description: "Get current weather",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
    handler: async ({ city }) => {
      const res = await fetch(`/api/weather?city=${city}`);
      return res.json();
    },
  });
}
```

## useWebSocket

Real-time WebSocket communication:

```typescript
import { useWebSocket } from "agui-framework/client/react";

function RealtimeAgent() {
  const { connected, caps, connect, disconnect, on, off, run, resume } = useWebSocket(
    "http://localhost:4124",
    "assistant",
  );
}
```

## useAgentState

Read and write agent shared state:

```typescript
import { useAgentState } from "agui-framework/client/react";

function AgentStateManager() {
  const { state, setState, deleteState, loading, error, refetch } =
    useAgentState("assistant", "http://localhost:4124");

  // setState(key, value) — set a key
  // deleteState(key) — delete a key
  // refetch() — reload state from server
}
```

## useLiveState

Poll the live execution state of an agent (status, pending interrupts, state snapshot, usage/cost):

```typescript
import { useLiveState } from "agui-framework/client/react";

function LiveMonitor({ agentId, baseUrl, threadId }) {
  const { state, loading, error, refetch, startPolling } = useLiveState(agentId, baseUrl, threadId);

  useEffect(() => {
    const stop = startPolling(2000); // poll every 2s
    return stop;
  }, []);

  return <div>Status: {state?.status}</div>;
}
```

## useRunningAgents

List all currently running agents on the server:

```typescript
import { useRunningAgents } from "agui-framework/client/react";

const { agents, loading, error, refetch } = useRunningAgents("http://localhost:4124");
```

## useGeneratedUI

Low-level hook for handling generative UI outside of `useChat`. Call `handleToolResult` when you receive a `TOOL_CALL_RESULT` event from a stream, then render the form from `uiState.spec`:

```tsx
import { useGeneratedUI } from "agui-framework/client/react";

function DynamicForm() {
  const { uiState, formData, setFormData, handleToolResult, clearUI } = useGeneratedUI();

  // Call this when you receive a TOOL_CALL_RESULT event
  // handleToolResult("generateUserInterface", JSON.stringify(jsonSpec));

  if (!uiState.spec) return <p>No form to display</p>;

  const { jsonSchema } = uiState.spec;

  return (
    <div>
      <h3>{jsonSchema.title || "Generated Form"}</h3>
      {Object.entries(jsonSchema.properties || {}).map(([key, prop]: any) => (
        <label key={key}>
          {prop.title || key}:
          <input
            value={formData[key] ?? ""}
            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
          />
        </label>
      ))}
      <button onClick={() => { console.log("Submitted:", formData); clearUI(); }}>
        Submit
      </button>
      <button onClick={clearUI}>Dismiss</button>
    </div>
  );
}
```

This hook is useful with `useStream` or manual SSE handling. When using `useChat`, prefer the built-in `generatedUI` / `submitGeneratedUI` / `dismissGeneratedUI` API instead.

## useResume

Resume an interrupted agent run:

```typescript
import { useResume } from "agui-framework/client/react";

const { resume } = useResume("http://localhost:4124", "assistant");
// await resume(interruptId, payload, 'resolved', { threadId: '...' })
```

## useModels

Query the model catalog:

```typescript
import { useModels, useModel, useModelsByProvider } from "agui-framework/client/react";

const { models, loading, error, refetch } = useModels("http://localhost:4124");
const { model } = useModel("http://localhost:4124", "gpt-4o");
const { models: fwModels } = useModelsByProvider("http://localhost:4124", "fireworks");
```

## useThreadRuns / useThreadStats

Run history and cost statistics for a thread:

```typescript
const { runs, loading, error } = useThreadRuns("http://localhost:4124", "thread-123");
const { stats, loading, error } = useThreadStats("http://localhost:4124", "thread-123");
```

## useAgents / useAgent / useCapabilities

```typescript
const { agents } = useAgents("http://localhost:4124");
const { meta } = useAgent("assistant", "http://localhost:4124");
const { caps } = useCapabilities("assistant", "http://localhost:4124");
```

## useAguiClient

Access the underlying memoized `AguiClient` instance:

```typescript
const client = useAguiClient("http://localhost:4124");
```

## All Hooks

| Hook | Description |
|------|-------------|
| `useChat` | Full conversational chat (threads, streaming, interrupts, meta events, GAI) |
| `useStream` | Token-by-token streaming with imperative start/stop |
| `useThread` | Thread CRUD and message management |
| `useInterrupts` | Client-side interrupt queue (no HTTP dependency) |
| `useCoAgent` | Collaborative agent with shared state and client-side tools |
| `useCoAction` | Tool action definition with execute/reset lifecycle |
| `useAgentState` | Agent shared state (get/set/delete keys) |
| `useCapabilities` | Agent capability discovery |
| `useAgent` | Single agent metadata |
| `useAgents` | All registered agents |
| `useWebSocket` | WebSocket real-time communication |
| `useModels` | Model catalog listing |
| `useModel` | Single model details |
| `useModelsByProvider` | Models filtered by provider |
| `useThreadRuns` | Thread run history with usage/cost |
| `useThreadStats` | Thread cost and run count |
| `useResume` | Resume interrupted executions |
| `useLiveState` | Live agent execution state (polling) |
| `useRunningAgents` | Currently running agents |
| `useGeneratedUI` | Generative UI from tool results |
| `useAguiClient` | Access the underlying memoized AguiClient |
