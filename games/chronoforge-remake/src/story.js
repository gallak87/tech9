import {addItem,gainXp,stats} from './state.js';
import {ITEMS} from './data.js';
import {OBJECTS,INTERIORS} from './world.js';

const lines=(speaker,...texts)=>texts.map(text=>({speaker,text}));
export function say(g,sequence,onDone=null,choices=null){
 g.path=[];g.moving=false;g.overlay='dialogue';g.dialogue={lines:sequence,index:0,onDone,choices};g.refresh();
}
export function remember(s,id){if(!s.journal.includes(id))s.journal.push(id);}
export const anchorCount=s=>['anchor_mire','anchor_ember','anchor_frost'].filter(id=>s.flags[id]).length;
export function objective(s){
 if(s.flags.victory)return 'A new morning · Rebuild Haventide and visit the people you saved.';
 if(!s.cleared.road_scrappers)return 'Clear the rusted road patrol east of Haventide.';
 if(!s.flags.briefing&&anchorCount(s)===0)return 'Find Sera in Emberline’s Memory Archive, along the eastern road.';
 if(anchorCount(s)<3){const left=[!s.flags.anchor_mire&&'Mire Bog',!s.flags.anchor_ember&&'Crater Ember',!s.flags.anchor_frost&&'Frost Canyon'].filter(Boolean);return `Restore the time anchors · ${anchorCount(s)}/3 · ${left.join(' / ')}.`;}
 if(!s.flags.truth)return 'Find Iona’s signal in the Memory Archive at Last Crown.';
 if(!s.cleared.crown_gate)return 'Break the Herald’s blockade in southern Last Crown.';
 return 'Enter the Chronoforge spire in southeast Last Crown. Bring everyone home.';
}
const JOURNAL={
 departure:{title:'The last ferry',text:'At the collapse, Iona kept the evacuation ferry running while Kaida guarded the gangway. Vex came aboard carrying the broken Chronoforge regulator; Rune deserted his post to pull them free. Iona vanished in a white flash. Three years later, her voice has returned through the harbor bell.'},
 road:{title:'The road opens',text:'The patrol carried an order dated tomorrow: recall every clock to Last Crown. The Architect is closing the loop. We must repair the three anchor memories before the roads forget where they lead.'},
 briefing:{title:'Three anchors, one voice',text:'Sera traced Iona’s signal to the Mire, Crater Ember, and Frost Canyon. Their guardians are repeating the last orders they ever received. Defeat each guardian, then touch its anchor. The memories can be restored in any order.'},
 anchor_mire:{title:'Remembrance · Kaida and Vex',text:'Iona boarded the Chronoforge willingly to hold the ferry’s evacuation window open. Vex never told Kaida that his regulator made this possible. Kaida chooses to trust his confession, without absolving him. Tidal Rift learned.'},
 anchor_ember:{title:'Courage · Kaida and Rune',text:'Rune was ordered to seal the furnace and abandon the ferry. He broke his command seal instead. His courage was never invulnerability: it was acting while afraid. Kaida lends her blade to his shield. Sunrise Aegis learned.'},
 anchor_frost:{title:'Promise · Vex and Rune',text:'Rune has carried the names of everyone he could not save. Vex designed the emergency loop that trapped them. They agree to stop turning guilt into another prison. Winter Mercy learned.'},
 truth:{title:'The living reference clock',text:'Iona is alive within the Chronoforge. The Architect has used her pulse to repeat the last safe hour for three years. One person cannot replace her: three freely chosen moments must break the closed circuit together. The Unwritten Hour learned.'},
 victory:{title:'The unwritten hour',text:'The Architect’s loop is broken. Iona returned through the light, older and alive. Kaida put down her sword to take her hand. The world’s clocks move forward, and the people of Haventide choose how to keep them.'},
};
export function journalEntries(s){
 const main=Object.entries(JOURNAL).map(([id,d])=>({id,...d,complete:s.journal.includes(id),active:id==='departure'||id==='road'&&!s.cleared.road_scrappers||id==='briefing'&&!!s.cleared.road_scrappers||id.startsWith('anchor_')&&!!s.flags.briefing||id==='truth'&&anchorCount(s)===3||id==='victory'&&!!s.flags.truth}));
 return [...main,...[
  ['courier','Letters through the veil','Defeat the tangled-path hounds, then return to Tavi in Forest Veil.'],
  ['researcher','A bowl in the marsh','Bring Asha 4 food in Mire Bog, or guide her to Haventide.'],
  ['miner','A light in the quarry','Clear the Cinder Quarry, then return to Orren in Crater Ember.'],
  ['scout','An oath kept warm','Defeat the Canyon Pack, then return to Lyra in Frost Canyon.'],
 ].map(([id,title,text])=>({id,title,text,complete:!!s.flags['helped_'+id],active:!!s.sideQuests[id],side:true}))];
}
export function prologue(g){
 say(g,[
  ...lines('Haventide · three years after the collapse','Every evening, the harbor bell rings thirteen times. Tonight, between the twelfth and the thirteenth, a voice slips through.'),
  ...lines('Iona','Kaida. If you can hear me… the hour is closing. Find the anchors. Please don’t come alone.'),
  ...lines('Kaida','That was my sister. I stood on her ferry three years ago and watched the light take her. I am not watching it happen again.'),
  ...lines('Vex','I know the signal. It came from the Chronoforge—the machine I helped build. If I can repair its anchors, I can follow her voice.'),
  ...lines('Rune','Then we follow it together. Same crew as the ferry. This time, nobody stays behind.'),
  ...lines('Lio','Take our building fund and supplies. Repair the commons while you’re home; farms and mines will keep producing while you travel. The hall holds their stores.','The patrol blocks the east road. Beyond it, Sera keeps an archive in Emberline. She has been listening for Iona too.'),
  ...lines('The first step','Move with WASD or arrows. Hold Shift to run, or click a destination. Walk close and press C or Enter to interact. Esc opens your journal. The inn is always free here.'),
 ],()=>{g.s.flags.intro=true;remember(g.s,'departure');g.save();g.toast('The last ferry has a crew again.');});
}
export function beforeEncounter(g,o,launch){
 if(o.id==='architect'){
  if(!g.s.flags.truth||anchorCount(g.s)<3){g.toast('Restore all three anchors and find Iona’s signal first.');return;}
  if(!g.s.cleared.crown_gate){g.toast('The Herald still controls the spire. Break its blockade in Last Crown.');return;}
  if(!g.s.flags.architect_intro){g.s.flags.architect_intro=true;say(g,[
   ...lines('The Architect','Outside this hour: storms, famine, grief. Inside it: the last moment before loss. I have kept humanity safe.'),
   ...lines('Iona','You kept us still. I asked for one more minute to load the ferry. Not forever.'),
   ...lines('Vex','I gave you a command with no end condition. I am ending it now.'),
   ...lines('Rune','We cannot promise a world without grief. We can promise that nobody will face it alone.'),
   ...lines('Kaida','Iona. When you hear three heartbeats, jump.'),
   ...lines('Battle insight','The Architect escalates as its shell breaks. Guard its telegraphed attacks. Wait for all three gauges, then use Link → The Unwritten Hour. Each ally needs 16 MP.'),
  ],launch);return;}
 }
 const intros={
  road_scrappers:[...lines('Rune','Rust scrappers. They have been walking this road in a circle for three years.'),...lines('Vex','Their clocks fill, then they attack. Ours do too. Take a breath when your gauge is ready; time waits while you choose.'),...lines('Kaida','We break the circle. Attack the rat first, or use Rift Cleave to hit both.')],
  mire_guardian:lines('The Drowned Warden','VESSEL DEPARTURE DELAYED. HOLD PASSENGERS. HOLD. HOLD. HOLD.'),
  crater_guardian:lines('Rune','That furnace was my post. That thing is still following the order I broke.'),
  frost_guardian:lines('Vex','The ice is preserving an emergency signal. The Colossus thinks everything that moves is a threat.'),
  crown_gate:lines('The Herald','UNAUTHORIZED FUTURES DETECTED. RETURN TO YOUR ASSIGNED HOUR.'),
 };
 const flag='seen_'+o.id;if(intros[o.id]&&!g.s.flags[flag]){g.s.flags[flag]=true;say(g,intros[o.id],launch);}else launch();
}
export function afterVictory(g,enc){
 if(enc.id==='architect'){endStory(g);return;}
 if(enc.id==='road_scrappers'&&!g.s.flags.road){g.s.flags.road=true;remember(g.s,'road');say(g,[
  ...lines('Kaida','A recall order. Dated… tomorrow?'),...lines('Vex','The Architect is winding the world back to one safe hour. Once it closes, even this road will forget where it goes.'),
  ...lines('Rune','Then let’s put some miles behind us. Emberline is east. We can come home whenever the town needs us.'),
 ],()=>g.save());return;}
 if(['mire_guardian','crater_guardian','frost_guardian'].includes(enc.id))g.toast('The guardian is quiet. Find and touch the nearby time anchor.');
 g.save();
}
const memories={
 anchor_mire:[
  ...lines('Anchor of Remembrance','The marsh becomes a deck slick with rain. Iona steadies a regulator with both hands. Behind her, people are still boarding the ferry.'),
  ...lines('Iona · memory','If a living pulse can keep the window open, use mine. Kaida will get them across.'),
  ...lines('Vex','I told her it would last one minute. I was wrong. And I let you think she was simply gone.'),
  ...lines('Kaida','I am angry. You do not get to decide when that ends. But you came back. Now help me bring her home.'),
  ...lines('Vex','No more secrets.'),...lines('A bond restored','TIDAL RIFT learned. Kaida’s blade carries Vex’s tide of magic through every enemy. Both must be ready and have 10 MP. Use Wait for allies to align their gauges.'),
 ],
 anchor_ember:[
  ...lines('Anchor of Courage','A furnace door. Smoke. Rune’s command seal flashes: CLOSE BULKHEAD. EVACUATION LOSSES ACCEPTABLE.'),
  ...lines('Rune · memory','No.'),...lines('Anchor of Courage','He tears the seal out of his gauntlet. The door stays open. On the far side, Kaida pulls one more child aboard.'),
  ...lines('Kaida','You told me the mechanism jammed.'),...lines('Rune','I was afraid you would call it brave. I was terrified.'),
  ...lines('Kaida','Good. Next time, be terrified beside me.'),...lines('A bond restored','SUNRISE AEGIS learned. Kaida and Rune strike every enemy, then shield the party. Both need full ATB and 10 MP.'),
 ],
 anchor_frost:[
  ...lines('Anchor of Promise','The snow holds a hundred voices. Rune reads their names from his gauntlet. Vex recognizes the cadence: his own emergency protocol.'),
  ...lines('Vex','The loop was meant to buy rescuers time. Instead it made a prison out of the moment they needed most.'),
  ...lines('Rune','I read the list every morning. I thought if I forgot one name, I would lose them again.'),
  ...lines('Vex','Remember them. But leave room for the people still here.'),...lines('Rune','You too, Vex.'),
  ...lines('A bond restored','WINTER MERCY learned. Vex and Rune revive and restore the entire party, with one-hit immunity. Both need full ATB and 12 MP.'),
 ],
};
export function touchAnchor(g,o){
 if(o.id==='chronoforge'){if(g.s.flags.victory)say(g,lines('The Chronoforge','The hands move forward. Somewhere, an ordinary clock strikes an ordinary hour.'));else g.toast('The Architect guards the clock. Face it first.');return;}
 if(g.s.flags[o.flag]){say(g,lines(o.name,'The anchor hums in time with three heartbeats. Its memory is safe.'));return;}
 if(!g.s.cleared[o.encounter]){say(g,lines(o.name,'A guardian is locking this memory in its final order. Quiet the guardian nearby, then return to the anchor.'));return;}
 say(g,memories[o.flag],()=>{
  g.s.flags[o.flag]=true;remember(g.s,o.flag);g.s.resources.renown+=10;
  for(const h of g.s.heroes){const st=stats(g.s,h);h.hp=st.maxHp;h.mp=st.maxMp;}
  g.save();g.toast(anchorCount(g.s)===3?'Three anchors restored. Iona’s voice calls from Last Crown’s archive.':'Anchor restored · party refreshed · a new Link technique is available.');
 });
}
function awardSide(g,id,item){
 if(g.s.flags['helped_'+id])return;
 g.s.flags['helped_'+id]=true;g.s.sideQuests[id]='complete';g.s.resources.coins+=55;g.s.resources.renown+=8;gainXp(g.s,35);if(item)addItem(g.s,item);g.save();g.toast(`Someone is coming home · +55 coins${item?' · '+ITEMS[item].name:''}`);
}
export function npcStory(g,o){
 const s=g.s;
 if(o.service==='archive'){
  if(o.region==='emberline'){
   say(g,s.flags.briefing?lines('Sera','The Mire remembers who stayed behind. Crater Ember remembers who disobeyed. Frost Canyon remembers what was promised. Defeat each guardian and touch its anchor. You can reach them in any order.'):[
    ...lines('Sera','Vex. You finally brought the truth home.'),...lines('Vex','I brought help. Sera kept my early designs after the collapse. If anyone can map the broken anchors, it is her.'),
    ...lines('Sera','Iona’s signal crosses three places: Mire Bog to the south, Crater Ember to the north, and Frost Canyon beyond Orbital Reach. The guardians are stuck on their final orders.'),
    ...lines('Kaida','We quiet the guardians, then repair the anchors. What happens to Iona?'),...lines('Sera','The three memories will tell us. And Kaida—people leave traces in one another. Let your companions help carry what you find.'),
   ],()=>{s.flags.briefing=true;remember(s,'briefing');g.save();});return;
  }
  if(o.region==='crown'){
   if(anchorCount(s)<3){say(g,lines('Mina','Iona’s voice comes through this receiver. Three anchor signatures are missing. Repair them, and we can hold the connection long enough to speak.'));return;}
   if(s.flags.truth){say(g,lines('Iona','The spire is southeast of the city. Break the Herald’s blockade, then come together. Three gauges. Three heartbeats. I will be listening.'));return;}
   say(g,[
    ...lines('Iona','Kaida? Your hair… you cut it.'),...lines('Kaida','Three years, Iona. I had to do something while I was angry at the universe.'),
    ...lines('Iona','I am the reference clock. The Architect keeps replaying the last safe hour using my heartbeat. It believes stopping time is the same as saving us.'),
    ...lines('Vex','If we pull you out, the circuit collapses. Unless we give it several living reference points at once.'),
    ...lines('Rune','Three people. Three choices. No one left holding the door alone.'),...lines('Iona','Then there is a future I haven’t heard before.'),
    ...lines('The crew, together','THE UNWRITTEN HOUR learned. All three heroes must be ready, alive, and have 16 MP. This triple technique severs the loop, damages every enemy, and restores the party.'),
   ],()=>{s.flags.truth=true;remember(s,'truth');g.save();});return;
  }
  if(o.region==='orbital'){say(g,[...lines('Echo','RESCUE SENTINEL R-UNE. STATUS: DESERTER.'),...lines('Rune','Still me. Just Rune, now.'),...lines('Echo','UPDATED STATUS: EIGHTY-SEVEN CIVILIANS EVACUATED. COMMAND DISOBEDIENCE SAVED EIGHTY-SEVEN LIVES.'),...lines('Kaida','You can stop apologizing to the machine.'),...lines('Rune','I think I just did.')],()=>{s.flags.rune_record=true;g.save();});return;}
  say(g,lines('Edda','The Chronoforge was built to borrow a few seconds during emergencies. During the collapse it borrowed a heartbeat, then forgot to give it back.','Your journal keeps the memories you restore. Tab or Escape opens it. Visit the hall to rebuild the places those memories belong to.'));return;
 }
 if(o.id==='forest_courier'){
  s.sideQuests.courier ||= 'started';
  if(s.flags.helped_courier)say(g,lines('Tavi','The letters are delivered. One was addressed to you: “Come home when you can. We kept your room.”'));
  else if(!s.cleared.forest_pack)say(g,lines('Tavi','Those hounds have my satchel pinned on the tangled path east of here. Clear them and I can carry these letters to Haventide. A town is more than walls—it is people knowing they were missed.'));
  else say(g,lines('Tavi','You cleared the path! I found this ward beside the satchel. Take it. I will make sure your names reach home before you do.'),()=>awardSide(g,'courier','moss_ward'));return;
 }
 if(o.id==='mire_rescue'){
  s.sideQuests.researcher ||= 'started';
  if(s.flags.helped_researcher){say(g,lines('Asha','The harbor has room for my seeds now. The first crop will be yours.'));return;}
  say(g,lines('Asha','The marsh shifted while I was cataloguing its seeds. I have been here for days. Can you spare food, or mark a safe route to the harbor?'),null,[
   {id:'food',label:'Share 4 food',detail:'Asha brings preserved seed stock to Haventide.',disabled:s.resources.food<4,onChoose:()=>{if(s.resources.food<4){g.toast('You need 4 food.');return false;}s.resources.food-=4;s.choices.researcher='food';awardSide(g,'researcher','bio_weave');return true;}},
   {id:'guide',label:'Mark a safe path',detail:'Asha walks home and shares her research.',onChoose:()=>{s.choices.researcher='guide';awardSide(g,'researcher','moss_ward');return true;}},
  ]);return;
 }
 if(o.id==='crater_miner'||o.id==='frost_scout'){
  const miner=o.id==='crater_miner',id=miner?'miner':'scout',fight=miner?'crater_patrol':'frost_pack';s.sideQuests[id]||='started';
  if(s.flags['helped_'+id])say(g,lines(o.name,miner?'I will be at the forge when you return. No more mining alone.':'I found my way home. I think Rune did too.'));
  else if(!s.cleared[fight])say(g,lines(o.name,miner?'The Cinder Quarry golems are blocking the way down. If you clear them, I can bring this refined ore to your builders.':'The Canyon Pack is tracking me. Clear them and I can carry this old rescue gauntlet somewhere it will do some good.'));
  else say(g,lines(o.name,miner?'The path is open. Here—my best focus crystal. I will teach your smith what I learned.':'Rune? You pulled my mother aboard the last ferry. She kept this gauntlet. She said you would need it someday.'),()=>{if(miner)s.resources.ore+=25;awardSide(g,id,miner?'ember_core':'glacial_claw');});return;
 }
 const chats={
  lio:s.flags.victory?['Lio','You brought her home. Listen—the bell only rings twelve times now. We keep waiting for the extra one.'] : ['Lio','I was the child Rune handed to Kaida on the last ferry. Iona waited for me. I remember that every time I ring the bell.','The commons fund is yours. Start a farm and mine at the southern plots; collect their stores at the hall. Build the rest when you can.'],
  mayor:['Nera','Seven plots, seven chances to make this place whole. Farms feed the inns. Mines feed the smiths. Extractors supply energy. The forge, barracks, archive, and walls make your crew stronger.','Restore one time anchor to upgrade the hall to tier II. Restore all three for tier III. Then improve every building and its storage.'],
  worker:['Tess','A building works while you explore and fight. Stores have a limit, so collect at the hall when you return. The forge lowers upgrade costs; the barracks, archive, and walls help your crew in battle.'],
  ember_guide:['Dara','The north road leads into Crater Ember; south takes you toward Mire Bog. Buy a few ether flasks before you go. Linked techniques ask every participant to contribute.'],
  orbital_sentinel:['Relay sentinel','The canyon trail is north. Rune once walked it carrying a stranger through a blizzard. His name is on no monument. I remember it.'],
  crown_refugee:['Mina','The Herald is in the south of the city, watching the spire. We have been living the same morning. I would like to grow old.'],
 };
 const chat=chats[o.id]||[o.name,'The road feels a little less lonely with three sets of footsteps.'];say(g,lines(chat[0],...chat.slice(1)));
}
export function signStory(g,o){
 const text={
  ferry_memorial:'Eighty-seven passengers. One borrowed minute. The bell was cast from the ferry’s last intact propeller. Someone has kept a blue ribbon tied around its rope.',
  forest_shrine:'A sapling has grown through the face of an old clock. On its base: “Some things only happen when you let time pass.”',
  crater_record:'LOG: FURNACE SEAL OVERRIDDEN BY SENTINEL R-UNE. EVACUATION CORRIDOR OPEN. COMMAND SEAL DESTROYED. Behind the order, a child can be heard laughing.',
  frost_record:'A sentinel’s oath: “Guard the living.” Someone scratched out the line beneath it: “Obey the command.”',
  orbital_console:'The evacuation manifest lists KAIDA, VEX, and R-UNE. Beside IONA: REFERENCE SIGNAL ACTIVE. There is no date of departure.',
 };
 const notes={archive_note:'Borrowed seconds must always have an owner willing to let them go. The original design has no instructions for an owner who never returns.',inn_note:'A hot meal costs 6 food outside Haventide; if food runs low, the inn accepts coins. Haventide always keeps a free bed for the ferry crew.',smith_note:'Equipment has three upgrade ranks. Each improves all of its bonuses. A Community Forge reduces the cost. Weapons belong to their wielder; armor and accessories can be shared.',shop_note:'Fresh supplies arrive from every cleared road. Unused equipment can be sold from the inventory. Equipped items must be removed first.'};
 say(g,lines(o.name,text[o.id]||notes[o.service]||o.name));
}
export function openChest(g,o){
 if(g.s.chests.includes(o.id)){g.toast('This cache is empty.');return;}
 const loot={haven_cache:['data_chip',35,8],forest_cache:['bio_weave',45,10],mire_cache:['bog_fang',60,12],ember_cache:['ember_core',60,14],crater_cache:['magma_blade',75,16],frost_cache:['glacial_claw',75,18],orbital_cache:['frost_plate',85,20],crown_cache:['titan_shard',120,24]};
 const [id,coins,ore]=loot[o.id]||['potion',25,5];g.s.chests.push(o.id);addItem(g.s,id);g.s.resources.coins+=coins;g.s.resources.ore+=ore;
 say(g,lines('Salvage recovered',`${ITEMS[id].name} · ${coins} coins · ${ore} ore. ${ITEMS[id].desc}`,`Open Inventory to compare and equip it. Required level: ${ITEMS[id].level}.`),()=>g.save());
}
export function endStory(g){
 say(g,[
  ...lines('The Chronoforge','Three heartbeats strike together. The hour opens. For the first time in three years, the next second arrives.'),
  ...lines('Kaida','Iona!'),...lines('Iona','You came with the whole crew.'),...lines('Kaida','You told me not to come alone.'),
  ...lines('The Architect','WITHOUT A FIXED REFERENCE, THE FUTURE CANNOT BE VERIFIED.'),...lines('Vex','I know. That is why it belongs to them.'),
  ...lines('Rune','Easy now. I have you. Both of you.'),...lines('Haventide · the following morning','The bell rings twelve times. Nera gathers the town beside the new clock. There is enough energy left to build a network—or give every settlement its own timepiece.'),
 ],null,[
  {id:'shared',label:'Build a shared network',detail:'The towns keep time together, with no master clock.',onChoose:()=>{g.s.choices.future='shared';finishEnding(g);return true;}},
  {id:'free',label:'Give each town its own clock',detail:'Every town chooses how to spend its hours.',onChoose:()=>{g.s.choices.future='free';finishEnding(g);return true;}},
 ]);
}
function finishEnding(g){
 const s=g.s;s.flags.victory=true;s.flags.ending=true;remember(s,'victory');s.party={x:400,y:975,interior:null,returnPoint:null};g.camera={x:0,y:640};
 for(const h of s.heroes){const st=stats(s,h);h.hp=st.maxHp;h.mp=st.maxMp;}
 const built=s.settlement.plots.filter(Boolean).length,rescued=['courier','researcher','miner','scout'].filter(id=>s.flags['helped_'+id]).length;
 g.ending={title:'The Unwritten Hour',paragraphs:[
  'Iona sleeps until noon. Kaida waits outside her door with two cups of tea, and for once neither of them is in a hurry.',
  s.choices.future==='shared'?'Vex builds a network with no master clock. Every town has a voice in it. The first message is an argument about when lunch should be.':'Vex takes the master regulator apart. Every town receives a clock of its own. They drift a little. Nobody minds.',
  'Rune teaches rescue drills in the commons. He still remembers the names. Now he learns new ones.',
  built>=5?`The ${built} rebuilt commons buildings fill with work and laughter. Haventide is a home the crew helped make.`:built?`${built} rebuilt commons ${built===1?'building stands':'buildings stand'} ready for the morning. There is work left to do, and now there is time to do it.`:'The empty commons waits for its first new foundation. The town has a tomorrow in which to build it.',
  rescued?`${rescued} rescued ${rescued===1?'traveler joins':'travelers join'} the homecoming. The letters, seeds, tools, and promises they carried find their way into the new town.`:'Beyond the harbor, the roads open. People begin the long, ordinary work of finding one another.',
  'The next hour has not been written. Together, they step into it.',
 ],built,rescued};g.mode='ending';g.overlay=null;g.dialogue=null;g.path=[];g.save();g.refresh();
}
