export type Protocol =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'shadowsocks'
  | 'socks'
  | 'http'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard'
  | 'anytls'
  | 'xray-json'
  | 'singbox-json'

/** Транспорт/безопасность для V2Ray-подобных протоколов (vless / vmess / trojan). */
export interface StreamOpts {
  network: string // tcp | ws | grpc | http | h2 | httpupgrade | xhttp | splithttp | kcp | quic
  security: string // none | tls | reality
  sni?: string
  alpn?: string[]
  fp?: string
  insecure?: boolean
  pbk?: string
  sid?: string
  spx?: string
  pqv?: string
  path?: string
  host?: string
  serviceName?: string
  headerType?: string
  mode?: string
  extra?: unknown
  seed?: string
}

export interface Server {
  id: string
  subId: string
  name: string
  protocol: Protocol
  address: string
  port: number
  /** ISO 3166-1 alpha-2, верхний регистр */
  country?: string
  raw: string
  // протокол-специфичные поля
  uuid?: string
  password?: string
  username?: string
  method?: string
  flow?: string
  encryption?: string
  alterId?: number
  stream?: StreamOpts
  plugin?: string
  pluginOpts?: string
  // hysteria2 / tuic
  obfs?: string
  obfsPassword?: string
  ports?: string
  upMbps?: number
  downMbps?: number
  congestion?: string
  udpRelayMode?: string
  // wireguard
  privateKey?: string
  publicKey?: string
  preSharedKey?: string
  localAddress?: string[]
  reserved?: number[]
  mtu?: number
  /** Полный конфиг (xray-json) или outbound (singbox-json) */
  json?: any
}

export interface SubInfo {
  upload?: number
  download?: number
  total?: number
  expire?: number // unix seconds
}

export interface Subscription {
  id: string
  name: string
  url?: string
  servers: Server[]
  updatedAt?: number
  info?: SubInfo
  supportUrl?: string
  webPageUrl?: string
  announce?: string
  updateInterval?: number // часы, из заголовка profile-update-interval
  error?: string
  manual?: boolean
}

export type ConnMode = 'system' | 'tun' | 'proxy'
/** smart: РФ напрямую, остальное через VPN; global: всё через VPN; selected: только выбранные сервисы и сайты */
export type RoutingMode = 'global' | 'smart' | 'selected'
export type RuleAct = 'proxy' | 'direct' | 'block'
export interface AppRule {
  /** имя файла, например discord.exe */
  exe: string
  path?: string
  /** иконка программы, data:URL */
  icon?: string
  act: RuleAct
}
export type CorePref = 'auto' | 'sing-box' | 'xray'
/** real: HTTP GET через сам прокси; tcp: соединение с портом; icmp: обычный ping */
export type PingType = 'real' | 'tcp' | 'icmp'

export interface Settings {
  connMode: ConnMode
  routing: RoutingMode
  blockAds: boolean
  autopilot: boolean // переключение при падении сервера
  bestPing: boolean // автоматический выбор сервера с лучшим пингом
  core: CorePref
  mixedPort: number
  allowLan: boolean
  ipv6: boolean
  remoteDns: string
  directDns: string
  pingType: PingType
  testUrl: string
  healthInterval: number // сек
  subUpdateHours: number
  userAgent: string
  autoStart: boolean
  startHidden: boolean
  autoConnect: boolean
  closeToTray: boolean
  directDomains: string
  proxyDomains: string
  blockDomains: string
  /** id сервиса -> через VPN (true) или напрямую (false) */
  services: Record<string, boolean>
  apps: AppRule[]
  /** автовыбор: переключаться, если другой сервер быстрее на столько мс */
  bestPingMargin: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** версия схемы настроек: для миграций */
  schema?: number
}

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error'

export interface PingResult {
  ms: number // -1 = недоступен
  at: number
}

export interface GeoInfo {
  ip?: string
  country?: string
  countryCode?: string
  city?: string
  lat?: number
  lon?: number
}

export interface Traffic {
  up: number // байт/с
  down: number
  upTotal: number
  downTotal: number
}

export interface AppState {
  status: ConnStatus
  error?: string
  subs: Subscription[]
  activeSubId?: string
  /** выбранный сервер; 'auto' - автовыбор */
  selectedId: string
  connectedId?: string
  connectedAt?: number
  engine?: string
  pings: Record<string, PingResult>
  pinging: boolean
  settings: Settings
  location?: GeoInfo
  exitInfo?: GeoInfo
  traffic: Traffic
  isAdmin: boolean
  coresOk: { singbox: boolean; xray: boolean; singboxVersion?: string; xrayVersion?: string }
  version: string
  notice?: { id: number; text: string; kind: 'info' | 'warn' | 'error' }
  pinned: boolean
}

export interface UveloApi {
  getState(): Promise<AppState>
  onState(cb: (s: AppState) => void): () => void
  onLog(cb: (lines: string[]) => void): () => void
  getLogs(): Promise<string[]>
  clearLogs(): Promise<void>
  connect(): Promise<void>
  disconnect(): Promise<void>
  selectServer(id: string): Promise<void>
  selectSub(id: string): Promise<void>
  addSub(input: string): Promise<{ ok: boolean; error?: string; count?: number }>
  addFromClipboard(): Promise<{ ok: boolean; error?: string; count?: number }>
  updateSub(id: string): Promise<{ ok: boolean; error?: string }>
  updateAllSubs(): Promise<void>
  renameSub(id: string, name: string): Promise<void>
  removeSub(id: string): Promise<void>
  removeServer(id: string): Promise<void>
  pingAll(): Promise<void>
  setSettings(p: Partial<Settings>): Promise<void>
  relaunchAsAdmin(): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(t: string): Promise<void>
  win(action: 'min' | 'max' | 'close' | 'pin'): Promise<void>
  openDataDir(): Promise<void>
  pickApp(): Promise<AppRule | null>
}

export const DEFAULT_SETTINGS: Settings = {
  connMode: 'system',
  routing: 'smart',
  blockAds: false,
  autopilot: true,
  bestPing: true,
  core: 'auto',
  mixedPort: 10808,
  allowLan: false,
  ipv6: false,
  remoteDns: 'https://1.1.1.1/dns-query',
  directDns: '77.88.8.8',
  pingType: 'real',
  testUrl: 'https://www.gstatic.com/generate_204',
  healthInterval: 20,
  subUpdateHours: 12,
  userAgent: 'Uvelo/0.1',
  autoStart: false,
  startHidden: false,
  autoConnect: false,
  closeToTray: true,
  directDomains: '',
  proxyDomains: '',
  blockDomains: '',
  services: {},
  apps: [],
  bestPingMargin: 50,
  logLevel: 'warn'
}
