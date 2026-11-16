import { IcClose, IcMax, IcMin, IcPin } from './Icons'

export default function TitleBar({ pinned }: { pinned: boolean }) {
  const w = window.uvelo.win
  return (
    <div className="titlebar">
      <div className="titlebar-drag" />
      <div className="titlebar-btns">
        <button className={'pin' + (pinned ? ' active' : '')} title={pinned ? 'Открепить' : 'Поверх всех окон'} onClick={() => w('pin')}>
          <span className="pin-bubble">
            <IcPin width={15} height={15} />
          </span>
        </button>
        <button title="Свернуть" onClick={() => w('min')}>
          <IcMin width={15} height={15} />
        </button>
        <button title="Развернуть" onClick={() => w('max')}>
          <IcMax width={13} height={13} />
        </button>
        <button className="close" title="Закрыть" onClick={() => w('close')}>
          <IcClose width={15} height={15} />
        </button>
      </div>
    </div>
  )
}
