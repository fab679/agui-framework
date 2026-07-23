# Semantic RAG Agent

Query RDF knowledge graphs using SPARQL with an autonomous agent that discovers schema, applies RDFS/OWL reasoning, walks graphs, and finds entity connections — all via natural language.

## Overview

The Semantic RAG module provides a pluggable RDF engine abstraction (`RdfEngine`) with two built-in backends:

- **`SparqlEngine`** — In-process local store using [oxigraph](https://oxigraph.org/), supports Turtle, N-Triples, and SPARQL queries
- **`SparqlEndpointClient`** — Remote SPARQL 1.1 HTTP client for any endpoint (Wikidata, DBpedia, enterprise triple stores)

On top of the engine layer, two tool systems are available:

| System | Description |
|--------|-------------|
| `createTools()` | 14 standalone tools for schema discovery, SPARQL querying, reasoning, graph walking, and Wikidata queries |
| `SemanticStore` | Multi-endpoint manager that generates per-endpoint tools with natural-language descriptions for agentic discovery |

## Installation

The module is built into `agui-framework` — no additional install needed:

```typescript
import { SparqlEngine, SparqlEndpointClient, Reasoner, SemanticStore, createTools } from 'agui-framework'
```

## Quick Start

### Fast Path (one-liner)

```typescript
import { createSemanticAgent } from 'agui-framework'

const agent = await createSemanticAgent({
  model: 'gpt-4o',
  provider: 'openai',
  data: `@prefix ex: <http://example.org/> .
    ex:Alice a ex:Person ; ex:name "Alice" .
    ex:Bob   a ex:Person ; ex:name "Bob" .`,
})

for await (const chunk of agent.stream('Who are all the people in the graph?')) {
  process.stdout.write(chunk)
}
```

Or with your own tools, no RDF data needed:

```typescript
const agent = await createSemanticAgent({
  model: 'gpt-4o',
  provider: 'openai',
  tools: myCustomTools,
  planning: true,
})
```

This single call:
1. Creates an in-process `SparqlEngine` and loads your Turtle data (or uses your pre-existing engine via `engine:`)
2. Creates a `Reasoner` for RDFS/OWL inference
3. Generates all 14 semantic tools (SPARQL query, schema discovery, graph walk, etc.)
4. Merges any custom tools you passed via `tools:`
5. Creates an `Agent` with appropriate defaults
6. Wraps it in a `DeepAgent` with planning tools and context management
7. Returns the ready-to-use `DeepAgent`

### Manual Path (full control)

```typescript
import { Agent, SparqlEngine, Reasoner, createTools, DeepAgent } from 'agui-framework'

const engine = new SparqlEngine()
await engine.load(TURTLE_DATA, 'text/turtle')

const reasoner = new Reasoner(engine)
const tools = createTools(engine, reasoner)

const agent = new Agent({
  model: 'gpt-4o',
  provider: 'openai',
  instructions: 'You are a Semantic Web assistant. Discover schema first.',
  tools,
})

const deepAgent = new DeepAgent(agent, { planning: true, contextManagement: true })
deepAgent.enhanceWithDeepCapabilities()

for await (const chunk of deepAgent.stream('Who are all the people?')) {
  process.stdout.write(chunk)
}
```

## Key Concepts

### RdfEngine Interface

All RDF backends implement `RdfEngine`, making them swappable without changing agent code:

```typescript
interface RdfEngine {
  select(sparql: string): Promise<BindingRow[]>
  construct(sparql: string): Promise<Quad[]>
  ask(sparql: string): Promise<boolean>
  describe(uri: string): Promise<Quad[]>
  update(sparql: string): Promise<void>
  load(data: string, format: string, baseIRI?: string): Promise<void>
  stats(): Promise<{ triples: number; classes: number; properties: number; instances: number }>
  formatSelectResult(rows: BindingRow[]): Promise<string>
  formatConstructResult(quads: Quad[], limit?: number): Promise<string>
}
```

### Local Store

```typescript
import { SparqlEngine } from 'agui-framework'

const engine = new SparqlEngine()
await engine.load(TURTLE_DATA, 'text/turtle', 'http://example.org/')
const results = await engine.select('SELECT ?s ?label WHERE { ?s rdfs:label ?label }')
```

#### Using Your Existing oxigraph Store

If you already have an oxigraph `Store` loaded with data, pass it directly to `SparqlEngine`:

```typescript
import { SparqlEngine } from 'agui-framework'
import { Store, namedNode } from 'oxigraph'

// Your existing oxigraph Store with pre-loaded data
const myStore = new Store()
myStore.add(
  namedNode('http://example.org/Paper1'),
  namedNode('http://example.org/cites'),
  namedNode('http://example.org/Paper2'),
)

// Wrap it in SparqlEngine for the RdfEngine interface
const engine = new SparqlEngine(myStore)
const results = await engine.select('SELECT ?s ?p ?o WHERE { ?s ?p ?o }')
console.log(results)
```

Or pass it directly to `createSemanticAgent` via the `engine` option:

```typescript
import { createSemanticAgent, SparqlEngine } from 'agui-framework'
import { Store, namedNode } from 'oxigraph'

const myStore = new Store()
// ... load your data into myStore ...

const agent = await createSemanticAgent({
  model: 'gpt-4o',
  provider: 'openai',
  engine: new SparqlEngine(myStore),
  planning: true,
})
```

#### Direct oxigraph Store Access

`SparqlEngine.store` exposes the underlying oxigraph `Store` for operations not covered by `RdfEngine`:

```typescript
import { SparqlEngine } from 'agui-framework'
import { namedNode } from 'oxigraph'

const engine = new SparqlEngine()

// Add quads directly
engine.store.add(
  namedNode('http://example.org/Paper1'),
  namedNode('http://example.org/cites'),
  namedNode('http://example.org/Paper2'),
)

// Iterate all quads
for (const quad of engine.store.match()) {
  console.log(quad.subject.value, quad.predicate.value, quad.object.value)
}

// Export as N-Triples
const ntriples = engine.store.dump({ format: 'application/n-triples' })

// Custom SPARQL via oxigraph's native API
const result = engine.store.query('SELECT ?s WHERE { ?s ?p ?o }')
```

### Remote SPARQL Endpoint

```typescript
import { SparqlEndpointClient } from 'agui-framework'

const wikidata = new SparqlEndpointClient('https://query.wikidata.org/sparql', {
  timeout: 15000,
  headers: { 'User-Agent': 'my-app/1.0' },
})

const cities = await wikidata.select(`
  SELECT ?city ?cityLabel WHERE {
    ?city wdt:P31 wd:Q515 .
    ?city rdfs:label "Paris"@en .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
  }
`)
```

### RDFS/OWL Reasoning

```typescript
import { Reasoner, SparqlEngine } from 'agui-framework'

const engine = new SparqlEngine()
// ... load data ...
const reasoner = new Reasoner(engine)
const result = await reasoner.applyAll(3)
console.log(`Inferred ${result.triplesAdded} triples`)
```

### SemanticStore (Multi-Endpoint)

Manage multiple SPARQL/RDF endpoints, each with a natural-language description so the agent discovers and queries the right one:

```typescript
import { SemanticStore, SparqlEngine, SparqlEndpointClient } from 'agui-framework'

const store = new SemanticStore()
store.register({
  name: 'research',
  description: 'Academic publications and citation network',
  engine: new SparqlEngine(),
})
store.register({
  name: 'wikidata',
  description: 'General world knowledge: entities, people, places, dates',
  engine: new SparqlEndpointClient('https://query.wikidata.org/sparql', { timeout: 15000 }),
})

// Generate tools — each endpoint gets its own scoped tools
const tools = store.createTools()
// Tools: list_endpoints, research_sparql, research_discover, research_describe, research_reason,
//        wikidata_sparql, wikidata_discover, wikidata_describe, wikidata_reason, query_all

// Agent reads endpoint descriptions and picks the right tool
const agent = new Agent({ model: 'gpt-4o', provider: 'openai', tools })
```

### Declarative JSON Config

For production setups, use `buildStore()` with a declarative JSON config:

```typescript
import { buildStore } from 'agui-framework'

const store = await buildStore([
  {
    name: 'research',
    description: 'Academic publications and citation network',
    engine: {
      type: 'local',
      data: './data/research.ttl',
      prefixes: { ex: 'http://example.org/research/' },
    },
  },
  {
    name: 'wikidata',
    description: 'General world knowledge',
    engine: {
      type: 'sparql',
      url: 'https://query.wikidata.org/sparql',
      timeout: 15000,
    },
  },
  {
    name: 'enterprise',
    description: 'Internal enterprise triple store',
    engine: {
      type: 'sparql',
      url: 'https://stardog.internal.example.com/sparql',
      headers: { Authorization: 'Bearer ${STARDOG_TOKEN}' },
    },
  },
])

const tools = store.createTools()
```

#### API Keys & Authentication

Remote SPARQL endpoints often require authentication. Secrets are managed via `.env` files using `${VAR_NAME}` interpolation in any config string — `url`, `data`, `description`, and all `headers` values:

```bash
# .env
STARDOG_URL=https://stardog.internal.example.com/sparql
STARDOG_TOKEN=sk-abc123...
NEPTUNE_HOST=db-neptune-1.region.neptune.amazonaws.com
NEPTUNE_API_KEY=xyz-789...
SPARQL_WIKIDATA_URL=https://query.wikidata.org/sparql
```

```typescript
const store = await buildStore([
  {
    name: 'enterprise',
    description: 'Internal triple store',
    engine: {
      type: 'sparql',
      url: '${STARDOG_URL}',
      headers: { Authorization: 'Bearer ${STARDOG_TOKEN}' },
    },
  },
  {
    name: 'neptune',
    description: 'AWS Neptune graph database',
    engine: {
      type: 'sparql',
      url: 'https://${NEPTUNE_HOST}:8182/sparql',
      headers: { 'x-api-key': '${NEPTUNE_API_KEY}' },
    },
  },
  {
    name: 'wikidata',
    description: 'World knowledge',
    engine: {
      type: 'sparql',
      url: '${SPARQL_WIKIDATA_URL}',
      timeout: 15000,
    },
  },
])
```

The `resolveEnv()` function interpolates `${VAR_NAME}` from `process.env` at construction time. If a variable is not set, a warning is printed and the placeholder is left as-is. This follows the same `.env` pattern used by the framework for provider API keys (`AGUI_OPENAI_KEY`, `AGUI_ANTHROPIC_KEY`).

A `.env.example` template is available at `24-semantic-rag/.env.example` for reference.

**Engine types:**

| Type | Description | Required fields |
|------|-------------|-----------------|
| `local` | In-process oxigraph store, loads data from a file | `data` (path to `.ttl` or `.nt` file) |
| `sparql` | Remote SPARQL 1.1 HTTP endpoint | `url` (endpoint URL) |

**Generated tools per endpoint:**

| Tool | Description |
|------|-------------|
| `{name}_sparql` | SPARQL SELECT on this endpoint |
| `{name}_discover` | Schema discovery for this endpoint |
| `{name}_describe` | DESCRIBE a resource in this endpoint |
| `{name}_reason` | RDFS/OWL reasoning on this endpoint |
| `query_all` | Same SPARQL across all endpoints (only if >1 registered) |
| `list_endpoints` | List all available endpoints with descriptions |

### Available Tools (createTools)

| Tool | Description |
|------|-------------|
| `store_stats` | Triple/class/property/instance counts |
| `sparql_query` | SPARQL SELECT with tabular results |
| `sparql_construct` | SPARQL CONSTRUCT/DESCRIBE returning triples |
| `sparql_ask` | SPARQL ASK returning Yes/No |
| `sparql_update` | SPARQL INSERT/DELETE |
| `discover_schema` | Full schema dump: classes, properties, hierarchy |
| `describe_resource` | All triples for a resource |
| `explore_class` | Class hierarchy, instances, domain/range |
| `explore_property` | Property definitions, domain, range, usage |
| `apply_reasoning` | RDFS/OWL RL reasoner |
| `walk_graph` | BFS graph traversal from a seed node |
| `find_connection` | Find shortest path between two resources |
| `query_wikidata` | Query live Wikidata SPARQL endpoint |
| `ns` | Show/lookup namespace prefixes |

## Full Example

See `examples/05-semantic-rag.ts` for a complete agent that explores a research publication knowledge graph — the agent discovers schema, queries entities, applies reasoning, walks citation networks, and synthesizes findings.
