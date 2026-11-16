import { useState } from 'react'
import type { AppState, Subscription } from '@shared/types'
import { daysLeft, fmtBytes, relTime, PROTO_LABEL } from '../lib/format'
import { plural } from '../lib/countries'
import { Flag } from '../components/ui'
import { IcClipboard, IcCopy, IcEdit, IcExternal, IcPlus, IcRefresh, IcTrash } from '../components/Icons'

function SubCard({ sub, active }: { sub: Subscription; active: boolean }) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(sub.name)
  const [expanded, setExpanded] = useState(false)
  const info = sub.info
  const used = (info?.upload || 0) + (info?.download || 0)
  const pct = info?.total ? Math.min(100, (used / info.total) * 100) : 0
  const days = daysLeft(info?.expire)
  const update = async () => {
    setBusy(true)
    await window.uvelo.updateSub(sub.id)
    setBusy(false)
  }
  const countries = [...new Set(sub.servers.map((x) => x.country).filter(Boolean))] as string[]
  return (
    <div className={'sub-card' + (active ? ' active' : '')}>
      <div className="sub-top">
        <div className="sub-title" onClick={() => window.uvelo.selectSub(sub.id)}>
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                window.uvelo.renameSub(sub.id, name)
                setEditing(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          ) : (
            <span>{sub.name}</span>
          )}
          {active && <span className="chip">активна</span>}
        </div>
        <div className="sub-actions">
          {sub.url && (
            <button className={'icon-btn' + (busy ? ' spin' : '')} title="Обновить" onClick={update}>
              <IcRefresh width={16} height={16} />
            </button>
          )}
          <button
            className="icon-btn"
            title="Переименовать"
            onClick={() => {
              setName(sub.name)
              setEditing(true)
            }}
          >
            <IcEdit width={16} height={16} />
          </button>
          {sub.url && (
            <button className="icon-btn" title="Скопировать ссылку" onClick={() => window.uvelo.copyText(sub.url!)}>
              <IcCopy width={16} height={16} />
            </button>
          )}
          {(sub.supportUrl || sub.webPageUrl) && (
            <button className="icon-btn" title="Сайт / поддержка" onClick={() => window.uvelo.openExternal((sub.webPageUrl || sub.supportUrl)!)}>
              <IcExternal width={16} height={16} />
            </button>
          )}
          <button
            className="icon-btn danger"
            title="Удалить"
            onClick={() => {
              if (confirm(`Удалить «${sub.name}»?`)) window.uvelo.removeSub(sub.id)
            }}
          >
            <IcTrash width={16} height={16} />
          </button>
        </div>
      </div>
      {sub.announce && <div className="announce">{sub.announce}</div>}
      <div className="sub-meta">
        <span>
          {sub.servers.length} {plural(sub.servers.length, 'сервер', 'сервера', 'серверов')}
        </span>
        {info?.total ? <span>{fmtBytes(used)} из {fmtBytes(info.total)}</span> : used ? <span>{fmtBytes(used)} использовано</span> : null}
        {days !== undefined && (
          <span className={days <= 3 ? 'warn' : ''}>{days > 0 ? `осталось ${days} ${plural(days, 'день', 'дня', 'дней')}` : 'истекла'}</span>
        )}
        {sub.url && <span>обновлена {relTime(sub.updatedAt)}</span>}
      </div>
      {info?.total ? (
        <div className="bar">
          <span style={{ width: pct + '%' }} />
        </div>
      ) : null}
      {sub.error && <div className="err-text">Ошибка обновления: {sub.error}</div>}
      <div className="flags-strip" onClick={() => setExpanded(!expanded)}>
        {countries.slice(0, 18).map((c) => (
          <Flag key={c} code={c} size={20} />
        ))}
        <span className="muted small">{expanded ? 'скрыть' : 'показать серверы'}</span>
      </div>
      {expanded && (
        <div className="srv-table">
          {sub.servers.map((x) => (
            <div key={x.id} className="srv-tr">
              <Flag code={x.country} size={18} />
              <span className="srv-tr-name">{x.name}</span>
              <span className="muted small">{PROTO_LABEL[x.protocol]}</span>
              <span className="muted small mono">
                {x.address}:{x.port}
              </span>
              <button className="icon-btn" title="Копировать ссылку" onClick={() => window.uvelo.copyText(x.raw)}>
                <IcCopy width={14} height={14} />
              </button>
              {sub.manual && (
                <button className="icon-btn danger" title="Удалить" onClick={() => window.uvelo.removeServer(x.id)}>
                  <IcTrash width={14} height={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SubsPage({ s }: { s: AppState }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>()
  const add = async (clip: boolean) => {
    setBusy(true)
    setMsg(undefined)
    const r = clip ? await window.uvelo.addFromClipboard() : await window.uvelo.addSub(text)
    setBusy(false)
    if (r.ok) {
      setText('')
      setMsg({ ok: true, t: `Добавлено: ${r.count} ${plural(r.count || 0, 'сервер', 'сервера', 'серверов')}` })
    } else setMsg({ ok: false, t: r.error || 'Ошибка' })
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Подписки</h2>
          <p className="page-desc">Ссылки на подписку, отдельные серверы или JSON-конфиги Xray / sing-box.</p>
        </div>
        {s.subs.some((x) => x.url) && (
          <button className="btn" onClick={() => window.uvelo.updateAllSubs()}>
            <IcRefresh width={16} height={16} /> Обновить все
          </button>
        )}
      </div>
      <div className="add-box">
        <textarea
          rows={2}
          value={text}
          placeholder="https://sub.example.com/…   ·   vless://…   ·   hy2://…   ·   uvelo://add/…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
              e.preventDefault()
              add(false)
            }
          }}
        />
        <div className="btn-row">
          <button className="btn primary" disabled={busy || !text.trim()} onClick={() => add(false)}>
            <IcPlus width={16} height={16} /> Добавить
          </button>
          <button className="btn" disabled={busy} onClick={() => add(true)}>
            <IcClipboard width={16} height={16} /> Из буфера обмена
          </button>
          {busy && <span className="muted">Загрузка…</span>}
          {msg && <span className={msg.ok ? 'ok-text' : 'err-text'}>{msg.t}</span>}
        </div>
      </div>
      <div className="sub-list">
        {s.subs.map((x) => (
          <SubCard key={x.id} sub={x} active={x.id === (s.activeSubId || s.subs[0]?.id)} />
        ))}
        {!s.subs.length && <div className="muted center pad">Подписок пока нет</div>}
      </div>
    </div>
  )
}
