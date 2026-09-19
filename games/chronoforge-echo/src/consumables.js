import {ITEMS} from './content.js';

const unavailable=message=>({ok:false,message,rewards:[]});

// Field menus and combat share the same eligibility and spend boundary. A
// confirmation describes a specific target state, never permission for later use.
export function assessItemUse(state,itemId,target,limits=target,{battle=false}={}){
 const item=ITEMS[itemId];
 if(!target||item?.slot!=='consumable'||!(state.inventory[itemId]>0))return unavailable('That supply is unavailable.');
 let amount,capacity,unit='HP';
 if(item.effect==='revive'){
  if(target.hp>0)return unavailable('This ally is already standing.');
  amount=Math.max(1,(battle?Math.round:Math.ceil)(limits.maxHp*item.power));capacity=amount;
 }else{
  if(target.hp<=0)return unavailable('Use a Dawn Seed to revive this ally first.');
  const key=item.effect==='heal'?'hp':item.effect==='restoreMp'?'mp':null;
  if(!key)return unavailable('That supply would have no effect.');
  unit=key==='hp'?'HP':'MP';const maximum=key==='hp'?limits.maxHp:limits.maxMp;
  capacity=Math.min(item.power,maximum);amount=Math.max(0,Math.min(item.power,maximum-target[key]));
  if(!amount)return unavailable(`${target.name} already has full ${unit}. No supply used.`);
 }
 const wasted=item.effect==='revive'?0:Math.max(0,item.power-amount);
 const confirmationKey=JSON.stringify([itemId,target.id,item.effect,item.power,target.hp,target.mp,limits.maxHp,limits.maxMp,amount]);
 return {ok:true,itemId,targetId:target.id,targetName:target.name,effect:item.effect,amount,capacity,wasted,unit,requiresConfirmation:item.effect!=='revive'&&amount<capacity/2,confirmationKey};
}

export function consumeItem(state,itemId,target,limits=target,options={}){
 const use=assessItemUse(state,itemId,target,limits,options);
 if(!use.ok)return use;
 if(use.requiresConfirmation&&options.confirmation!==use.confirmationKey)return {...use,ok:false,needsConfirmation:true,message:`${use.targetName} restores ${use.amount} ${use.unit}; ${use.wasted} ${use.unit} wasted.`};
 if(use.effect==='revive')target.hp=use.amount;
 else target[use.effect==='heal'?'hp':'mp']+=use.amount;
 state.inventory[itemId]--;
 return {...use,ok:true,message:`${ITEMS[itemId].name} restored ${use.amount} ${use.unit} to ${use.targetName}.`,rewards:[]};
}
