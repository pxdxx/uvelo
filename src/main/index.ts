import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, clipboard, type MenuItemConstructorOptions } from 'electron'
import { spawn } from 'node:child_process'
import { basename, join } from 'node:path'
import type { AppState } from '@shared/types'
import { Controller } from './controller'
import { cleanupStaleProxy, clearSystemProxySync, isAdmin } from './sysproxy'

// Повышенный процесс не наследует окружение родителя: передаём важное через аргументы
const argVal = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
if (argVal('uvelo-renderer')) process.env['ELECTRON_RENDERER_URL'] = argVal('uvelo-renderer')
if (argVal('uvelo-data')) process.env.UVELO_DATA = argVal('uvelo-data')

// для разработки: отдельная папка данных и авто-скриншот
if (process.env.UVELO_DATA) app.setPath('userData', process.env.UVELO_DATA)
const RELAUNCHED = process.argv.includes('--uvelo-relaunch')
if (!RELAUNCHED && !app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.setAppUserModelId('org.uvelo.client')
if (process.defaultApp) app.setAsDefaultProtocolClient('uvelo', process.execPath, [join(process.argv[1] || '.')])
else app.setAsDefaultProtocolClient('uvelo')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let ctl: Controller
let quitting = false

const iconPath = () => (app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources', 'icon.png'))

function createWindow(show: boolean) {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#000000',
    icon: iconPath(),
    title: 'Uvelo',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => show && win?.show())
  win.on('close', (e) => {
    if (!quitting && ctl.state.settings.closeToTray) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.on('closed', () => (win = null))
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function showWindow() {
  if (!win) createWindow(true)
  else {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}

const STATUS_RU: Record<AppState['status'], string> = {
  connected: 'Подключено',
  connecting: 'Подключение…',
  disconnecting: 'Отключение…',
  disconnected: 'Не подключено',
  error: 'Ошибка'
}

function updateTray(s: AppState) {
  if (!tray) return
  const srv = ctl.findServer(s.connectedId)
  tray.setToolTip(`Uvelo: ${STATUS_RU[s.status]}${srv ? ': ' + srv.name : ''}`)
  const on = s.status === 'connected' || s.status === 'connecting'
  const tpl: MenuItemConstructorOptions[] = [
    { label: STATUS_RU[s.status] + (srv ? ` · ${srv.name}` : ''), enabled: false },
    { type: 'separator' },
    { label: on ? 'Отключить' : 'Подключить', click: () => ctl.toggle() },
    {
      label: 'Режим',
      submenu: [
        { label: 'Системный прокси', type: 'radio', checked: s.settings.connMode === 'system', click: () => ctl.setSettings({ connMode: 'system' }) },
        { label: 'TUN (весь компьютер)', type: 'radio', checked: s.settings.connMode === 'tun', click: () => ctl.setSettings({ connMode: 'tun' }) },
        { label: 'Только локальный прокси', type: 'radio', checked: s.settings.connMode === 'proxy', click: () => ctl.setSettings({ connMode: 'proxy' }) }
      ]
    },
    { label: 'Автопилот', type: 'checkbox', checked: s.settings.autopilot, click: (m) => ctl.setSettings({ autopilot: m.checked }) },
    { type: 'separator' },
    { label: 'Открыть Uvelo', click: showWindow },
    { label: 'Выход', click: () => quit() }
  ]
  tray.setContextMenu(Menu.buildFromTemplate(tpl))
}

let lastTrayKey = ''
function onState(s: AppState) {
  win?.webContents.send('state', s)
  const key = [s.status, s.connectedId, s.settings.connMode, s.settings.autopilot].join('|')
  if (key !== lastTrayKey) {
    lastTrayKey = key
    updateTray(s)
  }
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16, quality: 'best' })
  tray = new Tray(img)
  tray.on('click', showWindow)
  updateTray(ctl.state)
}

function quit() {
  quitting = true
  app.quit()
}

/** Перезапуск с правами администратора. Uvelo работает только с ними. */
function relaunchAsAdmin(wait = false): Promise<boolean> {
  const exe = process.execPath
  const args = process.argv.slice(1).filter((a) => !a.startsWith('--uvelo-'))
  args.push('--uvelo-relaunch')
  if (process.env['ELECTRON_RENDERER_URL']) args.push(`--uvelo-renderer=${process.env['ELECTRON_RENDERER_URL']}`)
  if (process.env.UVELO_DATA) args.push(`--uvelo-data=${process.env.UVELO_DATA}`)
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`
  const argList = ` -ArgumentList @(${args.map((a) => q(a.includes(' ') ? `"${a}"` : a)).join(',')})`
  return new Promise((res) => {
    const p = spawn(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath ${q(exe)}${argList} -Verb RunAs${wait ? " -Wait" : ""}`],
      { stdio: 'ignore', windowsHide: true }
    )
    p.on('exit', (code) => res(code === 0))
    p.on('error', () => res(false))
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function handleDeepLink(argv: string[]) {
  const link = argv.find((a) => /^(uvelo|happ):\/\//i.test(a))
  if (link) {
    showWindow()
    ctl.addSub(link).then((r) => ctl.notify(r.ok ? `Добавлено серверов: ${r.count}` : `Ошибка: ${r.error}`, r.ok ? 'info' : 'error'))
  }
}

/**
 * Автозапуск. Приложению с requireAdministrator Windows не даст стартовать из ключа Run,
 * поэтому используем задачу планировщика с наивысшими правами (без запроса UAC при входе).
 */
function applyAutoStart() {
  if (!app.isPackaged) return
  const task = 'Uvelo'
  const args = ctl.state.settings.autoStart
    ? ['/Create', '/TN', task, '/TR', `"${process.execPath}" --hidden`, '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F']
    : ['/Delete', '/TN', task, '/F']
  spawn('schtasks.exe', args, { stdio: 'ignore', windowsHide: true }).on('error', () => {})
  app.setLoginItemSettings({ openAtLogin: false })
}

function registerIpc() {
  const h = (ch: string, fn: (...a: any[]) => any) => ipcMain.handle(ch, (_e, ...a) => fn(...a))
  h('getState', () => ctl.state)
  h('getLogs', () => ctl.core.getLogs())
  h('clearLogs', () => ctl.core.clearLogs())
  h('connect', () => ctl.connect())
  h('disconnect', () => ctl.disconnect())
  h('selectServer', (id: string) => ctl.selectServer(id))
  h('selectSub', (id: string) => ctl.selectSub(id))
  h('addSub', (t: string) => ctl.addSub(t))
  h('addFromClipboard', async () => ctl.addSub(await clipboard.readText()))
  h('updateSub', (id: string) => ctl.updateSub(id))
  h('updateAllSubs', () => ctl.updateAllSubs())
  h('renameSub', (id: string, n: string) => ctl.renameSub(id, n))
  h('removeSub', (id: string) => ctl.removeSub(id))
  h('removeServer', (id: string) => ctl.removeServer(id))
  h('pingAll', () => ctl.pingAll())
  h('setSettings', async (p) => {
    await ctl.setSettings(p)
    if ('autoStart' in p) applyAutoStart()
  })
  h('relaunchAsAdmin', async () => ((await relaunchAsAdmin()) ? quit() : ctl.notify('Запуск от имени администратора отменён', 'warn')))
  h('openExternal', (u: string) => /^https?:\/\//i.test(u) && shell.openExternal(u))
  h('copyText', (t: string) => clipboard.writeText(t))
  h('openDataDir', () => shell.openPath(app.getPath('userData')))
  h('pickApp', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Выберите программу',
      properties: ['openFile'],
      filters: [{ name: 'Программы', extensions: ['exe'] }]
    })
    const path = r.filePaths[0]
    if (r.canceled || !path) return null
    let icon: string | undefined
    try {
      icon = (await app.getFileIcon(path, { size: 'normal' })).toDataURL()
    } catch {}
    return { exe: basename(path), path, icon, act: 'direct' }
  })
  h('win', (a: string) => {
    if (!win) return
    if (a === 'min') win.minimize()
    else if (a === 'max') win.isMaximized() ? win.unmaximize() : win.maximize()
    else if (a === 'close') win.close()
    else if (a === 'pin') {
      const v = !win.isAlwaysOnTop()
      win.setAlwaysOnTop(v)
      ctl.state.pinned = v
      ctl.broadcast()
    }
  })
}

app.on('second-instance', (_e, argv) => {
  showWindow()
  handleDeepLink(argv)
})

app.whenReady().then(async () => {
  // Uvelo работает только с правами администратора (TUN, маршруты, адаптер)
  if (!process.env.UVELO_NO_ELEVATE && !(await isAdmin())) {
    // в dev исходный процесс ждёт повышенный, иначе electron-vite гасит dev-сервер
    const devWait = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
    if (devWait) app.releaseSingleInstanceLock()
    if (RELAUNCHED || !(await relaunchAsAdmin(devWait))) {
      dialog.showErrorBox('Uvelo', 'Uvelo работает только с правами администратора.\nЗапустите приложение снова и подтвердите запрос Windows.')
    }
    quitting = true
    app.exit(0)
    return
  }
  // повышенный экземпляр забирает блокировку «одного окна», когда старый закроется
  if (RELAUNCHED) {
    for (let i = 0; i < 40 && !app.requestSingleInstanceLock(); i++) await sleep(150)
  }
  ctl = new Controller()
  ctl.on('state', onState)
  ctl.on('log', (l) => win?.webContents.send('log', l))
  registerIpc()
  await cleanupStaleProxy(ctl.state.settings.mixedPort)
  const hidden = process.argv.includes('--hidden') || ctl.state.settings.startHidden
  createWindow(!hidden)
  createTray()
  applyAutoStart()
  await ctl.init()
  handleDeepLink(process.argv)
  const shot = !app.isPackaged && process.env.UVELO_SHOT
  if (shot) {
    if (process.env.UVELO_PAGE) setTimeout(() => win?.webContents.executeJavaScript(`window.__uveloPage?.(${JSON.stringify(process.env.UVELO_PAGE)})`), 1500)
    if (process.env.UVELO_CLICK) {
      const [x, y] = process.env.UVELO_CLICK.split(',').map(Number)
      setTimeout(() => {
        for (const type of ['mouseDown', 'mouseUp'] as const) win?.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 })
        win?.webContents.sendInputEvent({ type: 'mouseMove', x: x + 60, y: y + 40 })
      }, 4000)
    }
    if (process.env.UVELO_DEMO) {
      // скриншоты для README: вымышленные пинги и местоположение
      setTimeout(() => {
        const ids = ctl.state.subs.flatMap((s) => s.servers).map((s) => s.id)
        ids.forEach((id, i) => (ctl.state.pings[id] = { ms: 38 + ((i * 37) % 160), at: Date.now() }))
        ctl.state.pinging = false
        ctl.state.location = { city: 'Москва', country: 'Россия', countryCode: 'RU', lat: 55.75, lon: 37.62 }
        ctl.broadcast()
      }, Number(process.env.UVELO_SHOT_DELAY || 6000) - 2000)
    }
    setTimeout(async () => {
      const names = Object.fromEntries(ctl.state.subs.flatMap((s) => s.servers).map((s) => [s.id, s.name]))
      console.log('[shot] pings', ctl.state.settings.pingType, JSON.stringify(Object.entries(ctl.state.pings).map(([id, p]) => `${names[id]} = ${p.ms}`)))
      const img = await win?.webContents.capturePage()
      if (img) (await import('node:fs')).writeFileSync(shot, img.toPNG())
      quit()
    }, Number(process.env.UVELO_SHOT_DELAY || 6000))
  }
})

app.on('window-all-closed', () => {
  /* живём в трее */
})

app.on('before-quit', () => {
  quitting = true
  const wasSystem = ctl?.state.status === 'connected' && ctl.state.settings.connMode === 'system'
  ctl?.shutdownSync()
  if (wasSystem) clearSystemProxySync()
})
