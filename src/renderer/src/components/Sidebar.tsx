import logo from '../assets/logo.png'
import { IcGear, IcLogs, IcMode, IcShield, IcSubs } from './Icons'

export type Page = 'vpn' | 'mode' | 'subs' | 'settings' | 'logs'

const ITEMS: { id: Page; label: string; Icon: typeof IcShield }[] = [
  { id: 'vpn', label: 'VPN', Icon: IcShield },
  { id: 'mode', label: 'Режим', Icon: IcMode },
  { id: 'subs', label: 'Подписки', Icon: IcSubs },
  { id: 'settings', label: 'Настройки', Icon: IcGear }
]

function Item({ id, label, Icon, active, onClick }: { id: Page; label: string; Icon: typeof IcShield; active: boolean; onClick: () => void }) {
  return (
    <button className={'side-item' + (active ? ' active' : '')} onClick={onClick} data-id={id}>
      <span className="side-bubble">
        <Icon width={21} height={21} />
      </span>
      <span className="side-label">{label}</span>
    </button>
  )
}

export default function Sidebar({ page, onPage, connected }: { page: Page; onPage: (p: Page) => void; connected: boolean }) {
  return (
    <nav className="sidebar">
      <div className={'side-logo' + (connected ? ' live' : '')} onClick={() => onPage('vpn')}>
        <img src={logo} alt="Uvelo" draggable={false} />
      </div>
      <div className="side-items">
        {ITEMS.map((it) => (
          <Item key={it.id} {...it} active={page === it.id} onClick={() => onPage(it.id)} />
        ))}
      </div>
      <Item id="logs" label="Логи" Icon={IcLogs} active={page === 'logs'} onClick={() => onPage('logs')} />
    </nav>
  )
}
