import { sampleVesperSurface } from './surface.js';

export function createVesperOverlay({ host, track, getMotion }) {
  const label = document.createElement('span');
  label.dataset.vesperSurface = '';
  const cue = document.createElement('div');
  cue.dataset.vesperGuidance = '';
  const title = document.createElement('b');
  const instruction = document.createElement('small');
  cue.append(title, instruction);
  host.append(cue);
  const style = document.createElement('style');
  style.textContent = `
    [data-vesper-surface] { display:block!important; margin:0 0 7px; color:#bed9c5; font-size:9px!important; letter-spacing:.08em; text-shadow:0 1px 4px #000; }
    [data-vesper-guidance] { display:none; position:fixed; z-index:20; pointer-events:none; top:94px; left:50%; transform:translateX(-50%); padding:8px 16px; border-top:1px solid #bfa476; background:#11212bd9; color:#f1dfbb; text-align:center; font:11px/1.5 system-ui; letter-spacing:.1em; }
    [data-vesper-guidance] b,[data-vesper-guidance] small { display:block; }
    [data-vesper-guidance] small { color:#c6d2cf; font-size:9px; }
    @media (max-width:760px) and (orientation:portrait) {
      [data-vesper-surface] { position:fixed; top:156px; left:4vw; font-size:8px!important; }
      [data-vesper-guidance] { top:274px; width:calc(100vw - 64px); padding:5px 8px; font-size:10px; }
      body:has(#interface.driving #review-toggle[aria-expanded='true']) [data-vesper-guidance] { top:420px; }
    }
    @media (max-height:570px) and (orientation:landscape) {
      [data-vesper-surface] { position:fixed; top:52px; left:50%; transform:translateX(-50%); }
      [data-vesper-guidance] { top:48px; padding:2px 8px; font-size:9px; line-height:1.2; }
      [data-vesper-guidance] small { font-size:8px; }
    }
  `;
  host.append(style);
  const short = matchMedia('(max-height:570px) and (orientation:landscape)');
  let presentation = { surface: 'resin', drag: 0 };
  return {
    update({ state, mode }) {
      if (!label.isConnected) host.querySelector('.energy')?.prepend(label);
      const motion = getMotion?.() ?? 'magnetic';
      const surface =
        motion === 'magnetic'
          ? sampleVesperSurface(track, state)
          : { id: 'air', zone: null, drag: 0 };
      const s = ((state.distance % track.length) + track.length) % track.length;
      const nextJump =
        motion === 'magnetic' &&
        track.jumps.find(
          (jump) =>
            jump.takeoff > s && jump.takeoff - s < (jump.optional ? 170 : 210),
        );
      const noticeVisible = Boolean(host.querySelector('#notice')?.textContent);
      const showCue =
        mode === 'racing' &&
        Boolean(nextJump) &&
        !(short.matches && noticeVisible);
      cue.style.display = showCue ? 'block' : 'none';
      if (showCue) {
        title.textContent = `${nextJump.optional ? 'BRANCH GAP' : 'CROWN LEAP'} · ${Math.ceil((nextJump.takeoff - s) / 10) * 10} M`;
        instruction.textContent = nextJump.optional
          ? 'LEFT: BYPASS · RIGHT: MAIN ROUTE'
          : 'CENTER LINE · BUILD SPEED WITH MANUAL BOOST';
      }
      label.textContent =
        surface.id === 'sap'
          ? 'FLOWING SAP · DRAG'
          : surface.id === 'air'
            ? 'AIRBORNE · LANDING AHEAD'
            : 'HARDENED RESIN';
      label.style.visibility =
        ['racing', 'paused'].includes(mode) &&
        !(short.matches && (showCue || noticeVisible))
          ? 'visible'
          : 'hidden';
      label.style.color = surface.id === 'sap' ? '#ffe1b3' : '#bed9c5';
      presentation = {
        surface: surface.id,
        zone: surface.zone,
        drag: surface.drag,
        upcomingJump: nextJump?.id ?? null,
      };
    },
    getPresentation: () => ({ ...presentation }),
    dispose() {
      label.remove();
      cue.remove();
      style.remove();
    },
  };
}
