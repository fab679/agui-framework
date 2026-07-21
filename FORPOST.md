## Inspiration

Developers of AI integrations applications often face challenges with integrating third party frameworks like langchain, CrewAI, Google ADK and so on. This frameworks are all good and independent, however when it comes to deployment or integration with JavaScript UI frameworks they are very lacking. AGUE-Framework is developed from the concepts of ag-ui. It was developed to help create infrastructure for agents that have shared communications and interfaces from backend to frontend. This in turn makes it easy for user's to develop AI applications with ease, without so many abstractions and infrastructure changes in the UI. Personally i have faced so many challenges with this third party frameworks, especially when it comes to deployment and UI framework integrations there is not much documentation of how to do it self hosted or locally. One is forced to host on their platform. As a freelancer developing AI application for clients online, i wanted and easier way i can create and deploy AI applications with things like full-stack APPS like nextjs. With the help of Codex i was able to build test and publish this entire framework, and even create example usage with different providers. The framework is opensource and anyone is welcome to contribute and change the code in anyway that fits their needs.

## What it does
A TypeScript SDK for building AI agent-powered applications. agui-framework provides a complete toolkit for creating, orchestrating, and deploying LLM-based agents with multi-provider support, real-time streaming, state management, persistence, and the AG-UI protocol for frontend communication.

### Features

- **Agent class** -- Central orchestrator for LLM interactions with run/stream/resume execution modes
- **Multi-LLM providers** -- OpenAI, Anthropic, Ollama, and Fireworks support with a common abstraction
- **Real-time streaming** -- AsyncGenerator-based streaming with event callbacks
- **Event system** -- Publish/subscribe EventBus with history, compaction, and piping
- **Structured output** -- JSON Schema-enforced responses via `response_format`
- **State management** -- Thread-isolated SharedState with versioning, diffing, merging, and conflict resolution; agents can autonomously read/write global shared state via built-in setState/getState/deleteState tools
- **Long-term memory** -- Optional RDF-based semantic store (Oxigraph) with self-managing remember/recall/forget tools
- **AG-UI protocol** -- Full SSE-based protocol encoding, validation, and event compaction
- **Multi-agent patterns** -- Delegation, cyclic handoff, capability routing, and directed graph workflows
- **Middleware pipeline** -- Composable event interception and transformation
- **Persistence** -- Memory, Redis, and Postgres thread stores
- **HTTP/WebSocket server** -- Express route handlers, WebSocket agent communication, model catalog API
- **Model catalog** -- 44 models across 4 providers with pricing, context windows, and capabilities
- **Cost & usage tracking** -- Per-run token usage, cost calculation, cumulative thread cost, budget limits
- **WebSocket client** -- Full-duplex agent communication with run/stream/resume/capabilities
- **React client hooks** -- useStream, useThread, useInterrupts, useCoAgent, useWebSocket, useAgentState, and more
- **MCP (Model Context Protocol)** -- Connect to any MCP-compatible tool server via stdio or streamable HTTP with auto-discovery
- **Type safety** -- Full TypeScript with strict types across all modules

## How we built it

We built agui-framework from the ground up as a pure TypeScript SDK with zero abstraction layers between the developer and the LLM. The architecture revolves around three core design decisions:

1. **Event-driven execution** -- Every agent run and stream yields typed events (`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, etc.) that flow through a composable middleware pipeline. This makes it possible to observe, intercept, and transform agent behavior without subclassing or monkey-patching.

2. **Provider-agnostic abstraction** -- We defined a minimal `BaseLLMProvider` interface that standardizes chat completion and streaming across OpenAI, Anthropic, Ollama, and Fireworks. Each provider adapter handles auth, message formatting, and response parsing internally -- the Agent never touches provider-specific code.

3. **Protocol-first frontend communication** -- Instead of bolting on a REST API after the fact, we implemented the AG-UI protocol (SSE-based event encoding) as a first-class module (`ProtocolEncoder`/`ProtocolValidator`). This means the same event stream the agent produces internally can be piped directly to a frontend via HTTP or WebSocket with zero transformation.

The SDK was developed iteratively: core Agent class first, then providers, then state management, then the server layer, then multi-agent patterns, then MCP integration. Each feature was tested with Jest before moving to the next. The entire framework was built, tested, and published with assistance from AI pair programming (Codex), which dramatically accelerated the development cycle.

## Challenges we ran into

**Cross-provider tool call consistency.** OpenAI, Anthropic, and Ollama all format tool calls and responses differently. Getting a unified `ToolConfig` schema that serializes correctly across all four providers required extensive testing and a flexible parameter type system. The `ParameterSpec` interface had to be relaxed over time as we discovered edge cases with nested JSON schemas and provider-specific constraints.

**MCP SDK integration.** The Model Context Protocol SDK uses Zod schemas internally and has a complex initialization flow (capability negotiation, protocol versioning). Integrating it as an optional dependency while keeping the core framework lightweight required careful import structuring and lazy initialization patterns.

**State synchronization across threads and agents.** The dual-state model (thread-isolated `StateManager` + global `SharedState`) evolved organically. Getting the boundaries right -- what belongs in thread state vs. global state -- took several iterations. The breakthrough was making global state opt-in via `AgentConfig.sharedState` so existing thread-based code never breaks.

**Long-term memory with RDF.** Oxigraph is a WASM module with an async initialization path. The `ready` promise pattern (construction is non-blocking, methods await initialization) was necessary but added complexity. The SPARQL query for `recall` had to balance expressiveness with the fact that most users would only need simple predicate filters.

**Publishing and ESM compatibility.** The CJS/ESM dual-package problem caused `ERR_MODULE_NOT_FOUND` errors in Node.js. Every relative import had to use explicit `.js` extensions, and the `package.json` exports map had to be carefully crafted to support both `require` and `import`.

## Accomplishments that we're proud of

- **Self-hosted, zero-dependency deployment.** Unlike many AI frameworks that require a cloud platform, agui-framework runs entirely on your own infrastructure. A single `npm install` and a few lines of code give you a fully functional agent server with REST, SSE, and WebSocket support.

- **Cross-provider streaming that just works.** The same `agent.stream()` call works with OpenAI, Anthropic, Ollama, and Fireworks without any code changes. The AsyncGenerator abstraction means streaming integrates naturally with any Node.js HTTP server or React frontend.

- **Full MCP integration in under 500 lines.** The `MCPClientManager` connects to any MCP-compatible server, auto-discovers tools, and makes them available to the agent -- all in a single, focused module. This was one of the most requested features from the developer community.

- **Reactive shared state across agents.** Multiple agents can share the same `SharedState` instance and autonomously read/write it via built-in tools. Combined with the REST endpoints and `useAgentState` React hook, this creates a seamless data flow from LLM decisions to UI updates.

- **44-model catalog with automatic cost tracking.** Every provider round-trip logs token usage and calculates cost against current pricing. No manual tracking, no spreadsheets -- developers get cost visibility out of the box.

- **Testing discipline.** 256 passing tests across 11 test suites, covering the core agent, multi-agent patterns, MCP integration, state management, event system, providers, protocol, store implementations, and React hooks.

## What we learned

**Start with the protocol, not the features.** Implementing AG-UI protocol encoding early forced us to think about events as the universal currency of the system. Every feature (state, tools, streaming, multi-agent) became a matter of emitting the right events rather than adding special-case code paths.

**Optional dependencies need explicit contracts.** Oxigraph, ioredis, pg, and the MCP SDK are all optional. Each one required a clean interface (`SemanticStore`, `ThreadStore`) that the core can depend on without pulling in the implementation. The dynamic `import()` pattern for Oxigraph was a hard-learned lesson in WASM module lifecycle.

**TypeScript strict mode catches real bugs.** Enabling `strict: true`, `noImplicitAny`, and `noImplicitReturns` from day one prevented an entire class of runtime errors. The type system paid for itself many times over during cross-provider testing.

**LLM tool calling is not deterministic.** Different models format tool arguments differently, especially for nested objects. Making `ParameterSpec.type` optional and accepting any JSON value in tool parameters was a practical concession to real-world LLM behavior.

**Documentation must mirror the architecture.** The docs for state management, agents, tools, and the server each follow the same mental model: here's the concept, here's the code, here's how it connects to the rest of the framework. Keeping docs aligned with 2500+ lines of source is an ongoing discipline.

## What's next for agui-framework

- **Multi-Agent Router** -- Extend `AgentGraph` with router nodes that dynamically select the next agent based on conversation context, user intent, or capability matching. Includes LLM Router, Rule Router, and Capability Router strategies.

- **Generative User Interfaces** -- Enable agents to generate custom UIs on-the-fly using a two-step process: the agent declares *what* UI it needs, and a secondary generator builds the actual interface (JSON Schema, React components, or HTML).

- **Meta Events** -- Introduce a new `META` event type for run-independent annotations: user feedback (thumbs up/down), tags, bookmarks, moderation flags, and external analytics signals.

- **LTM REST API** -- Expose the Oxigraph memory store via REST endpoints (`POST /api/memory/remember`, `GET /api/memory/recall`, `DELETE /api/memory/forget`) so clients can read/write memory directly without going through the LLM.

- **Agent-to-agent MCP sharing** -- Allow agents to expose their own tools as MCP servers, enabling a mesh of interconnected agents that each contribute capabilities to the ecosystem.

- **Streaming state deltas** -- Push real-time state changes to connected clients via WebSocket `state_delta` messages (using JSON Patch format) instead of full snapshots on every change.

- **Plugin system** -- A formal plugin API for packaging and sharing agent configurations, tool sets, middleware, and UI components as installable npm packages.
