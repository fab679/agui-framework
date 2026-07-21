# Future Integrations

Draft proposals for extending agui-framework. Each proposal is a living document that may be implemented in a future release.

## Contents

- [Multi-Agent Router](#multi-agent-router) — Decision-driven graph routing for multi-agent workflows
- [Meta Events](#meta-events) — Annotations and signals independent of agent runs
- [Generative User Interfaces](#generative-user-interfaces) — AI-generated interfaces without custom tool renderers

---

## Multi-Agent Router

**Status:** Draft

### Summary

Extend `AgentGraph` with a **router node** that makes a decision about which child node to execute next. Instead of static edges, a router evaluates the current context (agent output, state, user intent) and dynamically selects the next agent or branch.

### Motivation

Current multi-agent graphs use static edges:

```
Input → AgentA → AgentB → AgentC → Output
```

Real-world workflows often require branching:

```
Input → Router
         ├── AgentA (handles technical questions)
         ├── AgentB (handles billing questions)
         └── AgentC (handles general support)
```

A router enables **decisions at runtime** — the graph dynamically picks the path based on the conversation state, agent output, or external signals.

### Specification

#### New Node Type: `RouterNode`

```typescript
interface RouterNode extends GraphNode {
  type: 'router'
  /** Child nodes to choose from */
  children: string[]
  /** Decision function — receives context, returns the id of the child to execute */
  route: (context: RouterContext) => string | Promise<string>
}

interface RouterContext {
  input: string
  state: Record<string, unknown>
  previousNode?: string
  previousOutput?: string
  threadId: string
}
```

#### Graph Execution with Routing

```typescript
const graph = new AgentGraph()
graph.addNode('router', { type: 'router', children: ['tech', 'billing', 'support'] })
graph.addNode('tech', agentTech)
graph.addNode('billing', agentBilling)
graph.addNode('support', agentSupport)

graph.setRouter('router', async (ctx) => {
  if (ctx.input.includes('bug') || ctx.input.includes('error')) return 'tech'
  if (ctx.input.includes('payment') || ctx.input.includes('invoice')) return 'billing'
  return 'support'
})

const result = await runAgentGraph(graph, agentA, 'My payment failed')
// Result: routes through router → billing agent
```

#### Router Strategies

| Strategy | Description |
|----------|-------------|
| **LLM Router** | An LLM decides the next node based on the conversation |
| **Rule Router** | Pattern matching on input/state/output |
| **Capability Router** | Routes based on agent capabilities declared via `getCapabilities()` |
| **Fallback Router** | Tries nodes in order until one succeeds |

#### LLM Router Example

```typescript
graph.setRouter('router', async (ctx) => {
  const response = await llm.complete(
    `Given this user request, which agent should handle it?\n` +
    `Options: tech, billing, support\n` +
    `User: ${ctx.input}\n` +
    `Respond with just the agent name.`
  )
  return response.trim().toLowerCase()
})
```

#### Capability Router Example

```typescript
graph.setCapabilityRouter('router', {
  'codeExecution': 'code-agent',
  'streaming': 'stream-agent',
  'structuredOutput': 'schema-agent',
})
```

### Implementation Plan

1. Add `RouterNode` type to `GraphNode` union
2. Add `setRouter()` / `setCapabilityRouter()` methods to `AgentGraph`
3. Update `runAgentGraph()` to handle router nodes — evaluate `route()`, execute the selected child, and continue
4. Support nested routing (router within a sub-graph)
5. Expose `RouterContext` in middleware for observability

---

## Meta Events

**Status:** Draft
**Author(s):** Markus Ecker (mail@mme.xyz)

See full proposal: [Proposals/Meta Events.md](docs/ag-ui/Proposals/Meta%20Events.md)

### Summary

AG-UI is extended with **MetaEvents**, a new class of events that can occur at any point in the event stream, independent of agent runs. MetaEvents provide a way to attach annotations, signals, or feedback to a serialized stream. They may originate from users, clients, or external systems rather than from agents. Examples include reactions such as thumbs up/down on a message.

### New Type

```typescript
type MetaEvent = BaseEvent & {
  type: EventType.META
  metaType: string
  payload: Record<string, unknown>
}
```

### Key Characteristics

- **Run-independent** — not tied to any specific run lifecycle
- **Position-flexible** — can appear before, between, or after runs
- **Origin-diverse** — may come from users, clients, or external systems
- **Extensible** — applications define their own `metaType` values and payload schemas

### Common Meta Event Types

| MetaType | Description | Typical Payload |
|----------|-------------|-----------------|
| `thumbs_up` | Positive feedback | `{ messageId, userId }` |
| `thumbs_down` | Negative feedback | `{ messageId, userId, reason? }` |
| `note` | User annotation | `{ text, relatedId?, author }` |
| `tag` | Categorization | `{ tags[], targetId }` |
| `bookmark` | Save for later | `{ messageId, userId }` |
| `rating` | Numeric rating | `{ messageId, rating, maxRating }` |

### Implementation Considerations

- New `MetaEvent` type in event system
- MetaEvent filtering and querying utilities
- Client SDK support for sending and receiving meta events
- Validation layer for meta event payloads

---

## Generative User Interfaces

**Status:** Draft
**Author(s):** Markus Ecker (mail@mme.xyz)

See full proposal: [Proposals/Generative User Interfaces.md](docs/ag-ui/Proposals/Generative%20User%20Interfaces.md)

### Summary

This draft describes an AG-UI extension that addresses **generative user interfaces** — interfaces produced directly by artificial intelligence without requiring a programmer to define custom tool renderers. The key idea is to leverage our ability to send client-side tools to the agent, thereby enabling this capability across all agent frameworks supported by AG-UI.

### Two-Step Generation Process

```
Agent needs UI
      │
      ▼
Step 1: What?
  Agent calls generateUserInterface(description, data, output)
      │
      ▼
Step 2: How?
  Secondary generator builds actual UI (JSON Schema, React, etc.)
      │
      ▼
Rendered UI shown to user
      │
      ▼
Validated user input returned to Agent
```

### Tool Definition

```typescript
const generateUITool: ToolConfig = {
  name: 'generateUserInterface',
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'High-level UI description' },
      data: { description: 'Pre-populated data for the UI' },
      output: {
        type: 'object',
        description: 'Schema of the data the agent expects back from the user',
      },
    },
    required: ['description', 'output'],
  },
  handler: async (args) => {
    // Delegate to a UI generator LLM or service
    // Return the generated UI definition
  },
}
```

### Implementation Plan

1. Add `generateUserInterface` tool to the built-in tool registry
2. Create a `UIGenerator` abstraction with pluggable generators (JSON Schema, React, HTML)
3. Integrate with client-side rendering via AG-UI protocol
4. Add validation layer for generated UI schemas
5. Support generator customization per application

### Client SDK Changes

- New `generateUserInterface` tool type
- UI generator registry for pluggable generators
- Validation layer for generated UI schemas
- Response handler for user-submitted data

---

## Appendix

All draft proposals live under [`docs/ag-ui/Proposals/`](docs/ag-ui/Proposals/). Current proposals:

- [Meta Events.md](docs/ag-ui/Proposals/Meta%20Events.md)
- [Generative User Interfaces.md](docs/ag-ui/Proposals/Generative%20User%20Interfaces.md)
