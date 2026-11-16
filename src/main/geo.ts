import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { fetch, ProxyAgent } from 'undici'
import countries from 'world-countries'
import type { GeoInfo, Server } from '@shared/types'

const ISO = new Set(countries.map((c) => c.cca2))

/* Синонимы, которые часто встречаются в названиях серверов */
const ALIASES: Record<string, string[]> = {
  US: ['usa', 'сша', 'америка', 'united states', 'america'],
  GB: ['uk', 'англия', 'великобритания', 'britain', 'england', 'london', 'лондон'],
  NL: ['нидерланды', 'голландия', 'holland', 'netherlands', 'amsterdam', 'амстердам'],
  DE: ['германия', 'germany', 'frankfurt', 'франкфурт', 'berlin', 'берлин'],
  RU: ['россия', 'russia', 'moscow', 'москва', 'рф'],
  AE: ['оаэ', 'uae', 'emirates', 'dubai', 'дубай'],
  KR: ['корея', 'южная корея', 'korea', 'seoul'],
  FI: ['финляндия', 'finland', 'helsinki', 'хельсинки'],
  SE: ['швеция', 'sweden', 'stockholm'],
  FR: ['франция', 'france', 'paris', 'париж'],
  TR: ['турция', 'turkey', 'türkiye', 'istanbul', 'стамбул'],
  JP: ['япония', 'japan', 'tokyo', 'токио'],
  SG: ['сингапур', 'singapore'],
  HK: ['гонконг', 'hong kong', 'hongkong'],
  KZ: ['казахстан', 'kazakhstan', 'almaty', 'алматы'],
  PL: ['польша', 'poland', 'warsaw', 'варшава'],
  CZ: ['чехия', 'czech', 'czechia', 'prague'],
  CH: ['швейцария', 'switzerland', 'zurich'],
  CA: ['канада', 'canada', 'toronto'],
  LV: ['латвия', 'latvia', 'riga', 'рига'],
  LT: ['литва', 'lithuania', 'vilnius'],
  EE: ['эстония', 'estonia', 'tallinn', 'таллин']
}

interface NameEntry {
  re: RegExp
  code: string
  len: number
}

const NAMES: NameEntry[] = (() => {
  const list: { n: string; code: string }[] = []
  for (const c of countries) {
    list.push({ n: c.name.common.toLowerCase(), code: c.cca2 })
    const ru = (c.translations as any)?.rus?.common
    if (ru) list.push({ n: ru.toLowerCase(), code: c.cca2 })
  }
  for (const [code, arr] of Object.entries(ALIASES)) arr.forEach((n) => list.push({ n, code }))
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return list
    .filter((x) => x.n.length >= 3 || x.n === 'uk' || x.n === 'рф')
    .map((x) => ({ re: new RegExp(`(?<![\\p{L}])${esc(x.n)}(?![\\p{L}])`, 'iu'), code: x.code, len: x.n.length }))
    .sort((a, b) => b.len - a.len)
})()

/** Определение страны по названию сервера: флаг-эмодзи → название → ISO-код */
export function countryFromName(name: string): string | undefined {
  const flag = name.match(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u)
  if (flag) {
    const a = String.fromCharCode(flag[1].codePointAt(0)! - 0x1f1e6 + 65)
    const b = String.fromCharCode(flag[2].codePointAt(0)! - 0x1f1e6 + 65)
    const code = a + b === 'UK' ? 'GB' : a + b
    if (ISO.has(code)) return code
  }
  for (const n of NAMES) if (n.re.test(name)) return n.code
  const tokens = name.match(/(?<![A-Za-z])[A-Z]{2}(?![A-Za-z])/g)
  if (tokens) for (const t of tokens) if (ISO.has(t === 'UK' ? 'GB' : t)) return t === 'UK' ? 'GB' : t
  return undefined
}

/** GeoIP для серверов без явной страны в имени (ip-api.com batch) */
export async function geoipHosts(hosts: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const ipOf: Record<string, string> = {}
  await Promise.all(
    hosts.map(async (h) => {
      try {
        ipOf[h] = isIP(h) ? h : (await lookup(h, { family: 4 })).address
      } catch {
        /* не резолвится */
      }
    })
  )
  const ips = [...new Set(Object.values(ipOf))]
  const byIp: Record<string, string> = {}
  for (let i = 0; i < ips.length; i += 100) {
    try {
      const r = await fetch('http://ip-api.com/batch?fields=status,countryCode,query', {
        method: 'POST',
        body: JSON.stringify(ips.slice(i, i + 100)),
        signal: AbortSignal.timeout(8000)
      })
      const arr = (await r.json()) as any[]
      for (const x of arr) if (x.status === 'success') byIp[x.query] = x.countryCode
    } catch {
      /* офлайн */
    }
  }
  for (const [h, ip] of Object.entries(ipOf)) if (byIp[ip]) result[h] = byIp[ip]
  return result
}

export function assignCountries(servers: Server[], cache: Record<string, string>) {
  for (const s of servers) s.country = countryFromName(s.name) || cache[s.address]
}

/** Где находится пользователь. Через прокси - показывает IP выхода. */
export async function whereAmI(proxyPort?: number): Promise<GeoInfo | undefined> {
  try {
    const r = await fetch('http://ip-api.com/json/?lang=ru&fields=status,country,countryCode,city,lat,lon,query', {
      dispatcher: proxyPort ? new ProxyAgent(`http://127.0.0.1:${proxyPort}`) : undefined,
      signal: AbortSignal.timeout(8000)
    })
    const j: any = await r.json()
    if (j.status !== 'success') return
    return { ip: j.query, country: j.country, countryCode: j.countryCode, city: j.city, lat: j.lat, lon: j.lon }
  } catch {
    return
  }
}
