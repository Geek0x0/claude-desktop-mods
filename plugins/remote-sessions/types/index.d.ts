export type Sess = { id: string; title: string; cwd: string; isRunning: boolean; me: boolean }

declare module 'claude-code' {
  interface PluginState {
    'remote-sessions': {
      sessions: Shaped<Sess[]>
      error: Shaped<string>
      updatedAt: Shaped<number>
      busy: Shaped<string[]>
    }
  }
}
