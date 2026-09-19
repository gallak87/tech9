// Available on this machine only. Keep the import.meta.env.DEV guard at
// the call site as well so the entire panel is removed from production builds.
export function localDevHost(location) {
  return (
    ['http:', 'https:'].includes(location.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  );
}

export function localDevPreviewRequested(location) {
  return (
    localDevHost(location) &&
    new URLSearchParams(location.search).get('dev') === '1'
  );
}

export function devPreviewReady(game) {
  return (
    game.mode === 'world' &&
    !game.ui.blocked &&
    !game.transition &&
    !game.state.recruitmentWalk
  );
}
