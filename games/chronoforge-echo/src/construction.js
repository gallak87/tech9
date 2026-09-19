import {build} from './progression.js';
import {onEvent} from './narrative.js';
import {townUpgradePlan} from './upgrade-cinematic.js';

// This is the settlement button's real transaction. The cinematic never
// charges resources, changes progression, or rolls back a completed upgrade.
export function performBuild(game,id) {
  if(game.upgradeTour?.open||game.devTools?.open||game.mode!=='world'||game.ui.panel?.type!=='build')return;
  const before=id==='town_center'?structuredClone(game.state):null;
  const result=build(game.state,id);
  if(!result.ok){game.ui.feedback(result);return result;}
  const story=onEvent(game.state,'build',id);
  game.checkpoint();
  const plan=before&&townUpgradePlan(before,game.state);
  if(plan&&game.upgradeTour){
    game.keys.clear();game.movePath=[];game.moving=false;
    game.ui.panel=null;game.ui.notice='';game.ui.render();
    let finished=false;
    const finish=()=>{
      if(finished)return;finished=true;
      game.keys.clear();game.ui.showBuild();game.ui.feedback(result);
      game.resolveResult(story);
      game.ui.restoreShopRow('build:town_center');
    };
    try{game.upgradeTour.openUpgrade(plan,finish);}
    catch(error){
      // A presentation failure cannot strand a paid, checkpointed upgrade.
      game.upgradeTour.close();game.log('upgrade_reveal_error',{message:error.message});finish();
    }
  }else{
    game.ui.feedback(result);game.resolveResult(story);
  }
  return result;
}
