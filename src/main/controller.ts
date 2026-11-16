import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AppState, Server, Settings, Subscription } from '@shared/types'
import { load, save, type Persisted } from './store'
import { CoreManager, coreVersions, realDelayTest } from './core'
import { pickEngine } from './config'
import { icmpPingServer, pingServer, pool } from './ping'
import { assignCountries, geoipHosts, whereAmI } from './geo'
import { fetchSubscription } from './subscription'
import { parseBody } from './parser'
import { clearSystemProxy, isAdmin, setSystemProxy } from './sysproxy'

const MANUAL_ID = 'manual'

export class Controller extends EventEmitter {
  data: Persisted
  core = new CoreManager()
  state: AppState
  private broadcastTimer?: NodeJS.Timeout
  private healthTimer?: NodeJS.Timeout
  private betterTimer?: NodeJS.Timeout
  private restartTimer?: NodeJS.Timeout
  private subTimer?: NodeJS.Timeout
  private fails = 0
  private failed = new Set<string>()
  private switching = false
  private noticeId = 0
  private upTotal = 0
  private downTotal = 0
  private connectSeq = 0

  constructor() {
    super()
    this.data = load()
    this.state = {
      status: 'disconnected',
      subs: this.data.subs,
      activeSubId: this.data.activeSubId || this.data.subs[0]?.id,
      selectedId: this.data.selectedId,
      pings: {},
      pinging: false,
      settings: this.data.settings,
      location: this.data.location,
      traffic: { up: 0, down: 0, upTotal: 0, downTotal: 0 },
      isAdmin: false,
      coresOk: coreVersions(),
      version: app.getVersion(),
      pinned: false
    }
    this.core.on('log', (l) => this.emit('log', l))
    this.core.on('traffic', (up: number, down: number) => {
      this.upTotal += up
      this.downTotal += down
      this.state.traffic = { up, down, upTotal: this.upTotal, downTotal: this.downTotal }
      this.broadcast()
    })
    this.core.on('crash', (name: string) => this.onCrash(name))
  }

  async init() {
    this.state.isAdmin = await isAdmin()
    this.broadcast()
    whereAmI().then((loc) => {
      if (loc && this.state.status !== 'connected') {
        this.state.location = loc
        this.data.location = loc
        this.persist()
        this.broadcast()
      }
    })
    this.subTimer = setInterval(() => this.autoUpdateSubs(), 10 * 60 * 1000)
    setTimeout(() => this.autoUpdateSubs(), 5000)
    if (this.activeServers().length) setTimeout(() => this.pingAll(), 800)
    this.refreshGeoip()
    if (this.state.settings.autoConnect && this.activeServers().length) setTimeout(() => this.connect(), 1500)
  }

  /* -------------------------------- состояние -------------------------------- */

  broadcast() {
    if (this.broadcastTimer) return
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = undefined
      this.emit('state', this.state)
    }, 60)
  }

  persist() {
    this.data.subs = this.state.subs
    this.data.activeSubId = this.state.activeSubId
    this.data.selectedId = this.state.selectedId
    this.data.settings = this.state.settings
    save(this.data)
  }

  notify(text: string, kind: 'info' | 'warn' | 'error' = 'info') {
    this.state.notice = { id: ++this.noticeId, text, kind }
    this.core.log(`[uvelo] ${text}`)
    this.broadcast()
  }

  activeSub(): Subscription | undefined {
    return this.state.subs.find((s) => s.id === this.state.activeSubId) || this.state.subs[0]
  }
  activeServers(): Server[] {
    return this.activeSub()?.servers || []
  }
  findServer(id?: string): Server | undefined {
    if (!id) return
    for (const s of this.state.subs) {
      const f = s.servers.find((x) => x.id === id)
      if (f) return f
    }
  }

  /** Сервера, отсортированные по пингу (недоступные - в конце) */
  ranked(exclude?: Set<string>): Server[] {
    const p = this.state.pings
    const score = (s: Server) => {
      const r = p[s.id]
      if (!r) return 50000
      return r.ms > 0 ? r.ms : 100000
    }
    return this.activeServers()
      .filter((s) => !exclude?.has(s.id))
      .sort((a, b) => score(a) - score(b))
  }

  /* -------------------------------- подписки -------------------------------- */

  private fetchOpts() {
    return {
      userAgent: this.state.settings.userAgent || 'Uvelo/0.1',
      hwid: this.data.hwid,
      proxyPort: this.state.status === 'connected' ? this.state.settings.mixedPort : undefined
    }
  }

  async addSub(input: string): Promise<{ ok: boolean; error?: string; count?: number }> {
    input = input.trim()
    if (!input) return { ok: false, error: 'Пусто' }
    const deep = input.match(/^(?:uvelo|happ|v2raytun|hiddify):\/\/(?:add|install-config|import\/?)\/?\??(?:url=)?(.+)$/i)
    if (deep) input = decodeURIComponent(deep[1])
    try {
      if (/^https?:\/\//i.test(input) && !input.includes('\n')) {
        const existing = this.state.subs.find((s) => s.url === input)
        const sub = await fetchSubscription(input, this.fetchOpts(), existing)
        assignCountries(sub.servers, this.data.geoCache)
        if (existing) Object.assign(existing, sub)
        else this.state.subs.push(sub)
        this.state.activeSubId = sub.id
        this.afterSubChange()
        return { ok: true, count: sub.servers.length }
      }
      // одиночные ссылки / base64 / JSON - в «Мои серверы»
      let manual = this.state.subs.find((s) => s.id === MANUAL_ID)
      const servers = parseBody(input, MANUAL_ID)
      if (!servers.length) return { ok: false, error: 'Не удалось распознать ни ссылку подписки, ни сервер' }
      if (!manual) {
        manual = { id: MANUAL_ID, name: 'Мои серверы', servers: [], manual: true, updatedAt: Date.now() }
        this.state.subs.push(manual)
      }
      const ids = new Set(manual.servers.map((s) => s.id))
      const fresh = servers.filter((s) => !ids.has(s.id))
      assignCountries(fresh, this.data.geoCache)
      manual.servers.push(...fresh)
      manual.updatedAt = Date.now()
      this.state.activeSubId = MANUAL_ID
      this.afterSubChange()
      return { ok: true, count: fresh.length }
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) }
    }
  }

  private afterSubChange() {
    this.persist()
    this.broadcast()
    this.refreshGeoip()
    this.pingAll()
  }

  async updateSub(id: string): Promise<{ ok: boolean; error?: string }> {
    const sub = this.state.subs.find((s) => s.id === id)
    if (!sub?.url) return { ok: false, error: 'Нет URL' }
    try {
      const fresh = await fetchSubscription(sub.url, this.fetchOpts(), sub)
      assignCountries(fresh.servers, this.data.geoCache)
      Object.assign(sub, fresh, { error: undefined })
      if (this.state.selectedId !== 'auto' && !this.findServer(this.state.selectedId)) this.state.selectedId = 'auto'
      this.afterSubChange()
      return { ok: true }
    } catch (e: any) {
      sub.error = e?.message || String(e)
      this.broadcast()
      return { ok: false, error: sub.error }
    }
  }

  async updateAllSubs() {
    await Promise.all(this.state.subs.filter((s) => s.url).map((s) => this.updateSub(s.id)))
  }

  private async autoUpdateSubs() {
    const hrs = this.state.settings.subUpdateHours
    if (!hrs) return
    for (const s of this.state.subs) {
      if (!s.url) continue
      const every = (s.updateInterval || hrs) * 3600e3
      if (!s.updatedAt || Date.now() - s.updatedAt > every) await this.updateSub(s.id)
    }
  }

  renameSub(id: string, name: string) {
    const s = this.state.subs.find((x) => x.id === id)
    if (s && name.trim()) s.name = name.trim()
    this.persist()
    this.broadcast()
  }

  removeSub(id: string) {
    this.state.subs = this.state.subs.filter((s) => s.id !== id)
    if (this.state.activeSubId === id) this.state.activeSubId = this.state.subs[0]?.id
    if (this.state.selectedId !== 'auto' && !this.findServer(this.state.selectedId)) this.state.selectedId = 'auto'
    this.persist()
    this.broadcast()
  }

  removeServer(id: string) {
    for (const s of this.state.subs) s.servers = s.servers.filter((x) => x.id !== id)
    this.state.subs = this.state.subs.filter((s) => !s.manual || s.servers.length)
    if (this.state.selectedId === id) this.state.selectedId = 'auto'
    this.persist()
    this.broadcast()
  }

  selectSub(id: string) {
    if (!this.state.subs.some((s) => s.id === id)) return
    this.state.activeSubId = id
    this.state.selectedId = 'auto'
    this.persist()
    this.broadcast()
    const stale = this.activeServers().some((s) => !this.state.pings[s.id])
    if (stale) this.pingAll()
  }

  private async refreshGeoip() {
    const unknown = new Set<string>()
    for (const sub of this.state.subs) for (const s of sub.servers) if (!s.country) unknown.add(s.address)
    const hosts = [...unknown].filter((h) => !this.data.geoCache[h])
    if (hosts.length) Object.assign(this.data.geoCache, await geoipHosts(hosts))
    let changed = false
    for (const sub of this.state.subs)
      for (const s of sub.servers)
        if (!s.country && this.data.geoCache[s.address]) {
          s.country = this.data.geoCache[s.address]
          changed = true
        }
    if (changed || hosts.length) {
      this.persist()
      this.broadcast()
    }
  }

  /* -------------------------------- пинг -------------------------------- */

  async pingAll(servers = this.activeServers()) {
    if (this.state.pinging || !servers.length) return
    this.state.pinging = true
    this.broadcast()
    const set = (id: string, ms: number) => {
      this.state.pings[id] = { ms, at: Date.now() }
      this.broadcast()
    }
    try {
      await this.measure(servers, set)
    } finally {
      this.state.pinging = false
      this.broadcast()
    }
    await this.checkBetter()
  }

  /** Автовыбор: если другой сервер быстрее текущего на bestPingMargin мс и больше, переключаемся */
  private async checkBetter() {
    if (this.state.selectedId !== 'auto' || this.state.status !== 'connected' || this.switching) return
    const curId = this.state.connectedId
    if (!curId) return
    const ms = (id: string) => this.state.pings[id]?.ms ?? -1
    const best = this.ranked(this.failed).find((s) => ms(s.id) > 0)
    if (!best || best.id === curId) return
    const margin = Math.max(0, this.state.settings.bestPingMargin ?? 50)
    const cur = ms(curId)
    if (cur > 0 && cur - ms(best.id) < margin) return
    const gain = cur > 0 ? `быстрее на ${cur - ms(best.id)} мс` : 'отвечает'
    await this.switchTo(best, `Лучший пинг: ${best.name} ${gain}, переключаюсь`)
  }

  /** Замер выбранным в настройках способом: через прокси (GET), TCP или ICMP */
  private async measure(servers: Server[], set: (id: string, ms: number) => void) {
    const st = this.state.settings
    if (st.pingType === 'real' && this.state.coresOk.singbox) {
      try {
        await realDelayTest(servers, st.testUrl, set, (l) => this.core.log(l), st.core)
        return
      } catch (e: any) {
        this.core.log(`[uvelo] проверка через прокси не удалась: ${e.message}, откат на TCP`)
      }
    }
    const fn = st.pingType === 'icmp' ? icmpPingServer : pingServer
    await pool(servers, 24, async (s) => set(s.id, await fn(s)))
  }

  /* ------------------------------ подключение ------------------------------ */

  private async pickTarget(): Promise<Server | undefined> {
    const sel = this.state.selectedId
    if (sel !== 'auto') return this.findServer(sel) || this.activeServers()[0]
    const fresh = this.activeServers().every((s) => {
      const p = this.state.pings[s.id]
      return p && Date.now() - p.at < 120_000
    })
    if (!fresh) await this.pingAll()
    const ranked = this.ranked(this.failed)
    return ranked.find((s) => (this.state.pings[s.id]?.ms ?? -1) > 0) || ranked[0]
  }

  private get wantTun() {
    return this.state.settings.connMode === 'tun'
  }

  async connect() {
    if (this.state.status === 'connecting' || this.state.status === 'connected') return
    if (!this.activeServers().length) return this.notify('Добавьте подписку или сервер', 'warn')
    if (!this.state.coresOk.singbox) return this.notify('Ядро sing-box не найдено. Выполните npm run fetch-cores', 'error')
    if (this.wantTun && !this.state.isAdmin) {
      this.state.status = 'error'
      this.state.error = 'need-admin'
      this.broadcast()
      return
    }
    const seq = ++this.connectSeq
    this.failed.clear()
    this.state.status = 'connecting'
    this.state.error = undefined
    this.broadcast()

    const target = await this.pickTarget()
    if (seq !== this.connectSeq) return
    if (!target) {
      this.state.status = 'disconnected'
      return this.broadcast()
    }
    const ok = await this.startOn(target, this.state.settings.autopilot ? 4 : 1)
    if (seq !== this.connectSeq) return
    if (!ok) {
      this.state.status = 'error'
      this.broadcast()
      return
    }
    if (this.state.settings.connMode === 'system') {
      try {
        await setSystemProxy(this.state.settings.mixedPort)
      } catch (e: any) {
        this.notify('Не удалось включить системный прокси: ' + e.message, 'error')
      }
    }
    this.state.status = 'connected'
    this.state.connectedAt = Date.now()
    this.upTotal = this.downTotal = 0
    this.broadcast()
    this.startHealth()
    this.refreshExit()
  }

  /** Запускает ядро на сервере; при ошибке пробует следующие лучшие (attempts) */
  private async startOn(first: Server, attempts: number): Promise<boolean> {
    let s: Server | undefined = first
    for (let i = 0; i < attempts && s; i++) {
      try {
        const engine = await this.core.start(s, this.state.settings, this.wantTun)
        this.state.connectedId = s.id
        this.state.engine = engine
        this.core.log(`[uvelo] подключено: ${s.name} (${pickEngine(s, this.state.settings.core)})`)
        return true
      } catch (e: any) {
        this.failed.add(s.id)
        this.state.error = e?.message || String(e)
        this.notify(`${s.name}: ${this.state.error}`, 'error')
        s = this.ranked(this.failed)[0]
      }
    }
    return false
  }

  async disconnect() {
    this.connectSeq++
    this.stopHealth()
    const wasSystem = this.state.status === 'connected' && this.state.settings.connMode === 'system'
    this.state.status = 'disconnecting'
    this.broadcast()
    await this.core.stop()
    if (wasSystem || this.state.settings.connMode === 'system') await clearSystemProxy().catch(() => {})
    this.state.status = 'disconnected'
    this.state.connectedId = undefined
    this.state.connectedAt = undefined
    this.state.exitInfo = undefined
    this.state.engine = undefined
    this.state.traffic = { up: 0, down: 0, upTotal: 0, downTotal: 0 }
    this.broadcast()
  }

  async toggle() {
    if (this.state.status === 'connected' || this.state.status === 'connecting') await this.disconnect()
    else await this.connect()
  }

  /** Переподключение «на лету» без снятия системного прокси */
  private async switchTo(s: Server, reason?: string) {
    if (this.switching) return
    this.switching = true
    this.stopHealth()
    this.state.status = 'connecting'
    this.broadcast()
    try {
      const ok = await this.startOn(s, this.state.settings.autopilot ? 4 : 1)
      if (ok) {
        this.state.status = 'connected'
        this.state.connectedAt = Date.now()
        if (reason) this.notify(reason, 'warn')
        this.startHealth()
        this.refreshExit()
      } else {
        await this.disconnect()
        this.state.status = 'error'
      }
    } finally {
      this.switching = false
      this.broadcast()
    }
  }

  async selectServer(id: string) {
    this.state.selectedId = id
    this.state.settings.bestPing = id === 'auto'
    this.persist()
    this.broadcast()
    if (this.state.status === 'connected') {
      const target = id === 'auto' ? await this.pickTarget() : this.findServer(id)
      if (target && target.id !== this.state.connectedId) await this.switchTo(target)
    }
  }

  private async refreshExit() {
    const info = await whereAmI(this.state.settings.mixedPort)
    if (this.state.status === 'connected') {
      this.state.exitInfo = info
      this.broadcast()
    }
  }

  /* ------------------------------ автопилот ------------------------------ */

  private startHealth() {
    this.stopHealth()
    this.fails = 0
    const tick = async () => {
      if (this.state.status !== 'connected' || this.switching) return
      const ms = await this.core.delay(this.state.settings.testUrl, 6000)
      if (this.state.status !== 'connected') return
      const id = this.state.connectedId
      if (ms > 0) {
        this.fails = 0
        if (id) this.state.pings[id] = { ms, at: Date.now() }
        this.broadcast()
        return
      }
      this.fails++
      this.core.log(`[uvelo] проверка не прошла (${this.fails})`)
      if (this.fails >= 2 && this.state.settings.autopilot) await this.failover('не отвечает')
    }
    this.healthTimer = setInterval(tick, Math.max(5, this.state.settings.healthInterval) * 1000)
    // автовыбор: раз в 3 минуты перемеряем все серверы и ищем заметно более быстрый
    this.betterTimer = setInterval(() => {
      if (this.state.selectedId === 'auto' && this.state.status === 'connected' && !this.switching) this.pingAll()
    }, 180_000)
  }

  private stopHealth() {
    if (this.healthTimer) clearInterval(this.healthTimer)
    if (this.betterTimer) clearInterval(this.betterTimer)
    this.healthTimer = this.betterTimer = undefined
  }

  private async failover(why: string) {
    const cur = this.findServer(this.state.connectedId)
    if (cur) {
      this.failed.add(cur.id)
      this.state.pings[cur.id] = { ms: -1, at: Date.now() }
    }
    // перепроверяем кандидатов напрямую, чтобы не прыгнуть на такой же мёртвый
    const candidates = this.ranked(this.failed).slice(0, 8)
    await this.measure(candidates, (id, ms) => {
      this.state.pings[id] = { ms, at: Date.now() }
    })
    let next = this.ranked(this.failed).find((s) => (this.state.pings[s.id]?.ms ?? -1) > 0)
    if (!next) {
      // все упали - начинаем круг заново
      this.failed.clear()
      next = this.ranked(new Set(cur ? [cur.id] : []))[0]
    }
    if (!next) return
    await this.switchTo(next, `Автопилот: ${cur?.name || 'сервер'} ${why}, переключаюсь на ${next.name}`)
  }

  private async onCrash(name: string) {
    if (this.state.status !== 'connected') return
    this.core.log(`[uvelo] ядро ${name} упало`)
    if (this.state.settings.autopilot) {
      const cur = this.findServer(this.state.connectedId)
      if (cur) await this.switchTo(cur, `Ядро ${name} перезапущено`)
    } else {
      await this.disconnect()
      this.state.status = 'error'
      this.state.error = `Ядро ${name} неожиданно завершилось`
      this.broadcast()
    }
  }

  /* ------------------------------ настройки ------------------------------ */

  async setSettings(p: Partial<Settings>) {
    const prev = { ...this.state.settings }
    Object.assign(this.state.settings, p)
    if (p.bestPing === true) this.state.selectedId = 'auto'
    if (p.bestPing === false && this.state.selectedId === 'auto') {
      const best = this.ranked()[0]
      if (best) this.state.selectedId = best.id
    }
    this.persist()
    this.broadcast()
    if (p.healthInterval && this.healthTimer) this.startHealth()

    // параметры, требующие перезапуска ядра
    const coreKeys: (keyof Settings)[] = [
      'connMode', 'routing', 'blockAds', 'core', 'mixedPort', 'allowLan', 'ipv6', 'remoteDns', 'directDns',
      'directDomains', 'proxyDomains', 'blockDomains', 'services', 'apps', 'logLevel'
    ]
    const changed = coreKeys.some((k) => k in p && JSON.stringify(p[k]) !== JSON.stringify(prev[k]))
    if (changed && this.state.status === 'connected') {
      const modeChanged = p.connMode !== undefined && p.connMode !== prev.connMode
      if (modeChanged || (p.mixedPort !== undefined && p.mixedPort !== prev.mixedPort)) {
        // смена режима - полный цикл, чтобы корректно снять/поставить системный прокси
        this.state.settings.connMode = prev.connMode
        this.state.settings.mixedPort = prev.mixedPort
        await this.disconnect()
        Object.assign(this.state.settings, p)
        await this.connect()
      } else {
        this.scheduleRestart()
      }
    }
  }

  /** Перезапуск ядра с новыми правилами; частые переключения склеиваются в один */
  private scheduleRestart() {
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = undefined
      if (this.state.status !== 'connected') return
      if (this.switching) return this.scheduleRestart()
      const cur = this.findServer(this.state.connectedId)
      if (cur) await this.switchTo(cur)
    }, 450)
  }

  newId() {
    return randomUUID()
  }

  shutdownSync() {
    this.stopHealth()
    if (this.subTimer) clearInterval(this.subTimer)
    this.core.killSync()
    save(this.data, true)
  }
}
