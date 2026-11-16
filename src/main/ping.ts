import { connect, isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { execFile } from 'node:child_process'
import type { Server } from '@shared/types'

const UDP_PROTOCOLS = new Set(['hysteria2', 'tuic', 'wireguard'])

async function resolve(host: string): Promise<string> {
  if (isIP(host)) return host
  const r = await lookup(host, { family: 4 }).catch(() => lookup(host))
  return r.address
}

export function tcpPing(host: string, port: number, timeout = 3000): Promise<number> {
  return new Promise((res) => {
    const t0 = process.hrtime.bigint()
    const s = connect({ host, port })
    const done = (v: number) => {
      s.destroy()
      res(v)
    }
    s.setTimeout(timeout, () => done(-1))
    s.once('connect', () => done(Math.max(1, Math.round(Number(process.hrtime.bigint() - t0) / 1e6))))
    s.once('error', () => done(-1))
  })
}

export function icmpPing(host: string, timeout = 2000): Promise<number> {
  return new Promise((res) => {
    execFile('ping', ['-n', '1', '-w', String(timeout), host], { windowsHide: true, timeout: timeout + 1500 }, (_e, out) => {
      // вывод локализован: "time=23ms" / "время=23мс" / "time<1ms"
      const m = String(out || '').match(/[=<]\s*(\d+)\s*(?:ms|мс)/i)
      res(m ? Math.max(1, Number(m[1])) : -1)
    })
  })
}

/** ICMP-пинг до адреса сервера */
export async function icmpPingServer(s: Server): Promise<number> {
  try {
    return await icmpPing(await resolve(s.address))
  } catch {
    return -1
  }
}

/** TCP-пинг (для UDP-протоколов вроде Hysteria2: ICMP, порт по TCP там закрыт) */
export async function pingServer(s: Server): Promise<number> {
  try {
    const ip = await resolve(s.address)
    if (UDP_PROTOCOLS.has(s.protocol) || (s.protocol === 'singbox-json' && ['hysteria2', 'tuic', 'wireguard', 'hysteria'].includes(s.json?.type))) {
      return icmpPing(ip)
    }
    // лучший из двух замеров - сглаживает первый «холодный» хендшейк
    const a = await tcpPing(ip, s.port)
    if (a < 0) return -1
    const b = await tcpPing(ip, s.port)
    return b > 0 ? Math.min(a, b) : a
  } catch {
    return -1
  }
}

export async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items]
  await Promise.all(
    Array.from({ length: Math.min(n, q.length) }, async () => {
      for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x)
    })
  )
}
