# Providers

The AGUI Framework supports multiple LLM providers through a common abstraction layer. Each provider extends `BaseLLMProvider` and implements the same interface, making it easy to switch between providers.

## Supported Providers

| Provider | Type | Auth Method |
|----------|------|-------------|
| OpenAI | `openai` | Bearer token (`OPENAI_API_KEY`) |
| Anthropic | `anthropic` | x-api-key header (`ANTHROPIC_API_KEY`) |
| Ollama | `ollama` | Optional API key |
| Fireworks | `fireworks` | Bearer token (`FIREWORKS_API_KEY`) |

## Using Providers

### Direct Configuration

```typescript
import { Agent } from "agui-framework";

// OpenAI
const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are helpful.",
});

// Anthropic
const anthropicAgent = new Agent({
  model: "claude-3-5-sonnet-20240620",
  provider: "anthropic",
  instructions: "You are helpful.",
});

// Ollama (local)
const localAgent = new Agent({
  model: "llama3",
  provider: "ollama",
  baseUrl: "http://localhost:11434/v1",
});

// Fireworks
const fwAgent = new Agent({
  model: "accounts/fireworks/models/deepseek-v4-flash",
  provider: "fireworks",
});
```

### Factory Pattern

```typescript
import { createProvider } from "agui-framework";

const provider = createProvider("openai", {
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: "https://api.openai.com/v1",
});
```

## Base Provider Interface

All providers implement `BaseLLMProvider`:

```typescript
abstract class BaseLLMProvider {
  readonly type: ProviderType;
  config: ProviderConfig;

  // Standard chat completion
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  // Streaming chat completion
  streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamChunk>;

  // Message preparation
  prepareMessages(systemPrompt: string, messages: Message[]): ChatMessage[];
}
```

## Provider-Specific Features

### OpenAI
- Supports `response_format` for structured output
- Function calling with parallel tool calls
- Vision capabilities via `multimodalInput.image`

### Anthropic
- Maps to Anthropic Messages API
- Supports extended thinking via `reasoningEncrypted`
- Tool use blocks

### Ollama
- OpenAI-compatible endpoint
- Local model inference
- Configurable `baseUrl` for custom hosts

### Fireworks
- OpenAI-compatible API
- Fast inference with Fireworks models

## Custom Providers

Extend `BaseLLMProvider` to create a custom provider:

```typescript
import { BaseLLMProvider, ProviderType, ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from "agui-framework";

class CustomProvider extends BaseLLMProvider {
  readonly type: ProviderType = "custom";

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    // Implement custom API call
  }

  async *streamChatCompletion(request: ChatCompletionRequest): AsyncGenerator<StreamChunk> {
    // Implement custom streaming
  }
}
```

## Model Selection

The framework includes a catalog of 44+ models across all providers with pricing, context windows, and capabilities:

```typescript
import { getModel, getModelsByProvider, getModelsWithCapability } from "agui-framework";

const model = getModel("gpt-4o");
const openaiModels = getModelsByProvider("openai");
const streamingModels = getModelsWithCapability("streaming");
```

## API Reference

### Provider Functions

| Function | Description |
|----------|-------------|
| `createProvider(type, config)` | Factory for provider instances |
| `BaseLLMProvider` | Abstract base class for providers |

### Model Functions

| Function | Description |
|----------|-------------|
| `getModel(modelId)` | Get model details |
| `getModelsByProvider(provider)` | List models for a provider |
| `getModelsWithCapability(capability)` | Filter models by capability |
