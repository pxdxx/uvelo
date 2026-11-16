import { isIP } from 'node:net'
import { SERVICES, serviceOn } from '@shared/services'
import { join } from 'node:path'
import type { Server, Settings, StreamOpts } from '@shared/types'

/* ------------------------------------------------------------------ */
/*  Выбор движка                                                       */
/* ------------------------------------------------------------------ */

const XRAY_ONLY_NET = new Set(['xhttp', 'splithttp', 'kcp', 'mkcp'])
const SB_ONLY_NET = new Set(['http', 'h2', 'quic'])
const XRAY_CAPABLE = new Set(['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http'])

export type Engine = 'sing-box' | 'xray'

export function pickEngine(s: Server, pref: Settings['core']): Engine {
  if (s.protocol === 'xray-json') return 'xray'
  if (s.protocol === 'singbox-json') return 'sing-box'
  if (!XRAY_CAPABLE.has(s.protocol)) return 'sing-box'
  const net = s.stream?.network || 'tcp'
  if (XRAY_ONLY_NET.has(net)) return 'xray'
  if (s.protocol === 'vless' && s.encryption && s.encryption !== 'none') return 'xray'
  if (net === 'tcp' && s.stream?.headerType === 'http') return 'xray'
  if (s.stream?.pqv) return 'xray'
  if (SB_ONLY_NET.has(net)) return 'sing-box'
  // Xray 26+ отказывается запускать VLESS без TLS/Reality на публичный адрес
  if (s.protocol === 'vless' && (!s.stream?.security || s.stream.security === 'none')) return 'sing-box'
  if (pref === 'sing-box') return 'sing-box'
  if (pref === 'xray') return 'xray'
  // Авто: панели (Marzban, Remnawave, 3x-ui) работают на Xray: для V2Ray-семейства
  // Xray-клиент самый совместимый (gRPC у sing-box с ними часто не работает)
  return V2RAY_FAMILY.has(s.protocol) ? 'xray' : 'sing-box'
}

const V2RAY_FAMILY = new Set(['vless', 'vmess', 'trojan'])


/* ------------------------------------------------------------------ */
/*  sing-box                                                           */
/* ------------------------------------------------------------------ */

function sbTls(s: Server, st?: StreamOpts): any {
  if (!st || (st.security !== 'tls' && st.security !== 'reality')) return undefined
  const tls: any = { enabled: true }
  const sni = st.sni || (isIP(s.address) ? undefined : s.address)
  if (sni) tls.server_name = sni
  if (st.insecure) tls.insecure = true
  if (st.alpn?.length) tls.alpn = st.alpn
  const fp = st.fp || (st.security === 'reality' ? 'chrome' : undefined)
  if (fp) tls.utls = { enabled: true, fingerprint: fp }
  if (st.security === 'reality') {
    tls.reality = { enabled: true, public_key: st.pbk || '', short_id: st.sid || '' }
  }
  return tls
}

function sbTransport(st?: StreamOpts): any {
  if (!st) return undefined
  switch (st.network) {
    case 'ws': {
      const t: any = { type: 'ws', path: st.path || '/' }
      if (st.host) t.headers = { Host: st.host }
      const m = t.path.match(/[?&]ed=(\d+)/)
      if (m) {
        t.path = t.path.replace(/[?&]ed=\d+/, '') || '/'
        t.max_early_data = Number(m[1])
        t.early_data_header_name = 'Sec-WebSocket-Protocol'
      }
      return t
    }
    case 'grpc':
      return { type: 'grpc', service_name: st.serviceName || st.path || '' }
    case 'http':
    case 'h2':
      return { type: 'http', host: st.host ? st.host.split(',') : undefined, path: st.path || '/' }
    case 'httpupgrade':
      return { type: 'httpupgrade', host: st.host || undefined, path: st.path || '/' }
    case 'quic':
      return { type: 'quic' }
  }
  return undefined
}

/** Возвращает [тип секции, объект] - wireguard идёт в endpoints */
export function singboxOutbound(s: Server, tag: string): { endpoint: boolean; ob: any } {
  const base = { tag, server: s.address, server_port: s.port }
  const strip = (o: any) => JSON.parse(JSON.stringify(o))
  switch (s.protocol) {
    case 'vless':
      return {
        endpoint: false,
        ob: strip({
          ...base,
          type: 'vless',
          uuid: s.uuid,
          flow: s.flow || undefined,
          packet_encoding: 'xudp',
          tls: sbTls(s, s.stream),
          transport: sbTransport(s.stream)
        })
      }
    case 'vmess':
      return {
        endpoint: false,
        ob: strip({
          ...base,
          type: 'vmess',
          uuid: s.uuid,
          security: s.method || 'auto',
          alter_id: s.alterId || 0,
          packet_encoding: 'xudp',
          tls: sbTls(s, s.stream),
          transport: sbTransport(s.stream)
        })
      }
    case 'trojan':
      return {
        endpoint: false,
        ob: strip({ ...base, type: 'trojan', password: s.password, tls: sbTls(s, s.stream), transport: sbTransport(s.stream) })
      }
    case 'shadowsocks':
      return {
        endpoint: false,
        ob: strip({ ...base, type: 'shadowsocks', method: s.method, password: s.password, plugin: s.plugin, plugin_opts: s.pluginOpts })
      }
    case 'socks':
      return {
        endpoint: false,
        ob: strip({ ...base, type: 'socks', version: '5', username: s.username || undefined, password: s.password || undefined })
      }
    case 'http':
      return {
        endpoint: false,
        ob: strip({ ...base, type: 'http', username: s.username || undefined, password: s.password || undefined, tls: sbTls(s, s.stream) })
      }
    case 'hysteria2': {
      const ob: any = { ...base, type: 'hysteria2', password: s.password, tls: sbTls(s, s.stream) }
      if (s.obfs) ob.obfs = { type: s.obfs, password: s.obfsPassword }
      if (s.ports) ob.server_ports = s.ports.split(',').map((p) => p.replace('-', ':'))
      if (s.upMbps) ob.up_mbps = s.upMbps
      if (s.downMbps) ob.down_mbps = s.downMbps
      return { endpoint: false, ob: strip(ob) }
    }
    case 'tuic':
      return {
        endpoint: false,
        ob: strip({
          ...base,
          type: 'tuic',
          uuid: s.uuid,
          password: s.password,
          congestion_control: s.congestion,
          udp_relay_mode: s.udpRelayMode,
          tls: sbTls(s, s.stream)
        })
      }
    case 'anytls':
      return { endpoint: false, ob: strip({ ...base, type: 'anytls', password: s.password, tls: sbTls(s, s.stream) }) }
    case 'wireguard':
      return {
        endpoint: true,
        ob: strip({
          type: 'wireguard',
          tag,
          address: s.localAddress,
          private_key: s.privateKey,
          mtu: s.mtu,
          peers: [
            {
              address: s.address,
              port: s.port,
              public_key: s.publicKey,
              pre_shared_key: s.preSharedKey,
              allowed_ips: ['0.0.0.0/0', '::/0'],
              reserved: s.reserved
            }
          ]
        })
      }
    case 'singbox-json': {
      const ob = { ...s.json, tag }
      return { endpoint: s.json?.type === 'wireguard' && !!s.json?.peers, ob }
    }
  }
  throw new Error(`Протокол ${s.protocol} не поддерживается sing-box`)
}

function parseDns(addr: string, tag: string, detour?: string): any {
  const a = addr.trim()
  if (a === 'local' || a === 'system') return { type: 'local', tag }
  let o: any
  const m = a.match(/^(https|tls|quic|h3|tcp|udp):\/\/([^/:]+|\[[^\]]+\])(?::(\d+))?(\/.*)?$/i)
  if (m) {
    o = { type: m[1].toLowerCase(), tag, server: m[2].replace(/^\[|\]$/g, '') }
    if (m[3]) o.server_port = Number(m[3])
    if (m[4] && (o.type === 'https' || o.type === 'h3')) o.path = m[4]
  } else {
    o = { type: 'udp', tag, server: a }
  }
  if (!isIP(o.server)) o.domain_resolver = 'local'
  if (detour) o.detour = detour
  return o
}

interface DomainRule {
  domain_suffix?: string[]
  domain_keyword?: string[]
  ip_cidr?: string[]
}

function parseDomainList(text: string): DomainRule | null {
  const r: DomainRule = {}
  for (let line of text.split(/[\n,]/)) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('keyword:')) (r.domain_keyword ??= []).push(line.slice(8))
    else if (isIP(line.split('/')[0])) (r.ip_cidr ??= []).push(line.includes('/') ? line : line + (isIP(line) === 6 ? '/128' : '/32'))
    else (r.domain_suffix ??= []).push(line.replace(/^\*?\.?/, '').replace(/^domain:/, ''))
  }
  return Object.keys(r).length ? r : null
}

/** Разделяет правило на доменную часть и IP-часть (rule-объекты sing-box объединяют поля через OR внутри одной группы) */
const withAction = (r: DomainRule | null, extra: any) => (r ? { ...r, ...extra } : null)

export interface SingboxOpts {
  settings: Settings
  server: Server
  /** если задан - proxy-outbound это socks на локальный xray */
  xrayPort?: number
  clashPort: number
  clashSecret: string
  coresDir: string
  tun: boolean
}

export function buildSingbox(o: SingboxOpts): any {
  const { settings: st, server, coresDir, tun } = o
  const rules = (name: string) => join(coresDir, 'rules', name)

  let proxy: { endpoint: boolean; ob: any }
  if (o.xrayPort) {
    proxy = { endpoint: false, ob: { type: 'socks', tag: 'proxy', server: '127.0.0.1', server_port: o.xrayPort, version: '5' } }
  } else {
    proxy = singboxOutbound(server, 'proxy')
  }

  const inbounds: any[] = [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: st.allowLan ? '0.0.0.0' : '127.0.0.1',
      listen_port: st.mixedPort
    }
  ]
  if (tun) {
    inbounds.push({
      type: 'tun',
      tag: 'tun-in',
      interface_name: 'Uvelo',
      address: st.ipv6 ? ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'] : ['172.19.0.1/30'],
      mtu: 9000,
      auto_route: true,
      strict_route: true,
      stack: 'mixed'
    })
  }

  const routeRules: any[] = [{ action: 'sniff' }, { protocol: 'dns', action: 'hijack-dns' }]
  if (tun) {
    // ядра и сам клиент ходят напрямую, иначе петля через TUN
    routeRules.push({ process_name: ['sing-box.exe', 'xray.exe', 'Uvelo.exe', 'electron.exe'], outbound: 'direct' })
  }
  routeRules.push({ ip_is_private: true, outbound: 'direct' })

  // программы: работают при любом режиме и для любых сайтов
  const apps = (st.apps || []).filter((a) => a.exe)
  for (const act of ['block', 'direct', 'proxy'] as const) {
    const list = apps.filter((a) => a.act === act)
    if (!list.length) continue
    const target = act === 'block' ? { action: 'reject' } : { outbound: act }
    const names = list.filter((a) => !a.path).map((a) => a.exe)
    const paths = list.filter((a) => a.path).map((a) => a.path!)
    if (names.length) routeRules.push({ process_name: names, ...target })
    if (paths.length) routeRules.push({ process_path: paths, ...target })
  }

  const ruleSets: any[] = []
  const addRs = (tag: string, file: string) => ruleSets.push({ type: 'local', tag, format: 'binary', path: rules(file) })

  const block = parseDomainList(st.blockDomains)
  if (block) routeRules.push(withAction(block, { action: 'reject' }))
  if (st.blockAds) {
    addRs('geosite-ads', 'geosite-category-ads-all.srs')
    routeRules.push({ rule_set: ['geosite-ads'], action: 'reject' })
  }
  const proxyList = parseDomainList(st.proxyDomains)
  if (proxyList) routeRules.push(withAction(proxyList, { outbound: 'proxy' }))
  const directList = parseDomainList(st.directDomains)
  if (directList) routeRules.push(withAction(directList, { outbound: 'direct' }))

  let final = 'proxy'
  const dnsRules: any[] = []
  if (directList?.domain_suffix) dnsRules.push({ domain_suffix: directList.domain_suffix, server: 'local' })
  if (st.routing === 'selected' && proxyList?.domain_suffix) dnsRules.push({ domain_suffix: proxyList.domain_suffix, server: 'remote' })

  // сервисы: в «Только выбранные» включённые идут через VPN, в остальных режимах выключенные идут напрямую
  const selected = st.routing === 'selected'
  for (const svc of SERVICES) {
    if (svc.selectedOnly && !selected) continue
    const on = serviceOn(svc, st.services)
    if (selected ? !on : on) continue
    const outbound = selected ? 'proxy' : 'direct'
    const dnsServer = selected ? 'remote' : 'local'
    if (svc.ruleSets) {
      const tags: string[] = []
      if (svc.ruleSets.site) {
        addRs(`svc-${svc.id}-site`, svc.ruleSets.site)
        tags.push(`svc-${svc.id}-site`)
        dnsRules.push({ rule_set: [`svc-${svc.id}-site`], server: dnsServer })
      }
      if (svc.ruleSets.ip) {
        addRs(`svc-${svc.id}-ip`, svc.ruleSets.ip)
        tags.push(`svc-${svc.id}-ip`)
      }
      routeRules.push({ rule_set: tags, outbound })
      continue
    }
    const r: any = { domain_suffix: svc.domains, outbound }
    if (svc.ips?.length) r.ip_cidr = svc.ips
    routeRules.push(r)
    dnsRules.push({ domain_suffix: svc.domains, server: dnsServer })
  }

  if (st.routing === 'smart') {
    addRs('geosite-ru', 'geosite-category-ru.srs')
    addRs('geoip-ru', 'geoip-ru.srs')
    routeRules.push({ domain_suffix: ['ru', 'su', 'xn--p1ai', 'by', 'kz'], outbound: 'direct' })
    routeRules.push({ rule_set: ['geosite-ru'], outbound: 'direct' })
    // без action: resolve: домены уходят на сервер как есть (их резолвит сам сервер),
    // поэтому сбой DNS не ломает весь трафик. geoip применяется к соединениям по IP.
    routeRules.push({ rule_set: ['geoip-ru'], outbound: 'direct' })
    dnsRules.push({ domain_suffix: ['ru', 'su', 'xn--p1ai', 'by', 'kz'], server: 'local' })
    dnsRules.push({ rule_set: ['geosite-ru'], server: 'local' })
  } else if (selected) {
    final = 'direct'
  }

  const outbounds: any[] = [{ type: 'direct', tag: 'direct' }]
  const endpoints: any[] = []
  if (proxy.endpoint) endpoints.push(proxy.ob)
  else outbounds.unshift(proxy.ob)

  const cfg: any = {
    log: { level: st.logLevel === 'warn' ? 'warn' : st.logLevel, timestamp: true },
    dns: {
      servers: [parseDns(st.remoteDns, 'remote', 'proxy'), parseDns(st.directDns, 'local')],
      rules: dnsRules,
      final: final === 'direct' ? 'local' : 'remote',
      strategy: st.ipv6 ? 'prefer_ipv4' : 'ipv4_only',
      // в TUN по IP восстанавливается домен, чтобы правила сервисов срабатывали и для UDP (голос Discord и т.п.)
      ...(tun ? { reverse_mapping: true } : {})
    },
    inbounds,
    outbounds,
    route: {
      rules: routeRules,
      rule_set: ruleSets,
      final,
      auto_detect_interface: true,
      // правила по программам работают и с системным прокси, не только в TUN
      ...(apps.length ? { find_process: true } : {}),
      default_domain_resolver: { server: 'local' }
    },
    experimental: {
      clash_api: { external_controller: `127.0.0.1:${o.clashPort}`, secret: o.clashSecret }
    }
  }
  if (endpoints.length) cfg.endpoints = endpoints
  return cfg
}

/** Конфиг для замера реальной задержки сразу множества серверов */
export function buildSingboxTester(
  servers: Server[],
  clashPort: number,
  secret: string,
  /** id сервера → локальный SOCKS-порт временного xray */
  socks: Record<string, number> = {}
): { cfg: any; order: { outbound: (string | undefined)[]; endpoint: (string | undefined)[] } } {
  const outbounds: any[] = [{ type: 'direct', tag: 'direct' }]
  const endpoints: any[] = []
  // порядок нужен, чтобы по ошибке «outbound[N]» понять, какой сервер битый
  const order = { outbound: [undefined] as (string | undefined)[], endpoint: [] as (string | undefined)[] }
  for (const s of servers) {
    try {
      if (socks[s.id]) {
        outbounds.push({ type: 'socks', tag: 't-' + s.id, server: '127.0.0.1', server_port: socks[s.id], version: '5' })
        order.outbound.push(s.id)
        continue
      }
      const r = singboxOutbound(s, 't-' + s.id)
      ;(r.endpoint ? endpoints : outbounds).push(r.ob)
      ;(r.endpoint ? order.endpoint : order.outbound).push(s.id)
    } catch {
      /* пропускаем */
    }
  }
  const cfg: any = {
    log: { level: 'error' },
    dns: { servers: [{ type: 'udp', tag: 'local', server: '1.1.1.1' }] },
    outbounds,
    route: { final: 'direct', auto_detect_interface: true, default_domain_resolver: { server: 'local' } },
    experimental: { clash_api: { external_controller: `127.0.0.1:${clashPort}`, secret } }
  }
  if (endpoints.length) cfg.endpoints = endpoints
  return { cfg, order }
}

/* ------------------------------------------------------------------ */
/*  Xray                                                               */
/* ------------------------------------------------------------------ */

function xrayStream(s: Server): any {
  const st = s.stream || { network: 'tcp', security: 'none' }
  const net = st.network === 'tcp' ? 'raw' : st.network === 'splithttp' ? 'xhttp' : st.network === 'mkcp' ? 'kcp' : st.network
  const ss: any = { network: net, security: st.security || 'none' }
  const sni = st.sni || (isIP(s.address) ? undefined : s.address)
  if (st.security === 'tls') {
    ss.tlsSettings = { serverName: sni, alpn: st.alpn, fingerprint: st.fp || 'chrome' }
    if (st.insecure) ss.tlsSettings.allowInsecure = true
  } else if (st.security === 'reality') {
    ss.realitySettings = {
      serverName: sni,
      fingerprint: st.fp || 'chrome',
      publicKey: st.pbk,
      shortId: st.sid || '',
      spiderX: st.spx || '',
      mldsa65Verify: st.pqv
    }
  }
  switch (net) {
    case 'ws':
      ss.wsSettings = { path: st.path || '/', host: st.host }
      break
    case 'grpc':
      ss.grpcSettings = { serviceName: st.serviceName || '', multiMode: st.mode === 'multi', authority: st.host }
      break
    case 'xhttp':
      ss.xhttpSettings = { path: st.path || '/', host: st.host, mode: st.mode || 'auto', extra: st.extra }
      break
    case 'httpupgrade':
      ss.httpupgradeSettings = { path: st.path || '/', host: st.host }
      break
    case 'kcp':
      ss.kcpSettings = { header: { type: st.headerType || 'none' }, seed: st.seed }
      break
    case 'raw':
      if (st.headerType === 'http') {
        ss.rawSettings = {
          header: {
            type: 'http',
            request: { path: (st.path || '/').split(','), headers: st.host ? { Host: st.host.split(',') } : {} }
          }
        }
      }
      break
  }
  return ss
}

export function xrayOutbound(s: Server, tag: string): any {
  let ob: any
  switch (s.protocol) {
    case 'vless':
      ob = {
        protocol: 'vless',
        settings: {
          vnext: [
            { address: s.address, port: s.port, users: [{ id: s.uuid, encryption: s.encryption || 'none', flow: s.flow || undefined }] }
          ]
        },
        streamSettings: xrayStream(s)
      }
      break
    case 'vmess':
      ob = {
        protocol: 'vmess',
        settings: { vnext: [{ address: s.address, port: s.port, users: [{ id: s.uuid, alterId: s.alterId || 0, security: s.method || 'auto' }] }] },
        streamSettings: xrayStream(s)
      }
      break
    case 'trojan':
      ob = {
        protocol: 'trojan',
        settings: { servers: [{ address: s.address, port: s.port, password: s.password }] },
        streamSettings: xrayStream(s)
      }
      break
    case 'shadowsocks':
      ob = { protocol: 'shadowsocks', settings: { servers: [{ address: s.address, port: s.port, method: s.method, password: s.password }] } }
      break
    case 'socks':
    case 'http': {
      const users = s.username ? [{ user: s.username, pass: s.password }] : undefined
      ob = { protocol: s.protocol, settings: { servers: [{ address: s.address, port: s.port, users }] } }
      if (s.protocol === 'http' && s.stream?.security === 'tls') ob.streamSettings = xrayStream(s)
      break
    }
    default:
      throw new Error(`Протокол ${s.protocol} не поддерживается Xray`)
  }
  ob.tag = tag
  return JSON.parse(JSON.stringify(ob))
}

const XRAY_LOG: Record<string, string> = { debug: 'debug', info: 'info', warn: 'warning', error: 'error' }

export function buildXray(server: Server, socksPort: number, logLevel: Settings['logLevel']): any {
  const inbound = {
    tag: 'socks',
    listen: '127.0.0.1',
    port: socksPort,
    protocol: 'socks',
    settings: { udp: true, auth: 'noauth' }
  }
  if (server.protocol === 'xray-json') {
    const cfg = JSON.parse(JSON.stringify(server.json))
    delete cfg.api
    delete cfg.stats
    delete cfg.remarks
    cfg.log = { loglevel: XRAY_LOG[logLevel] }
    cfg.inbounds = [inbound]
    return cfg
  }
  return {
    log: { loglevel: XRAY_LOG[logLevel] },
    inbounds: [inbound],
    outbounds: [xrayOutbound(server, 'proxy'), { protocol: 'freedom', tag: 'direct' }]
  }
}
