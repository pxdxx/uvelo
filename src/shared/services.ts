/** Популярные сервисы для вкладки «Режим»: домены и подсети, которые идут через VPN или напрямую */
export interface ServiceDef {
  id: string
  name: string
  desc: string
  domains: string[]
  ips?: string[]
  /** включён по умолчанию (идёт через VPN) */
  on: boolean
  /** показывать только в режиме «Только выбранные» */
  selectedOnly?: boolean
  /** готовые списки sing-box (.srs) вместо доменов */
  ruleSets?: { site?: string; ip?: string }
}

export const SERVICES: ServiceDef[] = [
  {
    id: 'ru-blocked',
    name: 'Заблокированное в РФ',
    desc: 'Сайты из реестра блокировок',
    domains: [],
    on: true,
    selectedOnly: true,
    ruleSets: { site: 'geosite-ru-blocked.srs', ip: 'geoip-ru-blocked.srs' }
  },
  {
    id: 'youtube',
    name: 'YouTube',
    desc: 'Видео и сервисы Google',
    domains: ['youtube.com', 'youtu.be', 'yt.be', 'googlevideo.com', 'ytimg.com', 'ggpht.com', 'youtube-nocookie.com', 'youtubekids.com', 'youtubei.googleapis.com', 'youtube.googleapis.com', 'withyoutube.com'],
    on: true
  },
  {
    id: 'instagram',
    name: 'Instagram',
    desc: 'Instagram, Facebook, Threads',
    domains: ['instagram.com', 'cdninstagram.com', 'instagr.am', 'ig.me', 'facebook.com', 'facebook.net', 'fb.com', 'fbcdn.net', 'fbsbx.com', 'fb.me', 'threads.net', 'threads.com', 'messenger.com', 'meta.com'],
    on: true
  },
  {
    id: 'telegram',
    name: 'Telegram',
    desc: 'Каналы, звонки, файлы',
    domains: ['telegram.org', 't.me', 'telegram.me', 'telegra.ph', 'telesco.pe', 'tdesktop.com', 'telegram-cdn.org', 'cdn-telegram.org', 'tg.dev', 'graph.org'],
    ips: [
      '91.105.192.0/23', '91.108.4.0/22', '91.108.8.0/22', '91.108.12.0/22', '91.108.16.0/22', '91.108.20.0/22', '91.108.56.0/22',
      '95.161.64.0/20', '149.154.160.0/20', '185.76.151.0/24',
      '2001:67c:4e8::/48', '2001:b28:f23c::/48', '2001:b28:f23d::/48', '2001:b28:f23f::/48', '2a0a:f280::/32'
    ],
    on: true
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    desc: 'Звонки и сообщения',
    domains: ['whatsapp.com', 'whatsapp.net', 'wa.me', 'whatsapp.biz', 'wl.co'],
    on: true
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    desc: 'Короткие видео',
    domains: ['tiktok.com', 'tiktokv.com', 'tiktokv.us', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokw.us', 'byteoversea.com', 'ibytedtos.com', 'ibyteimg.com', 'byteimg.com', 'ttwstatic.com', 'musical.ly', 'tik-tokapi.com'],
    on: true
  },
  {
    id: 'discord',
    name: 'Discord',
    desc: 'Голос и сообщения',
    domains: ['discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.media', 'discordcdn.com', 'discord.dev', 'discord.new', 'discordstatus.com', 'dis.gd', 'discord.co'],
    on: true
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    desc: 'Нейросеть OpenAI',
    domains: ['openai.com', 'chatgpt.com', 'chat.com', 'oaistatic.com', 'oaiusercontent.com', 'sora.com', 'openai.org'],
    on: true
  },
  {
    id: 'gemini',
    name: 'Gemini',
    desc: 'Нейросеть Google',
    domains: ['gemini.google.com', 'bard.google.com', 'aistudio.google.com', 'makersuite.google.com', 'notebooklm.google.com', 'notebooklm.google', 'labs.google', 'deepmind.google', 'gemini.google', 'generativelanguage.googleapis.com', 'alkalimakersuite-pa.clients6.google.com', 'proactivebackend-pa.googleapis.com', 'geller-pa.googleapis.com'],
    on: true
  },
  {
    id: 'claude',
    name: 'Claude',
    desc: 'Нейросеть Anthropic',
    domains: ['claude.ai', 'claude.com', 'anthropic.com', 'claudeusercontent.com', 'clau.de'],
    on: true
  },
  {
    id: 'x',
    name: 'X',
    desc: 'Бывший Twitter',
    domains: ['x.com', 'twitter.com', 'twimg.com', 't.co', 'x.ai', 'grok.com'],
    on: true
  },
  {
    id: 'twitch',
    name: 'Twitch',
    desc: 'Стримы',
    domains: ['twitch.tv', 'ttvnw.net', 'jtvnw.net', 'twitchcdn.net', 'twitchsvc.net', 'ext-twitch.tv', 'live-video.net', 'twitch.a2z.com'],
    on: true
  },
  {
    id: 'spotify',
    name: 'Spotify',
    desc: 'Музыка и подкасты',
    domains: ['spotify.com', 'scdn.co', 'spotifycdn.com', 'spoti.fi', 'pscdn.co', 'spotify.design', 'spotilocal.com'],
    on: true
  },
  {
    id: 'netflix',
    name: 'Netflix',
    desc: 'Фильмы и сериалы',
    domains: ['netflix.com', 'netflix.net', 'nflxext.com', 'nflximg.com', 'nflximg.net', 'nflxso.net', 'nflxvideo.net', 'fast.com'],
    on: true
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    desc: 'Сайты, которые работают через Cloudflare',
    domains: ['cloudflare.com', 'cloudflare.net', 'cloudflare-dns.com', 'cloudflareinsights.com', 'workers.dev', 'pages.dev', 'one.one.one.one'],
    ips: [
      '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
      '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
      '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22', '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32',
      '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'
    ],
    on: false
  }
]

export const serviceOn = (svc: ServiceDef, map: Record<string, boolean> | undefined) => map?.[svc.id] ?? svc.on
