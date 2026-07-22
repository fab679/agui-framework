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

The primary chat hook for building conversational interfaces:

```typescript
import { useChat } from "agui-framework/client/react";

function Chat() {
  const { messages, input, setInput, send, isLoading } = useChat({
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

## useStream

Stream agent responses token by token:

```typescript
import { useStream } from "agui-framework/client/react";

function StreamingChat() {
  const { start, stop, isLoading, error, result } = useStream();

  const handleSend = () => {
    start("assistant", {
      prompt: "Tell me a story",
      baseUrl: "http://localhost:4124",
    });
  };

  return (
    <div>
      <p>{result}</p>
      <button onClick={handleSend} disabled={isLoading}>
        {isLoading ? "Streaming..." : "Start"}
      </button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}
```

## useThread

Manage conversation threads:

```typescript
import { useThread } from "agui-framework/client/react";

function ThreadManager() {
  const {
    threads,
    messages,
    loadMessages,
    createThread,
    currentThreadId,
  } = useThread({
    baseUrl: "http://localhost:4124",
    agentId: "assistant",
  });

  return (
    <div>
      <select onChange={(e) => loadMessages(e.target.value)}>
        {threads.map((t) => (
          <option key={t.id} value={t.id}>{t.id}</option>
        ))}
      </select>
      <button onClick={() => createThread({ metadata: { topic: "general" } })}>
        New Thread
      </button>
      <div>
        {messages.map((m, i) => (
          <p key={i}><strong>{m.role}:</strong> {m.content}</p>
        ))}
      </div>
    </div>
  );
}
```

## useInterrupts

Handle human-in-the-loop interrupts:

```typescript
import { useInterrupts } from "agui-framework/client/react";

function InterruptHandler() {
  const { interrupts, handleInterrupt, resolve, clear } = useInterrupts({
    baseUrl: "http://localhost:4124",
    agentId: "assistant",
  });

  return (
    <div>
      {interrupts.map((interrupt) => (
        <div key={interrupt.id}>
          <p>Action required: {interrupt.prompt}</p>
          <button onClick={() => resolve(interrupt.id, { approved: true })}>
            Approve
          </button>
          <button onClick={() => resolve(interrupt.id, { approved: false })}>
            Deny
          </button>
        </div>
      ))}
    </div>
  );
}
```

## useCoAgent

Collaborative agent with shared state:

```typescript
import { useCoAgent } from "agui-framework/client/react";

function CollaborativeAgent() {
  const { state, setState, running, error } = useCoAgent({
    agentId: "assistant",
    baseUrl: "http://localhost:4124",
    initialState: { theme: "light" },
  });

  return (
    <div>
      <p>Current theme: {state?.theme}</p>
      <button onClick={() => setState({ theme: "dark" })}>
        Switch to Dark
      </button>
    </div>
  );
}
```

## useCoAction

Define and use tool actions:

```typescript
import { useCoAction } from "agui-framework/client/react";

function WeatherAction() {
  const { execute, result, loading } = useCoAction({
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

  return (
    <button onClick={() => execute({ city: "Paris" })} disabled={loading}>
      {loading ? "Loading..." : "Get Weather"}
    </button>
  );
}
```

## useWebSocket

Real-time WebSocket communication:

```typescript
import { useWebSocket } from "agui-framework/client/react";

function RealtimeAgent() {
  const { connected, caps, connect, disconnect, on, run } = useWebSocket(
    "http://localhost:4124",
    "assistant",
  );

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  const handleRun = () => {
    run("Tell me something interesting");
  };

  return (
    <div>
      <p>Status: {connected ? "Connected" : "Disconnected"}</p>
      <button onClick={handleRun} disabled={!connected}>Run</button>
    </div>
  );
}
```

## useAgentState

Read and write agent shared state:

```typescript
import { useAgentState } from "agui-framework/client/react";

function AgentStateManager() {
  const agentId = "assistant";
  const baseUrl = "http://localhost:4124";

  const { state, setState, deleteState, loading, error, refetch } =
    useAgentState(agentId, baseUrl);

  if (loading) return <p>Loading...</p>;
  return (
    <div>
      <pre>{JSON.stringify(state, null, 2)}</pre>
      <button onClick={() => setState({ theme: "dark" })}>Set Theme</button>
      <button onClick={() => deleteState("theme")}>Delete Theme</button>
    </div>
  );
}
```

## useModels

Query the model catalog:

```typescript
import { useModels, useModel, useModelsByProvider } from "agui-framework/client/react";

function ModelSelector() {
  const { models, loading } = useModels("http://localhost:4124");
  const { model } = useModel("http://localhost:4124", "gpt-4o");
  const { models: fwModels } = useModelsByProvider("http://localhost:4124", "fireworks");

  if (loading) return <p>Loading models...</p>;
  return (
    <select>
      {models.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}
```

## All Hooks

| Hook | Description |
|------|-------------|
| `useChat` | Full conversational chat interface |
| `useStream` | Token-by-token streaming responses |
| `useThread` | Thread CRUD and message management |
| `useInterrupts` | Human-in-the-loop interrupt handling |
| `useCoAgent` | Collaborative agent with shared state |
| `useCoAction` | Tool action definition and execution |
| `useAgentState` | Agent shared state management |
| `useCapabilities` | Agent capability discovery |
| `useAgent` | Agent metadata |
| `useWebSocket` | WebSocket real-time communication |
| `useModels` | Model catalog listing |
| `useModel` | Single model details |
| `useModelsByProvider` | Models filtered by provider |
| `useThreadRuns` | Thread run history |
| `useThreadStats` | Thread statistics |
| `useResume` | Resume interrupted executions |
| `useLiveState` | Real-time state subscriptions |
| `useRunningAgents` | Currently running agents |
| `useAgents` | All registered agents |
| `useAguiClient` | Access the underlying AguiClient |
