import { useEffect, useRef, useState } from 'react'
import { IcCopy, IcTrash } from '../components/Icons'

export default function LogsPage({ visible }: { visible: boolean }) {
  const [lines, setLines] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [follow, setFollow] = useState(true)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.uvelo.getLogs().then(setLines)
    return window.uvelo.onLog((l) => setLines((prev) => [...prev, ...l].slice(-3000)))
  }, [])

  useEffect(() => {
    if (follow && visible && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines, follow, visible])

  const shown = filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines
  const cls = (l: string) => (/error|fatal|ошибк|failed/i.test(l) ? 'log-err' : /warn|не прошла/i.test(l) ? 'log-warn' : l.startsWith('[uvelo]') ? 'log-app' : '')

  return (
    <div className="page logs-page">
      <div className="page-head">
        <h2>Логи</h2>
        <div className="btn-row">
          <input className="field" placeholder="Фильтр…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn small" onClick={() => window.uvelo.copyText(shown.join('\n'))}>
            <IcCopy width={14} height={14} /> Копировать
          </button>
          <button
            className="btn small"
            onClick={() => {
              window.uvelo.clearLogs()
              setLines([])
            }}
          >
            <IcTrash width={14} height={14} /> Очистить
          </button>
        </div>
      </div>
      <div
        className="log-box"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
        }}
      >
        {shown.length ? shown.map((l, i) => <div key={i} className={cls(l)}>{l}</div>) : <div className="muted">Пока пусто</div>}
      </div>
    </div>
  )
}
