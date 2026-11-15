import { createTrackEditor } from './index.js';
import { resolveEditorTestStart } from './test-drive.js';
import './workshop.css';

// The workshop owns a separate practice session. Career races stay suspended.
export async function createWorkshop(
  host,
  {
    document: initialDocument = null,
    shipId = 'kestrel',
    onExit,
    onSettings,
    onTunes,
    onDriving = () => {},
  } = {},
) {
  const editorHost = document.createElement('div');
  editorHost.id = 'track-editor-host';
  const sessionHost = document.createElement('div');
  sessionHost.id = 'editor-game-host';
  sessionHost.hidden = true;
  host.append(editorHost, sessionHost);
  let editor,
    game = null,
    controller = null,
    generation = 0,
    disposed = false,
    activeTest = false,
    gameKey = null;
  let pending = null,
    suspended = false,
    previousDiagnostics,
    diagnosticsSaved = false,
    disposal = null;

  function restoreDiagnostics() {
    if (!import.meta.env?.VN_DESKTOP && diagnosticsSaved) {
      if (previousDiagnostics === undefined) delete window.__VN;
      else window.__VN = previousDiagnostics;
      diagnosticsSaved = false;
    }
  }
  function claimDiagnostics() {
    if (import.meta.env?.VN_DESKTOP) return;
    if (!diagnosticsSaved) {
      previousDiagnostics = window.__VN;
      diagnosticsSaved = true;
    }
    if (game) window.__VN = game;
  }
  function discardGame() {
    game?.dispose();
    game = null;
    gameKey = null;
  }
  function returnToEditor() {
    if (disposed) return;
    generation++;
    activeTest = false;
    if (pending) controller?.abort();
    if (game) {
      const attempt = game.getEditorTestAttempt();
      if (attempt) editor?.setTestDriveAttempt?.(attempt);
      game.pause();
      game.setSuspended(true);
    }
    sessionHost.hidden = true;
    restoreDiagnostics();
    editorHost.hidden = false;
    document.body.dataset.screen = 'editor';
    onDriving(false);
    editor?.resume();
  }
  async function testDrive(documentData, request = {}) {
    const plan = resolveEditorTestStart(documentData, request, { shipId });
    const key = JSON.stringify([
      plan.courseIdentity,
      shipId,
      documentData.id,
      documentData.name,
    ]);
    const token = ++generation;
    if (pending) controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const previous = pending;
    activeTest = true;
    editor.suspend();
    editorHost.hidden = true;
    sessionHost.hidden = false;
    claimDiagnostics();
    if (game && gameKey === key && !previous) {
      try {
        game.setSuspended(false);
        document.body.dataset.screen = 'race';
        if (!game.startEditorTest(plan.request))
          throw new Error('The selected test could not be started.');
        return;
      } catch (error) {
        returnToEditor();
        throw error;
      }
    }
    discardGame();
    await previous?.catch(() => {});
    if (disposed || signal.aborted || token !== generation) return;
    sessionHost.replaceChildren();
    sessionHost.innerHTML =
      '<section class="editor-session-loading" data-editor-loading><p>TRACK WORKSHOP / TEST DRIVE</p><h1>Preparing your circuit</h1><p role="status">Reading track</p><button type="button">Back to editor</button></section>';
    const loading = sessionHost.firstElementChild;
    loading.querySelector('button').onclick = returnToEditor;
    loading.querySelector('button').focus();
    const task = (async () => {
      signal.throwIfAborted();
      const { createGame } = await import('../core/game.js');
      signal.throwIfAborted();
      const created = await createGame({
        host: sessionHost,
        customCourse: documentData,
        parameters: new URLSearchParams(),
        signal,
        onProgress(stage) {
          if (!signal.aborted && activeTest)
            loading.querySelector('[role="status"]').textContent = stage;
        },
        onHome: returnToEditor,
        onSettings() {
          game?.setSuspended(true);
          onSettings?.();
        },
        onTunes: onTunes
          ? () => onTunes(sessionHost.querySelector('#pause-tunes'))
          : null,
        onMode(mode) {
          if (!signal.aborted && activeTest)
            onDriving(['racing', 'countdown'].includes(mode));
        },
      });
      if (disposed || signal.aborted || token !== generation) {
        created.dispose();
        signal.throwIfAborted();
        return;
      }
      game = created;
      gameKey = key;
      if (
        game.getSnapshot().ship.id !== shipId &&
        !(await game.selectShip(shipId))
      )
        throw new Error('The selected ship could not be loaded.');
      signal.throwIfAborted();
      loading.remove();
      document.body.dataset.screen = 'race';
      if (!game.startEditorTest(plan.request))
        throw new Error('The selected test could not be started.');
    })();
    pending = task;
    try {
      await task;
    } catch (error) {
      if (token === generation && !disposed) {
        discardGame();
        returnToEditor();
      }
      if (error.name !== 'AbortError') throw error;
    } finally {
      if (pending === task) pending = null;
      if (!activeTest) restoreDiagnostics();
    }
  }
  editor = await createTrackEditor(editorHost, {
    shipId,
    ...(initialDocument ? { document: initialDocument } : {}),
    onExit,
    onTestDrive: testDrive,
    onTunes,
  });
  return {
    getDocument: () => editor.getDocument(),
    getState: () => ({
      ...editor.getState(),
      testDriving: activeTest,
      loadingTest: !!pending,
      retainedTest: !!game,
    }),
    isTestDriving: () => activeTest,
    suspend() {
      if (disposed || suspended) return;
      suspended = true;
      host.hidden = true;
      if (activeTest && game) {
        game.pause();
        game.setSuspended(true);
      } else editor.suspend();
      onDriving(false);
    },
    resume() {
      if (disposed) return;
      suspended = false;
      host.hidden = false;
      if (activeTest && game) {
        document.body.dataset.screen = 'race';
        game.resumeSession();
        sessionHost.querySelector('#pause-settings')?.focus();
      } else {
        document.body.dataset.screen = 'editor';
        editor.resume();
      }
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      generation++;
      controller?.abort();
      activeTest = false;
      discardGame();
      editor.dispose();
      editorHost.remove();
      sessionHost.remove();
      onDriving(false);
      disposal = Promise.allSettled([pending]).then(restoreDiagnostics);
      return disposal;
    },
  };
}
