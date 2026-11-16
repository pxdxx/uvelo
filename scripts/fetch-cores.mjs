// Скачивает ядра (sing-box, Xray) и rule-set'ы в resources/cores.
// Запуск: npm run fetch-cores   (флаг --force перекачивает всё заново)
import { mkdirSync, existsSync, writeFileSync, rmSync, readdirSync, renameSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'resources', 'cores')
const force = process.argv.includes('--force')
mkdirSync(join(out, 'rules'), { recursive: true })

const gh = async (repo) => {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'uvelo-fetch', Accept: 'application/vnd.github+json' }
  })
  if (!r.ok) throw new Error(`${repo}: HTTP ${r.status}`)
  return r.json()
}

const download = async (url, dest) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'uvelo-fetch' } })
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
}

const findFile = (dir, name) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      const f = findFile(p, name)
      if (f) return f
    } else if (e.toLowerCase() === name.toLowerCase()) return p
  }
  return null
}

async function fetchCore(repo, assetRe, exeName) {
  const dest = join(out, exeName)
  if (existsSync(dest) && !force) return console.log(`✓ ${exeName} уже есть`)
  const rel = await gh(repo)
  const asset = rel.assets.find((a) => assetRe.test(a.name))
  if (!asset) throw new Error(`${repo}: не найден ассет ${assetRe}`)
  console.log(`↓ ${repo} ${rel.tag_name}: ${asset.name}`)
  const tmp = join(tmpdir(), `uvelo-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  const zip = join(tmp, asset.name)
  await download(asset.browser_download_url, zip)
  // системный bsdtar Windows умеет zip; GNU tar из Git Bash путает "C:" с удалённым хостом
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  execFileSync(tar, ['-xf', zip, '-C', tmp])
  const exe = findFile(tmp, exeName)
  if (!exe) throw new Error(`${exeName} не найден в архиве`)
  renameSync(exe, dest)
  rmSync(tmp, { recursive: true, force: true })
  writeFileSync(join(out, exeName + '.version'), rel.tag_name)
}

const rules = {
  'geoip-ru.srs': 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-ru.srs',
  'geosite-category-ru.srs': 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ru.srs',
  'geosite-category-ads-all.srs': 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs',
  'geosite-ru-blocked.srs': 'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/sing-box/rule-set-geosite/geosite-ru-blocked.srs',
  'geoip-ru-blocked.srs': 'https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/sing-box/rule-set-geoip/geoip-ru-blocked.srs'
}

await fetchCore('SagerNet/sing-box', /windows-amd64\.zip$/, 'sing-box.exe')
await fetchCore('XTLS/Xray-core', /^Xray-windows-64\.zip$/, 'xray.exe')
for (const [name, url] of Object.entries(rules)) {
  const dest = join(out, 'rules', name)
  if (existsSync(dest) && !force) continue
  console.log(`↓ ${name}`)
  await download(url, dest)
}
console.log('Готово:', out)
