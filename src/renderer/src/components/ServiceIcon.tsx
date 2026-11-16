import type { CSSProperties } from 'react'
import {
  siClaude,
  siCloudflare,
  siDiscord,
  siGooglegemini,
  siInstagram,
  siNetflix,
  siSpotify,
  siTelegram,
  siTiktok,
  siTwitch,
  siWhatsapp,
  siX,
  siYoutube
} from 'simple-icons'

interface Look {
  path?: string
  bg: string
  fg?: string
  dark?: boolean
}

const LOOKS: Record<string, Look> = {
  youtube: { path: siYoutube.path, bg: '#ff0033' },
  instagram: { path: siInstagram.path, bg: 'linear-gradient(45deg, #feda75 0%, #fa7e1e 25%, #d62976 55%, #962fbf 80%, #4f5bd5 100%)' },
  telegram: { path: siTelegram.path, bg: '#229ed9' },
  whatsapp: { path: siWhatsapp.path, bg: '#25d366' },
  tiktok: { path: siTiktok.path, bg: '#111114', dark: true },
  discord: { path: siDiscord.path, bg: '#5865f2' },
  gemini: { path: siGooglegemini.path, bg: 'linear-gradient(135deg, #4f8cff, #8e75ff)' },
  claude: { path: siClaude.path, bg: '#d97757' },
  x: { path: siX.path, bg: '#111114', dark: true },
  twitch: { path: siTwitch.path, bg: '#9146ff' },
  spotify: { path: siSpotify.path, bg: '#111114', fg: '#1ed760', dark: true },
  netflix: { path: siNetflix.path, bg: '#111114', fg: '#e50914', dark: true },
  cloudflare: { path: siCloudflare.path, bg: '#f38020' },
  chatgpt: { bg: '#10a37f' },
  'ru-blocked': { bg: 'var(--grad)' }
}

export default function ServiceIcon({ id, size = 38 }: { id: string; size?: number }) {
  const l = LOOKS[id] || { bg: '#333' }
  const style: CSSProperties = { width: size, height: size, background: l.bg, color: l.fg || '#fff' }
  return (
    <span className={'svc-icon' + (l.dark ? ' dark' : '')} style={style}>
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="currentColor">
        {l.path && <path d={l.path} />}
        {id === 'chatgpt' && (
          <g fill="none" stroke="currentColor" strokeWidth="1.9">
            {[0, 60, 120].map((a) => (
              <ellipse key={a} cx="12" cy="12" rx="9.2" ry="4.6" transform={`rotate(${a} 12 12)`} />
            ))}
          </g>
        )}
        {id === 'ru-blocked' && (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6L12 3z" />
            <path d="M9 12l2.2 2.2L15.5 10" />
          </g>
        )}
      </svg>
    </span>
  )
}
