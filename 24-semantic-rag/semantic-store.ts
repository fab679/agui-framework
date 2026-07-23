/**
 * semantic-store.ts — Multi-endpoint RDF store abstraction for agentic use.
 *
 * Design:
 *   - Manages multiple named RDF endpoints (local oxigraph, remote SPARQL, etc.)
 *   - Each endpoint has a natural-language description so the agent can decide which to query
 *   - Tools are auto-generated per endpoint, each with the endpoint's description baked in
 *   - The agent discovers the right endpoint by reading tool descriptions, then calls it
 *   - Cross-endpoint queries are supported via `queryAll`
 *
 * Proposed integration into agui-framework:
 *   - Users declare endpoints in their agui config (opencode.json)
 *   - SemanticStore generates ToolConfig[] from the config
 *   - The agent sees endpoints as tools with rich descriptions
 *   - Federation: one tool runs the same SPARQL across all endpoints
 *
 * Example config:
 *   {
 *     "semanticStores": [
 *       { "name": "research", "description": "..." },
 *       { "name": "wikidata", "description": "...", "url": "https://query.wikidata.org/sparql" }
 *     ]
 *   }
 */

import type { ToolConfig } from 'agui-framework'
import { SparqlEngine, SparqlEndpointClient, type RdfEngine, type BindingRow } from './engine.js'
import { Reasoner } from './reasoner.js'

export interface EndpointDef {
  name: string
  description: string
  engine: RdfEngine
}

export interface EndpointInfo {
  name: string
  description: string
  stats: { triples: number; classes: number; properties: number; instances: number }
}

export class SemanticStore {
  private endpoints: Map<string, EndpointDef> = new Map()

  register(def: EndpointDef): void {
    if (this.endpoints.has(def.name)) {
      throw new Error(`Endpoint "${def.name}" already registered`)
    }
    this.endpoints.set(def.name, def)
  }

  get(name: string): RdfEngine {
    const ep = this.endpoints.get(name)
    if (!ep) throw new Error(`Unknown endpoint "${name}". Available: ${[...this.endpoints.keys()].join(', ')}`)
    return ep.engine
  }

  list(): EndpointInfo[] {
    return [...this.endpoints.values()].map(({ name, description }) => ({
      name,
      description,
      stats: { triples: 0, classes: 0, properties: 0, instances: 0 },
    }))
  }

  async queryAll(sparql: string): Promise<Record<string, BindingRow[]>> {
    const results: Record<string, BindingRow[]> = {}
    for (const [name, ep] of this.endpoints) {
      try {
        results[name] = await ep.engine.select(sparql)
      } catch {
        results[name] = []
      }
    }
    return results
  }

  /**
   * Generate ToolConfig[] for an AGUI agent.
   * Each endpoint gets its own tools with the description baked in,
   * plus a "query_all" tool and a "list_endpoints" tool.
   */
  createTools(): ToolConfig[] {
    const tools: ToolConfig[] = []

    // ── Endpoint listing ──
    tools.push({
      name: 'list_endpoints',
      description: 'List all registered SPARQL/RDF endpoints with descriptions. Use this to discover which endpoint has the data you need.',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async () => {
        const entries = [...this.endpoints.values()]
        if (entries.length === 0) return '(no endpoints registered)'
        return (
          '🗄️ Registered endpoints:\n' +
          entries
            .map((ep, i) => {
              const info = `  [${i + 1}] ${ep.name}: ${ep.description}`
              return info
            })
            .join('\n') +
          '\n\nUse list_endpoints to see available stores, then query any endpoint by name.'
        )
      },
    })

    // ── Per-endpoint tools ──
    for (const [name, ep] of this.endpoints) {
      const engine = ep.engine
      const reasoner = new Reasoner(engine)

      tools.push({
        name: `${name}_sparql`,
        description: `Execute SPARQL SELECT on "${name}". ${ep.description}`,
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'SPARQL SELECT query' } },
          required: ['query'],
        },
        handler: async (args) => {
          const query = typeof args.query === 'string' ? args.query : ''
          if (!query) return 'Provide a SPARQL SELECT query.'
          const rows = await engine.select(query)
          if (rows.length === 0) return '(no results)'
          return `[${name}] ${rows.length} rows:\n${await engine.formatSelectResult(rows)}`
        },
      })

      tools.push({
        name: `${name}_discover`,
        description: `Discover schema (classes, properties) of "${name}". ${ep.description}`,
        parameters: { type: 'object', properties: {}, required: [] },
        handler: async () => {
          const st = await engine.stats()
          const classes = await engine.select(
            `SELECT ?c (COUNT(?inst) AS ?count) WHERE { ?inst rdf:type ?c } GROUP BY ?c ORDER BY DESC(?count)`,
          )
          const props = await engine.select(
            `SELECT ?p (COUNT(?s) AS ?count) WHERE { ?s ?p ?o } GROUP BY ?p ORDER BY DESC(?count)`,
          )
          const lines = [
            `📐 [${name}] Schema`,
            `  Triples: ${st.triples}, Classes: ${st.classes}, Properties: ${st.properties}, Instances: ${st.instances}`,
            '',
          ]
          if (classes.length > 0) {
            lines.push('Classes:')
            for (const c of classes) lines.push(`  • ${c.c} (${c.count})`)
          }
          if (props.length > 0) {
            lines.push('Properties:')
            for (const p of props) lines.push(`  • ${p.p} (${p.count})`)
          }
          return lines.join('\n')
        },
      })

      tools.push({
        name: `${name}_describe`,
        description: `DESCRIBE a resource in "${name}". ${ep.description}`,
        parameters: {
          type: 'object',
          properties: { uri: { type: 'string', description: 'Resource URI' } },
          required: ['uri'],
        },
        handler: async (args) => {
          const uri = typeof args.uri === 'string' ? args.uri : ''
          const expanded = uri.includes(':') ? await engine.expand(uri) : await engine.expand(`ex:${uri}`)
          const quads = await engine.describe(expanded)
          if (quads.length === 0) return `No triples found for "${uri}" in ${name}.`
          return `[${name}] ${await engine.shorten(expanded)} (${quads.length} triples):\n${await engine.formatConstructResult(quads)}`
        },
      })

      tools.push({
        name: `${name}_reason`,
        description: `Run RDFS/OWL reasoning on "${name}". ${ep.description}`,
        parameters: {
          type: 'object',
          properties: { iterations: { type: 'number', description: 'Max iterations (default 3)' } },
          required: [],
        },
        handler: async (args) => {
          const iterations = typeof args.iterations === 'number' ? args.iterations : 3
          const before = await engine.getSize()
          const result = await reasoner.applyAll(iterations)
          return `[${name}] 🧠 Reasoned: ${result.rulesApplied} rules, ${result.triplesAdded} triples added. Total: ${await engine.getSize()} triples.`
        },
      })
    }

    // ── Cross-endpoint tool ──
    if (this.endpoints.size > 1) {
      tools.push({
        name: 'query_all',
        description: `Execute the same SPARQL SELECT across ALL ${this.endpoints.size} endpoints. Results are labeled by endpoint name.`,
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'SPARQL SELECT query' } },
          required: ['query'],
        },
        handler: async (args) => {
          const query = typeof args.query === 'string' ? args.query : ''
          if (!query) return 'Provide a SPARQL SELECT query.'
          const all = await this.queryAll(query)
          const lines: string[] = []
          for (const [epName, rows] of Object.entries(all)) {
            if (rows.length === 0) continue
            lines.push(`[${epName}] ${rows.length} results:`)
            lines.push(await this.endpoints.get(epName)!.engine.formatSelectResult(rows))
            lines.push('')
          }
          return lines.length > 0 ? lines.join('\n') : '(no results from any endpoint)'
        },
      })
    }

    return tools
  }
}

// ── Env var interpolation ──
// Any string value in the config can reference environment variables
// via ${VAR_NAME} syntax, e.g.: "url": "https://${SPARQL_HOST}/sparql"
// Values are resolved from process.env at build time.

function resolveEnv(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, name) => {
    if (process.env[name] === undefined) {
      console.warn(`[semantic-store] env var \${${name}} not set, leaving unresolved`)
      return `\${${name}}`
    }
    return process.env[name]!
  })
}

export interface EngineConfig {
  type: 'local' | 'sparql'
  /** Path to a Turtle/N-Triples file (supports ${VAR_NAME}) */
  data?: string
  /** SPARQL endpoint URL (supports ${VAR_NAME}) */
  url?: string
  prefixes?: Record<string, string>
  timeout?: number
  /** HTTP headers — value supports ${VAR_NAME} for API keys */
  headers?: Record<string, string>
}

export interface StoreConfig {
  name: string
  description: string
  engine: EngineConfig
}

export async function buildStore(configs: StoreConfig[]): Promise<SemanticStore> {
  const store = new SemanticStore()
  for (const cfg of configs) {
    let engine: RdfEngine
    if (cfg.engine.type === 'local') {
      engine = new SparqlEngine(cfg.engine.prefixes)
      if (cfg.engine.data) {
        const fs = await import('fs')
        const filePath = resolveEnv(cfg.engine.data)
        const data = fs.readFileSync(filePath, 'utf-8')
        const fmt = filePath.endsWith('.ttl')
          ? 'text/turtle'
          : filePath.endsWith('.nt')
            ? 'application/n-triples'
            : 'text/turtle'
        await engine.load(data, fmt)
      }
    } else {
      const url = resolveEnv(cfg.engine.url!)
      const headers = cfg.engine.headers
        ? Object.fromEntries(
            Object.entries(cfg.engine.headers).map(([k, v]) => [k, resolveEnv(v)]),
          )
        : undefined
      engine = new SparqlEndpointClient(url, {
        timeout: cfg.engine.timeout ?? 15000,
        headers,
        prefixes: cfg.engine.prefixes,
      })
    }
    store.register({ name: cfg.name, description: resolveEnv(cfg.description), engine })
  }
  return store
}
