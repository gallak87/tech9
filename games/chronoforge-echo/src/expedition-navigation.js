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
  if(key==='ArrowDown'){if(ui.tab===0)ui.map.focusSelected();else focus(hero()||buttons('.exp-page button,.exp-page input')[0]);}
  return true;
 }
 if(active?.closest('.exp-crew')){
  if(key==='ArrowLeft'||key==='ArrowRight')move(buttons('.exp-crew-choice'),key==='ArrowRight'?1:-1,true);
  if(key==='ArrowUp')focus(tab());
  if(key==='ArrowDown')focus(buttons('.exp-gear-slot')[0]||buttons('.exp-pack-item')[0]||buttons('.exp-skill-row')[0]);
  return true;
 }
 if(ui.tab===5){
  const row=active?.closest('[data-save-slot]'),rows=[...root.querySelectorAll('[data-save-slot]')];
  if(row){
   const actions=buttons('[data-save-slot="'+row.dataset.saveSlot+'"] button');
   if(key==='ArrowLeft'||key==='ArrowRight')move(actions,key==='ArrowRight'?1:-1);
   if(key==='ArrowUp'||key==='ArrowDown'){
    const next=rows[rows.indexOf(row)+(key==='ArrowDown'?1:-1)];
    if(next){
     const available=[...next.querySelectorAll('button:not(:disabled)')],action=active.dataset.do?.split(':')[0],rect=active.getBoundingClientRect(),x=(rect.left+rect.right)/2;
     available.sort((a,b)=>{const center=el=>{const r=el.getBoundingClientRect();return(r.left+r.right)/2;};return Math.abs(center(a)-x)-Math.abs(center(b)-x);});
     focus(available.find(el=>el.dataset.do?.split(':')[0]===action)||available[0]);
    }else focus(key==='ArrowUp'?tab():buttons('.exp-save-footer button')[0]);
   }
   return true;
  }
  if(active?.closest('.exp-save-footer')){
   if(key==='ArrowUp')focus(buttons('[data-save-slot="3"] button')[0]);
   if(key==='ArrowLeft'||key==='ArrowRight')move(buttons('.exp-save-footer button'),key==='ArrowRight'?1:-1);
   return true;
  }
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

// Like settlement navigation, use rendered rectangles rather than DOM order.
// This spans toolbar, heroes and every item section, including partial grid rows.
export function navigateShop(ui,key){
 if(!key.startsWith('Arrow')||ui.menu||ui.panel?.type!=='vendor')return false;
 const region=ui.root.querySelector('[data-shop-navigation]'),active=document.activeElement;
 if(!region?.contains(active))return false;
 const options=[...region.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(el=>el.offsetWidth>0&&el!==active).map(el=>({el,rect:el.getBoundingClientRect()}));
 const rect=active.getBoundingClientRect(),cx=r=>(r.left+r.right)/2;
 const vertical=key==='ArrowUp'||key==='ArrowDown',direction=key==='ArrowUp'||key==='ArrowLeft'?-1:1;
 let next;
 if(vertical){
  // Carry the original column through short rows; Up then retraces the same column.
  const column=ui.shopNavigation?.active===active?ui.shopNavigation.column:cx(rect);
  const rows=options.filter(({rect:r})=>direction>0?r.top>=rect.bottom-1:r.bottom<=rect.top+1);
  rows.sort((a,b)=>direction>0?a.rect.top-b.rect.top:b.rect.bottom-a.rect.bottom);
  const nearest=rows[0]?.rect;
  if(nearest){
   const row=rows.filter(({rect:r})=>Math.min(r.bottom,nearest.bottom)>Math.max(r.top,nearest.top));
   row.sort((a,b)=>Math.abs(cx(a.rect)-column)-Math.abs(cx(b.rect)-column));
   next=row[0]?.el;
  }
  ui.shopNavigation={active:next||active,column};
 }else{
  const row=options.filter(({rect:r})=>direction*(cx(r)-cx(rect))>1&&Math.min(r.bottom,rect.bottom)>Math.max(r.top,rect.top));
  row.sort((a,b)=>Math.abs(cx(a.rect)-cx(rect))-Math.abs(cx(b.rect)-cx(rect)));
  next=row[0]?.el;
  ui.shopNavigation={active:next||active,column:next?cx(next.getBoundingClientRect()):cx(rect)};
 }
 if(next){next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',inline:'nearest'});}
 return true;
}
