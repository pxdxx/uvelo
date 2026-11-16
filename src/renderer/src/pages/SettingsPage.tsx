import { useEffect, useState } from 'react'
import type { AppState, Settings } from '@shared/types'
import { Row, Segmented, Toggle } from '../components/ui'
import { IcExternal, IcFolder } from '../components/Icons'

function TextField({ value, onSave, width = 220, type = 'text' }: { value: string | number; onSave: (v: string) => void; width?: number; type?: string }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => v !== String(value) && onSave(v)
  return (
    <input
      className="field"
      style={{ width }}
      type={type}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      spellCheck={false}
    />
  )
}

const UA_PRESETS = ['Uvelo/0.1', 'v2rayN/7.10', 'Happ/2.0', 'sing-box 1.14', 'clash-verge/v2']

export default function SettingsPage({ s }: { s: AppState }) {
  const st = s.settings
  const set = (p: Partial<Settings>) => window.uvelo.setSettings(p)
  return (
    <div className="page">
      <h2>Настройки</h2>

      <div className="section-title">Запуск</div>
      <div className="group">
        <Row title="Запускать вместе с Windows">
          <Toggle on={st.autoStart} onChange={(v) => set({ autoStart: v })} />
        </Row>
        <Row title="Запускать свёрнутым в трей">
          <Toggle on={st.startHidden} onChange={(v) => set({ startHidden: v })} />
        </Row>
        <Row title="Подключаться при запуске" desc="к выбранному серверу или к лучшему по пингу">
          <Toggle on={st.autoConnect} onChange={(v) => set({ autoConnect: v })} />
        </Row>
        <Row title="Сворачивать в трей при закрытии">
          <Toggle on={st.closeToTray} onChange={(v) => set({ closeToTray: v })} />
        </Row>
      </div>

      <div className="section-title">Автопилот и пинг</div>
      <div className="group">
        <Row title="Автопилот" desc="Проверяет соединение и сам переключает сервер, если текущий упал">
          <Toggle on={st.autopilot} onChange={(v) => set({ autopilot: v })} />
        </Row>
        <Row title="Интервал проверки" desc="как часто проверять, что сервер жив (секунды)">
          <TextField type="number" width={90} value={st.healthInterval} onSave={(v) => set({ healthInterval: Math.max(5, Number(v) || 20) })} />
        </Row>
        <Row title="Лучший пинг: порог переключения" desc="переходить на другой сервер, если он быстрее текущего на столько мс. Проверка раз в 3 минуты">
          <TextField type="number" width={90} value={st.bestPingMargin} onSave={(v) => set({ bestPingMargin: Math.max(0, Number(v) || 0) })} />
        </Row>
        <Row
          title="Протокол пинга"
          desc={
            st.pingType === 'real'
              ? 'GET-запрос на URL проверки через сам сервер. Показывает настоящую задержку и что сервер реально работает'
              : st.pingType === 'tcp'
                ? 'Только соединение с портом сервера. Быстро, но не видит, что за сервером (CDN, фронт)'
                : 'Обычный ping до адреса сервера. Многие серверы и CDN его не пропускают'
          }
        >
          <Segmented
            value={st.pingType}
            options={[
              { v: 'real', label: 'Через прокси (GET)' },
              { v: 'tcp', label: 'TCP' },
              { v: 'icmp', label: 'ICMP' }
            ]}
            onChange={async (v) => {
              await set({ pingType: v })
              window.uvelo.pingAll()
            }}
          />
        </Row>
        <Row title="URL для проверки">
          <TextField value={st.testUrl} width={280} onSave={(v) => set({ testUrl: v.trim() || 'https://www.gstatic.com/generate_204' })} />
        </Row>
      </div>

      <div className="section-title">Подключение</div>
      <div className="group">
        <Row title="Ядро" desc="Авто: Xray для VLESS, VMess и Trojan (как в Happ), sing-box для Hysteria2, TUIC, WireGuard и остального">
          <Segmented
            value={st.core}
            options={[
              { v: 'auto', label: 'Авто' },
              { v: 'sing-box', label: 'sing-box' },
              { v: 'xray', label: 'Xray' }
            ]}
            onChange={(v) => set({ core: v })}
          />
        </Row>
        <Row title="Локальный порт" desc="SOCKS5 + HTTP на одном порту">
          <TextField type="number" width={100} value={st.mixedPort} onSave={(v) => set({ mixedPort: Number(v) || 10808 })} />
        </Row>
        <Row title="Разрешить подключения из локальной сети" desc="другие устройства смогут использовать этот ПК как прокси">
          <Toggle on={st.allowLan} onChange={(v) => set({ allowLan: v })} />
        </Row>
        <Row title="IPv6">
          <Toggle on={st.ipv6} onChange={(v) => set({ ipv6: v })} />
        </Row>
        <Row title="Удалённый DNS" desc="через VPN; поддерживаются https://, tls://, quic://, udp://">
          <TextField value={st.remoteDns} width={260} onSave={(v) => set({ remoteDns: v.trim() })} />
        </Row>
        <Row title="Прямой DNS" desc="для сайтов, которые идут напрямую ('local' = системный)">
          <TextField value={st.directDns} width={200} onSave={(v) => set({ directDns: v.trim() })} />
        </Row>
      </div>

      <div className="section-title">Подписки</div>
      <div className="group">
        <Row title="Автообновление" desc="часы, 0 = выключено. Заголовок profile-update-interval имеет приоритет">
          <TextField type="number" width={90} value={st.subUpdateHours} onSave={(v) => set({ subUpdateHours: Math.max(0, Number(v) || 0) })} />
        </Row>
        <Row title="User-Agent" desc="некоторые панели отдают разный формат в зависимости от клиента">
          <div className="ua-ctl">
            <TextField value={st.userAgent} width={180} onSave={(v) => set({ userAgent: v })} />
            <select className="field" value="" onChange={(e) => e.target.value && set({ userAgent: e.target.value })}>
              <option value="">шаблон…</option>
              {UA_PRESETS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </Row>
      </div>

      <div className="section-title">Диагностика</div>
      <div className="group">
        <Row title="Уровень логов">
          <Segmented
            value={st.logLevel}
            options={[
              { v: 'error', label: 'Ошибки' },
              { v: 'warn', label: 'Предупр.' },
              { v: 'info', label: 'Инфо' },
              { v: 'debug', label: 'Отладка' }
            ]}
            onChange={(v) => set({ logLevel: v })}
          />
        </Row>
        <Row title="Папка данных" desc="конфиги, настройки, подписки" onClick={() => window.uvelo.openDataDir()}>
          <IcFolder width={18} height={18} />
        </Row>
      </div>

      <div className="section-title">О программе</div>
      <div className="group">
        <Row title={`Uvelo ${s.version}`} desc="Открытый клиент для Windows. Лицензия GPL-3.0">
          <button className="btn small" onClick={() => window.uvelo.openExternal('https://github.com/pxdxx/uvelo')}>
            GitHub <IcExternal width={14} height={14} />
          </button>
        </Row>
        <Row title="Поддержка" desc="Вопросы, ошибки и предложения в Telegram">
          <button className="btn small" onClick={() => window.uvelo.openExternal('https://t.me/pxdxz')}>
            Написать <IcExternal width={14} height={14} />
          </button>
        </Row>
        <Row
          title="Ядра"
          desc={
            <>
              sing-box: {s.coresOk.singbox ? s.coresOk.singboxVersion || 'есть' : <span className="err-text">не найден</span>} · Xray:{' '}
              {s.coresOk.xray ? s.coresOk.xrayVersion || 'есть' : <span className="err-text">не найден</span>}
            </>
          }
        />
        <Row title="Права администратора" desc={s.isAdmin ? 'есть, TUN доступен' : 'нет, для TUN потребуется перезапуск'}>
          {!s.isAdmin && (
            <button className="btn small" onClick={() => window.uvelo.relaunchAsAdmin()}>
              Перезапустить
            </button>
          )}
        </Row>
      </div>
    </div>
  )
}
