import { execFile, execFileSync } from 'node:child_process'

const KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`
const BYPASS = 'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.30.*;172.31.*;192.168.*;<local>'

const REFRESH = `
Add-Type -Namespace UveloNet -Name WinInet -MemberDefinition '[DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(System.IntPtr h, int o, System.IntPtr b, int l);'
[UveloNet.WinInet]::InternetSetOption([System.IntPtr]::Zero, 39, [System.IntPtr]::Zero, 0) | Out-Null
[UveloNet.WinInet]::InternetSetOption([System.IntPtr]::Zero, 37, [System.IntPtr]::Zero, 0) | Out-Null`

function ps(script: string): Promise<void> {
  return new Promise((res, rej) =>
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 15000 },
      (e) => (e ? rej(e) : res())
    )
  )
}

const psKey = String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings`

export function setSystemProxy(port: number) {
  return ps(`
$k='${psKey}'
Set-ItemProperty -Path $k -Name ProxyEnable -Value 1
Set-ItemProperty -Path $k -Name ProxyServer -Value '127.0.0.1:${port}'
Set-ItemProperty -Path $k -Name ProxyOverride -Value '${BYPASS}'
${REFRESH}`)
}

export function clearSystemProxy() {
  return ps(`Set-ItemProperty -Path '${psKey}' -Name ProxyEnable -Value 0
${REFRESH}`)
}

/** Быстрый синхронный сброс при выходе (без обновления WinInet - достаточно реестра) */
export function clearSystemProxySync() {
  try {
    execFileSync('reg', ['add', KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'], { windowsHide: true })
  } catch {
    /* ignore */
  }
}

/** Если после краша остался наш прокси - снимаем его */
export async function cleanupStaleProxy(port: number) {
  try {
    const out = execFileSync('reg', ['query', KEY], { windowsHide: true, encoding: 'utf8' })
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(out)
    const server = out.match(/ProxyServer\s+REG_SZ\s+(\S+)/i)?.[1]
    if (enabled && server === `127.0.0.1:${port}`) await clearSystemProxy()
  } catch {
    /* ignore */
  }
}

export function isAdmin(): Promise<boolean> {
  return new Promise((res) => execFile('net', ['session'], { windowsHide: true }, (e) => res(!e)))
}
