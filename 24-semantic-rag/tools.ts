/**
 * tools.ts — 12 AGUI ToolConfig definitions for the Semantic RAG agent.
 *
 * Every tool handler calls only third-party code (oxigraph, fetch).
 * The AGUI framework is only used for the ToolConfig type and the
 * Agent/ToolConfig orchestration pattern.
 *
 * Tools are organized into categories:
 *   Query:     sparql_query, sparql_construct, sparql_ask, sparql_update
 *   Discovery: discover_schema, describe_resource, explore_class, explore_property
 *   Reasoning: apply_reasoning
 *   Traversal: walk_graph, find_connection
 *   External:  query_wikidata, ns
 *
 * All tools depend on RdfEngine (any backend) and Reasoner.
 */

import type { ToolConfig } from 'agui-framework'
import { type RdfEngine, SparqlEndpointClient } from './engine.js'
import { Reasoner } from './reasoner.js'

export function createTools(engine: RdfEngine, reasoner: Reasoner) {
  const endpointClient = new SparqlEndpointClient('https://query.wikidata.org/sparql', {
    timeout: 15000,
  })

  function s(args: Record<string, unknown>, key: string, fallback = ''): string {
    const v = args[key]
    return typeof v === 'string' ? v : fallback
  }

  function n(args: Record<string, unknown>, key: string, fallback = 0): number {
    const v = args[key]
    return typeof v === 'number' ? v : fallback
  }

  const tools: ToolConfig[] = [
    {
      name: 'store_stats',
      description: 'Get statistics about the local RDF store: triple count, class count, property count, instance count.',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async () => {
        const st = await engine.stats()
        return [
          `📊 Store Statistics:`,
          `  • ${st.triples} triples`,
          `  • ${st.classes} classes`,
          `  • ${st.properties} unique properties`,
          `  • ${st.instances} instances`,
        ].join('\n')
      },
    },

    {
      name: 'sparql_query',
      description: 'Execute a SPARQL SELECT query on the local store. Returns tabular results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SPARQL SELECT query' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const query = s(args, 'query')
        if (!query) return 'Please provide a SPARQL SELECT query in the "query" parameter.'
        const rows = await engine.select(query)
        if (rows.length === 0) return '(no results)'
        return `Query returned ${rows.length} rows:\n${await engine.formatSelectResult(rows)}`
      },
    },

    {
      name: 'sparql_construct',
      description: 'Execute a SPARQL CONSTRUCT or DESCRIBE query on the local store. Returns RDF triples.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SPARQL CONSTRUCT or DESCRIBE query' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const query = s(args, 'query')
        const quads = await engine.construct(query)
        if (quads.length === 0) return '(no triples)'
        return `Constructed ${quads.length} triples:\n${await engine.formatConstructResult(quads)}`
      },
    },

    {
      name: 'sparql_ask',
      description: 'Execute a SPARQL ASK query on the local store. Returns Yes or No.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SPARQL ASK query' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const query = s(args, 'query')
        return (await engine.ask(query)) ? 'Yes' : 'No'
      },
    },

    {
      name: 'sparql_update',
      description: 'Execute a SPARQL UPDATE (INSERT/DELETE) on the local store.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SPARQL INSERT or DELETE query' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const query = s(args, 'query')
        const before = await engine.getSize()
        await engine.update(query)
        const after = await engine.getSize()
        return `Store updated. ${after - before} triples changed. Total: ${after}`
      },
    },

    {
      name: 'describe_resource',
      description: 'DESCRIBE a resource to see all its triples. Use this to explore resources without knowing their schema ahead of time.',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'Resource URI (e.g. ex:Paper1 or Alice)' },
        },
        required: ['uri'],
      },
      handler: async (args) => {
        const uri = s(args, 'uri')
        const expanded = uri.includes(':') ? await engine.expand(uri) : await engine.expand(`ex:${uri}`)
        const quads = await engine.describe(expanded)
        if (quads.length === 0) {
          const lookup = await engine.select(
            `SELECT ?s ?p ?o WHERE { ?s ?p ?o . FILTER(CONTAINS(STR(?s), "${uri}")) } LIMIT 10`,
          )
          if (lookup.length > 0) {
            return `No exact match. Similar resources:\n${lookup.map((r) => `  ${r.s} ${r.p} ${r.o}`).join('\n')}`
          }
          return `No information found for "${uri}".`
        }
        const types = await Promise.all(
          quads
            .filter((q) => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
            .map((q) => engine.termToString(q.object)),
        )
        return [
          `📖 ${await engine.shorten(expanded)}`,
          types.length > 0 ? `   Types: ${types.join(', ')}` : '',
          '',
          `All triples (${quads.length}):`,
          await engine.formatConstructResult(quads),
        ]
          .filter(Boolean)
          .join('\n')
      },
    },

    {
      name: 'discover_schema',
      description: 'Discover all classes, properties, and their relationships. Shows class hierarchy and property definitions. Call this first to understand the data model.',
      parameters: {
        type: 'object',
        properties: {
          detail: {
            type: 'string',
            enum: ['summary', 'full'],
            description: 'Show summary or full schema dump',
          },
        },
        required: [],
      },
      handler: async (args) => {
        const detail = s(args, 'detail', 'summary')

        const classes = await engine.select(
          `SELECT ?c (COUNT(?inst) AS ?count) WHERE { ?inst rdf:type ?c } GROUP BY ?c ORDER BY DESC(?count)`,
        )
        const lines: string[] = ['📐 Classes:']
        for (const c of classes) {
          const parents = await engine.select(`SELECT ?super WHERE { ${c.c} rdfs:subClassOf ?super }`)
          const parentStr = parents.length > 0 ? ` ⊂ ${parents.map((p) => p.super).join(', ')}` : ''
          lines.push(`  • ${c.c} (${c.count} instances)${parentStr}`)
        }

        const props = await engine.select(
          `SELECT ?p (COUNT(?s) AS ?count) WHERE { ?s ?p ?o } GROUP BY ?p ORDER BY DESC(?count)`,
        )
        lines.push('')
        lines.push('📌 Properties:')
        for (const p of props) {
          const info = await engine.select(`
            SELECT ?attr ?val WHERE {
              { ${p.p} rdfs:domain ?val BIND("domain" AS ?attr) }
              UNION { ${p.p} rdfs:range ?val BIND("range" AS ?attr) }
              UNION { ${p.p} rdfs:subPropertyOf ?val BIND("subPropOf" AS ?attr) }
              UNION { ${p.p} a ?val FILTER(?val != rdf:Property) BIND("type" AS ?attr) }
            }
          `)
          const extras = info.map((r) => `${r.attr}=${r.val}`).join(', ')
          lines.push(`  • ${p.p} (${p.count} uses)${extras ? ` [${extras}]` : ''}`)
        }

        if (detail === 'full') {
          const defs = await engine.construct(
            `CONSTRUCT { ?p ?y ?z } WHERE { ?p rdf:type rdf:Property . ?p ?y ?z }`,
          )
          lines.push('')
          lines.push('Property definitions:')
          lines.push(await engine.formatConstructResult(defs))
        }

        return lines.join('\n')
      },
    },

    {
      name: 'explore_class',
      description: 'Get detailed information about a class: its hierarchy position, instances, and properties with this class as domain or range.',
      parameters: {
        type: 'object',
        properties: {
          classURI: { type: 'string', description: 'Class URI (e.g. ex:Publication)' },
        },
        required: ['classURI'],
      },
      handler: async (args) => {
        const classURI = s(args, 'classURI')
        const sURI = classURI.includes(':') ? classURI : `ex:${classURI}`
        const sh = await engine.shorten(await engine.expand(sURI))

        const hierarchy = await engine.select(`SELECT ?super WHERE { ${sh} rdfs:subClassOf ?super }`)
        const subclasses = await engine.select(`SELECT ?sub WHERE { ?sub rdfs:subClassOf ${sh} }`)
        const instances = await engine.select(`SELECT ?inst WHERE { ?inst rdf:type ${sh} } LIMIT 20`)
        const domainProps = await engine.select(`SELECT ?p WHERE { ?p rdfs:domain ${sh} }`)
        const rangeProps = await engine.select(`SELECT ?p WHERE { ?p rdfs:range ${sh} }`)

        return [
          `📐 Class: ${sh}`,
          hierarchy.length > 0 ? `  SubClassOf: ${hierarchy.map((r) => r.super).join(', ')}` : '',
          subclasses.length > 0 ? `  SubClasses: ${subclasses.map((r) => r.sub).join(', ')}` : '',
          instances.length > 0 ? `  Instances: ${instances.map((r) => r.inst).join(', ')}` : '',
          domainProps.length > 0 ? `  Domain of: ${domainProps.map((r) => r.p).join(', ')}` : '',
          rangeProps.length > 0 ? `  Range of: ${rangeProps.map((r) => r.p).join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      },
    },

    {
      name: 'explore_property',
      description: 'Get detailed information about a property: its domain, range, subProperty hierarchy, and OWL characteristics.',
      parameters: {
        type: 'object',
        properties: {
          propURI: { type: 'string', description: 'Property URI (e.g. ex:author)' },
        },
        required: ['propURI'],
      },
      handler: async (args) => {
        const propURI = s(args, 'propURI')
        const sURI = propURI.includes(':') ? propURI : `ex:${propURI}`
        const info = await engine.select(`SELECT ?p ?o WHERE { ${sURI} ?p ?o }`)
        const usage = await engine.select(`SELECT ?sub ?obj WHERE { ?sub ${sURI} ?obj } LIMIT 10`)

        return [
          `📌 Property: ${sURI}`,
          info.length > 0 ? `  Definitions:\n${info.map((r) => `    ${r.p}: ${r.o}`).join('\n')}` : '',
          usage.length > 0
            ? `  Usage (${usage.length} shown):\n${usage.map((r) => `    ${r.sub} → ${r.obj}`).join('\n')}`
            : '  (unused)',
        ]
          .filter(Boolean)
          .join('\n')
      },
    },

    {
      name: 'apply_reasoning',
      description: 'Run RDFS/OWL RL reasoner to infer new triples. Includes subClassOf/subPropertyOf transitivity, domain/range inference, symmetric properties, inverseOf, equivalentClass.',
      parameters: {
        type: 'object',
        properties: {
          iterations: { type: 'number', description: 'Max fixpoint iterations (default 3)' },
        },
        required: [],
      },
      handler: async (args) => {
        const iterations = n(args, 'iterations', 3)
        const before = await engine.getSize()
        const result = await reasoner.applyAll(iterations)
        const after = await engine.getSize()
        const added = after - before

        let samples = ''
        if (added > 0) {
          const latest = await engine.select(
            `SELECT ?s ?p ?o WHERE { ?s ?p ?o } OFFSET ${before} LIMIT 5`,
          )
          if (latest.length > 0) {
            samples = '\n  Sample inferred triples:'
            for (const r of latest) {
              if (r.s && r.p && r.o) samples += `\n    ${r.s}  ${r.p}  ${r.o}`
            }
          }
        }

        return [
          `🧠 Reasoning complete`,
          `  Rules applied: ${result.rulesApplied}`,
          `  Triples inferred: ${result.triplesAdded}`,
          `  New triples (this call): ${added}`,
          `  Store total: ${after} triples`,
          samples,
        ].join('\n')
      },
    },

    {
      name: 'walk_graph',
      description: 'BFS traversal from a seed URI, following links to connected resources. Great for exploring citation networks and understanding graph connectivity.',
      parameters: {
        type: 'object',
        properties: {
          startURI: { type: 'string', description: 'Starting resource (e.g. ex:Paper1)' },
          maxDepth: { type: 'number', description: 'Link-following depth (default 2)' },
          maxBreadth: { type: 'number', description: 'Max resources to visit (default 8)' },
          followProperties: {
            type: 'string',
            description: 'Properties to follow, comma-separated (default: all). E.g. "ex:cites,ex:author"',
          },
        },
        required: ['startURI'],
      },
      handler: async (args) => {
        const startURI = s(args, 'startURI')
        const maxDepth = n(args, 'maxDepth', 2)
        const maxBreadth = n(args, 'maxBreadth', 8)
        const followProperties = s(args, 'followProperties')

        const sURI = startURI.includes(':') ? startURI : `ex:${startURI}`
        const expanded = await engine.expand(sURI)
        const followSet = followProperties
          ? new Set(
              await Promise.all(
                followProperties.split(',').map(async (p) => {
                  const trimmed = p.trim()
                  const ex = await engine.expand(trimmed)
                  if (ex === trimmed && !trimmed.startsWith('<') && !trimmed.startsWith('http')) {
                    return engine.expand(`ex:${trimmed}`)
                  }
                  return ex
                }),
              ),
            )
          : null

        const visited = new Set<string>()
        const allTriples: string[] = []
        const queue: Array<{ uri: string; depth: number }> = [{ uri: expanded, depth: 0 }]

        while (queue.length > 0) {
          const { uri, depth } = queue.shift()!
          if (visited.has(uri) || depth > maxDepth) continue
          visited.add(uri)

          // Forward edges: triples where uri is the subject
          const quads = await engine.describe(uri)
          for (const q of quads) {
            allTriples.push(
              `${await engine.termToString(q.subject)}  ${await engine.termToString(q.predicate)}  ${await engine.termToString(q.object)} .`,
            )
            if (depth < maxDepth && q.object.termType === 'NamedNode') {
              const objURI = q.object.value
              if (!visited.has(objURI) && visited.size < maxBreadth) {
                if (!followSet || followSet.has(q.predicate.value)) {
                  queue.push({ uri: objURI, depth: depth + 1 })
                }
              }
            }
          }

          // Inverse edges: triples where uri is the object (things pointing TO this node)
          const invQuads = await engine.select(
            `SELECT ?s ?p WHERE { ?s ?p <${uri}> } LIMIT ${maxBreadth * 2}`,
          )
          for (const row of invQuads) {
            const sRaw = row.s as string
            const pRaw = row.p as string
            // Re-expand shortened URIs to full URIs for consistent comparison
            const sExpanded = sRaw.includes(':') && !sRaw.startsWith('http') ? await engine.expand(sRaw) : sRaw
            const pExpanded = pRaw.includes(':') && !pRaw.startsWith('http') ? await engine.expand(pRaw) : pRaw
            if (followSet && !followSet.has(pExpanded)) continue
            if (!visited.has(sExpanded) && visited.size < maxBreadth) {
              queue.push({ uri: sExpanded, depth: depth + 1 })
            }
            allTriples.push(`${sRaw}  ${pRaw}  <${uri}> .`)
          }
        }

        const nodeList = await Promise.all([...visited].map((u) => engine.shorten(u)))
        return [
          `🌐 Graph walk: ${await engine.shorten(expanded)} (depth=${maxDepth})`,
          `  Nodes visited: ${nodeList.length}`,
          `  Trail: ${nodeList.join(' → ')}`,
          `  Triples collected: ${allTriples.length}`,
          '',
          allTriples.join('\n'),
        ].join('\n')
      },
    },

    {
      name: 'find_connection',
      description: 'Find a connection path between two resources. Searches for direct links first, then 2-hop paths via SPARQL property paths.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Start resource (e.g. ex:Alice)' },
          object: { type: 'string', description: 'Target resource (e.g. ex:Paper4)' },
          maxDepth: { type: 'number', description: 'Max path length (default 4)' },
        },
        required: ['subject', 'object'],
      },
      handler: async (args) => {
        const subject = s(args, 'subject')
        const object = s(args, 'object')
        const maxDepth = n(args, 'maxDepth', 4)
        const sURI = subject.includes(':') ? subject : `ex:${subject}`
        const oURI = object.includes(':') ? object : `ex:${object}`

        const direct = await engine.select(`SELECT ?p WHERE { ${sURI} ?p ${oURI} }`)
        if (direct.length > 0) {
          return `🔗 Direct connection: ${subject} --[${direct.map((r) => r.p).join(', ')}]--> ${object}`
        }

        let rows = await engine.select(`
          SELECT ?p1 ?mid ?p2 WHERE {
            ${sURI} ?p1 ?mid .
            ?mid ?p2 ${oURI} .
            FILTER(?mid != ${sURI} && ?mid != ${oURI})
          } LIMIT 5
        `)
        if (rows.length > 0) {
          const best = rows[0]
          return `🔗 Path found (2 hops): ${subject} --[${best.p1}]--> ${best.mid} --[${best.p2}]--> ${object}`
        }

        if (maxDepth >= 3) {
          rows = await engine.select(`
            SELECT ?p1 ?mid1 ?p2 ?mid2 ?p3 WHERE {
              ${sURI} ?p1 ?mid1 .
              ?mid1 ?p2 ?mid2 .
              ?mid2 ?p3 ${oURI} .
              FILTER(?mid1 != ${sURI} && ?mid1 != ${oURI})
              FILTER(?mid2 != ${sURI} && ?mid2 != ${oURI})
              FILTER(?mid1 != ?mid2)
            } LIMIT 5
          `)
          if (rows.length > 0) {
            const best = rows[0]
            return `🔗 Path found (3 hops): ${subject} --[${best.p1}]--> ${best.mid1} --[${best.p2}]--> ${best.mid2} --[${best.p3}]--> ${object}`
          }
        }

        if (maxDepth >= 4) {
          rows = await engine.select(`
            SELECT ?p1 ?mid1 ?p2 ?mid2 ?p3 ?mid3 ?p4 WHERE {
              ${sURI} ?p1 ?mid1 .
              ?mid1 ?p2 ?mid2 .
              ?mid2 ?p3 ?mid3 .
              ?mid3 ?p4 ${oURI} .
              FILTER(?mid1 != ${sURI} && ?mid1 != ${oURI})
              FILTER(?mid2 != ${sURI} && ?mid2 != ${oURI})
              FILTER(?mid3 != ${sURI} && ?mid3 != ${oURI})
              FILTER(?mid1 != ?mid2 && ?mid2 != ?mid3)
            } LIMIT 5
          `)
          if (rows.length > 0) {
            const best = rows[0]
            return `🔗 Path found (4 hops): ${subject} --[${best.p1}]--> ${best.mid1} --[${best.p2}]--> ${best.mid2} --[${best.p3}]--> ${best.mid3} --[${best.p4}]--> ${object}`
          }
        }

        return `No connection found between ${subject} and ${object} within ${maxDepth} hops. Try walk_graph to explore more broadly.`
      },
    },

    {
      name: 'query_wikidata',
      description: 'Query the live Wikidata SPARQL endpoint for external knowledge. Uses standard wd:/wdt: prefixes. Note: may be rate-limited.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SPARQL query for Wikidata (use wd: and wdt: prefixes)' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const query = s(args, 'query')
        const results = await endpointClient.select(query)
        if (results.length === 0) return '(no results from Wikidata)'
        const vars = Object.keys(results[0])
        const lines = results.slice(0, 20).map((r) => vars.map((v) => r[v] ?? '').join(' │ '))
        const header = vars.join(' │ ')
        const sep = vars.map(() => '─'.repeat(20)).join('─┼─')
        let out = `🌐 Wikidata (${results.length} results):\n${header}\n${sep}\n${lines.join('\n')}`
        if (results.length > 20) out += `\n... and ${results.length - 20} more`
        return out
      },
    },

    {
      name: 'ns',
      description: 'Show or look up registered namespace prefixes.',
      parameters: {
        type: 'object',
        properties: {
          prefix: { type: 'string', description: 'Specific prefix to look up (optional)' },
        },
        required: [],
      },
      handler: async (args) => {
        const prefix = s(args, 'prefix')
        if (prefix && engine.prefixes[prefix]) {
          return `${prefix}: <${engine.prefixes[prefix]}>`
        }
        return 'Prefixes:\n' + Object.entries(engine.prefixes)
          .map(([k, v]) => `  ${k}: <${v}>`)
          .join('\n')
      },
    },
  ]

  return tools
}
