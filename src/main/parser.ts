import { createHash } from 'node:crypto'
import type { Server, StreamOpts, SubInfo } from '@shared/types'

export function b64decode(s: string): string {
  let t = s.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  while (t.length % 4) t += '='
  return Buffer.from(t, 'base64').toString('utf8')
}

const looksBase64 = (s: string) => /^[A-Za-z0-9+/=_\-\s]+$/.test(s.trim()) && s.trim().length >= 8

const dec = (s: string | null | undefined) => {
  if (!s) return ''
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

const hashId = (subId: string, raw: string) =>
  createHash('sha1').update(subId + '|' + raw).digest('hex').slice(0, 12)

const splitList = (s?: string | null) =>
  s ? dec(s).split(',').map((x) => x.trim()).filter(Boolean) : undefined

const truthy = (v?: string | null) => v === '1' || v === 'true'

/** host:port с поддержкой IPv6 [::1]:443 */
function hostPort(u: URL): { address: string; port: number } {
  return { address: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port) || 443 }
}

function streamFromQuery(q: URLSearchParams, defSecurity = 'none'): StreamOpts {
  let extra: unknown
  const ex = q.get('extra')
  if (ex) {
    try {
      extra = JSON.parse(dec(ex))
    } catch {
      /* ignore */
    }
  }
  const network = (q.get('type') || 'tcp').toLowerCase()
  return {
    network: network === 'raw' ? 'tcp' : network,
    security: (q.get('security') || defSecurity).toLowerCase(),
    sni: dec(q.get('sni') || q.get('peer')) || undefined,
    alpn: splitList(q.get('alpn')),
    fp: q.get('fp') || undefined,
    insecure: truthy(q.get('allowInsecure')) || truthy(q.get('insecure')),
    pbk: q.get('pbk') || undefined,
    sid: q.get('sid') || undefined,
    spx: dec(q.get('spx')) || undefined,
    pqv: q.get('pqv') || undefined,
    path: dec(q.get('path')) || undefined,
    host: dec(q.get('host')) || undefined,
    serviceName: dec(q.get('serviceName')) || undefined,
    headerType: q.get('headerType') || undefined,
    mode: q.get('mode') || undefined,
    seed: q.get('seed') || undefined,
    extra
  }
}

function parseVmess(link: string): Partial<Server> | null {
  const body = link.slice('vmess://'.length)
  let j: any
  try {
    j = JSON.parse(b64decode(body.split('#')[0]))
  } catch {
    return null
  }
  const network = String(j.net || 'tcp').toLowerCase()
  return {
    protocol: 'vmess',
    name: j.ps || `${j.add}:${j.port}`,
    address: String(j.add),
    port: Number(j.port) || 443,
    uuid: j.id,
    alterId: Number(j.aid) || 0,
    method: j.scy || 'auto',
    stream: {
      network: network === 'raw' ? 'tcp' : network,
      security: j.tls === 'tls' ? 'tls' : j.tls === 'reality' ? 'reality' : 'none',
      sni: j.sni || undefined,
      alpn: j.alpn ? String(j.alpn).split(',') : undefined,
      fp: j.fp || undefined,
      insecure: j.allowInsecure === true || j.allowInsecure === '1',
      path: j.path || undefined,
      host: j.host || undefined,
      serviceName: network === 'grpc' ? j.path : undefined,
      headerType: j.type && j.type !== 'none' ? j.type : undefined,
      mode: j.mode || undefined
    }
  }
}

function parseSS(link: string): Partial<Server> | null {
  // ss://base64(method:pass)@host:port?plugin=..#name  |  ss://base64(method:pass@host:port)#name
  let rest = link.slice('ss://'.length)
  let name = ''
  const hash = rest.indexOf('#')
  if (hash >= 0) {
    name = dec(rest.slice(hash + 1))
    rest = rest.slice(0, hash)
  }
  let query = ''
  const qi = rest.indexOf('?')
  if (qi >= 0) {
    query = rest.slice(qi + 1)
    rest = rest.slice(0, qi)
  }
  rest = rest.replace(/\/$/, '')
  let userinfo: string, hostport: string
  if (rest.includes('@')) {
    const at = rest.lastIndexOf('@')
    userinfo = rest.slice(0, at)
    hostport = rest.slice(at + 1)
    userinfo = userinfo.includes(':') ? dec(userinfo) : b64decode(dec(userinfo))
  } else {
    const d = b64decode(rest)
    const at = d.lastIndexOf('@')
    if (at < 0) return null
    userinfo = d.slice(0, at)
    hostport = d.slice(at + 1)
  }
  const ci = userinfo.indexOf(':')
  const m = hostport.match(/^\[?([^\]]+?)\]?:(\d+)$/)
  if (ci < 0 || !m) return null
  const q = new URLSearchParams(query)
  const plugin = q.get('plugin')
  let pluginName: string | undefined, pluginOpts: string | undefined
  if (plugin) {
    const p = dec(plugin)
    const si = p.indexOf(';')
    pluginName = si >= 0 ? p.slice(0, si) : p
    pluginOpts = si >= 0 ? p.slice(si + 1) : undefined
  }
  return {
    protocol: 'shadowsocks',
    name: name || `${m[1]}:${m[2]}`,
    address: m[1],
    port: Number(m[2]),
    method: userinfo.slice(0, ci),
    password: userinfo.slice(ci + 1),
    plugin: pluginName,
    pluginOpts
  }
}

function parseUrlLike(link: string): Partial<Server> | null {
  const scheme = link.slice(0, link.indexOf('://')).toLowerCase()
  let u: URL
  try {
    // URL не умеет нестандартные схемы с IPv6 - подменяем схему на http
    u = new URL('http://' + link.slice(link.indexOf('://') + 3))
  } catch {
    return null
  }
  const q = u.searchParams
  const { address, port } = hostPort(u)
  const name = dec(u.hash.slice(1)) || `${address}:${port}`
  const user = dec(u.username)
  const pass = dec(u.password)
  switch (scheme) {
    case 'vless':
      return {
        protocol: 'vless',
        name,
        address,
        port,
        uuid: user,
        flow: q.get('flow') || undefined,
        encryption: q.get('encryption') || 'none',
        stream: streamFromQuery(q)
      }
    case 'trojan':
      return {
        protocol: 'trojan',
        name,
        address,
        port,
        password: user + (pass ? ':' + pass : ''),
        stream: streamFromQuery(q, 'tls')
      }
    case 'hysteria2':
    case 'hy2':
      return {
        protocol: 'hysteria2',
        name,
        address,
        port,
        password: user + (pass ? ':' + pass : ''),
        obfs: q.get('obfs') || undefined,
        obfsPassword: dec(q.get('obfs-password')) || undefined,
        ports: q.get('mport') || undefined,
        upMbps: Number(q.get('up')) || undefined,
        downMbps: Number(q.get('down')) || undefined,
        stream: {
          network: 'udp',
          security: 'tls',
          sni: dec(q.get('sni')) || undefined,
          insecure: truthy(q.get('insecure')),
          alpn: splitList(q.get('alpn'))
        }
      }
    case 'tuic':
      return {
        protocol: 'tuic',
        name,
        address,
        port,
        uuid: user,
        password: pass,
        congestion: q.get('congestion_control') || 'bbr',
        udpRelayMode: q.get('udp_relay_mode') || undefined,
        stream: {
          network: 'udp',
          security: 'tls',
          sni: dec(q.get('sni')) || undefined,
          insecure: truthy(q.get('allow_insecure')) || truthy(q.get('insecure')),
          alpn: splitList(q.get('alpn')) || ['h3']
        }
      }
    case 'anytls':
      return {
        protocol: 'anytls',
        name,
        address,
        port,
        password: user,
        stream: {
          network: 'tcp',
          security: 'tls',
          sni: dec(q.get('sni')) || undefined,
          insecure: truthy(q.get('insecure')),
          fp: q.get('fp') || undefined
        }
      }
    case 'wireguard':
    case 'wg':
      return {
        protocol: 'wireguard',
        name,
        address,
        port,
        privateKey: user,
        publicKey: dec(q.get('publickey') || q.get('publicKey')),
        preSharedKey: dec(q.get('presharedkey') || q.get('psk')) || undefined,
        localAddress: splitList(q.get('address') || q.get('ip')) || ['10.0.0.2/32'],
        reserved: q.get('reserved') ? q.get('reserved')!.split(',').map(Number) : undefined,
        mtu: Number(q.get('mtu')) || undefined
      }
    case 'socks':
    case 'socks5': {
      let username = user,
        password = pass
      if (user && !pass) {
        try {
          const d = b64decode(user)
          if (d.includes(':')) [username, password] = [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]
        } catch {
          /* ignore */
        }
      }
      return { protocol: 'socks', name, address, port: Number(u.port) || 1080, username, password }
    }
    case 'http':
    case 'https':
      return {
        protocol: 'http',
        name,
        address,
        port: Number(u.port) || (scheme === 'https' ? 443 : 80),
        username: user,
        password: pass,
        stream: { network: 'tcp', security: scheme === 'https' ? 'tls' : 'none' }
      }
  }
  return null
}

export function parseLink(link: string, subId: string): Server | null {
  link = link.trim()
  const scheme = link.slice(0, link.indexOf('://')).toLowerCase()
  let p: Partial<Server> | null = null
  try {
    if (scheme === 'vmess') p = parseVmess(link)
    else if (scheme === 'ss') p = parseSS(link)
    else p = parseUrlLike(link)
  } catch {
    p = null
  }
  if (!p || !p.address || !p.port) return null
  return { ...(p as Server), id: hashId(subId, link), subId, raw: link, name: (p.name || '').trim() }
}

/** Извлекает адрес первого прокси-outbound из xray-конфига */
function xrayMainOutbound(cfg: any): any {
  const outs: any[] = cfg?.outbounds || []
  return (
    outs.find((o) => o.tag === 'proxy') ||
    outs.find((o) => !['freedom', 'blackhole', 'dns', 'loopback'].includes(o.protocol))
  )
}

function xrayAddr(o: any): { address: string; port: number } | null {
  const s = o?.settings
  const v = s?.vnext?.[0] || s?.servers?.[0] || s?.peers?.[0] || s
  if (!v) return null
  const address = v.address || v.endpoint?.split(':')[0]
  const port = Number(v.port || v.endpoint?.split(':').pop())
  return address ? { address, port: port || 443 } : null
}

const SB_SKIP = new Set(['direct', 'block', 'dns', 'selector', 'urltest'])

function parseJsonBody(text: string, subId: string): Server[] {
  let j: any
  try {
    j = JSON.parse(text)
  } catch {
    return []
  }
  const out: Server[] = []
  const list = Array.isArray(j) ? j : [j]
  for (const cfg of list) {
    if (!cfg || typeof cfg !== 'object') continue
    const outs: any[] = cfg.outbounds || []
    const isXray = outs.some((o) => o.protocol)
    if (isXray) {
      const main = xrayMainOutbound(cfg)
      const a = xrayAddr(main)
      if (!a) continue
      const raw = JSON.stringify(cfg)
      out.push({
        id: hashId(subId, raw),
        subId,
        name: cfg.remarks || `${a.address}:${a.port}`,
        protocol: 'xray-json',
        address: a.address,
        port: a.port,
        raw,
        json: cfg
      })
    } else {
      for (const o of [...outs, ...(cfg.endpoints || [])]) {
        if (!o.type || SB_SKIP.has(o.type) || !o.server && !o.peers) continue
        const raw = JSON.stringify(o)
        const address = o.server || o.peers?.[0]?.address
        out.push({
          id: hashId(subId, raw),
          subId,
          name: o.tag || `${address}`,
          protocol: 'singbox-json',
          address,
          port: o.server_port || o.peers?.[0]?.port || 443,
          raw,
          json: o
        })
      }
    }
  }
  return out
}

const LINK_RE = /^(vless|vmess|trojan|ss|socks5?|https?|hysteria2|hy2|tuic|wireguard|wg|anytls):\/\//i

/** Разбирает тело подписки или вставленный текст в список серверов */
export function parseBody(body: string, subId: string): Server[] {
  let text = body.trim()
  if (!text) return []
  if (text.startsWith('{') || text.startsWith('[')) {
    const r = parseJsonBody(text, subId)
    if (r.length) return r
  }
  if (!text.includes('://') && looksBase64(text)) {
    try {
      const d = b64decode(text)
      if (d.includes('://') || d.trim().startsWith('{') || d.trim().startsWith('[')) return parseBody(d, subId)
    } catch {
      /* ignore */
    }
  }
  const seen = new Set<string>()
  const servers: Server[] = []
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim()
    if (!LINK_RE.test(l)) continue
    const s = parseLink(l, subId)
    if (s && !seen.has(s.id)) {
      seen.add(s.id)
      servers.push(s)
    }
  }
  return servers
}

export function parseUserInfo(h?: string | null): SubInfo | undefined {
  if (!h) return
  const info: SubInfo = {}
  for (const part of h.split(';')) {
    const [k, v] = part.split('=').map((x) => x.trim())
    const n = Number(v)
    if (!k || !Number.isFinite(n)) continue
    if (k === 'upload' || k === 'download' || k === 'total' || k === 'expire') info[k] = n
  }
  return info
}

/** profile-title / announce могут приходить как "base64:..." */
export function decodeHeaderText(v?: string | null): string | undefined {
  if (!v) return
  if (v.startsWith('base64:')) {
    try {
      return b64decode(v.slice(7))
    } catch {
      return v
    }
  }
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}
