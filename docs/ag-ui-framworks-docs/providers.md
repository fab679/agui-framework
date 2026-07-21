# Providers

agui-framework supports multiple LLM providers through a common abstraction layer. Each provider extends `BaseLLMProvider` and handles its own authentication, request format, and response parsing.

## Supported Providers

| Provider    | Type Key      | Default Model                          | Default Base URL                              | Auth Header     |
|-------------|---------------|----------------------------------------|-----------------------------------------------|-----------------|
| OpenAI      | `openai`      | `gpt-4o`                               | `https://api.openai.com/v1`                   | `Bearer`        |
| Anthropic   | `anthropic`   | `claude-3-5-sonnet-20240620`           | `https://api.anthropic.com/v1`                | `x-api-key`     |
| Ollama      | `ollama`      | `llama3`                               | `http://localhost:11434/v1`                   | None            |
| Fireworks   | `fireworks`   | `accounts/fireworks/models/deepseek-v4-flash` | `https://api.fireworks.ai/inference/v1` | `Bearer`        |

## Configuration Per Provider

### OpenAI

```typescript
import { Agent } from 'agui-framework'

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a helpful assistant.',
  apiKey: process.env.OPENAI_API_KEY,
  // Optional overrides:
  baseUrl: 'https://api.openai.com/v1',
  temperature: 0.7,
  maxTokens: 1024,
})
```

### Anthropic

```typescript
const agent = new Agent({
  model: 'claude-3-5-sonnet-20240620',
  provider: 'anthropic',
  instructions: 'You are a helpful assistant.',
  apiKey: process.env.ANTHROPIC_API_KEY,
})
```

The Anthropic provider internally converts between OpenAI-compatible format and Anthropic's native `/v1/messages` API, including system prompt extraction and content block parsing. Messages are translated to Anthropic's expected format and responses are converted back to the standard event stream.

### Ollama

```typescript
const agent = new Agent({
  model: 'llama3',
  provider: 'ollama',
  instructions: 'You are a helpful assistant.',
  // No API key needed for local instances
  baseUrl: 'http://localhost:11434/v1',
})
```

Ollama runs locally and exposes an OpenAI-compatible `/v1/chat/completions` endpoint. The provider communicates using the same format as OpenAI.

### Fireworks

```typescript
const agent = new Agent({
  model: 'accounts/fireworks/models/deepseek-v4-flash',
  provider: 'fireworks',
  instructions: 'You are a helpful assistant.',
  apiKey: process.env.FIREWORKS_API_KEY,
})
```

## API Key Resolution

API keys are resolved automatically by the `Agent` constructor. If `apiKey` is not provided in config, the agent looks up the environment variable:

| Provider    | Env Variable         |
|-------------|----------------------|
| OpenAI      | `OPENAI_API_KEY`     |
| Anthropic   | `ANTHROPIC_API_KEY`  |
| Ollama      | `OLLAMA_API_KEY`     |
| Fireworks   | `FIREWORKS_API_KEY`  |

```typescript
// No need to pass apiKey -- auto-resolved from env
const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'Hello',
})
```

## Capabilities Comparison

| Capability         | OpenAI | Anthropic | Ollama | Fireworks |
|--------------------|--------|-----------|--------|-----------|
| Chat Completions   | Yes    | Yes       | Yes    | Yes       |
| Streaming          | Yes    | Yes       | Yes    | Yes       |
| Tool/Function Call | Yes    | Yes (wrapped)| Yes | Yes       |
| Vision             | Yes    | Yes       | Yes    | Yes       |
| Reasoning Content  | Yes    | Yes       | No     | Yes       |
| Custom Base URL    | Yes    | Yes       | Yes    | Yes       |
| API Key Required   | Yes    | Yes       | No     | Yes       |
| Free / Local       | No     | No        | Yes    | No        |

## ProviderConfig

```typescript
interface ProviderConfig {
  apiKey?: string       // API key
  baseUrl?: string      // Custom base URL (overrides default)
  model: string         // Model identifier
  defaultModel?: string // Fallback model
  maxTokens?: number    // Max tokens in response
  temperature?: number  // Sampling temperature (0-2)
  topP?: number         // Nucleus sampling
}
```

## Using the Factory

```typescript
import { createProvider } from 'agui-framework'

const provider = createProvider('openai', {
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
})

const response = await provider.chatCompletion({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
})
```

## BaseLLMProvider -- Abstract Class

```typescript
abstract class BaseLLMProvider {
  readonly type: ProviderType
  config: ProviderConfig

  constructor(type: ProviderType, config: ProviderConfig)

  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>
  streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamChunk>
  prepareMessages(systemPrompt: string, messages: Array<{ role: string; content: string }>): ChatMessage[]

  protected abstract getDefaultBaseUrl(): string
  protected abstract getDefaultModel(): string
  protected getHeaders(): Record<string, string>
}
```

### How It Works

1. `chatCompletion()` sends a POST to `{baseUrl}/chat/completions` with `stream: false` and returns the full response.
2. `streamChatCompletion()` sends with `stream: true`, reads the SSE response body, and yields `StreamChunk` objects.
3. `getHeaders()` returns `Content-Type: application/json` and `Authorization: Bearer {apiKey}` by default -- override for custom auth (e.g., Anthropic's `x-api-key`).
4. `prepareMessages()` injects the system prompt and formats messages according to the provider's expected structure.

## Creating Custom Providers

Extend `BaseLLMProvider` and implement the abstract methods:

```typescript
import { BaseLLMProvider } from 'agui-framework'
import type { ProviderConfig } from 'agui-framework'

class CustomProvider extends BaseLLMProvider {
  constructor(config: ProviderConfig) {
    super('custom' as any, config)
  }

  protected getDefaultBaseUrl(): string {
    return 'https://api.custom-llm.com/v1'
  }

  protected getDefaultModel(): string {
    return 'custom-model-1'
  }

  // Optional: override auth headers
  protected override getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey || '',
    }
  }
}

// Use it directly
const provider = new CustomProvider({ model: 'custom-model-1', apiKey: '...' })
```

To integrate a custom provider with the `Agent` class, use `agent.getProvider()` to access the raw provider instance, or assign the provider directly. The agent resolves the provider internally via `createProvider()` based on the `provider` type in the config. For custom types, you can override `agent.getProvider()` to return your instance.
