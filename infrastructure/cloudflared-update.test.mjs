import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { updateCloudflared } from './cloudflared-update.mjs'

const digest = `sha256:${'a'.repeat(64)}`
const oldPin = `cloudflare/cloudflared:2026.5.2@sha256:${'b'.repeat(64)}`
const files = ['docker-compose.dev.yml', 'docker-compose.prod.yml']
const original = `services:\n    cloudflared:\n        image: ${oldPin}\n        restart: unless-stopped\n`

async function fixture(t) {
    const cwd = await mkdtemp(join(tmpdir(), 'cloudflared-update-'))
    t.after(() => rm(cwd, { recursive: true, force: true }))
    for (const name of files) await writeFile(join(cwd, name), original)
    await writeFile(join(cwd, '.env'), 'PRIVATE_FIXTURE=preserved\n')
    return cwd
}
function registryFetch({ status = 200, tag = '2026.10.4', imageDigest = digest } = {}) {
    return async (url, options) => {
        if (url.includes('api.github.com')) return Response.json({ tag_name: tag }, { status })
        if (url.includes('auth.docker.io')) return Response.json({ token: 'test-pull-token' })
        assert.equal(url, `https://registry-1.docker.io/v2/cloudflare/cloudflared/manifests/${tag}`)
        assert.equal(options.method, 'HEAD')
        assert.equal(options.headers.Authorization, 'Bearer test-pull-token')
        return new Response(null, { headers: { 'docker-content-digest': imageDigest } })
    }
}

test('updates both image pins from the stable release and preserves private configuration', async (t) => {
    const cwd = await fixture(t)
    const image = await updateCloudflared({ cwd, fetchImpl: registryFetch() })
    assert.equal(image, `cloudflare/cloudflared:2026.10.4@${digest}`)
    for (const name of files) assert.equal(await readFile(join(cwd, name), 'utf8'), original.replace(oldPin, image))
    assert.equal(await readFile(join(cwd, '.env'), 'utf8'), 'PRIVATE_FIXTURE=preserved\n')
    assert.equal(await updateCloudflared({ cwd, fetchImpl: registryFetch() }), image)
})

for (const [name, options] of [
    ['release lookup fails', { status: 503 }],
    ['release tag is invalid', { tag: 'latest' }],
    ['registry digest is invalid', { imageDigest: 'invalid' }],
]) {
    test(`retains both pins when ${name}`, async (t) => {
        const cwd = await fixture(t)
        await assert.rejects(updateCloudflared({ cwd, fetchImpl: registryFetch(options) }))
        for (const file of files) assert.equal(await readFile(join(cwd, file), 'utf8'), original)
    })
}

test('validates both compose files before writing', async (t) => {
    const cwd = await fixture(t)
    await writeFile(join(cwd, files[1]), 'services: {}\n')
    await assert.rejects(updateCloudflared({ cwd, fetchImpl: registryFetch() }), /No cloudflared image pin/)
    assert.equal(await readFile(join(cwd, files[0]), 'utf8'), original)
})

test('rerunning init with an existing env updates pins and survives offline lookup', async (t) => {
    const cwd = await fixture(t)
    const preload = join(cwd, 'fetch-fixture.mjs')
    async function init(source) {
        await writeFile(preload, source)
        const child = spawn(
            process.execPath,
            ['--import', preload, new URL('./setup.mjs', import.meta.url).pathname, 'init'],
            { cwd },
        )
        let output = ''
        child.stdout.on('data', (data) => (output += data))
        child.stderr.on('data', (data) => (output += data))
        const code = await new Promise((resolve, reject) => {
            child.once('error', reject)
            child.once('close', resolve)
        })
        assert.equal(code, 0, output)
        return output
    }
    assert.match(
        await init(
            `import assert from "node:assert/strict"; const digest = "${digest}"; globalThis.fetch = ${registryFetch.toString()}();`,
        ),
        /Cloudflared image updated/,
    )
    // The second run explicitly exercises the initializer's offline fallback.
    assert.match(
        await init('globalThis.fetch = async () => { throw new Error("offline") }'),
        /automatic update skipped/,
    )
    assert.equal(await readFile(join(cwd, '.env'), 'utf8'), 'PRIVATE_FIXTURE=preserved\n')
})
