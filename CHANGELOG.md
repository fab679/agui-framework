# Changelog

## Unreleased

- Added `sharedState?: SharedState` to `AgentConfig`. When configured, the agent
  registers three built-in tools (`setState`, `getState`, `deleteState`) for
  autonomous read/write of a global, thread-independent key-value store.
  Supports any JSON value (primitives, objects, arrays, null). Tools are scoped
  to the provided `SharedState` instance and can be shared across multiple
  agents and users.
- Made `ParameterSpec.type` optional to allow JSON properties without a type
  constraint (e.g. `value` parameter in `setState` accepting any JSON type).

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
