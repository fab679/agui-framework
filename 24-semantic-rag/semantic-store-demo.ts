/**
 * semantic-store-demo.ts — Demonstrates the SemanticStore abstraction layer.
 *
 * Three scenarios:
 *   1. Declarative config → buildStore() → agent discovers endpoints by description
 *   2. Direct SemanticStore API — query, describe, reason across endpoints
 *   3. Integration with AGUI agent — auto-generated tools per endpoint
 *
 * Run: npx tsx src/24-semantic-rag/semantic-store-demo.ts
 */

import { SparqlEngine } from './engine.js'
import { SemanticStore, buildStore, type StoreConfig } from './semantic-store.js'

// ── Research publication graph (same as example.ts) ──
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

// ── Employee/org chart graph ──
const EMPLOYEE_DATA = `
@prefix : <http://example.org/hr/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Employee rdf:type rdfs:Class ; rdfs:label "Employee" .
:Department rdf:type rdfs:Class ; rdfs:label "Department" .
:Project rdf:type rdfs:Class ; rdfs:label "Project" .

:name rdf:type rdf:Property ; rdfs:domain :Employee ; rdfs:range rdfs:Literal ; rdfs:label "employee name" .
:salary rdf:type rdf:Property ; rdfs:domain :Employee ; rdfs:range xsd:integer ; rdfs:label "salary" .
:worksIn rdf:type rdf:Property ; rdfs:domain :Employee ; rdfs:range :Department ; rdfs:label "works in department" .
:manages rdf:type rdf:Property ; rdfs:domain :Employee ; rdfs:range :Department ; rdfs:label "manages department" .
:worksOn rdf:type rdf:Property ; rdfs:domain :Employee ; rdfs:range :Project ; rdfs:label "works on project" .
:budget rdf:type rdf:Property ; rdfs:domain :Project ; rdfs:range xsd:integer ; rdfs:label "project budget" .

:Engineering rdf:type :Department ; rdfs:label "Engineering" .
:Marketing rdf:type :Department ; rdfs:label "Marketing" .
:Sales rdf:type :Department ; rdfs:label "Sales" .

:ProjA rdf:type :Project ; rdfs:label "Project Alpha" ; :budget 500000 .
:ProjB rdf:type :Project ; rdfs:label "Project Beta" ; :budget 300000 .
:ProjC rdf:type :Project ; rdfs:label "Project Gamma" ; :budget 750000 .

:emp1 rdf:type :Employee ; :name "John Smith" ; :salary 120000 ; :worksIn :Engineering ; :worksOn :ProjA .
:emp2 rdf:type :Employee ; :name "Jane Doe" ; :salary 95000 ; :worksIn :Marketing ; :manages :Marketing ; :worksOn :ProjB .
:emp3 rdf:type :Employee ; :name "Bob Wilson" ; :salary 110000 ; :worksIn :Engineering ; :manages :Engineering ; :worksOn :ProjA , :ProjC .
:emp4 rdf:type :Employee ; :name "Alice Brown" ; :salary 85000 ; :worksIn :Sales ; :worksOn :ProjC .
:emp5 rdf:type :Employee ; :name "Carol Davis" ; :salary 105000 ; :worksIn :Engineering ; :worksOn :ProjB .
`

async function main() {
  // ════════════════════════════════════════════════════════════════════
  // SCENARIO 1: Declarative config → buildStore()
  //
  // API keys and secrets are read from .env via ${VAR_NAME} syntax.
  // Example .env file:
  //
  //   SPARQL_ENDPOINT=https://query.wikidata.org/sparql
  //   SPARQL_API_KEY=your-key-here
  //   STORAGE_PATH=./data/
  //
  // Config referencing env vars:
  //
  //   {
  //     name: "wikidata",
  //     description: "General knowledge base",
  //     engine: {
  //       type: "sparql",
  //       url: "${SPARQL_ENDPOINT}",
  //       headers: { "Authorization": "Bearer ${SPARQL_API_KEY}" },
  //     }
  //   }
  //
  // For endpoints that require authentication (Stardog, Amazon Neptune,
  // RDF4J, GraphDB, etc.), use the headers field with env var references.
  // ════════════════════════════════════════════════════════════════════
  console.log('═══ Scenario 1: Declarative config ═══\n')

  const configs: StoreConfig[] = [
    {
      name: 'research',
      description: 'Academic research publications, authors, citations, journals, and co-authorship network',
      engine: { type: 'local', prefixes: { ex: 'http://example.org/research/' } },
    },
    {
      name: 'hr',
      description: 'Employee directory with departments, projects, salaries, and org chart hierarchy',
      engine: { type: 'local', prefixes: { ex: 'http://example.org/hr/' } },
    },
    // Realistic example with env var — uncomment and add to .env:
    // {
    //   name: 'enterprise',
    //   description: 'Enterprise triple store with internal business data',
    //   engine: {
    //     type: 'sparql',
    //     url: '${ENTERPRISE_SPARQL_URL}',
    //     headers: { 'Authorization': 'Bearer ${ENTERPRISE_API_KEY}' },
    //     timeout: 30000,
    //   },
    // },
    // {
    //   name: 'neptune',
    //   description: 'AWS Neptune graph database for product catalog',
    //   engine: {
    //     type: 'sparql',
    //     url: 'https://${NEPTUNE_HOST}:8182/sparql',
    //     headers: { 'X-Api-Key': '${NEPTUNE_API_KEY}' },
    //     timeout: 30000,
    //   },
    // },
  ]

  const store = await buildStore(configs)

  // Load data into the local engines
  const researchEngine = store.get('research') as SparqlEngine
  await researchEngine.load(RESEARCH_DATA, 'text/turtle', 'http://example.org/research/')
  console.log(`  ✔ research: ${await researchEngine.getSize()} triples loaded`)

  const hrEngine = store.get('hr') as SparqlEngine
  await hrEngine.load(EMPLOYEE_DATA, 'text/turtle', 'http://example.org/hr/')

  console.log(`  ✔ hr:       ${await hrEngine.getSize()} triples loaded\n`)

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO 2: Direct SemanticStore API
  // ════════════════════════════════════════════════════════════════════
  console.log('═══ Scenario 2: Direct API ═══\n')

  // List endpoints (agent discovers which store to use)
  console.log('list_endpoints():')
  for (const ep of store.list()) {
    console.log(`  📦 ${ep.name} — ${ep.description}`)
  }
  console.log()

  // Query a specific endpoint by name
  console.log('Query "research" for researchers (via rdfs:label):')
  const researchers = await store.get('research').select(
    `SELECT ?s ?label ?affil WHERE { ?s a ex:Researcher ; rdfs:label ?label ; ex:affiliation ?affil }`,
  )
  for (const r of researchers) console.log(`  👤 ${r.label} @ ${r.affil} (${r.s})`)
  console.log()

  console.log('Query "hr" for employees (via ex:name):')
  const employees = await store.get('hr').select(
    `SELECT ?name ?dName WHERE { ?s ex:name ?name ; ex:worksIn ?d . ?d rdfs:label ?dName }`,
  )
  for (const e of employees) console.log(`  👤 ${e.name} — ${e.dName}`)
  console.log()

  // Cross-endpoint query: same SPARQL, different results
  console.log('query_all() — same query across all endpoints:')
  const allNamed = await store.queryAll(`SELECT ?s ?label WHERE { ?s rdfs:label ?label } LIMIT 5`)
  for (const [epName, rows] of Object.entries(allNamed)) {
    console.log(`  [${epName}] ${rows.length} labeled resources:`)
    for (const r of rows) console.log(`    ${r.s} → ${r.label}`)
  }
  console.log()

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO 3: Auto-generated tools for AGUI agent
  // ════════════════════════════════════════════════════════════════════
  console.log('═══ Scenario 3: Agent tools ═══\n')

  const tools = store.createTools()
  console.log(`Generated ${tools.length} tools:\n`)
  for (const t of tools) {
    console.log(`  🔧 ${t.name}`)
    console.log(`     ${t.description}`)
    console.log()
  }

  // Demonstrate tool execution
  console.log('─'.repeat(60))
  console.log('Demo: calling list_endpoints tool...')
  console.log('─'.repeat(60))
  const listResult = await tools.find((t) => t.name === 'list_endpoints')!.handler({})
  console.log(listResult)
  console.log()

  console.log('─'.repeat(60))
  console.log('Demo: calling research_discover tool...')
  console.log('─'.repeat(60))
  const discoverResult = await tools.find((t) => t.name === 'research_discover')!.handler({})
  console.log(discoverResult)
  console.log()

  console.log('─'.repeat(60))
  console.log('Demo: calling hr_discover tool...')
  console.log('─'.repeat(60))
  const hrResult = await tools.find((t) => t.name === 'hr_discover')!.handler({})
  console.log(hrResult)
  console.log()

  console.log('─'.repeat(60))
  console.log('Demo: calling hr_sparql to find managers...')
  console.log('─'.repeat(60))
  const queryResult = await tools.find((t) => t.name === 'hr_sparql')!.handler({
    query: `SELECT ?name ?dept WHERE { ?s ex:name ?name ; ex:manages ?d . ?d rdfs:label ?dept }`,
  })
  console.log(queryResult)

  console.log()
  console.log('═══ Summary ═══')
  console.log('  SemanticStore manages multiple named RDF endpoints.')
  console.log('  Each endpoint has a description the agent uses to decide which to query.')
  console.log('  Tools are auto-generated per endpoint with descriptions baked in.')
  console.log('  Config-driven setup: define endpoints in JSON, call buildStore().')
  console.log('  Cross-endpoint querying: query_all() fans out SELECT across all stores.')
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
