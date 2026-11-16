export function fmtBytes(n = 0) {
  const u = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 })} ${u[i]}`
}
export const fmtSpeed = (n = 0) => fmtBytes(n) + '/с'

export function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (x: number) => String(x).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`
}

export function daysLeft(expire?: number) {
  if (!expire) return undefined
  return Math.ceil((expire * 1000 - Date.now()) / 864e5)
}

export function pingClass(ms?: number) {
  if (ms === undefined) return 'p-none'
  if (ms < 0) return 'p-dead'
  if (ms < 120) return 'p-good'
  if (ms < 250) return 'p-mid'
  return 'p-bad'
}

export function relTime(t?: number) {
  if (!t) return 'никогда'
  const d = (Date.now() - t) / 1000
  if (d < 60) return 'только что'
  if (d < 3600) return `${Math.floor(d / 60)} мин назад`
  if (d < 86400) return `${Math.floor(d / 3600)} ч назад`
  return new Date(t).toLocaleDateString('ru-RU')
}

export const PROTO_LABEL: Record<string, string> = {
  vless: 'VLESS',
  vmess: 'VMess',
  trojan: 'Trojan',
  shadowsocks: 'Shadowsocks',
  socks: 'SOCKS5',
  http: 'HTTP',
  hysteria2: 'Hysteria2',
  tuic: 'TUIC',
  wireguard: 'WireGuard',
  anytls: 'AnyTLS',
  'xray-json': 'Xray JSON',
  'singbox-json': 'sing-box'
}
