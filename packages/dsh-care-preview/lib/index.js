// Node half of richfarm-care-preview.
// Runs inside the host composition: registers webServer routes that read
// content/plants markdown and serve it as JSON for the browser half.

export function apply(ctx) {
  const join = (a, b) => (a.endsWith('/') ? a + b : a + '/' + b)
  const norm = (s) => String(s).toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const cwdCandidates = () => {
    const out = []
    const push = (v) => {
      if (typeof v === 'string' && v && out.indexOf(v) === -1) out.push(v)
    }
    try {
      const workspaces = ctx.get('workspaceRegistry')
      if (workspaces && typeof workspaces.list === 'function') {
        for (const ws of workspaces.list()) {
          if (ws) push(ws.path)
          if (ws && ws.meta) push(ws.meta.path)
        }
      }
    } catch (e) { /* ignore */ }
    try {
      const sessions = ctx.get('sessions')
      if (sessions && typeof sessions.list === 'function') {
        for (const s of sessions.list()) {
          if (s && s.meta) push(s.meta.cwd)
          if (s && s.cwd) push(s.cwd)
        }
      }
    } catch (e) { /* ignore */ }
    try {
      const sp = ctx.get('sandboxPolicy')
      if (sp) push(sp.workspaceRoot)
    } catch (e) { /* ignore */ }
    return out
  }

  const resolveInWorkspace = async (fs, relPath) => {
    const tries = cwdCandidates()
    tries.push(null)
    let lastErr = null
    for (const cwd of tries) {
      try {
        const target = await fs.resolve(relPath, cwd ? { cwd } : undefined)
        const entries = await fs.listDir(target)
        if (Array.isArray(entries)) {
          return { target, basePath: cwd ? join(cwd, relPath) : relPath }
        }
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr || new Error(relPath + ' not found under any workspace candidate')
  }

  let nameMap = null
  const getNameMap = async (fs) => {
    if (nameMap) return nameMap
    const map = {}
    for (const loc of ['vi', 'en']) {
      try {
        const { basePath } = await resolveInWorkspace(fs, 'packages/convex/convex/data/plantI18nSource/' + loc + '.json')
        const target = await fs.resolve(basePath)
        const text = await fs.readText(target)
        const rows = JSON.parse(text)
        for (const row of rows) {
          if (!row || row.cultivar) continue
          const key = norm(row.scientificName || '')
          if (!key) continue
          if (!map[key]) map[key] = {}
          map[key][loc] = row.commonName || null
        }
      } catch (e) { /* keep partial map */ }
    }
    nameMap = map
    return map
  }

  const writeJson = (res, status, data) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' })
    res.end(JSON.stringify(data))
  }

  const webServer = ctx.get('webServer')
  if (webServer === undefined) return

  webServer.register({
    kind: 'exact',
    path: '/care-preview/api/plants',
    handler: async (req, res) => {
      const fs = ctx.get('fs')
      if (fs === undefined) return writeJson(res, 500, { ok: false, error: 'fs unavailable' })
      try {
        const { target: base, basePath } = await resolveInWorkspace(fs, 'content/plants')
        const map = await getNameMap(fs)
        const entries = await fs.listDir(base)
        const plants = []
        for (const entry of entries) {
          const dir = String(entry.name)
          if (!/^[a-z0-9-]+$/.test(dir)) continue
          const vi = await fs.stat(await fs.resolve(join(basePath, dir + '/vi.md')))
          const en = await fs.stat(await fs.resolve(join(basePath, dir + '/en.md')))
          if (!vi && !en) continue
          const names = map[norm(dir)] || {}
          plants.push({ dir, vi: Boolean(vi), en: Boolean(en), nameVi: names.vi || null, nameEn: names.en || null })
        }
        writeJson(res, 200, { ok: true, plants })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String((err && err.message) || err) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: '/care-preview/api/read',
    handler: async (req, res) => {
      const fs = ctx.get('fs')
      if (fs === undefined) return writeJson(res, 500, { ok: false, error: 'fs unavailable' })
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        const dir = String(url.searchParams.get('dir') || '')
        const loc = String(url.searchParams.get('loc') || '')
        if (!/^[a-z0-9-]+$/.test(dir) || !/^(vi|en)$/.test(loc)) {
          return writeJson(res, 400, { ok: false, error: 'bad args' })
        }
        const { basePath } = await resolveInWorkspace(fs, 'content/plants')
        const target = await fs.resolve(join(basePath, dir + '/' + loc + '.md'))
        const info = await fs.stat(target)
        if (!info) return writeJson(res, 404, { ok: false, error: 'not found' })
        const text = await fs.readText(target)
        writeJson(res, 200, { ok: true, text })
      } catch (err) {
        writeJson(res, 500, { ok: false, error: String((err && err.message) || err) })
      }
    },
  })
}
