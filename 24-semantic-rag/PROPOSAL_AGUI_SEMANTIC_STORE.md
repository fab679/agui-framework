# Proposal: `SemanticStore` — First-Class Multi-Endpoint RDF Support for AGUI Framework

## Problem

AGUI framework has no built-in RDF/Semantic Web support. Users who want to build agents that query SPARQL endpoints (Wikidata, DBpedia, local RDF stores) must manually wire up HTTP clients, manage endpoint configurations, and write boilerplate for every endpoint. There is no agent-friendly way to:

- Declare multiple SPARQL endpoints in config
- Let the agent **discover** which endpoint has the data it needs
- Query, describe, reason, and walk graphs across multiple endpoints
- Federate queries across endpoints in a single tool call

## Proposed Solution: `SemanticStore`

A first-class AGUI module that manages named RDF endpoints with natural-language descriptions. The agent discovers endpoints by reading their descriptions, then calls auto-generated tools scoped to the right endpoint.

### Key Design Decisions

1. **Description-driven discovery** — Each endpoint has a natural-language description. The agent reads `list_endpoints`, compares descriptions to the user's question, and picks the right tool.

2. **Scoped tool naming** — Tools are named `{endpoint}_{action}` (e.g. `wikidata_sparql`, `research_describe`, `hr_discover`), so the agent can see and invoke any endpoint's capabilities.

3. **Pluggable engine architecture** — `RdfEngine` interface (already designed and proven in the example) supports:
   - `SparqlEngine` — Local in-process oxigraph Store
   - `SparqlEndpointClient` — Remote SPARQL 1.1 HTTP (any endpoint)
   - Any future backend (RDF4J, Jena, Stardog, Amazon Neptune) by implementing `RdfEngine`

4. **Declarative config** — Users define endpoints in their AGUI configuration:

```jsonc
{
  "semanticStores": [
    {
      "name": "research",
      "description": "Academic publications, authors, citations, journals, co-authorship network",
      "engine": { "type": "local", "data": "./data/research.ttl" }
    },
    {
      "name": "wikidata",
      "description": "General world knowledge: entities, people, places, dates",
      "engine": { "type": "sparql", "url": "https://query.wikidata.org/sparql" }
    }
  ]
}
```

5. **No new abstractions** — Everything builds on the existing `RdfEngine` interface and AGUI's `ToolConfig`/`Agent` system. No custom agent logic needed.

### API Key / Secrets Handling

Remote SPARQL endpoints often require authentication (Stardog, Neptune, GraphDB, RDF4J). Secrets are managed via `.env` files using `${VAR_NAME}` interpolation in config strings:

```env
# .env
SPARQL_ENDPOINT=https://query.wikidata.org/sparql
ENTERPRISE_SPARQL_URL=https://stardog.internal.example.com/sparql
ENTERPRISE_API_KEY=sk-abc123...
NEPTUNE_HOST=db-neptune-1.region.neptune.amazonaws.com
NEPTUNE_API_KEY=xyz-789...
```

```jsonc
{
  "semanticStores": [
    {
      "name": "enterprise",
      "description": "Internal enterprise triple store",
      "engine": {
        "type": "sparql",
        "url": "${ENTERPRISE_SPARQL_URL}",
        "headers": { "Authorization": "Bearer ${ENTERPRISE_API_KEY}" },
        "timeout": 30000
      }
    }
  ]
}
```

The `buildStore()` function auto-resolves `${VAR_NAME}` references from `process.env` at construction time. This keeps secrets out of config files and follows the `.env` pattern already used by AGUI for model API keys. A `.env.example` file is provided as a template.

## Architecture

```
┌─────────────────────────────────────────────┐
│              AGUI Agent                      │
│  (reads tool descriptions, calls tools)      │
└──────────┬──────────────────────┬────────────┘
           │                      │
    ┌──────▼──────┐        ┌─────▼──────┐
    │ research_*  │        │  hr_*      │  ... per endpoint
    │ tools       │        │  tools     │
    └──────┬──────┘        └─────┬──────┘
           │                     │
    ┌──────▼──────────────┐      │
    │  SemanticStore      │──────┘
    │  - routing          │
    │  - cross-query      │
    └──────┬──────────────┘
           │
    ┌──────▼──────────────┐
    │  RdfEngine interface │
    │  (select, construct, │
    │   describe, update,  │
    │   load, reason, ...) │
    └──────┬──────────────┘
           │
    ┌──────┴──────┐  ┌──────────┐
    │ SparqlEngine│  │SparqlEndpoint│
    │ (oxigraph)  │  │Client (HTTP)│
    └─────────────┘  └────────────┘
```

### Tool Naming Convention

For an endpoint named `"research"`, the generated tools are:

| Tool Name | Description | Agent Use Case |
|-----------|-------------|----------------|
| `list_endpoints` | Lists all available endpoints | "What data stores exist?" |
| `research_sparql` | SPARQL SELECT on research | "Query for specific patterns" |
| `research_discover` | Schema discovery | "What classes and properties exist?" |
| `research_describe` | DESCRIBE a resource | "What triples does this entity have?" |
| `research_reason` | RDFS/OWL reasoning | "Infer implicit facts" |
| `query_all` | Same SPARQL across all endpoints | "Find this fact in any store" |

The endpoint's description is baked into each tool's `description` field, so when the agent asks "which endpoint has employee data?", it sees `hr: Employee directory with departments, projects, salaries, ...` and picks `hr_sparql`.

## Benefits

1. **Zero boilerplate for new endpoints** — Declare in config, get tools for free
2. **Agent naturally discovers stores** — No hardcoded routing logic; the agent reads descriptions and decides
3. **Extensible** — Any SPARQL 1.1 endpoint works; any RDF store engine can implement `RdfEngine`
4. **Federation built in** — `query_all` fans out SELECT queries to all endpoints, merges results
5. **Existing ecosystem compatible** — Wikidata, DBpedia, local TTL files, enterprise triple stores
6. **Reasoning on any store** — RDFS/OWL RL reasoner works via the `RdfEngine` interface on any backend
7. **Framework natural fit** — Uses `ToolConfig`, `Agent`, and the existing tool pattern; no new framework concepts

## Implementation Status

The complete implementation exists in the `agui-examples` repo at `src/24-semantic-rag/`:

| File | Purpose |
|------|---------|
| `engine.ts` | `RdfEngine` interface + `SparqlEngine` + `SparqlEndpointClient` |
| `reasoner.ts` | Async RDFS/OWL RL reasoner (depends on `RdfEngine`) |
| `semantic-store.ts` | `SemanticStore` class + `buildStore()` config builder + tool generation |
| `semantic-store-demo.ts` | Full demo with two local endpoints, direct API, and agent tools |
| `multi-engine.ts` | Demonstrates pluggable engines (local, remote Wikidata, `MultiEndpointEngine`) |
| `example.ts` | End-to-end agent demo with research graph (5 questions, full agent session) |
| `tools.ts` | Original 14 standalone tools (superseded by `SemanticStore.createTools()`) |

## Suggested Integration into AGUI Framework

### Phase 1: Core Module
- Add `@agui/semantic-store` package (or `agui-framework/semantic`)
- Include `RdfEngine` interface, `SparqlEngine`, `SparqlEndpointClient`
- Include `SemanticStore` class with config loading and tool generation
- Include `Reasoner` for RDFS/OWL inference

### Phase 2: Config Integration
- Parse `semanticStores` from `opencode.json`
- Auto-load local files, connect to remote endpoints
- Surface endpoints as tools in the agent's tool list by default

### Phase 3: Advanced Federation
- SPARQL 1.1 Federation (`SERVICE` keyword) for cross-endpoint joins
- Query plan optimization: push down filters, limit early
- Caching layer for remote endpoint results

### Phase 4: RDF-Specific Agent Patterns
- "Discover-then-query" agent template (schema discovery before querying)
- Graph traversal agent pattern (walk citation networks, org charts)
- Federated reasoning agent (reason across stores, merge results)
