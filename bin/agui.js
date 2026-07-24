#!/usr/bin/env node
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function loadPackageJson(dir) {
  try {
    return require(resolve(dir, 'package.json'))
  } catch {
    return null
  }
}

async function serveCommand(args) {
  const pkg = loadPackageJson(process.cwd())
  const configPath = args.find(a => a.startsWith('--config='))?.split('=')[1] || args.find(a => a.startsWith('--config '))?.split(' ')[1]
  const portIndex = args.indexOf('--port')
  const portArg = args.find(a => a.startsWith('--port='))
  const port = portArg ? parseInt(portArg.split('=')[1]) : portIndex >= 0 ? parseInt(args[portIndex + 1]) : 4124

  const { AguiServer } = await import('../dist/server/index.js')
  const { RedisThreadStore, PostgresThreadStore } = await import('../dist/store/index.js')

  // Auto-configure persistent store from environment variables
  let store
  if (process.env.AGUI_REDIS_URL) {
    store = new RedisThreadStore({ url: process.env.AGUI_REDIS_URL })
    console.log(`[Agui CLI] Using RedisThreadStore: ${process.env.AGUI_REDIS_URL}`)
  } else if (process.env.AGUI_POSTGRES_URL) {
    store = new PostgresThreadStore({ url: process.env.AGUI_POSTGRES_URL })
    console.log(`[Agui CLI] Using PostgresThreadStore`)
  }

  const server = new AguiServer({ port, store })

  try {
    await server.loadAndRegister(configPath)
  } catch (err) {
    console.error('[Agui CLI] Error loading config or agents:', err)
  }

  await server.start()
}

const command = process.argv[2]
switch (command) {
  case 'serve':
  case 'dev':
    serveCommand(process.argv.slice(3))
    break
  case '--help':
  case 'help':
  default:
    console.log(`
Agui Framework CLI

Usage:
  agui serve [--port=PORT] [--config=FILE]   Start the agent server
  agui dev    [--port=PORT]                    Start server in dev mode
  agui help                                    Show this help
`)
    break
}
