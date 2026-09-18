// Arrow navigation follows the visible menu zones. Tab remains a normal
// sequential way to reach every button, including each row's explicit action.
export function navigateExpedition(ui,key){
 if(!key.startsWith('Arrow'))return false;
 const root=ui.root,active=document.activeElement;
 const buttons=selector=>[...root.querySelectorAll(selector)].filter(b=>!b.disabled&&b.offsetWidth>0);
 const focus=(el,activate=false)=>{if(!el)return;el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'});if(activate)el.click();};
 const move=(list,d,activate=false)=>{const i=list.indexOf(active);focus(list[Math.max(0,Math.min(list.length-1,i+d))],activate);};
 const hero=()=>root.querySelector('.exp-crew-choice[aria-pressed="true"]');
 const tab=()=>root.querySelector('.tabs [aria-selected="true"]');
 if(active?.closest('.tabs')){
  if(key==='ArrowLeft'||key==='ArrowRight')move(buttons('.tabs button'),key==='ArrowRight'?1:-1,true);
  if(key==='ArrowDown')focus(hero()||buttons('.exp-page button,.exp-page input')[0]);
  return true;
 }
 if(active?.closest('.exp-crew')){
  if(key==='ArrowLeft'||key==='ArrowRight')move(buttons('.exp-crew-choice'),key==='ArrowRight'?1:-1,true);
  if(key==='ArrowUp')focus(tab());
  if(key==='ArrowDown')focus(buttons('.exp-gear-slot')[0]||buttons('.exp-pack-item')[0]||buttons('.exp-skill-row')[0]);
  return true;
 }
 if(ui.tab!==2)return false;
 if(active?.closest('.exp-gear')){
  const slots=buttons('.exp-gear-slot'),i=slots.indexOf(active);
  if(key==='ArrowUp')i===0?focus(hero()):move(slots,-1);
  if(key==='ArrowDown')move(slots,1);
  if(key==='ArrowRight')focus(root.querySelector('.exp-pack-row.selected .exp-pack-item')||buttons('.exp-pack-item')[0]);
  return true;
 }
 const row=active?.closest('.exp-pack-row');
 if(row){
  const list=buttons('.exp-pack-item'),i=list.findIndex(b=>b.closest('.exp-pack-row')===row);
  if(key==='ArrowUp')i===0?focus(hero()):focus(list[i-1]);
  if(key==='ArrowDown')focus(list[Math.min(list.length-1,i+1)]);
  if(key==='ArrowRight')focus(row.querySelector('.exp-pack-action:not(:disabled)'));
  if(key==='ArrowLeft')focus(active.matches('.exp-pack-action')?row.querySelector('.exp-pack-item'):buttons('.exp-gear-slot')[0]||hero());
  return true;
 }
 return false;
}
