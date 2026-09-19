import {mountUpgradeTour as mountTour} from './upgrade-tour.js';
import {upgradePreviewStates} from './dev-upgrade-preview.js';

// Only the local development panel imports the preview controls and copy.
export function mountUpgradeTour(game,options) {
  const tour=mountTour(game,{...options,previewMarkup:`
    <header><span><span data-town-name>HAVENTIDE</span> <small>UPGRADE PREVIEW · NEVER SAVED</small></span><button type="button" data-tour="close">Back to art preview <kbd>Esc</kbd></button></header>
    <div class="upgrade-caption" aria-live="polite"><span></span><strong></strong></div>
    <div class="upgrade-card">
      <div data-tour-phase="ready"><small>SETTLEMENT WORKS</small><h2></h2><p>Watch the exterior upgrade, then return to the hall.</p><button type="button" data-tour="play">Upgrade Town Center</button><p class="upgrade-note">Rehearsal only · no resources spent<br>Includes the hall’s four restoration stages.</p></div>
      <div data-tour-phase="playing" hidden><button type="button" data-tour="skip">Skip reveal <kbd>Space</kbd></button></div>
      <div data-tour-phase="complete" hidden><small>PREVIEW COMPLETE</small><h2>Back inside the hall</h2><p>The exterior and hall show the selected upgrade.<br>Your real town and expedition are unchanged.</p><button type="button" data-tour="done">Back to dev tools</button><button type="button" data-tour="play">Replay upgrade</button></div>
    </div>`});
  return {
    get open(){return tour.open;},
    openPreview(fromLevel,region){tour.openUpgrade(upgradePreviewStates(game.state,fromLevel,region));},
    close:tour.close,handleKey:tour.handleKey,dispose:tour.dispose,
  };
}
