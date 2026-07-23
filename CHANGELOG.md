# Changelog

## [0.3.0] - 2026-07-23

- **Breaking**: `StreamCallbacks.onEvent` and `handleEvent` in React hooks now
  typed as `(event: AgentEvent)` instead of `(event: any)`. TypeScript narrows
  properly per case branch — catches property-access typos at compile time.
- **Breaking**: `AguiClient.run()` and `resume()` return `events: AgentEvent[]`
  instead of `events: any[]`. Server `RunResponse.events` similarly typed.
- **Breaking**: `agentId` added to `BaseMessage` — every stored message now
  carries the ID of the agent that produced it. Also added `runId` and
  `parentRunId` for reconstructing delegation trees from message history alone.
- **Multi-agent delegation fix**: `AGENT_DELEGATION_END` and
  `AGENT_HANDOFF_RESULT` event handlers in React `useChat` now match by
  `parentAgent+childAgent` / `fromAgent+toAgent` instead of last array index.
  Fixes deeply nested delegations (A→B→C).
- **AgentGraph events**: `runAgentGraph()` now relays events through the
  manager's EventBus, so graph delegation events reach the client.
- **DeepAgent events**: DeepAgent's EventBus now relays through the wrapped
  agent's EventBus, so `ACTIVITY_SNAPSHOT` (planning) events reach the client.
- **ACTIVITY_SNAPSHOT handling**: Added `streamingActivities` state and
  `ChatMessage.activities` to React `useChat` hook, with `replace` support.
- **onInterrupt wired**: `useStream` now detects `HUMAN_INTERVENTION_REQUEST`
  events and calls `opts.onInterrupt`.
- **Server passes agentId**: REST, SSE, and WebSocket server endpoints now pass
  `agentId` in the run context, so server-initiated runs tag messages properly.
- **Semantic RAG module**: New `src/semantic/` module with pluggable RDF engine
  abstraction (`RdfEngine`), in-process oxigraph backend (`SparqlEngine`),
  remote SPARQL 1.1 client (`SparqlEndpointClient`), RDFS/OWL RL reasoner
  (`Reasoner`), multi-endpoint store (`SemanticStore`), declarative JSON config
  with env-var interpolation (`buildStore`), 14 standalone tools (`createTools`),
  and a one-call factory with DeepAgent planning (`createSemanticAgent`).
- **SparqlEngine prefix fix**: Fixed single-arg constructor that overwrote custom
  prefixes. `new SparqlEngine({ eg: 'http://example.org/' })` now correctly
  preserves `eg:` prefix instead of resetting to defaults.
- **React ChatMessage type**: Added `agentId`, `runId`, `parentRunId`,
  `activities` fields.
- **Client type safety**: Removed `any` casts from error handling in resume/run.
  Fixed `getThreadRuns` and `getThreadStats` return types. Added missing fields
  to `listThreads` return type.
- **Documentation**: Added Examples section (Semantic RAG), Integrations page
  (React, Next.js, Express), API key/auth docs for SPARQL endpoints.

## [0.2.3] - 2026-07-21

- Added MCP (Model Context Protocol) integration. Agents can now connect to
  any MCP-compatible tool server via `AgentConfig.mcpServers`. Supports stdio
  (local subprocess) and streamable HTTP transports. MCP tools are automatically
  discovered, converted to `ToolConfig`, and made available to the agent during
  `run` and `stream` execution. Includes `MCPClientManager` for managing
  connections and tool lifecycle.
- Added `sharedState?: SharedState` to `AgentConfig`. When configured, the agent
  registers three built-in tools (`setState`, `getState`, `deleteState`) for
  autonomous read/write of a global, thread-independent key-value store.
  Supports any JSON value (primitives, objects, arrays, null). Tools are scoped
  to the provided `SharedState` instance and can be shared across multiple
  agents and users.
- Made `ParameterSpec.type` optional to allow JSON properties without a type
  constraint (e.g. `value` parameter in `setState` accepting any JSON type).
- Added shared state REST endpoints to `AguiServer`: `POST /api/agents/:id/state`
  (set a key-value pair), `DELETE /api/agents/:id/state/:key` (remove a key).
- Added `getAgentState()`, `setAgentState()`, `deleteAgentState()` methods to
  `AguiClient` for client-side shared state access.
- Added `useAgentState(agentId, baseUrl)` React hook that returns `state`,
  `setState`, `deleteState`, `loading`, `error`, and `refetch`.

## [0.2.2] - 2026-07-21

- Integrated semantic long-term memory (LTM) via Oxigraph RDF store.
  Added `OxigraphSemanticStore`, `SemanticStore` interface, and
  `createLTMMiddleware` with self-managing `remember`/`recall`/`forget` tools.
- Server now passes `userId` from identity resolution into `RunContext`
  for multi-tenant memory isolation.

## [0.2.1] - 2026-07-21

- Fixed `ERR_MODULE_NOT_FOUND` in Node.js ESM by adding explicit `.js`
  extensions to all relative imports in source files.
- Improved "Agent not found" 404 responses to include a list of
  registered `availableAgentIds` in the response body.
- Hardened server request handling with body-size, prompt-size, CORS,
  concurrency, and in-memory rate-limit controls.
- Added provider-request cancellation for HTTP client disconnects.
- Separated server authentication credentials from provider credentials.
- Added optional identity and thread-authorization hooks for multi-tenant apps.
- Replaced insecure reasoning encryption with AES-256-GCM.
- Removed the in-process VM code-execution tool; code execution must be supplied
  by an externally isolated tool implementation.
