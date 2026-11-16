import { randomUUID } from 'node:crypto'
import { release } from 'node:os'
import { fetch, ProxyAgent } from 'undici'
import type { Subscription } from '@shared/types'
import { decodeHeaderText, parseBody, parseUserInfo } from './parser'

export interface FetchOpts {
  userAgent: string
  hwid: string
  proxyPort?: number
}

async function fetchOnce(url: string, o: FetchOpts, viaProxy: boolean) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': o.userAgent,
      Accept: '*/*',
      'x-hwid': o.hwid,
      'x-device-os': 'Windows',
      'x-ver-os': release(),
      'x-device-model': 'PC'
    },
    dispatcher: viaProxy && o.proxyPort ? new ProxyAgent(`http://127.0.0.1:${o.proxyPort}`) : undefined,
    signal: AbortSignal.timeout(20000)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return { body: await r.text(), headers: r.headers }
}

/** Загружает подписку. Если подключены - сначала пробуем через туннель, затем напрямую. */
export async function fetchSubscription(url: string, o: FetchOpts, base?: Subscription): Promise<Subscription> {
  let res: Awaited<ReturnType<typeof fetchOnce>> | undefined
  let err: unknown
  for (const via of o.proxyPort ? [true, false] : [false]) {
    try {
      res = await fetchOnce(url, o, via)
      break
    } catch (e) {
      err = e
    }
  }
  if (!res) throw err instanceof Error ? err : new Error(String(err))

  const id = base?.id || randomUUID()
  const servers = parseBody(res.body, id)
  if (!servers.length) throw new Error('В подписке не найдено ни одного сервера')

  const h = res.headers
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* ignore */
  }
  const title = decodeHeaderText(h.get('profile-title'))
  const cd = h.get('content-disposition')?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1]
  const interval = Number(h.get('profile-update-interval'))
  return {
    id,
    url,
    name: base?.name && base.name !== host ? base.name : title || (cd ? decodeURIComponent(cd) : host) || 'Подписка',
    servers,
    updatedAt: Date.now(),
    info: parseUserInfo(h.get('subscription-userinfo')),
    supportUrl: h.get('support-url') || undefined,
    webPageUrl: h.get('profile-web-page-url') || undefined,
    announce: decodeHeaderText(h.get('announce')),
    updateInterval: Number.isFinite(interval) && interval > 0 ? interval : undefined
  }
}
