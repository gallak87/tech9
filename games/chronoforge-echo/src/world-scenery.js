import {worldDetailBounds,worldDetailFrame,authoredLandmarkFootprints,frameBounds} from './world-detail-art.js';
import {caveEntranceBounds,caveArtFrame} from './cave-art.js';
import {REGIONAL_PROP_ASPECTS} from './world-scenery-geometry.js';
import {WORLD_PROP_ART} from './world-prop-frames.js';
import {ROAD_SIGN_ART} from './sign-art.js';

const rect=(x,y,w,h)=>({x,y,w,h});
const measuredAspect=(biome,part)=>{
  const f=worldDetailFrame(biome,part);
  return f?f.w/f.h:REGIONAL_PROP_ASPECTS[biome]?.[part]||({rock:1.07,cypress:.56,arch:.85,tree:.96}[part]||1);
};

export function sceneryBounds(o,biome) {
  if(o.type==='cave')return caveEntranceBounds(o,biome);
  const detail=worldDetailBounds(o,biome);if(detail)return detail;
  if(o.type==='console'&&!o.style&&!o.fieldRecord&&!o.domestic&&!o.service){
    const f=WORLD_PROP_ART.frames[WORLD_PROP_ART.parts.console];
    return frameBounds(f,o.x,o.y,f.nativeWidth*f.h/f.w);
  }
  if(o.type==='camp')return frameBounds(WORLD_PROP_ART.frames[WORLD_PROP_ART.restFrames[0]],o.x,o.y,88);
  if(o.type==='sign')return frameBounds(ROAD_SIGN_ART.frames[0],o.x,o.y,ROAD_SIGN_ART.frames[0].nativeHeight);
  let part,height;
  if(o.type==='tree'){part=o.variant===3?'cypress':'tree';height=(o.variant===3?260:220)*(o.size||1);}
  else if(o.type==='rock'){part='rock';height=69;}
  else if(o.type==='ruin'){part='arch';height=164;}
  else if(o.style==='biome_prop'){part=o.part;height=o.drawHeight;}
  else if(o.type==='landmark'&&['ring','arch','bell'].includes(o.style)){part=o.style==='arch'?'arch':'ring';height=320*(o.style==='bell'?.7:o.size||1);}
  if(!part)return null;
  const width=height*measuredAspect(biome,part);
  return {left:o.x-width*.5,top:o.y-height*.97,width,height};
}

// Occlusion follows the drawn upper silhouette, independently of the smaller
// ground collider. Restoration town interiors retain their own rendering path.
export function sceneryOcclusionBounds(scene,o) {
  if(!scene.interior)return sceneryBounds(o,scene.biome);
  if(scene.kind!=='cave')return null;
  if(o.style==='interior_supply'||o.fieldRecord&&o.id.endsWith('_record')){
    const f=caveArtFrame(scene.biome,'station');
    return f?frameBounds(f,o.x,o.y,100):null;
  }
  if(o.fieldRecord){
    const width=70*(REGIONAL_PROP_ASPECTS[scene.biome]?.cypress||.56);
    return {left:o.x-width*.5,top:o.y-70*.97,width,height:70};
  }
  return null;
}

// These rectangles are ground footprints, relative to the existing object
// anchor. They never include overhead boughs, arches, cables, or the floor.
export function sceneryFootprints(o,biome) {
  const authored=authoredLandmarkFootprints(o);if(authored)return authored;
  const size=o.size||1,b=sceneryBounds(o,biome),w=b?.width||0;
  if(o.type==='cave')return [rect(-w*.46,-41,w*.29,45),rect(w*.18,-41,w*.28,45),rect(-w*.18,-91,w*.36,35)];
  if(o.type==='tree'){
    const fraction=o.variant===3?({coast:.57,desert:.47,snow:.66,ice:.58}[biome]||.52):({coast:.32,desert:.39,forest:.32,mire:.32,volcanic:.4,snow:.25,ice:.42,alien:.32}[biome]||.32);
    const width=Math.max(27,w*fraction),height=(o.variant===3?27:22)*size;
    return [rect(-width/2,-height,width,height+3)];
  }
  if(o.type==='rock')return [rect(-measuredAspect(biome,'rock')*26,-24,measuredAspect(biome,'rock')*52,28)];
  if(o.type==='console'&&!o.style)return [rect(-25,-22,50,26)];
  if(o.type==='camp')return [rect(-17,-16,34,20)];
  if(o.type==='sign')return [rect(-9,-8,18,12)];
  if(o.type==='ruin'||o.style==='arch'){
    const depth=o.type==='ruin'?26:35*size;
    return [rect(-w*.44,-depth,w*.24,depth+4),rect(w*.20,-depth,w*.24,depth+4)];
  }
  if(o.style==='biome_prop'){
    if(o.part==='cypress')return [rect(-w*.29,-17,w*.58,20)];
    if(o.part==='rock')return [rect(-w*.4,-11,w*.8,14)];
  }
  if(o.type!=='landmark')return null;
  switch(o.style){
    case 'ring':case 'bell':return [rect(-w*.34,-30*size,w*.68,34*size)];
    case 'greattree':return [rect(-112,-65,225,70)];
    case 'furnace':return [rect(-185,-105,370,112)];
    case 'elevator':return [rect(-91,-57,182,63)];
    case 'ice':return [rect(-121,-49,242,55)];
    case 'hand':return [rect(-147,-57,294,65)];
    case 'palace':return [rect(-184,-76,370,85)];
    case 'bones':return [rect(-237,-84,163,123),rect(36,-115,155,114),rect(-76,-142,115,66)];
    case 'masts':return [-79,0,79].map((x,i)=>{const width=(190+i*26)*measuredAspect(biome,'cypress')*.48;return rect(x-width*.5,-28-(i%2)*15,width,33);});
    default:return null;
  }
}

export function footprintBlocks(o,x,y,padding=6) {
  return o.footprints?.some(r=>x>o.x+r.x-padding&&x<o.x+r.x+r.w+padding&&y>o.y+r.y-padding&&y<o.y+r.y+r.h+padding)||false;
}

// Final world coordinates. Decorative landmarks may move; doors, consoles,
// encounters, portal destinations and their saved IDs/anchors remain fixed.
const placements={
  haventide:{tide_ring:[850,1590]},
  forest_veil:{forest_veil_ruin_2:[2920,910]},
  orbital_reach:{orbital_tether:[3150,1100]},
  last_crown:{crown_spire:[4990,740],last_crown_ruin_4:[4540,880]},
};

export function configureWorldScenery(regions) {
  for(const scene of Object.values(regions)){
    for(const [id,[x,y]]of Object.entries(placements[scene.id]||{})){
      const object=scene.objects.find(o=>o.id===id);if(object)Object.assign(object,{x,y});
    }
    // Portal markers used to be paint-only props placed over the road. Make
    // their small physical bases real objects and frame the road from its sides.
    for(const portal of scene.portals){
      const horizontal=portal.x<200||portal.x>scene.width-200;
      const marker={x:portal.x+(horizontal?0:-73),y:portal.y+(horizontal?-78:0)};
      const stone={x:portal.x+(horizontal?0:72),y:portal.y+(horizontal?69:0)};
      scene.objects.push({id:portal.id+'_marker',type:'landmark',style:'biome_prop',part:'cypress',drawHeight:110,...marker,portalScenery:true},
        {id:portal.id+'_stone',type:'landmark',style:'biome_prop',part:'rock',drawHeight:28,...stone,portalScenery:true});
      portal.sceneryInstalled=true;
    }
    for(const o of scene.objects){
      const footprints=sceneryFootprints(o,scene.biome);
      if(footprints){o.footprints=footprints;o.solid=true;}
    }
    // Remove foreground trunks whose canopies hide a door, console, or the
    // heart of a landmark. Decorative groves and hidden supply caches remain.
    const targets=scene.objects.filter(o=>['town','house','cave','console'].includes(o.type)||
      o.type==='landmark'&&!o.portalScenery&&!o.building&&o.style!=='biome_prop');
    scene.objects=scene.objects.filter(o=>{
      if(o.type!=='tree')return true;
      const b=sceneryBounds(o,scene.biome);if(!b)return true;
      return !targets.some(t=>{
        const landmark=worldDetailBounds(t,scene.biome),focusY=t.y-(landmark?Math.min(120,landmark.height*.3):35);
        return o.y>t.y-12&&focusY>b.top+20&&focusY<o.y&&t.x>b.left+18&&t.x<b.left+b.width-18;
      });
    });
  }
}

export function configureCaveScenery(scene) {
  if(scene.kind!=='cave')return;
  for(const o of scene.objects){
    if(o.style==='interior_supply'||o.fieldRecord){
      o.solid=true;o.footprints=o.style==='interior_supply'||o.id.endsWith('_record')?[rect(-37,-26,74,29)]:[rect(-19,-16,38,20)];
    }else if(o.style==='relic'){
      o.solid=true;o.footprints=[rect(-28,-16,56,19)];
    }
  }
}
