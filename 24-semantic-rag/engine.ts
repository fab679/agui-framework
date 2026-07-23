/**
 * engine.ts — Pluggable RDF engine interface with local + remote implementations.
 *
 * RdfEngine: abstract interface that any RDF store can implement.
 * SparqlEngine: in-process oxigraph.Store wrapper (synchronous, wrapped in async).
 * SparqlEndpointClient: remote SPARQL 1.1 Protocol client (fetch-based).
 *
 * To add a new backend (RDF4J, Jena, Stardog, etc.):
 *   class MyEngine implements RdfEngine { ... }
 */

import { Store, type Term, type Quad, type Literal, namedNode } from 'oxigraph'

export interface BindingRow {
  [variable: string]: string
}

const DEFAULT_PREFIXES: Record<string, string> = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  dc: 'http://purl.org/dc/elements/1.1/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  ex: 'http://example.org/research/',
}

/**
 * Abstract interface for any RDF store backend.
 * All methods return Promises — local engines can just `return` their sync result.
 * Remote engines (SparqlEndpointClient) perform HTTP calls.
 */
export interface RdfEngine {
  prefixes: Record<string, string>

  select(sparql: string): Promise<BindingRow[]>
  construct(sparql: string): Promise<Quad[]>
  ask(sparql: string): Promise<boolean>
  update(sparql: string): Promise<void>
  describe(uri: string): Promise<Quad[]>
  load(data: string, format: string, baseIRI?: string): Promise<void>
  loadQuads(quads: Iterable<Quad>): Promise<void>
  getSize(): Promise<number>

  expand(prefixed: string): Promise<string>
  shorten(uri: string): Promise<string>
  termToString(term: Term): Promise<string>
  addPrefixes(...sparql: string[]): Promise<string[]>

  formatSelectResult(rows: BindingRow[], label?: string): Promise<string>
  formatConstructResult(quads: Quad[], limit?: number): Promise<string>
  stats(): Promise<{ triples: number; classes: number; properties: number; instances: number }>
}

/**
 * In-process oxigraph.Store wrapper.
 * Implements RdfEngine by wrapping synchronous oxigraph calls in async methods.
 */
export class SparqlEngine implements RdfEngine {
  private store: Store
  prefixes: Record<string, string>

  constructor(prefixes?: Record<string, string>) {
    this.store = new Store()
    this.prefixes = { ...DEFAULT_PREFIXES, ...prefixes }
  }

  async getSize(): Promise<number> {
    return this.store.size
  }

  async load(data: string, format: string, baseIRI?: string): Promise<void> {
    this.store.load(data, { format, base_iri: baseIRI ? namedNode(baseIRI) : undefined })
  }

  async loadQuads(quads: Iterable<Quad>): Promise<void> {
    for (const q of quads) this.store.add(q)
  }

  private prefixed(sparql: string): string {
    const decls = Object.entries(this.prefixes).map(([k, v]) => `PREFIX ${k}: <${v}>`)
    return decls.join('\n') + '\n' + sparql
  }

  async select(sparql: string): Promise<BindingRow[]> {
    const result = this.store.query(this.prefixed(sparql))
    if (Array.isArray(result) && result.length > 0 && result[0] instanceof Map) {
      const rows = await Promise.all(
        (result as Map<string, Term>[]).map(async (row) => {
          const obj: BindingRow = {}
          for (const [key, term] of row) obj[key] = await this.termToString(term)
          return obj
        }),
      )
      return rows
    }
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result) as {
          results?: { bindings?: Record<string, { value: string }>[] }
        }
        return parsed.results?.bindings?.map((b) => {
          const obj: BindingRow = {}
          for (const [k, v] of Object.entries(b)) obj[k] = v.value
          return obj
        }) ?? []
      } catch {
        return []
      }
    }
    return []
  }

  async construct(sparql: string): Promise<Quad[]> {
    const result = this.store.query(this.prefixed(sparql))
    if (Array.isArray(result)) {
      if (result.length > 0 && !(result[0] instanceof Map) && typeof result[0] !== 'boolean') {
        return result as Quad[]
      }
    }
    return []
  }

  async ask(sparql: string): Promise<boolean> {
    return this.store.query(this.prefixed(sparql)) === true
  }

  async describe(uri: string): Promise<Quad[]> {
    return this.construct(`DESCRIBE <${uri}>`)
  }

  async update(sparql: string): Promise<void> {
    this.store.update(this.prefixed(sparql))
  }

  async addPrefixes(...sparql: string[]): Promise<string[]> {
    const decls = Object.entries(this.prefixes).map(([k, v]) => `PREFIX ${k}: <${v}>`)
    return sparql.map((q) => decls.join('\n') + '\n' + q)
  }

  async termToString(term: Term): Promise<string> {
    if (term.termType === 'NamedNode') return await this.shorten(term.value) as string
    if (term.termType === 'Literal') {
      const lit = term as Literal
      if (lit.language) return `"${lit.value}"@${lit.language}`
      const dt = lit.datatype?.value
      if (dt && dt !== 'http://www.w3.org/2001/XMLSchema#string') {
        return `"${lit.value}"^^${await this.shorten(dt)}`
      }
      return `"${lit.value}"`
    }
    if (term.termType === 'BlankNode') return `_:${term.value}`
    return term.toString()
  }

  async formatSelectResult(rows: BindingRow[], label?: string): Promise<string> {
    if (rows.length === 0) return '(no results)'
    const vars = Object.keys(rows[0])
    const lines = rows.map((r) => vars.map((v) => r[v] ?? '').join('  │  '))
    const header = vars.join('  │  ')
    const sep = vars.map(() => '─'.repeat(18)).join('─┼─')
    const out = [label ? `\n${label}:\n${header}\n${sep}` : `${header}\n${sep}`, ...lines]
    return out.join('\n')
  }

  async formatConstructResult(quads: Quad[], limit = 20): Promise<string> {
    if (quads.length === 0) return '(no triples)'
    const lines = await Promise.all(
      quads.slice(0, limit).map(async (q) => {
        const s = await this.termToString(q.subject)
        const p = await this.termToString(q.predicate)
        const o = await this.termToString(q.object)
        return `${s}  ${p}  ${o} .`
      }),
    )
    if (quads.length > limit) lines.push(`... and ${quads.length - limit} more`)
    return lines.join('\n')
  }

  async shorten(uri: string): Promise<string> {
    for (const [prefix, ns] of Object.entries(this.prefixes)) {
      if (uri.startsWith(ns)) return `${prefix}:${uri.slice(ns.length)}`
    }
    return `<${uri}>`
  }

  async expand(prefixed: string): Promise<string> {
    const m = prefixed.match(/^(\w+):(.+)$/)
    if (m && this.prefixes[m[1]]) return this.prefixes[m[1]] + m[2]
    if (prefixed.startsWith('<') && prefixed.endsWith('>')) return prefixed.slice(1, -1)
    return prefixed
  }

  async stats(): Promise<{ triples: number; classes: number; properties: number; instances: number }> {
    const classes = (await this.select('SELECT DISTINCT ?c WHERE { ?s rdf:type ?c }')).length
    const props = (await this.select('SELECT DISTINCT ?p WHERE { ?s ?p ?o }')).length
    const instances = (await this.select('SELECT DISTINCT ?s WHERE { ?s rdf:type ?c }')).length
    return { triples: await this.getSize(), classes, properties: props, instances }
  }
}

/**
 * Remote SPARQL 1.1 Protocol client.
 * Implements RdfEngine using HTTP fetch() to any SPARQL endpoint.
 * Supports: SELECT, ASK, CONSTRUCT, DESCRIBE, UPDATE, and basic size/stats.
 */
export class SparqlEndpointClient implements RdfEngine {
  prefixes: Record<string, string>
  private defaultGraph?: string

  constructor(
    public url: string,
    options?: { timeout?: number; headers?: Record<string, string>; prefixes?: Record<string, string>; defaultGraph?: string },
  ) {
    this.prefixes = { ...DEFAULT_PREFIXES, ...options?.prefixes }
    this.options = options
    this.defaultGraph = options?.defaultGraph
  }

  private options?: { timeout?: number; headers?: Record<string, string> }

  private async request(body: string, accept: string): Promise<Response> {
    const url = this.defaultGraph ? `${this.url}?default-graph-uri=${encodeURIComponent(this.defaultGraph)}` : this.url
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: accept,
        ...this.options?.headers,
      },
      body,
      signal: this.options?.timeout ? AbortSignal.timeout(this.options.timeout) : undefined,
    })
    if (!res.ok) throw new Error(`SPARQL endpoint error: ${res.status} ${await res.text()}`)
    return res
  }

  async select(sparql: string): Promise<BindingRow[]> {
    const res = await this.request(sparql, 'application/sparql-results+json')
    const json = (await res.json()) as {
      results?: { bindings?: Record<string, { value: string }>[] }
    }
    return (
      json.results?.bindings?.map((b) => {
        const obj: BindingRow = {}
        for (const [k, v] of Object.entries(b)) obj[k] = v.value
        return obj
      }) ?? []
    )
  }

  async ask(sparql: string): Promise<boolean> {
    const res = await this.request(sparql, 'application/sparql-results+json')
    const json = (await res.json()) as { boolean?: boolean }
    return json.boolean === true
  }

  async construct(sparql: string): Promise<Quad[]> {
    const res = await this.request(sparql, 'application/n-triples')
    const body = await res.text()
    // Parse N-Triples into Quad[] using oxigraph
    const tmp = new Store()
    tmp.load(body, { format: 'application/n-triples' })
    return [...tmp.match()]
  }

  async describe(uri: string): Promise<Quad[]> {
    return this.construct(`DESCRIBE <${uri}>`)
  }

  async update(sparql: string): Promise<void> {
    const url = this.defaultGraph
      ? `${this.url}?default-graph-uri=${encodeURIComponent(this.defaultGraph)}`
      : this.url
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-update',
        ...this.options?.headers,
      },
      body: sparql,
      signal: this.options?.timeout ? AbortSignal.timeout(this.options.timeout) : undefined,
    })
    if (!res.ok) throw new Error(`SPARQL update error: ${res.status} ${await res.text()}`)
  }

  async load(data: string, format: string, baseIRI?: string): Promise<void> {
    const tmp = new Store()
    tmp.load(data, { format, base_iri: baseIRI ? namedNode(baseIRI) : undefined })
    const quads = [...tmp.match()]
    if (quads.length === 0) return
    const ntriples = tmp.dump({ format: 'application/n-triples' })
    await this.update(`INSERT DATA { ${ntriples} }`)
  }

  async loadQuads(quads: Iterable<Quad>): Promise<void> {
    const tmp = new Store()
    for (const q of quads) tmp.add(q)
    const ntriples = tmp.dump({ format: 'application/n-triples' })
    await this.update(`INSERT DATA { ${ntriples} }`)
  }

  async getSize(): Promise<number> {
    const rows = await this.select('SELECT (COUNT(*) AS ?cnt) WHERE { ?s ?p ?o }')
    return rows.length > 0 ? parseInt(rows[0].cnt, 10) : 0
  }

  async addPrefixes(...sparql: string[]): Promise<string[]> {
    const decls = Object.entries(this.prefixes).map(([k, v]) => `PREFIX ${k}: <${v}>`)
    return sparql.map((q) => decls.join('\n') + '\n' + q)
  }

  async termToString(term: Term): Promise<string> {
    if (term.termType === 'NamedNode') {
      const uri = term.value
      for (const [prefix, ns] of Object.entries(this.prefixes)) {
        if (uri.startsWith(ns)) return `${prefix}:${uri.slice(ns.length)}`
      }
      return `<${uri}>`
    }
    if (term.termType === 'Literal') {
      const lit = term as Literal
      if (lit.language) return `"${lit.value}"@${lit.language}`
      const dt = lit.datatype?.value
      if (dt && dt !== 'http://www.w3.org/2001/XMLSchema#string') {
        return `"${lit.value}"^^<${dt}>`
      }
      return `"${lit.value}"`
    }
    if (term.termType === 'BlankNode') return `_:${term.value}`
    return term.toString()
  }

  async formatSelectResult(rows: BindingRow[], label?: string): Promise<string> {
    if (rows.length === 0) return '(no results)'
    const vars = Object.keys(rows[0])
    const lines = rows.map((r) => vars.map((v) => r[v] ?? '').join('  │  '))
    const header = vars.join('  │  ')
    const sep = vars.map(() => '─'.repeat(18)).join('─┼─')
    const out = [label ? `\n${label}:\n${header}\n${sep}` : `${header}\n${sep}`, ...lines]
    return out.join('\n')
  }

  async formatConstructResult(quads: Quad[], limit = 20): Promise<string> {
    if (quads.length === 0) return '(no triples)'
    const lines = await Promise.all(quads.slice(0, limit).map(async (q) => {
      const s = await this.termToString(q.subject)
      const p = await this.termToString(q.predicate)
      const o = await this.termToString(q.object)
      return `${s}  ${p}  ${o} .`
    }))
    if (quads.length > limit) lines.push(`... and ${quads.length - limit} more`)
    return lines.join('\n')
  }

  async shorten(uri: string): Promise<string> {
    for (const [prefix, ns] of Object.entries(this.prefixes)) {
      if (uri.startsWith(ns)) return `${prefix}:${uri.slice(ns.length)}`
    }
    return `<${uri}>`
  }

  async expand(prefixed: string): Promise<string> {
    const m = prefixed.match(/^(\w+):(.+)$/)
    if (m && this.prefixes[m[1]]) return this.prefixes[m[1]] + m[2]
    if (prefixed.startsWith('<') && prefixed.endsWith('>')) return prefixed.slice(1, -1)
    return prefixed
  }

  async stats(): Promise<{ triples: number; classes: number; properties: number; instances: number }> {
    const [classes, props, instances] = await Promise.all([
      this.select('SELECT DISTINCT ?c WHERE { ?s rdf:type ?c }'),
      this.select('SELECT DISTINCT ?p WHERE { ?s ?p ?o }'),
      this.select('SELECT DISTINCT ?s WHERE { ?s rdf:type ?c }'),
    ])
    return {
      triples: await this.getSize(),
      classes: classes.length,
      properties: props.length,
      instances: instances.length,
    }
  }
}
