import { cupComplete } from '../race/cup.js';

// The frontend owns which surface is visible; the game owns the retained run.
// Menu transitions only suspend presentation. Explicit Start replaces a run.
export function createSessionNavigation({
  getGame,
  getSession,
  setScreen,
  onResume,
}) {
  function canResume() {
    const game = getGame();
    if (!game?.hasSession()) return false;
    const { cup, cupState, intent } = getSession();
    if (
      cup &&
      (!cupState || cupState.phase !== 'racing' || cupComplete(cupState))
    )
      return false;
    const snapshot = game.getSnapshot();
    return (
      !snapshot.competition?.playerFinished &&
      !snapshot.timeTrial?.result &&
      !snapshot.eliminator?.result &&
      !snapshot.interceptor?.result &&
      !(intent === 'freestyle' && snapshot.mode === 'results')
    );
  }
  return {
    canResume,
    sync(screen, { inspector = false } = {}) {
      getGame()?.setSuspended(
        inspector || !['race', 'review', 'results'].includes(screen),
      );
    },
    resume() {
      if (!canResume()) return false;
      onResume();
      setScreen('race');
      getGame().resumeSession();
      return true;
    },
  };
}

// Keep each page's position and focus through utility pages and layout changes.
export function createMenuHistory() {
  const pages = new Map();
  return {
    remember(key, state) {
      const previous = pages.get(key);
      pages.set(key, {
        ...previous,
        ...state,
        focus: state.focus ?? previous?.focus ?? null,
      });
    },
    recall(key) {
      return pages.get(key) ?? null;
    },
  };
}
