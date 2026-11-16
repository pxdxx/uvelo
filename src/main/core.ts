import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, connect } from 'node:net'
import { request } from 'node:http'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { app } from 'electron'
import type { Server, Settings } from '@shared/types'
import { buildSingbox, buildSingboxTester, buildXray, pickEngine, type Engine } from './config'

export const coresDir = () =>
  app.isPackaged ? join(process.resourcesPath, 'cores') : join(app.getAppPath(), 'resources', 'cores')
const runDir = () => {
  const d = join(app.getPath('userData'), 'run')
  mkdirSync(d, { recursive: true })
  return d
}
export const singboxPath = () => join(coresDir(), 'sing-box.exe')
export const xrayPath = () => join(coresDir(), 'xray.exe')

export function coreVersions() {
  const v = (f: string) => {
    try {
      return readFileSync(f + '.version', 'utf8').trim()
    } catch {
      return undefined
    }
  }
  return {
    singbox: existsSync(singboxPath()),
    xray: existsSync(xrayPath()),
    singboxVersion: v(singboxPath()),
    xrayVersion: v(xrayPath())
  }
}

export function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer()
    s.unref()
    s.on('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as any).port
      s.close(() => res(p))
    })
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function portOpen(port: number): Promise<boolean> {
  return new Promise((res) => {
    const c = connect({ host: '127.0.0.1', port })
    const done = (v: boolean) => {
      c.destroy()
      res(v)
    }
    c.setTimeout(400, () => done(false))
    c.once('connect', () => done(true))
    c.once('error', () => done(false))
  })
}

function clashGet(port: number, secret: string, path: string, timeout = 8000): Promise<any> {
  return new Promise((res, rej) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { Authorization: `Bearer ${secret}` }, timeout },
      (r) => {
        let b = ''
        r.on('data', (d) => (b += d))
        r.on('end', () => {
          try {
            const j = b ? JSON.parse(b) : {}
            if ((r.statusCode || 500) >= 400) rej(new Error(j.message || `HTTP ${r.statusCode}`))
            else res(j)
          } catch (e) {
            rej(e)
          }
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', rej)
    req.end()
  })
}

export async function clashDelay(port: number, secret: string, tag: string, url: string, timeout = 5000): Promise<number> {
  try {
    const j = await clashGet(
      port,
      secret,
      `/proxies/${encodeURIComponent(tag)}/delay?timeout=${timeout}&url=${encodeURIComponent(url)}`,
      timeout + 2000
    )
    return typeof j.delay === 'number' && j.delay > 0 ? j.delay : -1
  } catch {
    return -1
  }
}

interface Proc {
  name: string
  child: ChildProcess
}

export class CoreManager extends EventEmitter {
  private procs: Proc[] = []
  private logs: string[] = []
  private pending: string[] = []
  private flushTimer?: NodeJS.Timeout
  private trafficReq?: ReturnType<typeof request>
  private stopping = false
  clashPort = 0
  clashSecret = ''
  engine?: Engine

  get running() {
    return this.procs.length > 0
  }

  getLogs() {
    return this.logs
  }
  clearLogs() {
    this.logs = []
  }

  log(line: string) {
    const l = line.replace(/\x1b\[[0-9;]*m/g, '').trimEnd()
    if (!l) return
    this.logs.push(l)
    if (this.logs.length > 3000) this.logs.splice(0, this.logs.length - 3000)
    this.pending.push(l)
    if (!this.flushTimer)
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined
        const p = this.pending
        this.pending = []
        this.emit('log', p)
      }, 150)
  }

  private spawnCore(name: string, exe: string, args: string[]): ChildProcess {
    if (!existsSync(exe)) throw new Error(`Не найдено ядро ${name}. Выполните npm run fetch-cores`)
    const child = spawn(exe, args, { cwd: coresDir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const onData = (d: Buffer) => d.toString().split(/\r?\n/).forEach((l) => l && this.log(`[${name}] ${l}`))
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('exit', (code) => {
      this.log(`[${name}] процесс завершён (код ${code})`)
      const was = this.procs.some((p) => p.child === child)
      this.procs = this.procs.filter((p) => p.child !== child)
      if (was && !this.stopping) {
        this.emit('crash', name, code)
      }
    })
    this.procs.push({ name, child })
    return child
  }

  /** Ждёт, пока порт начнёт принимать соединения, или процесс упадёт */
  private async waitReady(child: ChildProcess, port: number, name: string, ms = 10000) {
    const t0 = Date.now()
    let exited = false
    const onExit = () => (exited = true)
    child.once('exit', onExit)
    try {
      while (Date.now() - t0 < ms) {
        if (exited) {
          const tail = this.logs.filter((l) => l.startsWith(`[${name}]`)).slice(-4).join('\n')
          throw new Error(`${name} не запустился:\n${tail}`)
        }
        if (await portOpen(port)) return
        await sleep(150)
      }
      throw new Error(`${name}: таймаут запуска`)
    } finally {
      child.off('exit', onExit)
    }
  }

  async start(server: Server, settings: Settings, tun: boolean): Promise<Engine> {
    await this.stop()
    this.stopping = false
    const engine = pickEngine(server, settings.core)
    const dir = runDir()
    this.clashPort = await freePort()
    this.clashSecret = randomBytes(12).toString('hex')

    let xrayPort: number | undefined
    try {
      if (engine === 'xray') {
        xrayPort = await freePort()
        const xcfg = join(dir, 'xray.json')
        writeFileSync(xcfg, JSON.stringify(buildXray(server, xrayPort, settings.logLevel), null, 2))
        const x = this.spawnCore('xray', xrayPath(), ['run', '-c', xcfg])
        await this.waitReady(x, xrayPort, 'xray')
      }
      const cfg = buildSingbox({
        settings,
        server,
        xrayPort,
        clashPort: this.clashPort,
        clashSecret: this.clashSecret,
        coresDir: coresDir(),
        tun
      })
      const scfg = join(dir, 'sing-box.json')
      writeFileSync(scfg, JSON.stringify(cfg, null, 2))
      const sb = this.spawnCore('sing-box', singboxPath(), ['run', '-c', scfg, '-D', dir, '--disable-color'])
      await this.waitReady(sb, settings.mixedPort, 'sing-box', tun ? 15000 : 10000)
    } catch (e) {
      await this.stop()
      throw e
    }
    this.engine = engine
    this.startTraffic()
    return engine
  }

  async stop() {
    this.stopping = true
    this.trafficReq?.destroy()
    this.trafficReq = undefined
    const procs = this.procs
    this.procs = []
    await Promise.all(
      procs.map(
        (p) =>
          new Promise<void>((res) => {
            if (p.child.exitCode !== null) return res()
            const t = setTimeout(res, 3000)
            p.child.once('exit', () => {
              clearTimeout(t)
              res()
            })
            p.child.kill()
          })
      )
    )
    this.engine = undefined
  }

  /** Синхронное убийство при выходе из приложения */
  killSync() {
    this.stopping = true
    for (const p of this.procs) {
      try {
        p.child.kill()
      } catch {
        /* ignore */
      }
    }
    this.procs = []
  }

  delay(url: string, timeout = 5000) {
    if (!this.running) return Promise.resolve(-1)
    return clashDelay(this.clashPort, this.clashSecret, 'proxy', url, timeout)
  }

  private startTraffic() {
    const req = request(
      {
        host: '127.0.0.1',
        port: this.clashPort,
        path: '/traffic',
        headers: { Authorization: `Bearer ${this.clashSecret}` }
      },
      (r) => {
        let buf = ''
        r.on('data', (d) => {
          buf += d
          let i
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i)
            buf = buf.slice(i + 1)
            try {
              const j = JSON.parse(line)
              this.emit('traffic', Number(j.up) || 0, Number(j.down) || 0)
            } catch {
              /* ignore */
            }
          }
        })
      }
    )
    req.on('error', () => {
      /* ядро перезапускается - ничего */
    })
    req.end()
    this.trafficReq = req
  }
}

/** Запускает временный sing-box-тестер; при битом outbound выкидывает его и пробует снова */
async function startTester(
  servers: Server[],
  socks: Record<string, number>,
  log: (l: string) => void,
  onDrop: (id: string) => void
): Promise<{ child: ChildProcess; port: number; secret: string; servers: Server[] } | null> {
  let list = [...servers]
  for (let attempt = 0; attempt < 6 && list.length; attempt++) {
    const port = await freePort()
    const secret = randomBytes(8).toString('hex')
    const file = join(runDir(), 'tester.json')
    const { cfg, order } = buildSingboxTester(list, port, secret, socks)
    writeFileSync(file, JSON.stringify(cfg))
    let err = ''
    const child = spawn(singboxPath(), ['run', '-c', file, '-D', runDir(), '--disable-color'], {
      cwd: coresDir(),
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    child.stderr?.on('data', (d) => (err += d.toString()))
    const t0 = Date.now()
    let ok = false
    while (Date.now() - t0 < 8000) {
      if (child.exitCode !== null) break
      if (await portOpen(port)) {
        ok = true
        break
      }
      await sleep(120)
    }
    if (ok) return { child, port, secret, servers: list }
    child.kill()
    // «initialize outbound[3]: …» / «initialize endpoint[0]: …»: выкидываем виновника
    const m = err.match(/initialize (outbound|endpoint)\[(\d+)\]/)
    const bad = m ? order[m[1] as 'outbound' | 'endpoint'][Number(m[2])] : undefined
    log('[tester] ' + (err.trim().split('\n').pop() || 'не запустился'))
    if (!bad) return null
    onDrop(bad)
    list = list.filter((s) => s.id !== bad)
  }
  return null
}

/**
 * Реальная задержка: HTTP GET на testUrl через сам прокси.
 * sing-box-совместимые серверы: напрямую в тестере; для серверов, которым нужен Xray,
 * поднимаются временные xray (пачками), а тестер ходит в них через SOCKS.
 */
export async function realDelayTest(
  servers: Server[],
  url: string,
  onResult: (id: string, ms: number) => void,
  log: (l: string) => void,
  /** тот же выбор ядра, что и при подключении: чтобы пинг совпадал с реальностью */
  pref: Settings['core'] = 'auto'
): Promise<void> {
  if (!servers.length) return
  const hasXray = existsSync(xrayPath())
  const eng = (s: Server) => (hasXray ? pickEngine(s, pref) : pickEngine(s, 'sing-box'))
  const native = servers.filter((s) => eng(s) === 'sing-box')
  const viaXray = servers.filter((s) => eng(s) === 'xray')
  for (const s of servers) if (!native.includes(s) && !viaXray.includes(s)) onResult(s.id, -1)

  const runBatch = async (batch: Server[], xr: Server[]) => {
    const xrays: ChildProcess[] = []
    const socks: Record<string, number> = {}
    try {
      for (const s of xr) {
        try {
          const p = await freePort()
          const f = join(runDir(), `xtest-${s.id}.json`)
          writeFileSync(f, JSON.stringify(buildXray(s, p, 'error')))
          const c = spawn(xrayPath(), ['run', '-c', f], { cwd: coresDir(), windowsHide: true, stdio: 'ignore' })
          xrays.push(c)
          socks[s.id] = p
        } catch {
          onResult(s.id, -1)
        }
      }
      // ждём, пока xray откроют порты
      const t0 = Date.now()
      for (const [id, p] of Object.entries(socks)) {
        while (!(await portOpen(p)) && Date.now() - t0 < 6000) await sleep(100)
        if (!(await portOpen(p))) {
          onResult(id, -1)
          delete socks[id]
        }
      }
      const all = [...batch, ...xr.filter((s) => socks[s.id])]
      if (!all.length) return
      const t = await startTester(all, socks, log, (id) => onResult(id, -1))
      if (!t) {
        all.forEach((s) => onResult(s.id, -1))
        return
      }
      try {
        const queue = [...t.servers]
        const worker = async () => {
          for (let s = queue.shift(); s; s = queue.shift()) {
            // два замера, лучший: первый часто «холодный» (DNS, хендшейки ядра)
            const a = await clashDelay(t.port, t.secret, 't-' + s.id, url, 6000)
            const b = a > 0 ? await clashDelay(t.port, t.secret, 't-' + s.id, url, 6000) : -1
            onResult(s.id, b > 0 ? Math.min(a, b) : a)
          }
        }
        await Promise.all(Array.from({ length: 12 }, worker))
      } finally {
        t.child.kill()
      }
    } finally {
      xrays.forEach((c) => c.kill())
    }
  }

  // первая пачка: все нативные + до 8 xray, дальше xray по 8
  const XB = 8
  await runBatch(native, viaXray.slice(0, XB))
  for (let i = XB; i < viaXray.length; i += XB) await runBatch([], viaXray.slice(i, i + XB))
}
