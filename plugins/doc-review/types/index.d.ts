declare module 'claude-code' {
  interface PluginState {
    // pending: spec/plan paths written since the last ask; asked: paths already offered this session
    'doc-review': { pending: string[]; asked: string[] }
  }
}
