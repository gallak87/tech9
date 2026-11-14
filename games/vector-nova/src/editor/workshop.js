import { createTrackEditor } from './index.js';
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
    disposed = false;
  let pending = null,
    suspended = false,
    previousDiagnostics = null,
    disposal = null;

  function restoreDiagnostics() {
    if (!import.meta.env?.VN_DESKTOP && previousDiagnostics) {
      window.__VN = previousDiagnostics;
      previousDiagnostics = null;
    }
  }
  function returnToEditor() {
    if (disposed) return;
    generation++;
    controller?.abort();
    game?.dispose();
    game = null;
    const token = generation;
    sessionHost.hidden = true;
    const restore = () => {
      if (disposed || token !== generation) return;
      restoreDiagnostics();
      sessionHost.replaceChildren();
      editorHost.hidden = false;
      document.body.dataset.screen = 'editor';
      onDriving(false);
      editor?.resume();
    };
    if (pending) void pending.catch(() => {}).then(restore);
    else restore();
  }
  async function testDrive(documentData) {
    const token = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const previous = pending;
    editor.suspend();
    editorHost.hidden = true;
    sessionHost.hidden = false;
    sessionHost.innerHTML =
      '<section class="editor-session-loading" data-editor-loading><p>TRACK WORKSHOP / TEST DRIVE</p><h1>Preparing your circuit</h1><p role="status">Reading track</p><button type="button">Back to editor</button></section>';
    const loading = sessionHost.firstElementChild;
    loading.querySelector('button').onclick = returnToEditor;
    loading.querySelector('button').focus();
    if (!import.meta.env?.VN_DESKTOP) previousDiagnostics = window.__VN ?? null;
    const task = (async () => {
      await previous?.catch(() => {});
      signal.throwIfAborted();
      const { createGame } = await import('../core/game.js');
      signal.throwIfAborted();
      const created = await createGame({
        host: sessionHost,
        customCourse: documentData,
        parameters: new URLSearchParams(),
        signal,
        onProgress(stage) {
          if (!signal.aborted)
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
          if (!signal.aborted)
            onDriving(['racing', 'countdown'].includes(mode));
        },
      });
      if (disposed || signal.aborted || token !== generation) {
        created.dispose();
        signal.throwIfAborted();
        return;
      }
      game = created;
      game.prepareSession();
      if (
        game.getSnapshot().ship.id !== shipId &&
        !(await game.selectShip(shipId))
      )
        throw new Error('The selected ship could not be loaded.');
      signal.throwIfAborted();
      loading.remove();
      document.body.dataset.screen = 'race';
      game.practice();
    })();
    pending = task;
    try {
      await task;
    } catch (error) {
      if (token === generation && !disposed) returnToEditor();
      if (error.name !== 'AbortError') throw error;
    } finally {
      if (pending === task) pending = null;
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
      testDriving: !!game,
      loadingTest: !!pending,
    }),
    isTestDriving: () => !!game || !!pending,
    suspend() {
      if (disposed || suspended) return;
      suspended = true;
      host.hidden = true;
      if (game) {
        game.pause();
        game.setSuspended(true);
      } else editor.suspend();
      onDriving(false);
    },
    resume() {
      if (disposed) return;
      suspended = false;
      host.hidden = false;
      if (game) {
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
      game?.dispose();
      game = null;
      editor.dispose();
      editorHost.remove();
      sessionHost.remove();
      onDriving(false);
      disposal = Promise.allSettled([pending]).then(restoreDiagnostics);
      return disposal;
    },
  };
}
