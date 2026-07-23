/**
 * reasoner.ts — RDFS/OWL RL rule engine.
 *
 * Implements inference rules as SPARQL CONSTRUCT queries executed against
 * any RdfEngine backend. Each rule derives implicit triples from explicit ones.
 *
 * RDFS rules: subClassOf transitivity, subPropertyOf transitivity,
 *   domain/range inference, type propagation.
 *
 * OWL RL rules: SymmetricProperty, inverseOf, equivalentClass, equivalentProperty.
 */

import { type RdfEngine } from './engine.js'

interface Rule {
  name: string
  construct: string
  description: string
}

const RDFS_RULES: Rule[] = [
  {
    name: 'subClassOf-transitivity',
    description: 'If A subclassOf B and B subclassOf C, then A subclassOf C',
    construct: `CONSTRUCT { ?c rdfs:subClassOf ?q }
WHERE { ?c rdfs:subClassOf ?p . ?p rdfs:subClassOf ?q . FILTER(?c != ?q) }`,
  },
  {
    name: 'subPropertyOf-transitivity',
    description: 'If A subPropertyOf B and B subPropertyOf C, then A subPropertyOf C',
    construct: `CONSTRUCT { ?p rdfs:subPropertyOf ?r }
WHERE { ?p rdfs:subPropertyOf ?q . ?q rdfs:subPropertyOf ?r . FILTER(?p != ?r) }`,
  },
  {
    name: 'domain-inference',
    description: 'If ?s ?p ?o and ?p rdfs:domain ?c, then ?s rdf:type ?c',
    construct: `CONSTRUCT { ?s rdf:type ?c }
WHERE { ?s ?p ?o . ?p rdfs:domain ?c }`,
  },
  {
    name: 'range-inference',
    description: 'If ?s ?p ?o and ?p rdfs:range ?c, then ?o rdf:type ?c',
    construct: `CONSTRUCT { ?o rdf:type ?c }
WHERE { ?s ?p ?o . ?p rdfs:range ?c }`,
  },
  {
    name: 'type-propagation',
    description: 'If ?s type ?c and ?c subclassOf ?d, then ?s type ?d',
    construct: `CONSTRUCT { ?s rdf:type ?d }
WHERE { ?s rdf:type ?c . ?c rdfs:subClassOf ?d }`,
  },
]

const OWL_RL_RULES: Rule[] = [
  {
    name: 'symmetric-property',
    description: 'If p is SymmetricProperty and a p b, then b p a',
    construct: `CONSTRUCT { ?b ?p ?a }
WHERE { ?p a owl:SymmetricProperty . ?a ?p ?b }`,
  },
  {
    name: 'inverse-of',
    description: 'If p inverseOf q and a p b, then b q a',
    construct: `CONSTRUCT { ?b ?q ?a }
WHERE { ?p owl:inverseOf ?q . ?a ?p ?b }`,
  },
  {
    name: 'inverse-of-reverse',
    description: 'If p inverseOf q and a q b, then b p a',
    construct: `CONSTRUCT { ?b ?p ?a }
WHERE { ?p owl:inverseOf ?q . ?a ?q ?b }`,
  },
  {
    name: 'equivalent-class',
    description: 'If c1 equivalentClass c2 and s type c1, then s type c2',
    construct: `CONSTRUCT { ?s rdf:type ?c2 }
WHERE { ?c1 owl:equivalentClass ?c2 . ?s rdf:type ?c1 }`,
  },
  {
    name: 'equivalent-property',
    description: 'If p1 equivalentProperty p2 and s p1 o, then s p2 o',
    construct: `CONSTRUCT { ?s ?p2 ?o }
WHERE { ?p1 owl:equivalentProperty ?p2 . ?s ?p1 ?o }`,
  },
]

const RULES = [...RDFS_RULES, ...OWL_RL_RULES]

/**
 * Applies RDFS and OWL RL rules via SPARQL CONSTRUCT against any RdfEngine.
 * Runs iteratively until fixpoint (no new triples) or maxIterations.
 */
export class Reasoner {
  constructor(private engine: RdfEngine) {}

  async applyAll(maxIterations = 5): Promise<{ rulesApplied: number; triplesAdded: number }> {
    let totalRules = 0
    let totalTriples = 0

    for (let iter = 0; iter < maxIterations; iter++) {
      const beforeIter = await this.engine.getSize()

      for (const rule of RULES) {
        try {
          const quads = await this.engine.construct(rule.construct)
          if (quads.length > 0) {
            const beforeRule = await this.engine.getSize()
            await this.engine.loadQuads(quads)
            const added = (await this.engine.getSize()) - beforeRule
            totalTriples += added
            if (added > 0) totalRules++
          }
        } catch {
          /* skip rules that error (e.g. no matching data) */
        }
      }

      if ((await this.engine.getSize()) === beforeIter) break
    }

    return { rulesApplied: totalRules, triplesAdded: totalTriples }
  }

  getRules(): Rule[] {
    return RULES
  }

  async applyNamed(rules: string[]): Promise<number> {
    let count = 0
    for (const rule of RULES) {
      if (rules.includes(rule.name)) {
        try {
          const quads = await this.engine.construct(rule.construct)
          if (quads.length > 0) {
            await this.engine.loadQuads(quads)
            count += quads.length
          }
        } catch { /* skip */ }
      }
    }
    return count
  }
}
