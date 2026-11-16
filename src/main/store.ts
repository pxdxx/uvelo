import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_SETTINGS, type Settings, type Subscription, type GeoInfo } from '@shared/types'

export interface Persisted {
  settings: Settings
  subs: Subscription[]
  activeSubId?: string
  selectedId: string
  hwid: string
  geoCache: Record<string, string>
  location?: GeoInfo
}

/** v2: пинг по умолчанию: реальная задержка через прокси */
function migrate(s: Settings): Settings {
  if ((s.schema || 1) < 2) {
    s.pingType = 'real'
    s.schema = 2
  }
  if ((s.schema || 1) < 3) {
    const any = s as any
    // старое поле «Приложения мимо VPN» -> список программ
    if (typeof any.excludeApps === 'string') {
      const apps = any.excludeApps
        .split(/[\n,]/)
        .map((x: string) => x.trim())
        .filter(Boolean)
        .map((x: string) => ({ exe: x.toLowerCase().endsWith('.exe') ? x : x + '.exe', act: 'direct' as const }))
      s.apps = [...(s.apps || []), ...apps]
      delete any.excludeApps
    }
    if (any.routing === 'blocked') s.routing = 'selected'
    s.schema = 3
  }
  if (!s.services) s.services = {}
  if (!Array.isArray(s.apps)) s.apps = []
  return s
}

const file = () => join(app.getPath('userData'), 'uvelo.json')

export function load(): Persisted {
  let d: Partial<Persisted> = {}
  try {
    if (existsSync(file())) d = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    /* повреждённый файл - начинаем с нуля */
  }
  return {
    settings: migrate({ ...DEFAULT_SETTINGS, ...(d.settings || {}) }),
    subs: d.subs || [],
    activeSubId: d.activeSubId,
    selectedId: d.selectedId || 'auto',
    hwid: d.hwid || randomUUID(),
    geoCache: d.geoCache || {},
    location: d.location
  }
}

let timer: NodeJS.Timeout | undefined
let last: Persisted | undefined

export function save(d: Persisted, now = false) {
  last = d
  if (timer) clearTimeout(timer)
  const write = () => {
    timer = undefined
    if (!last) return
    const tmp = file() + '.tmp'
    writeFileSync(tmp, JSON.stringify(last, null, 1))
    renameSync(tmp, file())
  }
  if (now) write()
  else timer = setTimeout(write, 400)
}
