/**
 * 05-semantic-rag.ts — Semantic RAG Agent with RDF Knowledge Graph
 *
 * Demonstrates the fast-start path using createSemanticAgent().
 * The agent explores an RDF knowledge graph — discovers schema,
 * queries via SPARQL, applies reasoning, walks the graph,
 * and finds connections — all via natural language.
 *
 * Run: npx tsx examples/05-semantic-rag.ts
 */

import { createSemanticAgent } from 'agui-framework'
import 'dotenv/config'

const RESEARCH_DATA = `
@prefix : <http://example.org/research/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Researcher rdf:type rdfs:Class ; rdfs:label "Researcher" .
:Publication rdf:type rdfs:Class ; rdfs:label "Publication" .
:Article rdf:type rdfs:Class ; rdfs:label "Article" ; rdfs:subClassOf :Publication .
:ConferencePaper rdf:type rdfs:Class ; rdfs:label "Conference Paper" ; rdfs:subClassOf :Publication .
:Journal rdf:type rdfs:Class ; rdfs:label "Journal" .

:author rdf:type rdf:Property ; rdfs:domain :Publication ; rdfs:range :Researcher ; rdfs:label "author" .
:cites rdf:type rdf:Property ; rdfs:domain :Publication ; rdfs:range :Publication ; rdfs:label "cites" .
:affiliation rdf:type rdf:Property ; rdfs:domain :Researcher ; rdfs:range rdfs:Literal ; rdfs:label "affiliation" .
:title rdf:type rdf:Property ; rdfs:domain :Publication ; rdfs:range rdfs:Literal ; rdfs:label "title" .
:year rdf:type rdf:Property ; rdfs:domain :Publication ; rdfs:range xsd:gYear ; rdfs:label "publication year" .
:publishedIn rdf:type rdf:Property ; rdfs:domain :Publication ; rdfs:range :Journal ; rdfs:label "published in" .
:coAuthorWith rdf:type owl:SymmetricProperty , rdf:Property ; rdfs:label "co-author with" .
:isAuthorOf owl:inverseOf :author ; rdf:type rdf:Property ; rdfs:label "is author of" .
:citedBy owl:inverseOf :cites ; rdf:type rdf:Property ; rdfs:label "cited by" .

:Alice rdf:type :Researcher ; rdfs:label "Alice" ; :affiliation "MIT" ; :coAuthorWith :Bob .
:Bob rdf:type :Researcher ; rdfs:label "Bob" ; :affiliation "Stanford" ; :coAuthorWith :Alice .
:Carol rdf:type :Researcher ; rdfs:label "Carol" ; :affiliation "MIT" ; :coAuthorWith :David .
:David rdf:type :Researcher ; rdfs:label "David" ; :affiliation "Berkeley" .
:Eve rdf:type :Researcher ; rdfs:label "Eve" ; :affiliation "Stanford" .

:Paper1 rdf:type :Article ; :title "Deep Learning for NLP" ; :year "2023"^^xsd:gYear ; :author :Alice , :Bob ; :publishedIn :JAI .
:Paper2 rdf:type :Article ; :title "Transformers in Practice" ; :year "2024"^^xsd:gYear ; :author :Alice , :Carol ; :cites :Paper1 ; :publishedIn :JAI .
:Paper3 rdf:type :ConferencePaper ; :title "Efficient Attention Mechanisms" ; :year "2024"^^xsd:gYear ; :author :Bob , :David ; :cites :Paper1 .
:Paper4 rdf:type :Article ; :title "Graph Neural Networks for Text" ; :year "2023"^^xsd:gYear ; :author :Carol , :David ; :cites :Paper1 , :Paper3 ; :publishedIn :JCL .
:Paper5 rdf:type :ConferencePaper ; :title "Scaling Laws in LLMs" ; :year "2025"^^xsd:gYear ; :author :Eve , :Alice ; :cites :Paper2 , :Paper4 .

:JAI rdf:type :Journal ; rdfs:label "JAI" ; :title "Journal of AI Research" .
:JCL rdf:type :Journal ; rdfs:label "JCL" ; :title "Computational Linguistics" .
`

async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   Semantic RAG Agent — Research Graph       ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log()

  // Fast-start: createSemanticAgent does all the wiring
  // Engine → Reasoner → Tools → Agent → DeepAgent with planning
  const agent = await createSemanticAgent({
    model: process.env.AGUI_MODEL || 'gpt-4o',
    provider: (process.env.AGUI_PROVIDER as any) || 'openai',
    data: RESEARCH_DATA,
    planning: true,
    maxPlanningSteps: 10,
  })

  console.log(`📦  Loaded research knowledge graph`)
  console.log(`🤖  Agent exploring the research graph...`)
  console.log()

  for await (const chunk of agent.stream(
    'Discover the schema, then list all researchers with their affiliations and all publications with their titles.',
  )) {
    process.stdout.write(chunk)
  }
  console.log()
  console.log('✅  Done')
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
