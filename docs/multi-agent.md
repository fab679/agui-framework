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
