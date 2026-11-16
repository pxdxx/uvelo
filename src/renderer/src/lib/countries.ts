import wc from 'world-countries'
import ct from 'countries-and-timezones'
import { CAPITALS, FACTS } from './capitals'

export interface CountryInfo {
  code: string
  ccn3: string
  name: string
  capital?: string
  lat: number
  lon: number
  area: number
  areaRank?: number
  tz?: string
  tzCount: number
  landlocked: boolean
  borders: number
}

const flagUrls = import.meta.glob('../../../../node_modules/flag-icons/flags/1x1/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>
const FLAGS: Record<string, string> = {}
for (const [p, url] of Object.entries(flagUrls)) FLAGS[p.split('/').pop()!.replace('.svg', '').toUpperCase()] = url

export const flagUrl = (code?: string) => (code ? FLAGS[code.toUpperCase()] : undefined)

function pickTz(code: string, capitalEn: string | undefined, lon: number): { tz?: string; count: number } {
  const c = ct.getCountry(code)
  if (!c) return { count: 0 }
  const zones = c.timezones.map((z) => ct.getTimezone(z)).filter((z): z is NonNullable<typeof z> => !!z)
  const offsets = new Set(zones.map((z) => z.utcOffset))
  const cap = capitalEn?.replace(/\s/g, '_').toLowerCase()
  let tz = zones.find((z) => cap && z.name.toLowerCase().endsWith('/' + cap))?.name
  if (!tz && zones.length) {
    const target = (lon / 15) * 60
    tz = zones.reduce((a, b) => (Math.abs(b.utcOffset - target) < Math.abs(a.utcOffset - target) ? b : a)).name
  }
  return { tz, count: offsets.size }
}

const sovereign = wc.filter((c) => c.cca2 !== 'AQ' && c.independent).sort((a, b) => b.area - a.area)
const rankOf = new Map(sovereign.map((c, i) => [c.cca2, i + 1]))

export const COUNTRIES: Record<string, CountryInfo> = {}
export const BY_CCN3: Record<string, string> = {}

for (const c of wc) {
  const cap = CAPITALS[c.cca2]
  const lat = cap?.lat ?? c.latlng[0]
  const lon = cap?.lon ?? c.latlng[1]
  const { tz, count } = pickTz(c.cca2, c.capital?.[0], lon)
  COUNTRIES[c.cca2] = {
    code: c.cca2,
    ccn3: c.ccn3,
    name: (c.translations as any)?.rus?.common || c.name.common,
    capital: cap?.name || c.capital?.[0],
    lat,
    lon,
    area: c.area,
    areaRank: rankOf.get(c.cca2),
    tz,
    tzCount: count,
    landlocked: c.landlocked,
    borders: c.borders?.length || 0
  }
  if (c.ccn3) BY_CCN3[c.ccn3] = c.cca2
}
// у world-atlas нет числовых id для некоторых территорий
export const NAME_FALLBACK: Record<string, string> = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' }

const ORD = [
  'первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая', 'седьмая', 'восьмая', 'девятая', 'десятая',
  'одиннадцатая', 'двенадцатая', 'тринадцатая', 'четырнадцатая', 'пятнадцатая', 'шестнадцатая', 'семнадцатая',
  'восемнадцатая', 'девятнадцатая', 'двадцатая'
]
const NUM = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать']

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10,
    m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export function factsFor(code: string): string[] {
  const c = COUNTRIES[code]
  if (!c) return []
  const out = [...(FACTS[code] || [])]
  if (c.areaRank && c.areaRank <= 20 && !out.some((f) => f.includes('по площади')))
    out.push(`${c.name} ${ORD[c.areaRank - 1]} по площади страна мира.`)
  if (c.tzCount >= 3) out.push(`${c.name} пересекает ${NUM[c.tzCount] || c.tzCount} ${plural(c.tzCount, 'часовой пояс', 'часовых пояса', 'часовых поясов')}.`)
  if (c.landlocked) out.push(`${c.name} не имеет выхода к морю.`)
  else if (c.borders === 0 && c.area > 0) out.push('Сухопутных границ нет, со всех сторон вода.')
  if (c.borders >= 2) out.push(`Граничит с ${c.borders} ${plural(c.borders, 'страной', 'странами', 'странами')}.`)
  if (!out.length && c.area) out.push(`Площадь: ${Math.round(c.area).toLocaleString('ru-RU')} км².`)
  return out
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function fmtDistance(km: number) {
  if (km >= 1000) return `${(km / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} тыс. км`
  return `${Math.max(1, Math.round(km))} км`
}

export function localTime(tz?: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date())
  } catch {
    return ''
  }
}
