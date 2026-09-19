import {mountUpgradeTour as mountTour} from './upgrade-tour.js';
import {upgradePreviewStates} from './dev-upgrade-preview.js';

// Only the local development panel imports the preview controls and copy.
export function mountUpgradeTour(game,options) {
  const tour=mountTour(game,{...options,previewMarkup:`
    <header><span>HAVENTIDE <small>UPGRADE PREVIEW · NEVER SAVED</small></span><button type="button" data-tour="close">Back to art preview <kbd>Esc</kbd></button></header>
    <div class="upgrade-caption" aria-live="polite"><span></span><strong></strong></div>
    <div class="upgrade-card">
      <div data-tour-phase="ready"><small>SETTLEMENT WORKS</small><h2></h2><p>Watch the exterior upgrade, then return to the hall.</p><button type="button" data-tour="play">Upgrade Town Center</button><p class="upgrade-note">Rehearsal only · no resources spent<br>Interior uses current artwork; its four stages come next.</p></div>
      <div data-tour-phase="playing" hidden><button type="button" data-tour="skip">Skip reveal <kbd>Space</kbd></button></div>
      <div data-tour-phase="complete" hidden><small>PREVIEW COMPLETE</small><h2>Back inside Haventide</h2><p>Interior artwork is unchanged in this pass.<br>Your real town and expedition are unchanged.</p><button type="button" data-tour="done">Return to play</button><button type="button" data-tour="play">Replay upgrade</button></div>
    </div>`});
  return {
    get open(){return tour.open;},
    openPreview(fromLevel){tour.openUpgrade(upgradePreviewStates(game.state,fromLevel));},
    close:tour.close,handleKey:tour.handleKey,dispose:tour.dispose,
  };
}
