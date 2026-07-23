# Multi-Agent Patterns

The AGUI Framework supports several multi-agent orchestration patterns through `MultiAgentManager`, `AgentGraph`, and `DeepAgent`.

## MultiAgentManager

The `MultiAgentManager` orchestrates multiple agents with delegation, cyclic handoff, and capability routing.

```typescript
import { MultiAgentManager, Agent } from "agui-framework";

const manager = new MultiAgentManager();

const researchAgent = new Agent({
  name: "researcher",
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a research specialist. Find information.",
  capabilities: ["research"],
});

const writerAgent = new Agent({
  name: "writer",
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a writing specialist. Create content.",
  capabilities: ["writing"],
});

manager.registerAgent(researchAgent);
manager.registerAgent(writerAgent);
```

### Capability Routing

Find agents by capability:

```typescript
const researchAgents = manager.getAgentsByCapability("research");
```

### Delegation

Agents can delegate tasks to sub-agents using delegation tools:

```typescript
import { createHandoffTool } from "agui-framework";

const researchTool = createHandoffTool(
  "research_topic",
  "Research a topic using the research agent",
  researchAgent,
  manager,
);

const mainAgent = new Agent({
  ...config,
  tools: [researchTool],
});
```

## AgentGraph

`AgentGraph` creates directed graph workflows where execution flows through agent nodes with conditional edge traversal:

```typescript
import { AgentGraph, MultiAgentManager } from "agui-framework";

const graph = new AgentGraph({
  nodes: [
    { id: "router", agent: routerAgent },
    { id: "researcher", agent: researchAgent },
    { id: "writer", agent: writerAgent },
    { id: "reviewer", agent: reviewAgent },
  ],
  edges: [
    { from: "router", to: "researcher", condition: (ctx) => ctx.needsResearch },
    { from: "router", to: "writer", condition: (ctx) => !ctx.needsResearch },
    { from: "researcher", to: "writer" },
    { from: "writer", to: "reviewer" },
  ],
});
```

### Running a Graph

```typescript
import { runAgentGraph } from "agui-framework";

const result = await runAgentGraph(
  graph,
  manager,
  [routerAgent, researchAgent, writerAgent, reviewerAgent],
  "Create a report about AI trends",
);
```

## DeepAgent

`DeepAgent` wraps an agent with autonomous planning tools, context management, and safety controls:

```typescript
import { DeepAgent, Agent } from "agui-framework";

const baseAgent = new Agent({ ...config });
const deepAgent = new DeepAgent(baseAgent, {
  maxSteps: 20,
  enablePlanning: true,
  enableContextManagement: true,
  safetyConfig: {
    maxTokensPerStep: 2000,
    allowedTools: ["web_search", "calculator"],
  },
});

const result = await deepAgent.run("Research and write a report on quantum computing");
```

DeepAgent adds:
- **Planning tools** -- Self-directed task decomposition
- **Context management** -- Manages conversation window
- **Safety controls** -- Limits on execution and tool usage

## Handoff Mechanism

Handoff between agents uses a `HandoffRequested` error internally:

```typescript
// Creating a handoff tool
const handoff = agent.createHandoffTool(
  "handoff_to_expert",
  "Handoff to the expert agent",
  expertAgent,
);

// When called, the runtime catches HandoffRequested
// and transfers control to the target agent
```

## Multi-Agent Event Flow

```
Main Agent
  │
  ├─► AGENT_DELEGATION_START → Sub-agent execution
  │       │
  │       ├─► Sub-agent events
  │       │
  │       └─► AGENT_DELEGATION_END → Return to main
  │
  ├─► AGENT_HANDOFF_REQUEST → Control transfer
  │       │
  │       └─► AGENT_HANDOFF_RESULT → New agent takes over
  │
  └─► Graph execution (conditional edges)
```

## Agent Identity on Messages

Each message stored in thread history carries an optional `agentId` field identifying which agent produced it. This is automatically populated in multi-agent flows:

- `MultiAgentManager.runAgent()` and `streamAgent()` pass `agentId` in the run context
- Delegation tools (`createDelegationTool()`) set `agentId` to the delegate agent
- `Agent.delegate()` tags sub-agent messages with the sub-agent's name
- REST and SSE server endpoints set `agentId` from the route parameter

Each message also carries `runId` (the specific run instance that produced it) and `parentRunId` (the parent agent's run ID when this message came from a delegated sub-agent). This lets you reconstruct the full delegation tree from message history alone:

```typescript
// Root messages have no parentRunId
const rootMsgs = messages.filter(m => !m.parentRunId)

// Group by runId — all messages from the same run
const byRun = new Map<string, ChatMessage[]>()
for (const msg of messages) {
  const key = msg.runId || 'root'
  if (!byRun.has(key)) byRun.set(key, [])
  byRun.get(key)!.push(msg)
}

// Link children to parents via parentRunId → runId
for (const msg of messages) {
  if (msg.parentRunId) {
    console.log(`${msg.agentId}'s run ${msg.runId} was delegated by ${byRun.get(msg.parentRunId)?.[0]?.agentId}`)
  }
}
```

Messages without `agentId`/`runId`/`parentRunId` (single-agent runs) will have those fields undefined. In React, all three are available on every `ChatMessage`:

```typescript
messages.map(msg => console.log(
  `${msg.agentId || 'default'} [run: ${msg.runId || 'N/A'}]${msg.parentRunId ? ` (delegated by run ${msg.parentRunId})` : ''}: ${msg.content}`
))
```

The client can also reconstruct the agent execution tree by correlating `AGENT_DELEGATION_START`/`END` events (from `onEvent`) with `agentId` changes in the message stream.

## API Reference

### `MultiAgentManager`

| Method | Description |
|--------|-------------|
| `registerAgent(agent)` | Register an agent |
| `unregisterAgent(agentId)` | Remove an agent |
| `getAgent(agentId)` | Get agent by ID |
| `getAgentsByCapability(cap)` | Find agents by capability |
| `getAllAgents()` | List all agents |

### `AgentGraph`

| Method | Description |
|--------|-------------|
| `constructor(config)` | Create graph with nodes and edges |
| `addNode(node)` | Add a node |
| `addEdge(edge)` | Add an edge |
| `run(input)` | Execute the graph |

### `DeepAgent`

| Method | Description |
|--------|-------------|
| `constructor(agent, config)` | Wrap agent with deep capabilities |
| `run(prompt)` | Execute with planning |
| `stream(prompt)` | Execute with streaming |

### Functions

| Function | Description |
|----------|-------------|
| `createHandoffTool(name, desc, target, manager)` | Create handoff tool |
| `runAgentGraph(graph, manager, agents, input?)` | Execute agent graph |
