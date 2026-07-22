# Getting Started

## Prerequisites

- **Node.js 18+** -- Required for native `fetch` and `ReadableStream` support.
- **npm** or **yarn** -- Package manager.

## Installation

```bash
npm install agui-framework
```

### Optional Dependencies

```bash
# Redis-backed thread persistence
npm install ioredis

# PostgreSQL-backed thread persistence
npm install pg

# Long-term memory (RDF semantic store)
npm install oxigraph
```

## Environment Setup

Create a `.env` file or set environment variables for your LLM provider:

```env
# OpenAI (default)
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Fireworks
FIREWORKS_API_KEY=...

# Ollama (local, no API key usually needed)
# OLLAMA_API_KEY=...
```

### AGUI Prefix Convention

You can also use the `AGUI_` prefix for convenient environment-based configuration:

```env
AGUI_PROVIDER=openai
AGUI_MODEL=gpt-4o
AGUI_INSTRUCTIONS=You are a helpful assistant.
AGUI_MAX_TOKENS=1024
AGUI_TEMPERATURE=0.7
```

## Your First Agent

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant.",
});

const response = await agent.run("What is the capital of France?");
console.log(response); // "The capital of France is Paris."
```

## Streaming an Agent

```typescript
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a storyteller.",
});

for await (const chunk of agent.stream("Tell me a short story")) {
  process.stdout.write(chunk);
}
```

## Configuration Reference

### AgentConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `undefined` | Display name for the agent |
| `model` | `string` | *required* | LLM model identifier |
| `provider` | `ProviderType` | *required* | `openai`, `anthropic`, `ollama`, `fireworks` |
| `instructions` | `string` | *required* | System prompt |
| `tools` | `ToolConfig[]` | `[]` | Tool definitions |
| `maxTokens` | `number` | `1024` | Maximum output tokens |
| `temperature` | `number` | `0.7` | Sampling temperature (0–2) |
| `topP` | `number` | `undefined` | Nucleus sampling |
| `stream` | `boolean` | `false` | Enable streaming by default |
| `apiKey` | `string` | env var | API key for the provider |
| `baseUrl` | `string` | provider default | Custom API endpoint |
| `store` | `ThreadStore` | `undefined` | Persistence backend |
| `autoPersist` | `boolean` | `true` | Auto-save to store after runs |
| `capabilities` | `string[]` | `[]` | Custom capability flags |
| `maxIterations` | `number` | `10` | Execution iteration limit |
| `maxExecutionTime` | `number` | `30000` | Max wall-clock time in ms |
| `structuredOutput` | `boolean` | `false` | JSON schema output support |
| `outputSchema` | `object` | `undefined` | JSON Schema for structured output |
| `sharedState` | `SharedState` | `undefined` | Global SharedState instance |
| `mcpServers` | `MCPServerConfig[]` | `undefined` | MCP server configurations |

### Environment Variables

| Provider | Variable | Notes |
|----------|----------|-------|
| OpenAI | `OPENAI_API_KEY` | Also supports `AGUI_*` prefix |
| Anthropic | `ANTHROPIC_API_KEY` | |
| Ollama | `OLLAMA_API_KEY` | Usually not needed for local |
| Fireworks | `FIREWORKS_API_KEY` | |

## Next Steps

- [Agent Deep Dive](agents.md) -- Full agent configuration, tools, and execution
- [Events](events.md) -- Understanding the event system
- [State Management](state-management.md) -- Managing agent state
- [Providers](providers.md) -- Multi-provider setup
- [Server](server.md) -- Deploying the HTTP/WebSocket server
