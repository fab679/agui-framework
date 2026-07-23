/**
 * multi-engine.ts — Demonstrates RdfEngine pluggability with local + remote backends.
 *
 * Shows three patterns:
 *   1. Local oxigraph (SparqlEngine)
 *   2. Remote SPARQL endpoint (SparqlEndpointClient) — Wikidata
 *   3. Multi-endpoint aggregator that fans out SELECT queries to multiple stores
 *
 * Run: npx tsx src/24-semantic-rag/multi-engine.ts
 */

import { SparqlEngine, SparqlEndpointClient, type RdfEngine, type BindingRow } from './engine.js'
import { Reasoner } from './reasoner.js'

// ---------------------------------------------------------------------------
// Pattern 1: Local engine with RDFS/OWL reasoning
// ---------------------------------------------------------------------------
async function demoLocalEngine() {
  console.log('═══ Local SparqlEngine ═══')
  const engine = new SparqlEngine({ eg: 'http://example.org/' })
  await engine.load(`
    @prefix eg: <http://example.org/> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    eg:Alice a eg:Person ; rdfs:label "Alice" ; eg:age "30" .
    eg:Bob   a eg:Person ; rdfs:label "Bob"   ; eg:age "25" .
    eg:Carol a eg:Person ; rdfs:label "Carol" .
  `, 'text/turtle')

  const people = await engine.select(`SELECT ?s ?label WHERE { ?s a eg:Person ; rdfs:label ?label }`)
  for (const p of people) console.log(`  ${p.s} → ${p.label}`)

  // Reasoner works with any RdfEngine
  // const reasoner = new Reasoner(engine)
  // await reasoner.applyAll(3)

  return engine
}

// ---------------------------------------------------------------------------
// Pattern 2: Remote SPARQL endpoint (Wikidata)
// ---------------------------------------------------------------------------
async function demoRemoteEndpoint() {
  console.log('\n═══ Remote SparqlEndpointClient (Wikidata) ═══')
  const wikidata = new SparqlEndpointClient('https://query.wikidata.org/sparql', {
    timeout: 15000,
    headers: { 'User-Agent': 'agui-examples/1.0 (multi-engine demo)' },
  })

  // Find Alan Turing's Wikidata item
  const rows = await wikidata.select(`
    SELECT ?item ?itemLabel WHERE {
      ?item wdt:P31 wd:Q5 .
      ?item rdfs:label "Alan Turing"@en .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
    } LIMIT 5
  `)

  for (const r of rows) console.log(`  ${r.item} → ${r.itemLabel}`)
  return rows
}

// ---------------------------------------------------------------------------
// Pattern 3: Multi-endpoint aggregator
// Implements RdfEngine by fanning out SELECT queries to multiple backends
// and merging results. Useful for federated queries across SPARQL endpoints.
// ---------------------------------------------------------------------------
class MultiEndpointEngine implements RdfEngine {
  prefixes: Record<string, string>

  constructor(
    public engines: RdfEngine[],
    prefixes?: Record<string, string>,
  ) {
    this.prefixes = prefixes ?? engines[0]?.prefixes ?? {}
  }

  async select(sparql: string): Promise<BindingRow[]> {
    // Fan out to all engines, tolerate individual failures
    const settled = await Promise.allSettled(this.engines.map((e) => e.select(sparql)))
    const seen = new Set<string>()
    const merged: BindingRow[] = []
    for (const result of settled) {
      if (result.status === 'rejected') continue
      for (const row of result.value) {
        const key = JSON.stringify(row)
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(row)
        }
      }
    }
    return merged
  }

  // Writes go to the first engine only
  async construct(sparql: string) { return this.engines[0].construct(sparql) }
  async ask(sparql: string) { return this.engines[0].ask(sparql) }
  async update(sparql: string) { return this.engines[0].update(sparql) }
  async describe(uri: string) { return this.engines[0].describe(uri) }
  async load(data: string, format: string, baseIRI?: string) { return this.engines[0].load(data, format, baseIRI) }
  async loadQuads(quads: any) { return this.engines[0].loadQuads(quads) }
  async getSize() { return this.engines[0].getSize() }
  async expand(prefixed: string) { return this.engines[0].expand(prefixed) }
  async shorten(uri: string) { return this.engines[0].shorten(uri) }
  async termToString(term: any) { return this.engines[0].termToString(term) }
  async addPrefixes(...sparql: string[]) { return this.engines[0].addPrefixes(...sparql) }
  async formatSelectResult(rows: BindingRow[], label?: string) { return this.engines[0].formatSelectResult(rows, label) }
  async formatConstructResult(quads: any[], limit?: number) { return this.engines[0].formatConstructResult(quads, limit) }
  async stats() { return this.engines[0].stats() }
}

async function demoMultiEndpoint() {
  console.log('\n═══ MultiEndpointEngine (local store + Wikidata) ═══')

  const local = new SparqlEngine({ eg: 'http://example.org/' })
  await local.load(`
    @prefix eg: <http://example.org/> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    eg:AlanTuring a eg:Person ; rdfs:label "Alan Turing" .
  `, 'text/turtle')

  const wikidata = new SparqlEndpointClient('https://query.wikidata.org/sparql', {
    timeout: 30000,
    headers: { 'User-Agent': 'agui-examples/1.0 (multi-engine demo)' },
  })

  const multi = new MultiEndpointEngine([local, wikidata])

  // Query for "Alan Turing" across both local store and Wikidata
  // Each backend gets the same SPARQL — each prepends its own PREFIX declarations.
  // The local store will prepend its prefixes (incl. eg:), while Wikidata
  // has wdt:/wd:/rdfs: built in, so only the local side matches.
  const rows = await multi.select(`
    SELECT ?s ?label WHERE {
      ?s rdfs:label ?label .
      FILTER(CONTAINS(LCASE(?label), "alan turing"))
    } LIMIT 10
  `)

  console.log(`  Found ${rows.length} results across all endpoints:`)
  for (const r of rows) console.log(`    ${r.s} → ${r.label}`)
}

// ---------------------------------------------------------------------------
// Run all demos
// ---------------------------------------------------------------------------
async function main() {
  await demoLocalEngine()
  await demoRemoteEndpoint()
  await demoMultiEndpoint()

  console.log('\n═══ Summary ═══')
  console.log('  RdfEngine interface allows swapping backends without changing tools.')
  console.log('  - SparqlEngine: local oxigraph Store (sync ops, async interface)')
  console.log('  - SparqlEndpointClient: any SPARQL 1.1 HTTP endpoint')
  console.log('  - MultiEndpointEngine: federated queries across multiple stores')
  console.log('  - Custom: implement RdfEngine for Jena, RDF4J, Stardog, etc.')
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
