import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'
import { cloneIdentity, loadEnvironment, localDatabaseUrl, resolveEnvironment } from './config.mjs'
import { resolveDockerEnvironment } from './compose.mjs'
import { updateCloudflared } from './cloudflared-update.mjs'

const action = process.argv[2]
const allocatedPorts = new Set()
async function availablePort(start) {
    for (let port = start; port < start + 100; port++) {
        if (allocatedPorts.has(port)) continue
        const free = await new Promise((resolve) => {
            const server = createServer()
            server.once('error', () => resolve(false))
            server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
        })
        if (free) {
            allocatedPorts.add(port)
            return port
        }
    }
    throw new Error(`No available port near ${start}`)
}

try {
    if (action === 'init') {
        if (existsSync('.env')) console.log('.env already exists; preserved. Run pnpm project:doctor to validate it.')
        else {
            let content = readFileSync('.env.example', 'utf8')
            const project = existsSync('project.json') ? JSON.parse(readFileSync('project.json', 'utf8')) : null
            if (
                project &&
                (!/^[a-z][a-z0-9-]{2,31}$/.test(project.slug) ||
                    typeof project.name !== 'string' ||
                    !/^[^"\\]{1,80}$/.test(project.name) ||
                    [...project.name].some((character) => character.charCodeAt(0) < 32))
            )
                throw new Error('Invalid project.json identity')
            const values = {
                ...(project ? { APP_NAME: JSON.stringify(project.name) } : {}),
                APP_ID: `${(project?.slug || cloneIdentity(process.cwd())).slice(0, 32)}-${randomBytes(3).toString('hex')}`,
                POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
                BETTER_AUTH_SECRET: randomBytes(48).toString('base64'),
                SEARCH_ENGINE_MASTER_KEY: randomBytes(24).toString('hex'),
            }
            for (const [name, start] of Object.entries({
                DEV_HTTP_PORT: 8080,
                DEV_FRONTEND_PORT: 3000,
                DEV_BACKEND_PORT: 4000,
                DEV_POSTGRES_PORT: 5432,
                DEV_REDIS_PORT: 6379,
                DEV_SEARCH_PORT: 7700,
                DEV_CLAMAV_PORT: 3310,
                DEV_MAIL_PORT: 8025,
                DEV_STORAGE_PORT: 8333,
            }))
                values[name] = await availablePort(start)
            const configuration = { ...parseEnv(content), ...values }
            values.DATABASE_URL = localDatabaseUrl(configuration)
            values.CACHE_URL = `redis://localhost:${values.DEV_REDIS_PORT}`
            values.SEARCH_ENGINE_URL = `http://localhost:${values.DEV_SEARCH_PORT}`
            values.VIRUS_SCANNER_PORT = values.DEV_CLAMAV_PORT
            for (const [key, value] of Object.entries(values))
                content = content.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${value}`)
            writeFileSync('.env', content, { flag: 'wx', mode: 0o600 })
            console.log(`Created .env. Application: ${resolveEnvironment('development', configuration).APP_URL}`)
        }
        try {
            console.log(`Cloudflared image updated: ${await updateCloudflared()}`)
        } catch (error) {
            console.warn(
                `Cloudflared automatic update skipped: ${error.message}. Existing image pins retained when lookup fails; rerun pnpm project:init to retry.`,
            )
        }
    } else if (action === 'doctor') {
        const major = Number(process.versions.node.split('.')[0])
        if (major !== 22 && major !== 24)
            throw new Error('Use Node 22 LTS (see .node-version), or Node 24 for local compatibility testing')
        loadEnvironment(process.env.ENV_FILE || '.env')
        const env = resolveEnvironment(process.argv[3] || 'development')
        if (!env.POSTGRES_PASSWORD || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
            throw new Error('Configure database and auth secrets in .env')
        for (const args of [['--version'], ['compose', 'version'], ['info', '--format', '{{.ServerVersion}}']]) {
            const result = spawnSync('docker', args, {
                env: resolveDockerEnvironment(),
                encoding: 'utf8',
            })
            if (result.error || result.status !== 0)
                throw new Error(`Docker prerequisite failed: docker ${args.join(' ')}`)
            console.log(result.stdout.trim())
        }
        console.log(
            `Configuration valid. App: ${env.APP_URL}; clone: ${env.APP_ID}; profiles: ${env.COMPOSE_PROFILES || 'core only'}`,
        )
    } else throw new Error('Usage: node infrastructure/setup.mjs <init|doctor> [development|production]')
} catch (error) {
    console.error(error.message)
    process.exitCode = 1
}
