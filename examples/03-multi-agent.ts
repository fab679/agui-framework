/**
 * Example 03: Multi-Agent Orchestration
 *
 * Demonstrates:
 * - MultiAgentManager: registering agents, delegation tools, cyclic handoffs
 * - Agent.createDelegationTool() / createHandoffTool()
 * - AgentGraph: directed graph with conditional traversal
 * - DeepAgent: planning tools, context management
 * - runAgentGraph: orchestrated multi-agent execution
 * - Capability summaries and peer discovery
 */

import 'dotenv/config'
import {
  Agent,
  MultiAgentManager,
  AgentGraph,
  DeepAgent,
  createHandoffTool,
  runAgentGraph,
  type GraphNode,
  type GraphEdge,
  type DeepAgentConfig,
  type AgentEvent,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// 1. MultiAgentManager with Delegation
// ---------------------------------------------------------------------------

async function demonstrateMultiAgentManager() {
  console.log('\n=== 1. MultiAgentManager with Delegation ===')

  const manager = new MultiAgentManager()
  console.log('  Manager created, agents:', manager.getAgentIds().length)

  // Create specialized agents
  const researcher = new Agent({
    name: 'researcher',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are a research specialist. Find detailed information and return comprehensive findings.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  const writer = new Agent({
    name: 'writer',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are a writer. Create engaging content based on research findings.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  const editor = new Agent({
    name: 'editor',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are an editor. Review and polish content for clarity, grammar, and style.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  // Register agents
  manager.registerAgent('researcher', researcher, 'Specializes in data analysis and research')
  manager.registerAgent('writer', writer, 'Creates well-structured documents and reports')
  manager.registerAgent('editor', editor, 'Polishes and proofreads content')

  console.log('  Registered agents:', manager.getAgentIds())
  console.log('  Agent count:', manager.getAllAgents().length)

  // Create delegation tools
  const researchTool = writer.createDelegationTool(
    'delegate_research',
    'Delegate a research task to the research specialist. Use this when you need detailed information.',
    researcher,
  )
  writer.addTool(researchTool)

  const editorResearchTool = editor.createDelegationTool(
    'delegate_research',
    'Delegate a research task if more information is needed.',
    researcher,
  )
  editor.addTool(editorResearchTool)

  console.log('  Writer tools:', writer.getTools().map(t => t.name).join(', '))
  console.log('  Editor tools:', editor.getTools().map(t => t.name).join(', '))

  // Capability summary
  const summary = manager.getCapabilitySummary()
  console.log('  Capability summary:')
  summary.split('\n').forEach(line => console.log('    ' + line))

  // Track manager events
  const mgrEvents: string[] = []
  manager.events.on('*', (e) => mgrEvents.push(e.type))

  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('\n  Running delegated workflow...')
      const result = await manager.runAgent('writer', 'Write a short article about AI trends in 2025.')
      console.log('  Result:', result.substring(0, 200))
      console.log('  Manager events emitted:', mgrEvents.join(', '))
    } catch (err) {
      console.log('  Note: Run failed (expected if no API key). Error:', err instanceof Error ? err.message : err)
    }
  } else {
    console.log('  [SKIP] No API key found.')
  }

  return manager
}

// ---------------------------------------------------------------------------
// 2. Cyclic Handoffs
// ---------------------------------------------------------------------------

async function demonstrateHandoffs(manager: MultiAgentManager) {
  console.log('\n=== 2. Cyclic Handoffs ===')

  const support = new Agent({
    name: 'support',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are a support agent. Handle customer inquiries and escalate when needed.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  const billing = new Agent({
    name: 'billing',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are a billing specialist. Handle payment and invoice questions.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  manager.registerAgent('support', support, 'Handles general customer support questions')
  manager.registerAgent('billing', billing, 'Handles billing and payment inquiries')

  // Register handoff tools automatically
  manager.registerHandoffTools('support')
  manager.registerHandoffTools('billing')
  manager.registerHandoffTools('writer')

  console.log('  Support tools:', support.getTools().map(t => t.name).join(', '))
  console.log('  Billing tools:', billing.getTools().map(t => t.name).join(', '))
  console.log('  Writer tools (with handoffs):', writer.getTools().map(t => t.name).join(', '))

  // Track handoff history
  const handoffEvents: string[] = []
  manager.events.on('AGENT_HANDOFF_REQUEST', (e) => {
    const ev = e as any
    handoffEvents.push(`${ev.fromAgent} -> ${ev.toAgent}`)
  })
  manager.events.on('AGENT_HANDOFF_RESULT', (e) => {
    const ev = e as any
    handoffEvents.push(`${ev.toAgent} completed`)
  })

  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('\n  Running handoff workflow...')
      const result = await manager.runAgent('support', 'I have a question about my recent invoice payment.')
      console.log('  Result:', result.substring(0, 200))
      console.log('  Handoff events:', handoffEvents)
    } catch (err) {
      console.log('  Handoff error:', err instanceof Error ? err.message : err)
    }
  } else {
    console.log('  [SKIP] No API key found.')
  }

  // Manual programmatic handoff
  console.log('\n  Programmatic handoff test...')
  try {
    const handoffResult = await manager.handoff('support', 'billing', {
      fromAgent: 'support',
      toAgent: 'billing',
      reason: 'Customer has a billing question',
      context: { threadId: 'handoff-test-thread' },
    })
    console.log('  Handoff result:', handoffResult.substring(0, 200))
  } catch (err) {
    console.log('  Handoff error (expected if no API key):', err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// 3. AgentGraph
// ---------------------------------------------------------------------------

async function demonstrateAgentGraph() {
  console.log('\n=== 3. AgentGraph ===')

  // Create a research workflow graph
  const nodes: GraphNode[] = [
    { id: 'start', label: 'Start Research', type: 'start' },
    { id: 'gather', label: 'Gather Data', type: 'agent', nextNodes: ['analyze'] },
    { id: 'analyze', label: 'Analyze Findings', type: 'agent', nextNodes: ['draft'] },
    { id: 'draft', label: 'Draft Report', type: 'agent', nextNodes: ['review'] },
    {
      id: 'review',
      label: 'Quality Review',
      type: 'condition',
      nextNodes: ['publish', 'revision'],
    },
    { id: 'revision', label: 'Revise', type: 'agent', nextNodes: ['review'] },
    { id: 'publish', label: 'Publish', type: 'agent' },
    { id: 'end', label: 'Complete', type: 'end' },
  ]

  const edges: GraphEdge[] = [
    { from: 'start', to: 'gather' },
    { from: 'gather', to: 'analyze' },
    { from: 'analyze', to: 'draft' },
    { from: 'draft', to: 'review' },
    {
      from: 'review',
      to: 'publish',
      label: 'Approved',
      condition: (state) => state.quality_score === 'high',
    },
    {
      from: 'review',
      to: 'revision',
      label: 'Needs Revision',
      condition: (state) => state.quality_score === 'low',
    },
    { from: 'revision', to: 'review' },
    { from: 'publish', to: 'end' },
  ]

  const graph = new AgentGraph({
    nodes,
    edges,
    startNode: 'start',
    endNodes: ['end'],
    maxIterations: 20,
  })

  console.log('  Graph nodes:', graph.nodes.size)
  console.log('  Graph edges:', graph.edges.length)
  console.log('  Start node:', graph.startNode)
  console.log('  End nodes:', Array.from(graph.endNodes))

  // Traverse with high quality (goes through)
  graph.updateState({ quality_score: 'high' })
  console.log('\n  Traversal (high quality):')
  let step = 0
  let node = graph.getCurrentNode()
  while (node && !graph.isEnd() && step < 10) {
    console.log(`    Step ${step}: ${node.id} (${node.label})`)
    node = graph.nextNode()
    step++
  }
  console.log('  Final node:', graph.currentNodeId)
  console.log('  Progress:', JSON.stringify(graph.getProgress()))

  // Reset and traverse with low quality (goes through revision loop)
  graph.reset()
  graph.updateState({ quality_score: 'low' })
  console.log('\n  Traversal (low quality):')
  step = 0
  node = graph.getCurrentNode()
  while (node && !graph.isEnd() && step < 10) {
    console.log(`    Step ${step}: ${node.id} (${node.label})`)
    node = graph.nextNode()
    step++
  }
  console.log('  Final node:', graph.currentNodeId)

  // Serialization round-trip
  const json = graph.toJSON()
  const restored = AgentGraph.fromJSON(json)
  console.log('\n  Serialization round-trip:')
  console.log('    Restored nodes:', restored.nodes.size)
  console.log('    Restored state:', JSON.stringify(restored.state))
}

// ---------------------------------------------------------------------------
// 4. DeepAgent
// ---------------------------------------------------------------------------

async function demonstrateDeepAgent() {
  console.log('\n=== 4. DeepAgent ===')

  const baseAgent = new Agent({
    name: 'deep-researcher',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are an autonomous research assistant with planning capabilities.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  // Create DeepAgent with planning and context management
  const config: DeepAgentConfig = {
    planning: true,
    contextManagement: true,
    humanInTheLoop: true,
    maxPlanningSteps: 5,
  }

  const deepAgent = new DeepAgent(baseAgent, config)
  deepAgent.enhanceWithDeepCapabilities()

  console.log('  DeepAgent config:', JSON.stringify(deepAgent.config, null, 2).replace(/\n/g, '\n    '))
  console.log('  Base agent tools:', baseAgent.getTools().map(t => t.name).join(', '))

  // Listen to deep agent events
  const deepEvents: string[] = []
  deepAgent.events.on('*', (e) => deepEvents.push(e.type))

  // Test planning tool
  const planTool = baseAgent.getTools().find(t => t.name === 'create_plan')
  if (planTool) {
    const planResult = await planTool.handler(
      { steps: ['Research topic', 'Analyze findings', 'Write summary'] },
      { threadId: 'deep-thread', runId: 'deep-run', agentId: 'deep-researcher' },
    )
    console.log('\n  Plan created:', JSON.stringify(planResult))
    console.log('  DeepAgent plan:', deepAgent.plan)
    console.log('  Current step:', deepAgent.currentStep)
    console.log('  Events emitted:', deepEvents)
  }

  // Test progress update
  const progressTool = baseAgent.getTools().find(t => t.name === 'update_progress')
  if (progressTool) {
    deepEvents.length = 0
    const progressResult = await progressTool.handler(
      { step: 1, status: 'in_progress', notes: 'Starting analysis phase' },
      { threadId: 'deep-thread', runId: 'deep-run', agentId: 'deep-researcher' },
    )
    console.log('\n  Progress updated:', JSON.stringify(progressResult))
    console.log('  Current step:', deepAgent.currentStep)
  }

  // Test run (requires API key)
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('\n  Running DeepAgent...')
      const result = await deepAgent.run('Research the impact of quantum computing on cybersecurity.')
      console.log('  Result:', result.substring(0, 200))
    } catch (err) {
      console.log('  DeepAgent run error:', err instanceof Error ? err.message : err)
    }
  } else {
    console.log('\n  [SKIP] No API key found.')
  }
}

// ---------------------------------------------------------------------------
// 5. createHandoffTool and HandoffRequested
// ---------------------------------------------------------------------------

async function demonstrateHandoffTool() {
  console.log('\n=== 5. Handoff Tool Creation ===')

  const manager = new MultiAgentManager()
  const agentA = new Agent({
    name: 'agent-a',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are Agent A.',
    apiKey: process.env.OPENAI_API_KEY,
  })
  const agentB = new Agent({
    name: 'agent-b',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You are Agent B.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  manager.registerAgent('a', agentA, 'Agent A - handles initial inquiries')
  manager.registerAgent('b', agentB, 'Agent B - handles specialized tasks')

  // Method 1: Using createHandoffTool function
  const handoff1 = createHandoffTool('handoff_to_b', 'Hand off to Agent B', 'b', manager)
  agentA.addTool(handoff1)
  console.log('  Agent A tools (function):', agentA.getTools().map(t => t.name))

  // Method 2: Using Agent.createHandoffTool method
  const handoff2 = agentB.createHandoffTool('handoff_to_a', 'Hand off to Agent A', agentA)
  agentB.addTool(handoff2)
  console.log('  Agent B tools (method):', agentB.getTools().map(t => t.name))

  // Method 3: Using registerHandoffTools (auto-inject)
  manager.registerHandoffTools('a')
  manager.registerHandoffTools('b')
  console.log('  Agent A tools (after auto-inject):', agentA.getTools().map(t => t.name))
  console.log('  Agent B tools (after auto-inject):', agentB.getTools().map(t => t.name))

  // Handoff stack
  console.log('  Handoff stack:', manager.handoffStack)
}

// ---------------------------------------------------------------------------
// 6. Run Agent Graph (full orchestrated workflow)
// ---------------------------------------------------------------------------

async function demonstrateRunAgentGraph() {
  console.log('\n=== 6. Agent Graph Execution ===')

  const graphManager = new MultiAgentManager()

  const analyst = new Agent({
    name: 'analyst',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You analyze data and extract insights.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  const summarizer = new Agent({
    name: 'summarizer',
    model: 'gpt-4o',
    provider: 'openai',
    instructions: 'You summarize information into concise bullet points.',
    apiKey: process.env.OPENAI_API_KEY,
  })

  graphManager.registerAgent('analyst', analyst)
  graphManager.registerAgent('summarizer', summarizer)

  // Simple linear graph
  const graphNodes: GraphNode[] = [
    { id: 'analysis', type: 'agent', label: 'Analysis Phase', nextNodes: ['summary'] },
    { id: 'summary', type: 'agent', label: 'Summary Phase', nextNodes: ['end'] },
    { id: 'end', type: 'end', label: 'Complete' },
  ]

  const graphEdges: GraphEdge[] = [
    { from: 'analysis', to: 'summary' },
    { from: 'summary', to: 'end' },
  ]

  const graph = new AgentGraph({
    nodes: graphNodes,
    edges: graphEdges,
    startNode: 'analysis',
    endNodes: ['end'],
  })

  const agentMap = new Map<string, string>([
    ['analysis', 'analyst'],
    ['summary', 'summarizer'],
  ])

  // Track graph events
  const graphEvents: string[] = []
  graph.events.on('*', (e) => graphEvents.push(e.type))

  console.log('  Graph configured with', graph.nodes.size, 'nodes')

  if (process.env.OPENAI_API_KEY) {
    try {
      console.log('\n  Running agent graph...')
      const result = await runAgentGraph(graph, graphManager, agentMap, 'Key developments in renewable energy')
      console.log('  Graph result:', result.substring(0, 300))
      console.log('  Graph events emitted:', graphEvents.join(', '))
    } catch (err) {
      console.log('  Graph execution error:', err instanceof Error ? err.message : err)
    }
  } else {
    console.log('  [SKIP] No API key found.')
  }
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(72))
  console.log('AG-UI FRAMEWORK - Example 03: Multi-Agent Orchestration')
  console.log('='.repeat(72))

  const manager = await demonstrateMultiAgentManager()
  await demonstrateHandoffs(manager)
  await demonstrateAgentGraph()
  await demonstrateDeepAgent()
  await demonstrateHandoffTool()
  await demonstrateRunAgentGraph()

  console.log('\n' + '='.repeat(72))
  console.log('Example 03 completed successfully!')
  console.log('='.repeat(72))
}

main().catch(console.error)
