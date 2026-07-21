# Getting Started

Installation, prerequisites, first agent configuration, and next steps for building with agui-framework.

## Prerequisites

- Node.js 18+ (required for native `fetch` and `ReadableStream` support)
- npm, yarn, or pnpm
- An API key for at least one LLM provider (OpenAI, Anthropic, Fireworks) or a local Ollama instance

## Installation

```bash
npm install agui-framework
```

### Optional persistence dependencies

```bash
npm install ioredis          # RedisThreadStore
npm install pg               # PostgresThreadStore
```

## Your First Agent

Create an agent with a single LLM provider and run a prompt:

```typescript
import { Agent } from 'agui-framework'

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a helpful assistant.',
})

const response = await agent.run('What is the capital of France?')
console.log(response)
```

Set `OPENAI_API_KEY` in your environment before running:

```bash
export OPENAI_API_KEY=sk-...
node index.js
```

## Basic Configuration

### AgentConfig

```typescript
interface AgentConfig {
  name?: string                         // Agent display name
  model: string                         // LLM model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet-20240620')
  provider: ProviderType                // 'openai' | 'anthropic' | 'ollama' | 'fireworks'
  instructions: string                  // System prompt that defines agent behavior
  tools?: ToolConfig[]                  // Array of tool definitions
  maxTokens?: number                    // Maximum output tokens (default: 1024)
  temperature?: number                  // Sampling temperature 0-2 (default: 0.7)
  topP?: number                         // Nucleus sampling parameter
  stream?: boolean                      // Enable streaming by default
  apiKey?: string                       // API key (falls back to environment variable)
  baseUrl?: string                      // Custom API endpoint URL
  capabilities?: string[]               // Custom capability flags
  modelSettings?: Record<string, unknown> // Additional model parameters
  store?: ThreadStore                   // Persistence backend
  autoPersist?: boolean                 // Auto-save to store (default: true)
  costLimit?: number                    // Runtime cost limit in USD
  maxContextWindow?: number             // Override model's context window
}
```

### Environment Variables

Each provider resolves its API key from a well-known environment variable when `apiKey` is omitted from the config:

| Provider    | Variable            |
|-------------|---------------------|
| OpenAI      | `OPENAI_API_KEY`    |
| Anthropic   | `ANTHROPIC_API_KEY` |
| Ollama      | `OLLAMA_API_KEY`    |
| Fireworks   | `FIREWORKS_API_KEY` |

### Environment-Based Configuration

Use `Agent.createFromEnv()` to build an agent from `AGUI_*` environment variables:

```env
AGUI_PROVIDER=openai
AGUI_MODEL=gpt-4o
AGUI_INSTRUCTIONS=You are a helpful assistant.
AGUI_MAX_TOKENS=1024
AGUI_TEMPERATURE=0.7
```

```typescript
import 'dotenv/config'
import { Agent } from 'agui-framework'

const agent = Agent.createFromEnv()
const reply = await agent.run('Tell me a joke')
console.log(reply)
```

## Run vs Stream

### run() -- Non-Streaming

Returns the complete response as a string after the LLM finishes processing:

```typescript
const response = await agent.run('Explain quantum computing')
console.log(response)
```

### stream() -- Streaming

Yields text chunks as they arrive from the LLM. Supports optional callbacks for fine-grained control:

```typescript
for await (const chunk of agent.stream('Tell me a story')) {
  process.stdout.write(chunk)
}
```

With callbacks:

```typescript
for await (const chunk of agent.stream('Write a poem', {}, {
  onStart: () => console.log('Starting...'),
  onChunk: (c) => process.stdout.write(c),
  onComplete: () => console.log('\nDone'),
  onError: (err) => console.error(err),
})) {
  // chunks are also yielded here
}
```

## Using Tools

Define tools with JSON Schema parameters and attach them to your agent:

```typescript
import { Agent } from 'agui-framework'
import type { ToolConfig } from 'agui-framework'

const weatherTool: ToolConfig = {
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
    },
    required: ['city'],
  },
  handler: async ({ city }) => {
    return { city, temperature: 22, conditions: 'sunny' }
  },
}

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Use tools when needed.',
  tools: [weatherTool],
})

const response = await agent.run('What is the weather in Tokyo?')
console.log(response)
```

## Thread History

Each conversation thread maintains its own message history. Pass a `threadId` to continue a conversation:

```typescript
const threadId = 'conversation-1'

await agent.run('Hi, my name is Alice', { threadId })
await agent.run('What is my name?', { threadId })
// The agent remembers "Alice" from context
```

## Next Steps

| Topic                           | Guide                                                |
|---------------------------------|------------------------------------------------------|
| Advanced agent configuration    | [Agents](./agents.md)                                |
| Event system and EventBus       | [Events](./events.md)                                |
| State management                | [State Management](./state-management.md)            |
| Multi-provider setup            | [Providers](./providers.md)                          |
| Tool definition deep dive       | [Tools](./tools.md)                                  |
| System architecture             | [Architecture](./architecture.md)                    |
| Complete API reference          | [API Reference](./api-reference.md)                  |
| Real-world examples             | [Examples](./examples.md)                            |
| Live agent state observation | [Agents](./agents.md#live-state-observation) |
| AG-UI protocol implementation  | [ag-ui/Agents](./ag-ui/Agents.md)                   |
| Next.js integration           | [framework-guides/next-usage](../framework-guides/next-usage) |
