import { useEffect, useState } from 'react'
import type { AppState } from '@shared/types'
import TitleBar from './components/TitleBar'
import Sidebar, { type Page } from './components/Sidebar'
import VpnView from './components/VpnView'
import ModePage from './pages/ModePage'
import SubsPage from './pages/SubsPage'
import SettingsPage from './pages/SettingsPage'
import LogsPage from './pages/LogsPage'
import { GradientDefs } from './components/Icons'

function Toast({ s }: { s: AppState }) {
  const [shown, setShown] = useState<AppState['notice']>()
  useEffect(() => {
    if (!s.notice) return
    setShown(s.notice)
    const t = setTimeout(() => setShown(undefined), 5000)
    return () => clearTimeout(t)
  }, [s.notice?.id])
  if (!shown) return null
  return (
    <div className={'toast ' + shown.kind} onClick={() => setShown(undefined)}>
      {shown.text}
    </div>
  )
}

export default function App() {
  const [s, setS] = useState<AppState>()
  const [page, setPage] = useState<Page>('vpn')

  useEffect(() => {
    ;(window as any).__uveloPage = setPage
    window.uvelo.getState().then(setS)
    return window.uvelo.onState(setS)
  }, [])

  if (!s) return <div className="app loading" />

  return (
    <div className={'app status-' + s.status}>
      <GradientDefs />
      <TitleBar pinned={s.pinned} />
      <Sidebar page={page} onPage={setPage} connected={s.status === 'connected'} />
      <main className="main">
        <VpnView s={s} visible={page === 'vpn'} />
        {page === 'mode' && <ModePage s={s} />}
        {page === 'subs' && <SubsPage s={s} />}
        {page === 'settings' && <SettingsPage s={s} />}
        <div style={{ display: page === 'logs' ? 'contents' : 'none' }}>
          <LogsPage visible={page === 'logs'} />
        </div>
      </main>
      {!s.coresOk.singbox && (
        <div className="core-warning">
          Ядро sing-box не найдено. Выполните <code>npm run fetch-cores</code> и перезапустите приложение.
        </div>
      )}
      <Toast s={s} />
    </div>
  )
}
