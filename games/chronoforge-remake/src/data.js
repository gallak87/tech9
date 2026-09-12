// Original content for The Unwritten Hour. All gameplay numbers live here.
export const HEROES = {
  kaida: {id:'kaida',name:'Kaida',role:'Riftblade',color:'#ff72c5',desc:'A ferry guard following the voice of her lost sister.',base:{maxHp:156,maxMp:44,atk:24,mag:10,def:10,spd:19,crit:8},growth:{maxHp:22,maxMp:5,atk:5,mag:2,def:2,spd:0.7,crit:0.5}},
  vex: {id:'vex',name:'Vex',role:'Void scholar',color:'#72dcfa',desc:'The engineer who opened the wound in time—and intends to mend it.',base:{maxHp:122,maxMp:72,atk:13,mag:27,def:7,spd:17,crit:5},growth:{maxHp:18,maxMp:8,atk:2,mag:5,def:2,spd:0.6,crit:0.4}},
  rune: {id:'rune',name:'Rune',role:'Oath sentinel',color:'#f7ce69',desc:'A rescue sentinel who chose people over orders.',base:{maxHp:188,maxMp:52,atk:21,mag:17,def:16,spd:15,crit:4},growth:{maxHp:26,maxMp:6,atk:4,mag:3,def:3,spd:0.5,crit:0.4}},
};

export const ITEMS = {
  iron_blade:{name:'Ferry Blade',slot:'weapon',heroes:['kaida'],level:1,tier:1,price:75,stats:{atk:5},desc:'Kaida kept the evacuation ferry clear with this blade.'},
  void_shard:{name:'Glass Focus',slot:'weapon',heroes:['vex'],level:1,tier:1,price:75,stats:{mag:6,maxMp:6},desc:'A small fragment of a very large mistake.'},
  rune_gauntlet:{name:'Rescue Gauntlet',slot:'weapon',heroes:['rune'],level:1,tier:1,price:75,stats:{atk:4,def:2},desc:'Built to lift fallen beams, then repurposed for battle.'},
  scrap_vest:{name:'Patchwork Coat',slot:'armor',level:1,tier:1,price:60,stats:{def:3,maxHp:8},desc:'Warm, weatherproof, and stitched by Haventide.'},
  data_chip:{name:'Quickstep Dial',slot:'accessory',level:1,tier:1,price:95,stats:{spd:3},desc:'An old pocket clock that runs a little ahead.'},
  crit_lens:{name:'Copper Sight',slot:'accessory',level:2,tier:1,price:100,stats:{crit:8},desc:'Turns a moment of hesitation into an opening.'},
  slag_tooth:{name:'Slag Tooth',slot:'accessory',level:1,tier:1,price:70,stats:{atk:2,crit:3},desc:'An ember-tipped fang pendant hung from a weathered cord.'},
  swamp_coil:{name:'Swamp Coil',slot:'accessory',level:2,tier:2,price:145,stats:{crit:3,spd:2},desc:'A braided reed-and-copper bracelet carrying the quiet pulse of the Mire.'},
  mire_charm:{name:'Mire Charm',slot:'accessory',level:2,tier:2,price:125,stats:{mag:2,maxMp:8},desc:'A forked gray-blue tooth pendant on a dark chain, cool with marsh magic.'},
  bog_fang:{name:'Reedsteel Saber',slot:'weapon',heroes:['kaida'],level:2,tier:2,price:175,stats:{atk:11,spd:1},desc:'A light blade quenched in the waters of the Mire.'},
  moss_ward:{name:'Moss Ward',slot:'accessory',level:2,tier:2,price:150,stats:{maxHp:28,def:3},desc:'Living moss woven into a small protective knot.'},
  bio_weave:{name:'Fenweave Mantle',slot:'armor',level:2,tier:2,price:165,stats:{maxHp:24,def:6},desc:'Flexible fibers absorb the force of a blow.'},
  ember_core:{name:'Cinder Focus',slot:'weapon',heroes:['vex'],level:3,tier:2,price:220,stats:{mag:14,maxMp:12},desc:'A quiet flame held inside a ring of glass.'},
  magma_blade:{name:'Daybreak Saber',slot:'weapon',heroes:['kaida'],level:4,tier:3,price:300,stats:{atk:19,crit:4},desc:'Emberline steel glows warm even beneath frost.'},
  glacial_claw:{name:'Glacier Gauntlet',slot:'weapon',heroes:['rune'],level:3,tier:2,price:220,stats:{atk:12,def:5},desc:'A rescued sentinel’s gift, restored by Rune.'},
  frost_plate:{name:'Winterguard Plate',slot:'armor',level:4,tier:3,price:265,stats:{def:11,maxHp:40},desc:'Insulated plates fitted over a soft blue lining.'},
  void_scepter:{name:'Unbound Focus',slot:'weapon',heroes:['vex'],level:5,tier:3,price:340,stats:{mag:23,maxMp:22},desc:'Its circuit is deliberately open. Nothing is trapped inside.'},
  titan_shard:{name:'Dawnsteel Harness',slot:'armor',level:5,tier:4,price:380,stats:{def:16,maxHp:56},desc:'Forged from the shell of a machine that learned mercy.'},
  ember_crown:{name:'Shared Hour',slot:'accessory',level:4,tier:3,price:260,stats:{spd:4,crit:7,maxMp:8},desc:'Three hands move together on this unusual clock.'},
  potion:{name:'Field Tonic',slot:'consumable',level:1,tier:1,price:18,stats:{},effect:'heal',power:100,desc:'Restores 100 HP to one living ally.'},
  ether:{name:'Ether Flask',slot:'consumable',level:1,tier:1,price:28,stats:{},effect:'mp',power:35,desc:'Restores 35 MP to one living ally.'},
  phoenix:{name:'Wakeflower',slot:'consumable',level:1,tier:1,price:48,stats:{},effect:'revive',power:0.45,desc:'Revives one fallen ally with 45% HP.'},
};
for (const [id,item] of Object.entries(ITEMS)) item.id=id;

export const SKILLS = {
  rift_cleave:{hero:'kaida',name:'Rift Cleave',desc:'A sweeping blade strikes every enemy.',level:1,cost:0,mp:7,requires:null,target:'enemies',effect:'physical',power:1.05},
  chrono_strike:{hero:'kaida',name:'Chrono Strike',desc:'A strong hit slows one enemy’s ATB for 12 seconds.',level:2,cost:1,mp:8,requires:null,target:'enemy',effect:'slow',power:1.65},
  time_sever:{hero:'kaida',name:'Time Sever',desc:'Three converging cuts strike one enemy.',level:4,cost:2,mp:15,requires:'chrono_strike',target:'enemy',effect:'physical',power:3.35,hits:3},
  second_wind:{hero:'kaida',name:'Second Wind',desc:'Recover 40% HP and gain a brief speed boost.',level:3,cost:1,mp:6,requires:null,target:'self',effect:'secondwind',power:0.4},
  void_lance:{hero:'vex',name:'Void Lance',desc:'Pierce one enemy with concentrated void magic.',level:1,cost:0,mp:6,requires:null,target:'enemy',effect:'magic',power:1.65},
  null_field:{hero:'vex',name:'Null Field',desc:'A contained void burst hits every enemy.',level:2,cost:1,mp:10,requires:null,target:'enemies',effect:'magic',power:1.35},
  entropy_surge:{hero:'vex',name:'Entropy Surge',desc:'Drain all enemies. Restore HP and MP to Vex.',level:4,cost:2,mp:14,requires:'null_field',target:'enemies',effect:'drain',power:1.65},
  mend:{hero:'vex',name:'Mend the Moment',desc:'Restore 65 HP plus magic to one ally.',level:2,cost:1,mp:7,requires:null,target:'ally',effect:'heal',power:65},
  aegis_field:{hero:'rune',name:'Aegis Field',desc:'Shield every ally for 30 plus Rune’s magic.',level:1,cost:0,mp:9,requires:null,target:'allies',effect:'shield',power:30},
  bulwark:{hero:'rune',name:'Bulwark',desc:'Draw attacks for 12 seconds and reduce damage by 60%.',level:2,cost:1,mp:6,requires:null,target:'self',effect:'taunt',power:0},
  temporal_wall:{hero:'rune',name:'Temporal Wall',desc:'Each ally ignores the next two hits. Lasts 15 seconds.',level:4,cost:2,mp:18,requires:'bulwark',target:'allies',effect:'immune',power:2},
  rekindle:{hero:'rune',name:'Rekindle',desc:'Revive a fallen ally with 45% HP, or heal a living ally.',level:3,cost:1,mp:12,requires:null,target:'ally',effect:'revive',power:0.45},
};
for(const [id,skill] of Object.entries(SKILLS)) skill.id=id;

export const LINKS = {
  tidal_rift:{id:'tidal_rift',name:'Tidal Rift',heroes:['kaida','vex'],flag:'anchor_mire',mp:10,target:'enemies',effect:'linkmagic',power:2.3,desc:'Kaida + Vex • strike and slow every enemy.'},
  sunrise_aegis:{id:'sunrise_aegis',name:'Sunrise Aegis',heroes:['kaida','rune'],flag:'anchor_ember',mp:10,target:'enemies',effect:'linkshield',power:2.15,desc:'Kaida + Rune • strike every foe and shield all allies.'},
  winter_mercy:{id:'winter_mercy',name:'Winter Mercy',heroes:['vex','rune'],flag:'anchor_frost',mp:12,target:'allies',effect:'linkheal',power:0.7,desc:'Vex + Rune • revive and restore the party; grant one-hit immunity.'},
  unwritten_hour:{id:'unwritten_hour',name:'The Unwritten Hour',heroes:['kaida','vex','rune'],flag:'truth',mp:16,target:'enemies',effect:'triple',power:3.8,desc:'All three • sever the loop, strike every enemy, and restore the party.'},
};

export const BUILDINGS = {
  farm:{id:'farm',name:'Farm',desc:'Terraced gardens produce food for meals and recovery.',cost:{coins:45,ore:8,energy:0},production:'food',rate:12,capacity:30,color:'#94b965'},
  mine:{id:'mine',name:'Mine',desc:'A safe salvage shaft produces ore for buildings and equipment.',cost:{coins:55,ore:10,energy:0},production:'ore',rate:9,capacity:24,color:'#aa99a8'},
  extractor:{id:'extractor',name:'Energy Extractor',desc:'Converts harmless clock eddies into construction energy.',cost:{coins:60,ore:12,energy:2},production:'energy',rate:6,capacity:18,color:'#79cbd1'},
  forge:{id:'forge',name:'Community Forge',desc:'Every rank reduces equipment upgrade costs by 10%.',cost:{coins:80,ore:16,energy:4},bonus:{forgeDiscount:0.1},color:'#e79768'},
  barracks:{id:'barracks',name:'Rescue Barracks',desc:'Training and shelter grant the party +18 maximum HP per rank.',cost:{coins:65,ore:12,energy:3},bonus:{maxHp:18},color:'#d29d7b'},
  archive:{id:'archive',name:'Memory Archive',desc:'Shared research grants the party +3 magic per rank.',cost:{coins:65,ore:12,energy:4},bonus:{mag:3},color:'#ab8aca'},
  walls:{id:'walls',name:'Shelter Walls',desc:'Protective craft grants the party +2 defense per rank.',cost:{coins:60,ore:16,energy:2},bonus:{def:2},color:'#b2a18c'},
};

export const ENEMIES = {
  rat:{id:'rat',name:'Slag Rat',hp:58,atk:16,mag:10,def:3,spd:12,xp:25,coins:16,ore:3,loot:'slag_tooth',color:'#c89575'},
  scrapper:{id:'scrapper',name:'Rust Scrapper',hp:82,atk:20,mag:8,def:5,spd:13,xp:40,coins:24,ore:5,color:'#c98967'},
  hound:{id:'hound',name:'Mutant Hound',hp:108,atk:24,mag:12,def:5,spd:16,xp:50,coins:30,ore:4,color:'#ab6e73'},
  stalker:{id:'stalker',name:'Bog Stalker',hp:122,atk:28,mag:20,def:6,spd:14,xp:60,coins:33,ore:5,loot:'mire_charm',color:'#91c58f'},
  gravbot:{id:'gravbot',name:'Gravbot',hp:230,atk:36,mag:28,def:18,spd:10,xp:90,coins:48,ore:10,color:'#96c6cf'},
  mire_hulk:{id:'mire_hulk',name:'Mire Hulk',hp:210,atk:31,mag:18,def:12,spd:10,xp:75,coins:42,ore:8,color:'#8b9c69'},
  neon_cultist:{id:'neon_cultist',name:'Neon Cultist',hp:185,atk:22,mag:42,def:7,spd:16,xp:90,coins:48,ore:6,color:'#ed76bf'},
  sandworm_hatchling:{id:'sandworm_hatchling',name:'Sandworm Hatchling',hp:240,atk:38,mag:18,def:11,spd:11,xp:95,coins:52,ore:9,color:'#d7ab70'},
  frost_revenant:{id:'frost_revenant',name:'Frost Revenant',hp:250,atk:42,mag:32,def:14,spd:14,xp:110,coins:58,ore:10,color:'#abcce2'},
  magma_behemoth:{id:'magma_behemoth',name:'Magma Behemoth',hp:340,atk:44,mag:28,def:15,spd:11,xp:130,coins:68,ore:14,color:'#e5a16b'},
  warden:{id:'warden',name:'Mire Warden',hp:450,atk:34,mag:27,def:9,spd:13,xp:145,coins:145,ore:25,energy:10,loot:'moss_ward',boss:true,color:'#8fcbb0'},
  golem:{id:'golem',name:'Ember Golem',hp:180,atk:36,mag:24,def:13,spd:11,xp:75,coins:40,ore:8,color:'#ee9268'},
  emberlord:{id:'emberlord',name:'Ember Lord',hp:720,atk:43,mag:35,def:12,spd:14,xp:195,coins:180,ore:30,energy:14,loot:'magma_blade',boss:true,color:'#fa9270'},
  wolf:{id:'wolf',name:'Glacier Wolf',hp:158,atk:35,mag:22,def:8,spd:19,xp:80,coins:42,ore:6,color:'#a6dce9'},
  colossus:{id:'colossus',name:'Frost Colossus',hp:900,atk:47,mag:39,def:16,spd:12,xp:240,coins:210,ore:34,energy:18,loot:'frost_plate',boss:true,color:'#b2d8ef'},
  drone:{id:'drone',name:'Drone Sentinel',hp:168,atk:36,mag:34,def:10,spd:17,xp:80,coins:45,ore:7,loot:'swamp_coil',color:'#c3cbd2'},
  wraith:{id:'wraith',name:'Wraith Core',hp:194,atk:30,mag:43,def:8,spd:16,xp:95,coins:52,ore:8,color:'#c7a5ed'},
  herald:{id:'herald',name:'Architect’s Herald',hp:420,atk:48,mag:44,def:15,spd:16,xp:170,coins:120,ore:18,energy:8,loot:'void_scepter',color:'#d6a8d2'},
  architect:{id:'architect',name:'The Architect',hp:2100,atk:60,mag:54,def:19,spd:15,xp:420,coins:360,ore:60,energy:30,boss:true,color:'#efcab1'},
};
