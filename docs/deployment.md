# Deployment

## Using `agui serve`

The CLI provides a quick way to deploy your agents:

```bash
npx agui serve --port 4124
```

By default it looks for an `agui.json` config file in the current directory:

```json
{
  "agents": {
    "assistant": "./agents/assistant.ts",
    "weather": "./agents/weather.ts"
  }
}
```

Each agent file should export an `Agent` instance, a factory function, or a registration object:

```typescript
// agents/assistant.ts
import { Agent } from "agui-framework";

const agent = new Agent({
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant.",
});

export default agent;
```

### Config Formats

`agui.json` supports agent references with optional metadata:

```json
{
  "agents": {
    "assistant": {
      "path": "./agents/assistant.ts",
      "export": "default",
      "metadata": {
        "name": "Assistant",
        "description": "A general-purpose assistant"
      }
    }
  }
}
```

You can also use `agui.config.ts` or `agui.config.js` for programmatic config:

```typescript
// agui.config.ts
import { Agent } from "agui-framework";

const assistant = new Agent({ ... });

export const agents = [assistant];
```

### Auto-Discovery

If no config file is found, the CLI scans `./agents/` and `./src/agents/` directories and registers any `.ts`/`.js` files automatically.

## Persistence with `agui serve`

Thread persistence is **optional** and configured via environment variables:

```bash
# Redis (requires: npm install ioredis)
export AGUI_REDIS_URL=redis://localhost:6379
npx agui serve

# PostgreSQL (requires: npm install pg)
export AGUI_POSTGRES_URL=postgres://user:pass@localhost:5432/agui
npx agui serve
```

Without these, the server uses in-memory storage — data is lost on restart.

## Custom Server Deployment

### Standalone Server

```typescript
import { AguiServer, Agent } from "agui-framework/server";

const agent = new Agent({
  name: "assistant",
  model: "gpt-4o",
  provider: "openai",
  instructions: "You are a helpful assistant.",
});

const server = new AguiServer({
  port: 4124,
  agents: [agent],
});

await server.start();
```

### With Persistence

```typescript
import { AguiServer } from "agui-framework/server";
import { RedisThreadStore } from "agui-framework/store";

const server = new AguiServer({
  port: 4124,
  agents: [agent],
  store: new RedisThreadStore({ url: process.env.REDIS_URL }),
});

await server.start();
```

### Express Integration

Embed the AguiServer into an existing Express app:

```typescript
import express from "express";
import { AguiServer, Agent } from "agui-framework/server";

const app = express();
// Your existing routes...

const agent = new Agent({ ... });
const server = new AguiServer({
  port: 4124,
  agents: [agent],
  app, // pass existing Express instance
});

await server.start();
```

### Docker Deployment

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 4124
CMD ["node", "bin/agui.js", "serve"]
```

### Production Considerations

- Set `NODE_ENV=production`
- Use a process manager (PM2, systemd) or container orchestration (Docker, K8s)
- Configure a persistent store (Redis/Postgres) for thread data
- Set API keys via environment variables, never in code
- Add reverse proxy (nginx, Caddy) for TLS termination
- Use `AGUI_REDIS_URL` or `AGUI_POSTGRES_URL` for automatic store setup
