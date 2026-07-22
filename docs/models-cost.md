# Models & Cost Tracking

AGUI Framework includes a comprehensive model catalog with pricing, context windows, and capabilities, plus cost calculation utilities.

## Model Catalog

The catalog contains 44+ models across 4 providers:

```typescript
import { getModel, getModelsByProvider, getModelsWithCapability, modelCatalog } from "agui-framework";

// Look up a specific model
const model = getModel("gpt-5.6-luna");
console.log(model?.pricing);
// { input: 1.00, output: 6.00, cachedInput: 0.10 }

// List all models for a provider
const openaiModels = getModelsByProvider("openai");

// Filter models by capability
const streamingModels = getModelsWithCapability("streaming");
const visionModels = getModelsWithCapability("vision");

// Full catalog
console.log(modelCatalog);
```

### Model Entry

```typescript
interface ModelEntry {
  id: string;
  provider: ProviderType;
  name: string;
  description: string;
  pricing: ModelPricing;
  contextWindow: number;
  maxOutputTokens?: number;
  capabilities: ModelCapabilities;
}

interface ModelPricing {
  input: number;        // Cost per 1M input tokens
  output: number;       // Cost per 1M output tokens
  cachedInput?: number; // Cost per 1M cached input tokens
}

interface ModelCapabilities {
  streaming: boolean;
  vision: boolean;
  functionCalling: boolean;
  parallelToolCalls: boolean;
  structuredOutput: boolean;
}
```

## Cost Calculation

```typescript
import { calculateCost, formatCost, createTokenUsage } from "agui-framework";

const usage = createTokenUsage(5000, 1200);
// { promptTokens: 5000, completionTokens: 1200, totalTokens: 6200 }

const cost = calculateCost("deepseek-v4-flash", usage);
if (cost) {
  console.log(formatCost(cost.totalCost)); // "$0.0010"
  console.log(cost.breakdown);
  // { input: 0.0004, output: 0.0006, total: 0.0010 }
}
```

## Context Window Checking

```typescript
import { exceedsContextWindow } from "agui-framework";

const { exceeds, limit } = exceedsContextWindow("llama-3.2-3b", 200_000);
console.log(exceeds); // true
console.log(limit);   // 128000
```

## Automatic Cost Tracking

When an agent is configured with a thread store, costs are automatically tracked per run and accumulated per thread:

```typescript
const agent = new Agent({
  ...config,
  store: new MemoryThreadStore(),
});

// Costs are tracked in RunData
// Available via server API:
// GET /api/threads           → includes totalCost, runCount, lastModelId
// GET /api/threads/:id/runs  → includes usage + cost per run
```

## Server Model API

When using `AguiServer`, model information is available via REST:

```typescript
import { AguiClient } from "agui-framework";

const client = new AguiClient("http://localhost:4124");

// List all models
const models = await client.models();

// Get specific model
const model = await client.model("gpt-5.6-terra");

// Get models by provider
const fwModels = await client.modelsByProvider("fireworks");
```

## API Reference

| Function | Description |
|----------|-------------|
| `getModel(modelId)` | Get model by ID |
| `getModelsByProvider(provider)` | Get models for a provider |
| `getModelsWithCapability(capability)` | Filter by capability |
| `calculateCost(modelId, usage)` | Calculate cost for token usage |
| `formatCost(cost)` | Format cost as string |
| `exceedsContextWindow(modelId, tokens)` | Check context window limits |
| `createTokenUsage(prompt, completion)` | Create a TokenUsage object |

### Types

| Type | Description |
|------|-------------|
| `ModelEntry` | Full model metadata |
| `ModelPricing` | Token pricing per 1M |
| `ModelCapabilities` | Model feature flags |
| `TokenUsage` | Token usage counts |
| `CostBreakdown` | Cost breakdown details |
