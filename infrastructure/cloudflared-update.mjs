import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const imagePattern = /cloudflare\/cloudflared:[\w.-]+(?:@sha256:[a-f0-9]{64})?/g
const manifestTypes = [
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.index.v1+json',
].join(', ')

export async function updateCloudflared({ cwd = process.cwd(), fetchImpl = fetch } = {}) {
    async function request(url, options = {}) {
        const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error(`Cloudflared update lookup failed (HTTP ${response.status})`)
        return response
    }

    const release = await (
        await request('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', {
            headers: { Accept: 'application/vnd.github+json' },
        })
    ).json()
    if (release.draft || release.prerelease || !/^\d{4}\.\d+\.\d+$/.test(release.tag_name))
        throw new Error('Cloudflared latest release has an invalid stable version')
    const auth = await (
        await request(
            'https://auth.docker.io/token?service=registry.docker.io&scope=repository:cloudflare/cloudflared:pull',
        )
    ).json()
    if (typeof auth.token !== 'string' || !auth.token) throw new Error('Docker registry did not return a pull token')
    const manifest = await request(
        `https://registry-1.docker.io/v2/cloudflare/cloudflared/manifests/${release.tag_name}`,
        { method: 'HEAD', headers: { Authorization: `Bearer ${auth.token}`, Accept: manifestTypes } },
    )
    const digest = manifest.headers.get('docker-content-digest')
    if (!/^sha256:[a-f0-9]{64}$/.test(digest || '')) throw new Error('Docker registry returned an invalid image digest')
    const image = `cloudflare/cloudflared:${release.tag_name}@${digest}`
    // Resolve and validate both files before changing either pin.
    const updates = await Promise.all(
        ['docker-compose.dev.yml', 'docker-compose.prod.yml'].map(async (name) => {
            const path = resolve(cwd, name)
            const original = await readFile(path, 'utf8')
            if (!original.match(imagePattern)) throw new Error(`No cloudflared image pin found in ${name}`)
            return { path, original, content: original.replace(imagePattern, image) }
        }),
    )
    for (const { path, original, content } of updates) if (original !== content) await writeFile(path, content)
    return image
}
