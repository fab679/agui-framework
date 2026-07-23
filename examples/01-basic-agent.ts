/**
 * Example 01: Basic Agent
 * 
 * This example demonstrates the core Agent class:
 * - Agent creation and configuration
 * - Adding tools
 * - Running the agent (requires an API key / .env)
 * - Streaming responses
 * - Event bus listening
 * - Capabilities introspection
 * - Middleware usage
 * - Cloning
 * - Serialization
 */

import 'dotenv/config'
import {
  Agent,
  type ToolConfig,
  type MiddlewareFunction,
  type AgentEvent,
  type StreamingOptions,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// 1. Tool Definition
// ---------------------------------------------------------------------------

const weatherTool: ToolConfig = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'The city name' },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius',
      },
    },
    required: ['city'],
  },
  handler: async (args, context) => {
    console.log('  [Tool executed] get_weather called with:', args)
    console.log('  [Tool context] threadId:', context.threadId)
    return {
      temperature: 22,
      conditions: 'sunny',
      city: args.city,
      units: args.units || 'celsius',
    }
  },
}

const calculatorTool: ToolConfig = {
  name: 'calculate',
  description: 'Perform a mathematical calculation',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Math expression like "2 + 2"' },
    },
    required: ['expression'],
  },
  handler: async ({ expression }) => {
    console.log('  [Tool executed] calculate:', expression)
    try {
      const fn = new Function(`"use strict"; return (${expression})`)
      const result = fn()
      return { result }
    } catch (e) {
      return { error: `Invalid expression: ${e instanceof Error ? e.message : 'unknown'}` }
    }
  },
}

// ---------------------------------------------------------------------------
// 2. Middleware Definition
// ---------------------------------------------------------------------------

const loggingMiddleware: MiddlewareFunction = (agent, prompt, context, next) => {
  async function* wrapped() {
    console.log(`\n  [Middleware] Agent "${agent.config.name || 'unnamed'}" starting run`)
    console.log(`  [Middleware] Prompt: "${prompt.substring(0, 60)}..."`)
    let count = 0
    for await (const event of next()) {
      count++
      yield event
    }
    console.log(`  [Middleware] Run complete. ${count} events emitted.`)
  }
  return wrapped()
}

// ---------------------------------------------------------------------------
// 3. Main demonstration
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(72))
  console.log('AG-UI FRAMEWORK - Example 01: Basic Agent')
  console.log('='.repeat(72))

  // --- 3a. Create an agent with tools ---
  console.log('\n--- Creating Agent ---')
  const agent = new Agent({
    name: 'assistant',
    model: process.env.AGUI_MODEL || 'gpt-4o',
    provider: (process.env.AGUI_PROVIDER || 'openai') as any,
    instructions: 'You are a helpful assistant. Use the available tools when appropriate.',
    temperature: 0.7,
    maxTokens: 1024,
    tools: [weatherTool, calculatorTool],
    capabilities: ['streaming', 'tools'],
  })

  // Add middleware
  agent.use(loggingMiddleware)

  // Add a capability at runtime
  agent.addCapability('code_execution')

  console.log('  Agent name:', agent.config.name)
  console.log('  Model:', agent.config.model)
  console.log('  Provider:', agent.config.provider)
  console.log('  Tools:', agent.getTools().map(t => t.name).join(', '))
  console.log('  Capabilities:', agent.stringCapabilities.join(', '))

  // --- 3b. Listen to events ---
  console.log('\n--- Event Bus Subscription ---')
  const unsubRunStarted = agent.events.on('RUN_STARTED', (event) => {
    const e = event as any
    console.log(`  [Event] RUN_STARTED: thread=${e.threadId}, run=${e.runId}`)
  })

  agent.events.on('TEXT_MESSAGE_START', () => {
    console.log('  [Event] TEXT_MESSAGE_START')
  })

  agent.events.on('TEXT_MESSAGE_END', () => {
    console.log('  [Event] TEXT_MESSAGE_END')
  })

  agent.events.on('RUN_FINISHED', (event) => {
    const e = event as any
    console.log(`  [Event] RUN_FINISHED: outcome=${e.outcome?.type}`)
  })

  agent.events.on('USAGE_UPDATE', (event) => {
    const e = event as any
    if (e.cost) {
      console.log(`  [Event] USAGE_UPDATE: tokens=${e.usage?.totalTokens}, cost=$${e.cost.totalCost?.toFixed(6)}`)
    }
  })

  // Wildcard listener
  const unsubAll = agent.events.on('*', (event) => {
    if (['RUN_STARTED', 'RUN_FINISHED', 'RUN_ERROR'].includes(event.type)) {
      // already handled above
    }
  })

  // --- 3c. Capabilities introspection ---
  console.log('\n--- Capabilities ---')
  const caps = agent.getCapabilities()
  console.log('  Identity:', JSON.stringify(caps.identity, null, 2).replace(/\n/g, '\n  '))
  console.log('  Transport:', JSON.stringify(caps.transport))
  console.log('  Tools supported:', caps.tools?.supported)
  console.log('  Tools items:', caps.tools?.items?.length)
  console.log('  State snapshots:', caps.state?.snapshots)
  console.log('  Multi-agent:', caps.multiAgent?.supported)
  console.log('  Human-in-the-loop:', caps.humanInTheLoop?.supported)

  // --- 3d. Run the agent (requires API key) ---
  console.log('\n--- Running Agent ---')
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.FIREWORKS_API_KEY
  if (apiKey) {
    try {
      const result = await agent.run(
        "What's 45 * 67? Then tell me a fun fact about the number 42.",
        { threadId: 'example-thread', runId: 'example-run-1' },
      )
      console.log('\n  Result:', result.substring(0, 500))
      console.log('\n  Thread messages count:', agent.getMessageHistory('example-thread').length)
      console.log('  Last usage:', agent.getLastUsage())
      console.log('  Last cost:', agent.getLastCost())
    } catch (err) {
      console.log('  Note: API call failed (expected if no API key configured). Error:', err instanceof Error ? err.message : err)
    }
  } else {
    console.log('  [SKIP] No API key found in environment. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or FIREWORKS_API_KEY.')
  }

  // --- 3e. Check interrupts ---
  const interrupts = agent.checkInterrupts()
  console.log('\n  Pending interrupts:', interrupts.length)

  // --- 3f. Provider access ---
  const provider = agent.getProvider()
  console.log('  Provider type:', provider.type)
  console.log('  Provider config model:', provider.config.model)

  // --- 3g. Streaming (if API key available) ---
  if (apiKey) {
    console.log('\n--- Streaming Example ---')
    try {
      let fullStream = ''
      const streamOpts: StreamingOptions = {
        onStart: () => console.log('  [Stream] Started'),
        onChunk: (chunk) => process.stdout.write(chunk),
        onComplete: () => console.log('\n  [Stream] Complete'),
        onError: (err) => console.log('\n  [Stream] Error:', err.message),
      }
      for await (const chunk of agent.stream(
        'Write a very short haiku about coding.',
        { threadId: 'stream-thread', runId: 'stream-run-1' },
        streamOpts,
      )) {
        fullStream += chunk
      }
      console.log('\n  Full streaming result:', fullStream)
    } catch (err) {
      console.log('  Stream error (expected if no API key):', err instanceof Error ? err.message : err)
    }
  }

  // --- 3h. Agent serialization ---
  console.log('\n--- Serialization ---')
  const json = agent.toJSON()
  console.log('  Serialized length:', json.length, 'chars')

  const restored = new Agent({
    model: agent.config.model,
    provider: agent.config.provider,
    instructions: agent.config.instructions,
  })
  restored.fromJSON(json)
  console.log('  Restored config model:', restored.config.model)
  console.log('  Restored tools count:', restored.getTools().length)
  console.log('  Restored capabilities:', restored.stringCapabilities.join(', '))

  // --- 3i. Agent cloning ---
  console.log('\n--- Cloning ---')
  const cloned = agent.clone()
  console.log('  Clone config model:', cloned.config.model)
  console.log('  Clone tools count:', cloned.getTools().length)

  // --- 3j. Static factory methods ---
  console.log('\n--- Static Factory ---')
  const fromCreate = Agent.create({
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'Created via static method.',
  })
  console.log('  Agent.create() type:', fromCreate.constructor.name)

  // --- 3k. Cleanup ---
  unsubRunStarted()
  unsubAll()

  console.log('\n' + '='.repeat(72))
  console.log('Example 01 completed successfully!')
  console.log('='.repeat(72))
}

main().catch(console.error)
