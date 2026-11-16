import { useEffect, useRef } from 'react'
import { geoEquirectangular, geoOrthographic, geoPath, geoContains, geoInterpolate } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry, MultiLineString } from 'geojson'
import world50 from 'world-atlas/countries-50m.json'
import world110 from 'world-atlas/countries-110m.json'
import { BY_CCN3, COUNTRIES, NAME_FALLBACK } from '../lib/countries'

export interface GlobeMarker {
  code: string
  lat: number
  lon: number
  count: number
}

export interface GlobeProps {
  markers: GlobeMarker[]
  user?: { lat: number; lon: number }
  connectedCode?: string
  connecting?: boolean
  selectedCode?: string
  focus?: { lat: number; lon: number; key: number }
  rightInset: number
  paused?: boolean
  onCountryClick: (code: string | null) => void
  onHover?: (code: string | null) => void
}

/* ----------------------------- статичные данные ----------------------------- */

type CFeature = Feature<Geometry, { name: string }> & { code?: string }

const RAD = Math.PI / 180
const RASTER_W = 2048
const RASTER_H = 1024

interface GeoData {
  features: CFeature[]
  borders: MultiLineString
  raster: Uint8ClampedArray
  dots: Float32Array // x,y,z
  dotKind: Uint16Array // индекс страны + 1 (0 - океан)
  dotCount: number
  codeIndex: Map<string, number>
}

let GEO: GeoData | null = null

function buildGeo(): GeoData {
  if (GEO) return GEO
  const fc = feature(world50 as any, (world50 as any).objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>
  const features = fc.features as CFeature[]
  const codeIndex = new Map<string, number>()
  features.forEach((f, i) => {
    const id = f.id != null ? String(f.id).padStart(3, '0') : ''
    f.code = BY_CCN3[id] || NAME_FALLBACK[f.properties?.name]
    if (f.code && !codeIndex.has(f.code)) codeIndex.set(f.code, i)
  })
  const borders = mesh(world110 as any, (world110 as any).objects.countries, (a: any, b: any) => a !== b) as MultiLineString

  // растровая карта индексов стран (equirectangular) - для O(1) хит-теста и точек суши
  const cv = document.createElement('canvas')
  cv.width = RASTER_W
  cv.height = RASTER_H
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false
  const proj = geoEquirectangular()
    .scale(RASTER_W / (2 * Math.PI))
    .translate([RASTER_W / 2, RASTER_H / 2])
  const path = geoPath(proj, ctx)
  features.forEach((f, i) => {
    const idx = i + 1
    ctx.fillStyle = `rgb(${idx & 255},${idx >> 8},255)`
    ctx.beginPath()
    path(f)
    ctx.fill()
  })
  const raster = ctx.getImageData(0, 0, RASTER_W, RASTER_H).data

  const sample = (lat: number, lon: number) => {
    const x = Math.min(RASTER_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * RASTER_W)))
    const y = Math.min(RASTER_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * RASTER_H)))
    const o = (y * RASTER_W + x) * 4
    if (raster[o + 3] < 250 || raster[o + 2] !== 255) return 0
    return raster[o] + (raster[o + 1] << 8)
  }

  // равномерная сетка точек на сфере
  const pts: number[] = []
  const kinds: number[] = []
  const step = 0.78
  for (let lat = -84; lat <= 84; lat += step) {
    const n = Math.max(1, Math.round((360 * Math.cos(lat * RAD)) / step))
    const offs = (Math.round(lat / step) % 2) * 0.5
    for (let i = 0; i < n; i++) {
      const lon = -180 + ((i + offs) * 360) / n
      const k = sample(lat, lon)
      // океан - разреженно
      if (!k && (i % 3 !== 0 || Math.round(lat / step) % 3 !== 0)) continue
      const cl = Math.cos(lat * RAD)
      pts.push(cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(lat * RAD))
      kinds.push(k)
    }
  }
  GEO = {
    features,
    borders,
    raster,
    dots: new Float32Array(pts),
    dotKind: new Uint16Array(kinds),
    dotCount: kinds.length,
    codeIndex
  }
  return GEO
}

function countryAt(g: GeoData, lat: number, lon: number): CFeature | null {
  const x = Math.min(RASTER_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * RASTER_W)))
  const y = Math.min(RASTER_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * RASTER_H)))
  const o = (y * RASTER_W + x) * 4
  if (g.raster[o + 3] < 200) return null
  const idx = g.raster[o] + (g.raster[o + 1] << 8) - 1
  const f = g.features[idx]
  // на сглаженных границах цвета «смешиваются» - перепроверяем геометрией
  if (f && geoContains(f, [lon, lat])) return f
  for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
    const o2 = ((Math.min(RASTER_H - 1, Math.max(0, y + dy)) * RASTER_W) + Math.min(RASTER_W - 1, Math.max(0, x + dx))) * 4
    const f2 = g.features[g.raster[o2] + (g.raster[o2 + 1] << 8) - 1]
    if (f2 && f2 !== f && geoContains(f2, [lon, lat])) return f2
  }
  return null
}

/** Положение Солнца (подсолнечная точка) - для мягкого дня/ночи */
function sunVector(d = new Date()) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  const day = (d.getTime() - start) / 864e5
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10))
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60
  const lon = (12 - hours) * 15
  const cl = Math.cos(decl * RAD)
  return [cl * Math.cos(lon * RAD), cl * Math.sin(lon * RAD), Math.sin(decl * RAD)]
}

/* ---------------------------------- компонент ---------------------------------- */

const ALPHA_LEVELS = 8

export default function Globe(props: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const view = useRef({
    lon: 30,
    lat: 38,
    zoom: 1,
    vLon: 0,
    vLat: 0,
    dragging: false,
    moved: false,
    hover: null as CFeature | null,
    mouse: null as null | { x: number; y: number },
    fly: null as null | { fromLon: number; fromLat: number; toLon: number; toLat: number; t0: number },
    dirty: true,
    initialised: false
  })

  // перелёт к точке фокуса
  useEffect(() => {
    const f = props.focus
    if (!f) return
    const v = view.current
    let toLon = f.lon
    while (toLon - v.lon > 180) toLon -= 360
    while (toLon - v.lon < -180) toLon += 360
    v.fly = { fromLon: v.lon, fromLat: v.lat, toLon, toLat: Math.max(-60, Math.min(65, f.lat - 8)), t0: performance.now() }
  }, [props.focus?.key])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const g = buildGeo()
    const v = view.current
    ;(window as any).__globeView = v
    let raf = 0
    let W = 0,
      H = 0,
      dpr = 1
    let lastFrame = 0

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      const r = canvas.getBoundingClientRect()
      W = r.width
      H = r.height
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      v.dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const geom = () => {
      const inset = propsRef.current.rightInset
      const availW = Math.max(300, W - inset)
      const R = Math.min(availW * 0.46, H * 0.5) * v.zoom
      return { cx: availW / 2, cy: H * 0.56, R }
    }

    /** экранные координаты → широта/долгота */
    const invert = (x: number, y: number) => {
      const { cx, cy, R } = geom()
      const right = (x - cx) / R,
        up = (cy - y) / R
      const r2 = right * right + up * up
      if (r2 > 1) return null
      const depth = Math.sqrt(1 - r2)
      const sl = Math.sin(v.lat * RAD),
        cl = Math.cos(v.lat * RAD)
      const so = Math.sin(v.lon * RAD),
        co = Math.cos(v.lon * RAD)
      const x1 = depth * cl - up * sl
      const z1 = depth * sl + up * cl
      const y1 = right
      const X = x1 * co - y1 * so,
        Y = x1 * so + y1 * co
      return { lat: Math.asin(Math.max(-1, Math.min(1, z1))) / RAD, lon: Math.atan2(Y, X) / RAD }
    }

    const draw = (now: number) => {
      const p = propsRef.current
      const { cx, cy, R } = geom()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const sl = Math.sin(v.lat * RAD),
        cl = Math.cos(v.lat * RAD)
      const so = Math.sin(v.lon * RAD),
        co = Math.cos(v.lon * RAD)
      const project = (x: number, y: number, z: number, lift = 1) => {
        const x1 = x * co + y * so
        const y1 = -x * so + y * co
        const depth = x1 * cl + z * sl
        const up = -x1 * sl + z * cl
        return { sx: cx + R * lift * y1, sy: cy - R * lift * up, depth }
      }
      const ll = (lat: number, lon: number) => {
        const c = Math.cos(lat * RAD)
        return [c * Math.cos(lon * RAD), c * Math.sin(lon * RAD), Math.sin(lat * RAD)] as const
      }

      // атмосфера
      const atm = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25)
      atm.addColorStop(0, 'rgba(255,95,160,0.16)')
      atm.addColorStop(0.25, 'rgba(150,110,255,0.06)')
      atm.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = atm
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2)
      ctx.fill()

      // тело планеты
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R)
      body.addColorStop(0, '#15151d')
      body.addColorStop(0.7, '#09090d')
      body.addColorStop(1, '#050507')
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()

      // ободок в цветах логотипа
      const ring = ctx.createConicGradient(-Math.PI * 0.75, cx, cy)
      ring.addColorStop(0, '#ffa53a')
      ring.addColorStop(0.25, '#ff5f8f')
      ring.addColorStop(0.5, '#c46bff')
      ring.addColorStop(0.75, '#4fb2ff')
      ring.addColorStop(1, '#ffa53a')
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = ring
      ctx.lineWidth = 1.3
      ctx.shadowColor = 'rgba(255,95,160,0.6)'
      ctx.shadowBlur = 16
      ctx.stroke()
      ctx.restore()

      /** линейный градиент логотипа по диагонали области */
      const logoGrad = (x0: number, y0: number, x1: number, y1: number) => {
        const gr = ctx.createLinearGradient(x0, y0, x1, y1)
        gr.addColorStop(0, '#ffa53a')
        gr.addColorStop(0.35, '#ff5f8f')
        gr.addColorStop(0.68, '#c46bff')
        gr.addColorStop(1, '#4fb2ff')
        return gr
      }
      const globeGrad = logoGrad(cx - R, cy - R, cx + R, cy + R)

      // точки
      const sun = sunVector()
      const serverIdx = new Set<number>()
      for (const m of p.markers) {
        const i = g.codeIndex.get(m.code)
        if (i !== undefined) serverIdx.add(i + 1)
      }
      const connIdx = p.connectedCode ? (g.codeIndex.get(p.connectedCode) ?? -2) + 1 : -1
      // ведра: [категория][уровень альфы] → массив координат
      const CATS = 5 // 0 океан, 1 суша, 2 терминатор, 3 страна с серверами, 4 подключённая
      const buckets: number[][] = Array.from({ length: CATS * ALPHA_LEVELS }, () => [])
      const d = g.dots
      for (let i = 0, n = g.dotCount; i < n; i++) {
        const x = d[i * 3],
          y = d[i * 3 + 1],
          z = d[i * 3 + 2]
        const x1 = x * co + y * so
        const depth = x1 * cl + z * sl
        if (depth <= 0.02) continue
        const y1 = -x * so + y * co
        const up = -x1 * sl + z * cl
        const k = g.dotKind[i]
        let cat: number
        let a: number
        if (!k) {
          cat = 0
          a = depth * 0.5
        } else {
          const light = x * sun[0] + y * sun[1] + z * sun[2]
          if (k === connIdx) cat = 4
          else if (serverIdx.has(k)) cat = 3
          else if (light > -0.07 && light < 0.03 && depth < 0.75) cat = 2
          else cat = 1
          a = (0.3 + 0.7 * depth) * (light < -0.1 && cat < 3 ? 0.62 : 1)
        }
        const lvl = Math.min(ALPHA_LEVELS - 1, Math.floor(a * ALPHA_LEVELS))
        buckets[cat * ALPHA_LEVELS + lvl].push(cx + R * y1, cy - R * up)
      }
      const COLORS = ['150,150,180', '205,205,220', '230,150,105']
      const ds = Math.max(1.1, Math.min(2.6, R / 260))
      for (let c = 0; c < CATS; c++) {
        for (let l = 0; l < ALPHA_LEVELS; l++) {
          const arr = buckets[c * ALPHA_LEVELS + l]
          if (!arr.length) continue
          const alpha = ((l + 0.5) / ALPHA_LEVELS) * (c === 0 ? 0.35 : 1)
          if (c >= 3) {
            // страны с серверами: градиент логотипа поверх всей планеты
            ctx.fillStyle = globeGrad
            ctx.globalAlpha = Math.min(1, alpha * (c === 4 ? 1.25 : 1))
          } else {
            ctx.fillStyle = `rgba(${COLORS[c]},${alpha.toFixed(3)})`
            ctx.globalAlpha = 1
          }
          const s = c >= 3 ? ds * 1.2 : c === 0 ? ds * 0.8 : ds
          for (let j = 0; j < arr.length; j += 2) ctx.fillRect(arr[j] - s / 2, arr[j + 1] - s / 2, s, s)
        }
      }
      ctx.globalAlpha = 1

      // границы и контуры
      const proj = geoOrthographic()
        .rotate([-v.lon, -v.lat])
        .scale(R)
        .translate([cx, cy])
        .clipAngle(90)
        .precision(0.4)
      const path = geoPath(proj, ctx)
      ctx.beginPath()
      path(g.borders)
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 0.7
      ctx.stroke()

      /** контур страны градиентом логотипа со свечением */
      const outline = (f: CFeature, fill: boolean, glow: number, alpha: number) => {
        const [[x0, y0], [x1, y1]] = path.bounds(f)
        if (!Number.isFinite(x0)) return
        const gr = logoGrad(x0, y0, x1, y1)
        ctx.save()
        ctx.beginPath()
        path(f)
        if (fill) {
          ctx.globalAlpha = 0.12
          ctx.fillStyle = gr
          ctx.fill()
        }
        ctx.globalAlpha = alpha
        ctx.shadowColor = 'rgba(255,95,160,0.85)'
        ctx.shadowBlur = glow
        ctx.strokeStyle = gr
        ctx.lineWidth = 1.8
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.globalAlpha = alpha * 0.8
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 0.5
        ctx.stroke()
        ctx.restore()
      }
      const selF = p.selectedCode ? g.features[g.codeIndex.get(p.selectedCode) ?? -1] : undefined
      if (selF) outline(selF, true, 16, 1)
      if (v.hover && v.hover !== selF) outline(v.hover, false, 12, 0.85)

      // дуга «вы → сервер»
      const conn = p.connectedCode ? p.markers.find((m) => m.code === p.connectedCode) : undefined
      if (p.user && conn) {
        const interp = geoInterpolate([p.user.lon, p.user.lat], [conn.lon, conn.lat])
        const dist = Math.acos(
          Math.max(-1, Math.min(1, ll(p.user.lat, p.user.lon).reduce((s, x, i) => s + x * ll(conn.lat, conn.lon)[i], 0)))
        )
        const h = 0.04 + dist * 0.12
        const N = 64
        const pts: { sx: number; sy: number; vis: boolean }[] = []
        for (let i = 0; i <= N; i++) {
          const t = i / N
          const [lo, la] = interp(t)
          const [x, y, z] = ll(la, lo)
          const lift = 1 + h * Math.sin(Math.PI * t)
          const q = project(x, y, z, lift)
          const r = Math.hypot(q.sx - cx, q.sy - cy)
          pts.push({ sx: q.sx, sy: q.sy, vis: q.depth > 0 || r > R })
        }
        const grad = ctx.createLinearGradient(pts[0].sx, pts[0].sy, pts[N].sx, pts[N].sy)
        grad.addColorStop(0, '#ffa53a')
        grad.addColorStop(0.5, '#ff5fa0')
        grad.addColorStop(1, '#7f8cff')
        ctx.save()
        ctx.strokeStyle = grad
        ctx.lineWidth = 2
        ctx.shadowColor = 'rgba(255,110,170,0.7)'
        ctx.shadowBlur = 10
        if (p.connecting) {
          ctx.setLineDash([6, 8])
          ctx.lineDashOffset = -now / 25
        }
        ctx.beginPath()
        let open = false
        for (const q of pts) {
          if (!q.vis) {
            open = false
            continue
          }
          if (!open) ctx.moveTo(q.sx, q.sy)
          else ctx.lineTo(q.sx, q.sy)
          open = true
        }
        ctx.stroke()
        // бегущий импульс
        if (!p.connecting) {
          const t = (now / 1600) % 1
          const q = pts[Math.round(t * N)]
          if (q.vis) {
            ctx.fillStyle = '#fff'
            ctx.shadowColor = '#ff8ac0'
            ctx.shadowBlur = 16
            ctx.beginPath()
            ctx.arc(q.sx, q.sy, 2.6, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.restore()
      }

      // маркеры серверов
      const pulse = (now % 2000) / 2000
      ctx.font = '600 12px "Manrope Variable", sans-serif'
      for (const m of p.markers) {
        const [x, y, z] = ll(m.lat, m.lon)
        const q = project(x, y, z)
        if (q.depth <= 0.05) continue
        const isConn = m.code === p.connectedCode
        const a = Math.min(1, 0.35 + q.depth)
        const mg = logoGrad(q.sx - 9, q.sy - 9, q.sx + 9, q.sy + 9)
        if (isConn) {
          ctx.strokeStyle = mg
          ctx.globalAlpha = (1 - pulse) * 0.9
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.arc(q.sx, q.sy, 4 + pulse * 16, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.fillStyle = mg
          ctx.globalAlpha = 0.2 * a
          ctx.beginPath()
          ctx.arc(q.sx, q.sy, 8, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        ctx.fillStyle = `rgba(255,255,255,${a})`
        ctx.shadowColor = isConn ? '#ff5f8f' : 'rgba(255,120,150,0.85)'
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(q.sx, q.sy, isConn ? 4.2 : 3.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // пользователь
      if (p.user) {
        const [x, y, z] = ll(p.user.lat, p.user.lon)
        const q = project(x, y, z)
        if (q.depth > 0.05) {
          // «Вы» светится градиентом логотипа и мягко пульсирует
          const ug = logoGrad(q.sx - 6, q.sy - 6, q.sx + 6, q.sy + 6)
          const up = (now % 2600) / 2600
          ctx.strokeStyle = ug
          ctx.globalAlpha = (1 - up) * 0.7
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(q.sx, q.sy, 5 + up * 12, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
          ctx.fillStyle = ug
          ctx.shadowColor = 'rgba(255,110,140,0.95)'
          ctx.shadowBlur = 14
          ctx.beginPath()
          ctx.arc(q.sx, q.sy, 4.4, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.beginPath()
          ctx.arc(q.sx, q.sy, 1.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.font = '600 13px "Manrope Variable", sans-serif'
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.fillText('Вы', q.sx + 8, q.sy + 4)
        }
      }

      // подпись страны под курсором
      if (v.hover && v.mouse && !v.dragging && v.hover.code) {
        const name = COUNTRIES[v.hover.code]?.name || v.hover.properties.name
        ctx.font = '600 12px "Manrope Variable", sans-serif'
        const tw = ctx.measureText(name).width
        const bx = v.mouse.x + 14,
          by = v.mouse.y + 14
        ctx.fillStyle = 'rgba(14,14,20,0.9)'
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.beginPath()
        ctx.roundRect(bx, by, tw + 18, 24, 8)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#eceaf6'
        ctx.fillText(name, bx + 9, by + 16)
      }
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (propsRef.current.paused || document.hidden) return
      // физика вращения
      if (v.fly) {
        const t = Math.min(1, (now - v.fly.t0) / 1100)
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        v.lon = v.fly.fromLon + (v.fly.toLon - v.fly.fromLon) * e
        v.lat = v.fly.fromLat + (v.fly.toLat - v.fly.fromLat) * e
        if (t >= 1) v.fly = null
        v.dirty = true
      } else if (!v.dragging && (Math.abs(v.vLon) > 0.01 || Math.abs(v.vLat) > 0.01)) {
        v.lon += v.vLon
        v.lat = Math.max(-75, Math.min(75, v.lat + v.vLat))
        v.vLon *= 0.94
        v.vLat *= 0.94
        v.dirty = true
      }
      const p = propsRef.current
      const animated = p.markers.length > 0 || !!p.connectedCode || !!p.user
      // анимации маркеров - 30 fps, взаимодействие - полный fps
      const minDt = v.dirty ? 0 : animated ? 33 : 1000
      if (now - lastFrame < minDt) return
      lastFrame = now
      v.dirty = false
      draw(now)
    }
    raf = requestAnimationFrame(loop)

    // ------------------------------ ввод ------------------------------
    let last = { x: 0, y: 0, t: 0 }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      v.dragging = true
      v.moved = false
      v.fly = null
      v.vLon = v.vLat = 0
      last = { x: e.clientX, y: e.clientY, t: performance.now() }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left,
        my = e.clientY - r.top
      v.mouse = { x: mx, y: my }
      if (v.dragging) {
        const dx = e.clientX - last.x,
          dy = e.clientY - last.y
        if (Math.abs(dx) + Math.abs(dy) > 2) v.moved = true
        const { R } = geom()
        const k = 57.3 / R
        v.lon -= dx * k
        v.lat = Math.max(-75, Math.min(75, v.lat + dy * k))
        v.vLon = -dx * k * 0.9
        v.vLat = dy * k * 0.9
        last = { x: e.clientX, y: e.clientY, t: performance.now() }
        v.dirty = true
        canvas.style.cursor = 'grabbing'
        return
      }
      const geo = invert(mx, my)
      const f = geo ? countryAt(g, geo.lat, geo.lon) : null
      if (f !== v.hover) {
        v.hover = f
        propsRef.current.onHover?.(f?.code || null)
        canvas.style.cursor = f ? 'pointer' : geo ? 'grab' : 'default'
      }
      v.dirty = true
    }
    const up = (e: PointerEvent) => {
      if (!v.dragging) return
      v.dragging = false
      canvas.style.cursor = v.hover ? 'pointer' : 'grab'
      if (performance.now() - last.t > 80) v.vLon = v.vLat = 0
      if (!v.moved) {
        const r = canvas.getBoundingClientRect()
        const geo = invert(e.clientX - r.left, e.clientY - r.top)
        const f = geo ? countryAt(g, geo.lat, geo.lon) : null
        propsRef.current.onCountryClick(f?.code || null)
      }
    }
    const leave = () => {
      v.mouse = null
      if (v.hover) {
        v.hover = null
        propsRef.current.onHover?.(null)
      }
      v.dirty = true
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      v.zoom = Math.max(0.75, Math.min(3.2, v.zoom * Math.exp(-e.deltaY * 0.0012)))
      v.dirty = true
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('wheel', wheel, { passive: false })

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('wheel', wheel)
    }
  }, [])

  // первичная ориентация - на пользователя
  useEffect(() => {
    const v = view.current
    if (v.initialised || !props.user) return
    v.initialised = true
    v.fly = { fromLon: v.lon, fromLat: v.lat, toLon: props.user.lon - 12, toLat: Math.min(60, props.user.lat - 10), t0: performance.now() }
  }, [props.user])

  useEffect(() => {
    view.current.dirty = true
  })

  return <canvas ref={canvasRef} className="globe-canvas" />
}
