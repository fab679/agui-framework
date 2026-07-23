/**
 * example.ts — Semantic RAG Agent Demo
 *
 * Demonstrates an autonomous agent that explores an RDF knowledge graph
 * without prior ontology knowledge. The agent:
 *   1. Discovers schema (classes, properties) on the fly
 *   2. Queries the graph via SPARQL
 *   3. Applies RDFS/OWL reasoning to infer implicit facts
 *   4. Walks the graph by following links between resources
 *   5. Finds connections between entities
 *   6. Can query live Wikidata for external knowledge
 *
 * Uses AGUI framework only for Agent/DeepAgent orchestration, events, and tools.
 * All RDF/SPARQL operations go through the third-party oxigraph library directly.
 */

import { Agent, DeepAgent } from 'agui-framework'
import 'dotenv/config'
import { SparqlEngine } from './engine.js'
import { Reasoner } from './reasoner.js'
import { createTools } from './tools.js'

/**
 * Research publication ontology in Turtle format.
 * Designed to demonstrate:
 *   - Class hierarchy (Publication → Article, ConferencePaper)
 *   - Properties with domain/range (author, cites, affiliation, etc.)
 *   - OWL constructs (SymmetricProperty: coAuthorWith, inverseOf: author/isAuthorOf, cites/citedBy)
 *   - A small citation network with 5 papers, 5 researchers, 2 journals
 *   - Cross-references suitable for graph walking
 */
const RESEARCH_DATA = `
@prefix : <http://example.org/research/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Researcher rdf:type rdfs:Class ;
    rdfs:label "Researcher" .

:Publication rdf:type rdfs:Class ;
    rdfs:label "Publication" .

:Article rdf:type rdfs:Class ;
    rdfs:label "Article" ;
    rdfs:subClassOf :Publication .

:ConferencePaper rdf:type rdfs:Class ;
    rdfs:label "Conference Paper" ;
    rdfs:subClassOf :Publication .

:Journal rdf:type rdfs:Class ;
    rdfs:label "Journal" .

:author rdf:type rdf:Property ;
    rdfs:domain :Publication ;
    rdfs:range :Researcher ;
    rdfs:label "author" .

:cites rdf:type rdf:Property ;
    rdfs:domain :Publication ;
    rdfs:range :Publication ;
    rdfs:label "cites" .

:affiliation rdf:type rdf:Property ;
    rdfs:domain :Researcher ;
    rdfs:range rdfs:Literal ;
    rdfs:label "affiliation" .

:title rdf:type rdf:Property ;
    rdfs:domain :Publication ;
    rdfs:range rdfs:Literal ;
    rdfs:label "title" .

:year rdf:type rdf:Property ;
    rdfs:domain :Publication ;
    rdfs:range xsd:gYear ;
    rdfs:label "publication year" .

:publishedIn rdf:type rdf:Property ;
    rdfs:domain :Publication ;
    rdfs:range :Journal ;
    rdfs:label "published in" .

:coAuthorWith rdf:type owl:SymmetricProperty , rdf:Property ;
    rdfs:label "co-author with" .

:isAuthorOf owl:inverseOf :author ;
    rdf:type rdf:Property ;
    rdfs:label "is author of" .

:citedBy owl:inverseOf :cites ;
    rdf:type rdf:Property ;
    rdfs:label "cited by" .

:Alice rdf:type :Researcher ;
    rdfs:label "Alice" ;
    :affiliation "MIT" ;
    :coAuthorWith :Bob .

:Bob rdf:type :Researcher ;
    rdfs:label "Bob" ;
    :affiliation "Stanford" ;
    :coAuthorWith :Alice .

:Carol rdf:type :Researcher ;
    rdfs:label "Carol" ;
    :affiliation "MIT" ;
    :coAuthorWith :David .

:David rdf:type :Researcher ;
    rdfs:label "David" ;
    :affiliation "Berkeley" .

:Eve rdf:type :Researcher ;
    rdfs:label "Eve" ;
    :affiliation "Stanford" .

:Paper1 rdf:type :Article ;
    :title "Deep Learning for NLP" ;
    :year "2023"^^xsd:gYear ;
    :author :Alice , :Bob ;
    :publishedIn :JAI .

:Paper2 rdf:type :Article ;
    :title "Transformers in Practice" ;
    :year "2024"^^xsd:gYear ;
    :author :Alice , :Carol ;
    :cites :Paper1 ;
    :publishedIn :JAI .

:Paper3 rdf:type :ConferencePaper ;
    :title "Efficient Attention Mechanisms" ;
    :year "2024"^^xsd:gYear ;
    :author :Bob , :David ;
    :cites :Paper1 .

:Paper4 rdf:type :Article ;
    :title "Graph Neural Networks for Text" ;
    :year "2023"^^xsd:gYear ;
    :author :Carol , :David ;
    :cites :Paper1 , :Paper3 ;
    :publishedIn :JCL .

:Paper5 rdf:type :ConferencePaper ;
    :title "Scaling Laws in LLMs" ;
    :year "2025"^^xsd:gYear ;
    :author :Eve , :Alice ;
    :cites :Paper2 , :Paper4 .

:JAI rdf:type :Journal ;
    rdfs:label "JAI" ;
    :title "Journal of AI Research" .

:JCL rdf:type :Journal ;
    rdfs:label "JCL" ;
    :title "Computational Linguistics" .
`

const AGENT_INSTRUCTIONS = `You are a Semantic Web research assistant exploring a knowledge graph about academic publications.

YOUR CAPABILITIES:
You have tools to query RDF data using SPARQL, discover ontology schemas on-the-fly,
apply RDFS/OWL reasoning to infer implicit facts, walk the graph by following links,
find connections between entities, and query live Wikidata.

IMPORTANT:
- Do NOT assume you know the schema. Always DISCOVER it first.
- Use discover_schema() to see what classes and properties exist.
- Then explore_class() and explore_property() for details.
- Use describe_resource() to understand specific entities.
- Apply reasoning with apply_reasoning() to infer implicit facts.
- Walk citation networks with walk_graph().
- Find relationships with find_connection().

YOUR WORKFLOW FOR EACH QUESTION:
1. DISCOVER — call discover_schema() to understand the data model
2. EXPLORE — describe_resource() for key entities, explore_class() for class details
3. QUERY — sparql_query() to find specific patterns
4. REASON — apply_reasoning() to derive implicit facts
5. WALK — walk_graph() to follow relationships across the graph
6. SYNTHESIZE — explain what you found with specific evidence from the data

Always show your reasoning between steps. Explain what you found and why each step matters.`

async function main() {
  console.log()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║        Semantic RAG Agent — Research Graph Explorer         ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  // -------------------------------------------------------------------------
  // 1. Load the research publication knowledge graph into the local oxigraph Store
  // -------------------------------------------------------------------------
  console.log('📦  Loading research knowledge graph...')
  const engine = new SparqlEngine()
  await engine.load(RESEARCH_DATA, 'text/turtle', 'http://example.org/research/')
  const stats = await engine.stats()
  console.log(`    ✔  ${stats.triples} triples loaded`)
  console.log(`       ${stats.classes} classes, ${stats.properties} properties, ${stats.instances} named instances`)

  // -------------------------------------------------------------------------
  // 2. Apply initial RDFS/OWL reasoning to infer implicit triples
  //    This demonstrates the reasoner before the agent starts
  // -------------------------------------------------------------------------
  const reasoner = new Reasoner(engine)
  console.log()
  console.log('🧠  Applying initial RDFS/OWL reasoning...')
  const initialReasoning = await reasoner.applyAll(3)
  console.log(`    ✔  ${initialReasoning.rulesApplied} rules fired`)
  console.log(`       ${initialReasoning.triplesAdded} triples inferred`)
  console.log(`       Store now has ${await engine.getSize()} triples`)

  const inferred = await engine.select(
    `SELECT ?s ?p ?o WHERE { ?s ?p ?o } OFFSET ${stats.triples} LIMIT 5`,
  )
  if (inferred.length > 0) {
    console.log('       Sample inferred triples:')
    for (const row of inferred) {
      if (row.s && row.p && row.o) {
        console.log(`         ${row.s}  ${row.p}  ${row.o}`)
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Create the shared tools
  // -------------------------------------------------------------------------
  console.log()
  console.log('🤖  Initializing semantic agent...')
  const tools = createTools(engine, reasoner)

  // -------------------------------------------------------------------------
  // 4. Define test questions exercising different capabilities
  // -------------------------------------------------------------------------
  const questions = [
    {
      id: 1,
      label: 'Schema & Discovery',
      prompt: `Discover the schema of this research knowledge graph. What classes, properties, and instances exist? Show me the full picture.`,
      expected: ['discover_schema', 'explore_class', 'explore_property'],
    },
    {
      id: 2,
      label: 'Entity Query',
      prompt: `List all researchers with their names and affiliations. Also list all publications with their titles and years.`,
      expected: ['sparql_query'],
    },
    {
      id: 3,
      label: 'Citation Network Walk',
      prompt: `Walk the citation network starting from Paper1. Show me the full trail of citations - which papers cite which. Go up to depth 3.`,
      expected: ['walk_graph', 'sparql_query'],
    },
    {
      id: 4,
      label: 'Relationship Discovery',
      prompt: `Find the connection between Alice and David. How are they related through publications and co-authorship?`,
      expected: ['find_connection', 'sparql_query', 'describe_resource'],
    },
    {
      id: 5,
      label: 'Reasoning & Inference',
      prompt: `Apply OWL reasoning and then check what new triples were inferred. Specifically, look for any new co-authorship relationships that became explicit after reasoning.`,
      expected: ['apply_reasoning', 'sparql_query'],
    },
  ]

  // -------------------------------------------------------------------------
  // 5. Run each question as a separate agent session
  // -------------------------------------------------------------------------
  const startTime = Date.now()
  let totalToolCalls = 0
  let totalTokens = 0
  let totalErrors = 0

  for (const q of questions) {
    // Create fresh agent per question so context doesn't pollute
    const agent = new Agent({
      model: process.env.AGUI_MODEL || 'gpt-4o',
      provider: (process.env.AGUI_PROVIDER as any) || 'openai',
      instructions: AGENT_INSTRUCTIONS,
      tools,
      maxTokens: 2048,
      temperature: 0.2,
      maxExecutionTime: 120_000,
    })
    const deepAgent = new DeepAgent(agent, {
      planning: true,
      contextManagement: true,
      maxPlanningSteps: 10,
    })
    deepAgent.enhanceWithDeepCapabilities()

    // Per-question counters
    let toolCallCount = 0
    let tokenCount = 0
    let sessionError: string | null = null

    agent.events.on('*', (event: any) => {
      if (event.type === 'TEXT_MESSAGE_CONTENT') return
      if (event.type === 'TOOL_CALL_ARGS') {
        console.log(`  🔧  args: ${String(event.delta).slice(0, 150)}`)
        return
      }
      if (event.type === 'TOOL_CALL_START') {
        toolCallCount++
        totalToolCalls++
        console.log(`\n  ⚡  [${toolCallCount}][q${q.id}] ${event.toolCallName}`)
        return
      }
      if (event.type === 'TOOL_CALL_RESULT') {
        const raw = event.content ?? ''
        if (!raw) { console.log(`  📋  ✓\n`); return }
        const lines = raw.split('\n')
        const preview = lines.slice(0, 3).join('\n').slice(0, 200)
        console.log(`  📋  ${preview}`)
        if (lines.length > 3 || raw.length > 200) console.log(`       ... (${raw.length} chars)`)
        console.log()
        return
      }
      if (event.type === 'RUN_ERROR') {
        console.log(`\n  ❌  RUN_ERROR: ${event.message}`)
        return
      }
    })

    console.log()
    console.log('┏' + '━'.repeat(70))
    console.log(`┃  📝  Q${q.id}: ${q.label}`)
    console.log(`┃      "${q.prompt}"`)
    console.log('┗' + '━'.repeat(70))
    console.log()
    console.log('─'.repeat(72))
    console.log('  AGENT REASONING (streaming)...')
    console.log('─'.repeat(72))
    console.log()

    try {
      for await (const chunk of deepAgent.stream(q.prompt)) {
        process.stdout.write(chunk)
        tokenCount++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n  ⚠️  Agent error: ${msg}`)
      sessionError = msg
      totalErrors++
    }

    totalTokens += tokenCount

    console.log()
    console.log('─'.repeat(40))
    console.log(`  ✅  Q${q.id} complete`)
    console.log(`  🔧  Tool calls: ${toolCallCount}`)
    console.log(`  💬  Tokens: ${tokenCount}`)
    console.log(`  🗃  Store: ${await engine.getSize()} triples`)
    if (sessionError) console.log(`  ⚠️  Error: ${sessionError}`)
    console.log('─'.repeat(40))
    console.log()
  }

  // -------------------------------------------------------------------------
  // 6. Print session summary
  // -------------------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  SESSION SUMMARY                                            ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`  📝  Questions: ${questions.length}`)
  console.log(`  ⏱  Elapsed: ${elapsed}s`)
  console.log(`  🔧  Total tool calls: ${totalToolCalls}`)
  console.log(`  💬  Total tokens streamed: ${totalTokens}`)
  console.log(`  ⚠️  Errors: ${totalErrors}`)
  const finalStats = await engine.stats()
  const inferredCount = finalStats.triples - stats.triples
  console.log(`  🗃  Store: ${finalStats.triples} triples (+${inferredCount} inferred)`)
  console.log()
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
