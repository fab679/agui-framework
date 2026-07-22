# Agent Capabilities Implementation

The `Agent.getCapabilities()` method implements the AG-UI capabilities discovery protocol. It returns a structured `AgentCapabilities` object that clients can query to adapt their behavior.

## How Capabilities Are Built

`getCapabilities()` constructs the response dynamically from the agent's current configuration:

```typescript
const caps = agent.getCapabilities()
```

The implementation in `src/agent.ts` builds each category from live state:

```typescript
getCapabilities(peerDescriptors?: Map<string, AgentDescriptor>): AgentCapabilities {
  const hasStore = !!this.store
  const hasApprovalTools = this.tools.some(t => t.requiresApproval)

  const subAgents = [...this.tools
    .filter(t => t.name.startsWith('delegate_') || t.name.startsWith('handoff_'))
    .map(t => ({ name: t.name, description: t.description }))]

  if (peerDescriptors) {
    for (const [, desc] of peerDescriptors) {
      if (!subAgents.find(s => s.name === desc.id)) {
        subAgents.push({ name: desc.id, description: desc.description })
      }
    }
  }

  return {
    identity: { name, type, description, version, provider },
    transport: { streaming, websocket, resumable },
    tools: { supported, items, parallelCalls, clientProvided },
    output: { structuredOutput, supportedMimeTypes },
    state: { snapshots, deltas, memory, persistentState },
    multiAgent: { supported, delegation, handoffs, subAgents },
    reasoning: { supported, streaming, encrypted },
    multimodal: { input, output },
    execution: { codeExecution, sandboxed, maxIterations, maxExecutionTime },
    humanInTheLoop: { supported, approvals, interventions, feedback, interrupts, approveWithEdits },
    model: { id, name, provider, contextWindow, maxOutput, pricing, capabilities },
    custom: {},
  }
}
```

## Model Capabilities Block (New)

When the model is found in the built-in model catalog (`src/models/catalog.ts`), `getCapabilities()` enriches the response with full pricing, context window, and capability data:

```typescript
{
  model: {
    id: 'gpt-5.6-luna',
    name: 'GPT 5.6 Luna',
    provider: 'openai',
    contextWindow: 1_050_000,
    maxOutput: 128_000,
    pricing: { input: 1.00, output: 6.00, cachedInput: 0.10 },
    capabilities: {
      tools: true, streaming: true, reasoning: true,
      structuredOutput: true, codeExecution: false,
      multimodal: { vision: true, audio: false }
    }
  }
}
```

If the model is not in the catalog, a minimal block is returned with the model ID, provider, and default context window.

The catalog contains 44 models across 4 providers with accurate July 2026 pricing:

```
OpenAI:    gpt-5.6-sol/terra/luna, gpt-5.5, gpt-5.4 variants, gpt-4.1, o3, realtime, image-gen, codex
Anthropic: Claude Fable 5, Mythos 5, Opus 4.8/4.7/4.6/4.5, Sonnet 5/4.6/4.5, Haiku 4.5
Fireworks: Kimi K2.7, DeepSeek V4 Pro/Flash, GLM 5.2, Qwen 3.7 Plus, MiniMax M3, GPT-OSS
Ollama:    Qwen 3.6 27B, Qwen3-Coder 30B, Llama 3.3 70B, Phi-4, DeepSeek R1, Gemma 4
```

## Cost & Usage Tracking (New)

Every `run()` and `stream()` call tracks token usage from provider responses and calculates cost using the catalog's pricing:

| Feature | Access |
|---|---|
| Raw token usage | `agent.getLastUsage()` → `TokenUsage` |
| Cost breakdown | `agent.getLastCost()` → `CostBreakdown` |
| Per-run persistence | Stored in `RunData.usage` + `RunData.cost` via `ThreadStore` |
| Per-thread accumulation | `thread.metadata.totalCost` + `runCount` + `lastModelId` |
| Cost limit | `AgentConfig.costLimit` (USD) — warns when exceeded |
| USAGE_UPDATE event | Emitted on every provider response with token + cost info |
| Server API | `GET /api/threads/:id/runs` returns usage/cost per run |

Cost calculation accounts for:
- Cached input tokens (lower rate)
- Long-context surcharges (>200K input on certain OpenAI models, 2x input / 1.5x output)
- Model-specific pricing per 1M tokens

## Dynamic Nature

Capabilities reflect the agent's current state and configuration. Adding tools, changing config, or passing peer descriptors changes the returned object:

```typescript
agent.addTool({ name: 'delegate_research', ... })
agent.addCapability('vision')

const caps = agent.getCapabilities()
// caps.tools.items now includes delegate_research
// caps.multiAgent.subAgents includes the delegation tool
```

## Including Peer Agents

When managed by a `MultiAgentManager`, peer agent descriptors can be passed to enrich the `multiAgent.subAgents` list:

```typescript
const caps = agent.getCapabilities(manager.agentDescriptors)
// caps.multiAgent.subAgents now includes all registered peer agents
```

## Config-Driven Values

Several capability fields are driven by `AgentConfig` properties, with sensible defaults:

| Config Field               | Capability Path                     | Default      |
|----------------------------|-------------------------------------|--------------|
| `maxIterations`            | `execution.maxIterations`           | `10`         |
| `maxExecutionTime`         | `execution.maxExecutionTime`        | `30000`      |
| `structuredOutput`         | `output.structuredOutput`           | `false`      |
| `outputSchema`             | `output.structuredOutput`           | auto `true`  |
| `supportedMimeTypes`       | `output.supportedMimeTypes`         | `['text/plain']` |
| `parallelCalls`            | `tools.parallelCalls`               | `false`      |
| `clientProvidedTools`      | `tools.clientProvided`              | `false`      |
| `codeExecution`            | `execution.codeExecution`           | `false`      |
| `sandboxed`                | `execution.sandboxed`               | `false`      |
| `websocket`                | `transport.websocket`               | `false`      |
| `multimodalInput`          | `multimodal.input`                  | all `false`  |
| `multimodalOutput`         | `multimodal.output`                 | all `false`  |
| `reasoningEncrypted`       | `reasoning.encrypted`               | `false`      |
| `humanInterventions`       | `humanInTheLoop.interventions`      | `false`      |
| `humanFeedback`            | `humanInTheLoop.feedback`           | `false`      |
| `approveWithEdits`         | `humanInTheLoop.approveWithEdits`   | `false`      |
| `costLimit`                | runtime cost check                  | `0` (no limit) |
| `maxContextWindow`         | `model.contextWindow` override       | from catalog |

## Auto-Detected Values

| Capability Path            | Detection Logic                                  |
|----------------------------|--------------------------------------------------|
| `state.persistentState`    | `true` when a `ThreadStore` is configured        |
| `humanInTheLoop.supported` | `true` when any tool has `requiresApproval` or interventions/feedback enabled |
| `humanInTheLoop.approvals` | `true` when any tool has `requiresApproval`       |
| `humanInTheLoop.interrupts`| `true` when any tool has `requiresApproval`       |
| `multiAgent.subAgents`     | Tools with `delegate_`/`handoff_` prefix + passed `peerDescriptors` |

## Client Usage

```typescript
const caps = agent.getCapabilities()

// Check tool support
if (caps.tools?.supported) {
  console.log(`Agent provides ${caps.tools.items?.length} tools`)
}

// Check streaming
if (caps.transport?.streaming) {
  // Use streaming endpoint
}

// Check interrupt support
if (caps.humanInTheLoop?.interrupts) {
  // Show approval UI
}

// Check structured output support
if (caps.output?.structuredOutput) {
  // Use JSON mode
}

// Enumerate peer agents from MultiAgentManager
if (caps.multiAgent?.subAgents) {
  for (const agent of caps.multiAgent.subAgents) {
    console.log(`Peer: ${agent.name} — ${agent.description}`)
  }
}
```

## TypeScript Interface

```typescript
interface AgentCapabilities {
  identity?: {
    name?: string
    type?: string
    description?: string
    version?: string
    provider?: string
  }
  transport?: {
    streaming?: boolean
    websocket?: boolean
    resumable?: boolean
  }
  tools?: {
    supported?: boolean
    items?: ToolDefinition[]
    parallelCalls?: boolean
    clientProvided?: boolean
  }
  output?: {
    structuredOutput?: boolean
    supportedMimeTypes?: string[]
  }
  state?: {
    snapshots?: boolean
    deltas?: boolean
    memory?: boolean
    persistentState?: boolean
  }
  multiAgent?: {
    supported?: boolean
    delegation?: boolean
    handoffs?: boolean
    subAgents?: Array<{ name: string; description?: string }>
  }
  reasoning?: {
    supported?: boolean
    streaming?: boolean
    encrypted?: boolean
  }
  multimodal?: {
    input?: { image?: boolean; audio?: boolean; video?: boolean; pdf?: boolean; file?: boolean }
    output?: { image?: boolean; audio?: boolean }
  }
  execution?: {
    codeExecution?: boolean
    sandboxed?: boolean
    maxIterations?: number
    maxExecutionTime?: number
  }
  humanInTheLoop?: {
    supported?: boolean
    approvals?: boolean
    interventions?: boolean
    feedback?: boolean
    interrupts?: boolean
    approveWithEdits?: boolean
  }
  model?: {
    id: string
    name?: string
    provider?: string
    contextWindow: number
    maxOutput?: number
    pricing?: { input: number; output: number; cachedInput?: number }
    capabilities?: { tools?: boolean; streaming?: boolean; reasoning?: boolean; structuredOutput?: boolean; codeExecution?: boolean; multimodal?: { vision?: boolean; audio?: boolean } }
  }
  custom?: Record<string, unknown>
}
```
