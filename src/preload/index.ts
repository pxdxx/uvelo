import { contextBridge, ipcRenderer } from 'electron'
import type { UveloApi } from '../shared/types'

const inv =
  (ch: string) =>
  (...a: unknown[]) =>
    ipcRenderer.invoke(ch, ...a)

const api: UveloApi = {
  getState: inv('getState') as UveloApi['getState'],
  onState(cb) {
    const l = (_: unknown, s: any) => cb(s)
    ipcRenderer.on('state', l)
    return () => ipcRenderer.off('state', l)
  },
  onLog(cb) {
    const l = (_: unknown, s: string[]) => cb(s)
    ipcRenderer.on('log', l)
    return () => ipcRenderer.off('log', l)
  },
  getLogs: inv('getLogs') as UveloApi['getLogs'],
  clearLogs: inv('clearLogs') as UveloApi['clearLogs'],
  connect: inv('connect') as UveloApi['connect'],
  disconnect: inv('disconnect') as UveloApi['disconnect'],
  selectServer: inv('selectServer') as UveloApi['selectServer'],
  selectSub: inv('selectSub') as UveloApi['selectSub'],
  addSub: inv('addSub') as UveloApi['addSub'],
  addFromClipboard: inv('addFromClipboard') as UveloApi['addFromClipboard'],
  updateSub: inv('updateSub') as UveloApi['updateSub'],
  updateAllSubs: inv('updateAllSubs') as UveloApi['updateAllSubs'],
  renameSub: inv('renameSub') as UveloApi['renameSub'],
  removeSub: inv('removeSub') as UveloApi['removeSub'],
  removeServer: inv('removeServer') as UveloApi['removeServer'],
  pingAll: inv('pingAll') as UveloApi['pingAll'],
  setSettings: inv('setSettings') as UveloApi['setSettings'],
  relaunchAsAdmin: inv('relaunchAsAdmin') as UveloApi['relaunchAsAdmin'],
  openExternal: inv('openExternal') as UveloApi['openExternal'],
  copyText: inv('copyText') as UveloApi['copyText'],
  win: inv('win') as UveloApi['win'],
  openDataDir: inv('openDataDir') as UveloApi['openDataDir'],
  pickApp: inv('pickApp') as UveloApi['pickApp']
}

contextBridge.exposeInMainWorld('uvelo', api)
