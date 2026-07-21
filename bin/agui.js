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
  const port = portIndex >= 0 ? parseInt(args[portIndex + 1]) : 4124

  const { AguiServer } = await import('../dist/server/index.js')

  const server = new AguiServer({ port })

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
