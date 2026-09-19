import {configureRegionalInterior} from './regional-interior-layout.js';
import {NPC_IDENTITIES,npcIdentity,npcPresent} from './npc-identities.js';
import {configureHaventideInterior} from './haventide-interior-layout.js';
// Authored geography. Coordinates are native pixels; every door is anchored at its threshold.
const W = 4608, H = 2016;
const point = (x,y) => ({x,y});
const road = (...pts) => pts.map(p=>point(...p));
const obj = (id,type,x,y,extra={}) => ({id,type,x,y,...extra});
const encounter = (id,x,y,enemies,extra={}) => obj(id,'encounter',x,y,{enemies,...extra});
const consoleAt = (id,name,x,y,extra={})=>obj(id,'console',x,y,{name,...extra});
const pickup = (id,item,x,y,amount=1)=>obj(id,'pickup',x,y,{item,amount,name:'Recovered supplies'});
const landmark = (id,name,x,y,style='ring',extra={})=>obj(id,'landmark',x,y,{name,style,...extra});
const sign = (id,name,x,y,dialogue)=>obj(id,'sign',x,y,{name,dialogue});
const camp = (id,x,y)=>obj(id,'camp',x,y,{name:'Wayfarer’s rest',service:'rest'});
const regions = [
 {id:'haventide',name:'Haventide',subtitle:'The coast remembers',biome:'coast',spawn:point(420,1060),town:{id:'haventide',name:'Haventide',x:1110,y:1010},roads:[road([100,1080],[560,1050],[1110,1060],[1580,1040],[2170,1190],[2790,1080],[3430,900],[3940,960],[4510,1080]),road([1110,1060],[1270,760],[1780,520],[2360,550],[2790,1080]),road([2170,1190],[2200,1550],[3010,1590],[3430,900])],water:[[[0,1200],[320,1135],[590,1190],[1060,1160],[1410,1280],[1940,1360],[2300,1610],[2810,1720],[3350,1650],[3800,1440],[4250,1500],[4608,1390],[4608,2016],[0,2016]]],groves:[[210,680,260,250,22],[830,590,300,270,26],[1500,820,230,170,16],[1780,1530,210,120,13],[2680,500,430,230,40],[3350,470,270,210,24],[3820,1220,310,160,22],[4100,450,240,200,21]],objects:[
  obj('hav_cypress_1','tree',140,940,{variant:3,size:1.5,solid:true,w:28,h:18}),obj('hav_cypress_2','tree',205,905,{variant:3,size:1.2,solid:true,w:23,h:16}),obj('hav_bough_1','tree',740,925,{variant:0,size:1.28,solid:true,w:26,h:16}),obj('hav_bough_2','tree',815,845,{variant:1,size:1.2,solid:true,w:26,h:16}),obj('hav_ruin_opening','ruin',300,925,{variant:2,solid:true,w:105,h:40}),landmark('tide_ring','The broken listening ring',630,1210,'ring',{size:1.12}),consoleAt('hav_beacon','The listening beacon',500,1040,{style:'beacon',solid:true,w:38,h:18}),sign('hav_waystone','The old coast road',860,1110,'Haventide → • the pier bell has fallen silent. The sea road continues east.'),encounter('hav_first',850,1045,['rust_scrapper'],{name:'Salt-rusted scavenger'}),encounter('hav_guard',1110,1042,['drone_sentinel'],{name:'The silent gate',guard:'haventide'}),camp('hav_camp',1590,990),encounter('hav_road',1860,1115,['rust_scrapper','slag_rat']),consoleAt('coastal_cache','A weathered signal crate',1750,525),encounter('hav_crabway',2360,590,['bog_stalker','drone_sentinel']),landmark('hav_dish','The gull crown',2530,1160,'dish'),encounter('hav_road_east',3050,1040,['rust_scrapper','drone_sentinel']),consoleAt('well_filter','The tide filter',2220,1540),pickup('hav_hidden_med','field_tonic',780,760,2),pickup('hav_ore_cache','ore',2860,550,24),pickup('hav_coast_food','food',1550,1300,16),landmark('hav_arch','Saltway arch',4090,970,'arch'),encounter('hav_east_sentries',4090,990,['drone_sentinel','slag_rat']),obj('mara','npc',1160,920,{name:'Mara',dialogue:'The town is waiting for someone to open its doors.'})]},
 {id:'emberline',name:'Emberline',subtitle:'A hundred roads, one horizon',biome:'desert',spawn:point(130,1080),town:{id:'emberline',name:'The Lantern Exchange',x:1870,y:1050},roads:[road([100,1080],[760,1090],[1340,950],[1870,1090],[2460,1030],[3030,880],[3650,1030],[4510,1080]),road([1870,1090],[2130,1470],[2460,1900]),road([3030,880],[3350,560],[3730,120]),road([760,1090],[830,590],[1360,410],[2350,520],[2460,1030])],water:[],groves:[[350,440,220,160,10],[1000,1560,300,220,15],[2800,1530,250,190,13],[3960,540,240,250,12]],objects:[encounter('ember_arrival',650,1080,['slag_rat','mutant_hound']),landmark('ember_caravan','Caravan of the last rain',970,1220,'caravan'),obj('mara_convoy','npc',1020,1160,{name:'Mara’s caravan'}),encounter('ember_guard',1870,1082,['gravbot','drone_sentinel'],{guard:'emberline',name:'Exchange blockade'}),camp('ember_camp',2350,1070),landmark('ember_lens','The starless observatory',1360,455,'dish',{size:1.5}),encounter('ember_signal',1360,475,['neon_cultist','drone_sentinel'],{boss:true,name:'The stolen signal'}),consoleAt('ember_observatory','Observatory lens',1360,400),consoleAt('signal_receiver','Caravan receiver',2700,1500),encounter('ember_dunes',2950,930,['sandworm','slag_rat']),encounter('ember_road_east',3890,1050,['mutant_hound','gravbot']),encounter('ember_north_patrol',3400,510,['neon_cultist','mutant_hound']),landmark('ember_ribs','The whale of iron',4100,1410,'bones',{size:1.8}),pickup('ember_sand_cache','ether_cell',4070,1390,2),pickup('ember_ore','ore',2820,1560,45),sign('ember_forest_sign','The southern branch',2380,1700,'South: Forest Veil. Follow the old watercourse beneath the trees.'),sign('ember_crater_sign','The furnace road',3550,350,'North: Crater Ember. Heat shields and an Ascendant settlement are required.')]},
 {id:'forest_veil',name:'Forest Veil',subtitle:'A green sea above the roots',biome:'forest',spawn:point(2430,170),roads:[road([2460,100],[2390,510],[1710,700],[920,1060],[1580,1380],[2230,1220],[2960,1140],[3650,1350],[4510,1250]),road([1710,700],[1090,400],[420,570],[380,1180],[920,1060]),road([2390,510],[3170,430],[3660,760],[3650,1350])],water:[[[2630,0],[2700,430],[2540,720],[2580,1010],[2820,1360],[2830,1680],[3150,2016],[3290,2016],[2970,1630],[2950,1320],[2710,970],[2700,720],[2820,430],[2760,0]]],groves:[[500,340,420,220,36],[1000,850,300,230,24],[580,1570,380,280,45],[1610,1740,470,210,48],[1890,410,250,210,22],[3220,620,430,320,40],[3990,430,350,260,36],[4000,1650,380,190,32]],objects:[landmark('forest_greatroot','The glasswood elder',2050,810,'greattree',{size:1.7}),encounter('forest_entry',2330,550,['mutant_hound','bog_stalker']),encounter('forest_hollows',1070,1080,['mire_hulk','slag_rat']),camp('forest_camp',1640,1320),consoleAt('vex_record','The unburned record',1080,400),consoleAt('seed_vault','The sleeping seed vault',410,570),encounter('forest_warden',3520,1180,['mire_warden'],{boss:true,name:'Keeper of the first root'}),consoleAt('forest_heart','Heartwood relay',3570,1080),encounter('forest_east',4070,1290,['mutant_hound','bog_stalker','slag_rat']),pickup('forest_herbs','field_tonic',650,1530,4),pickup('forest_energy','energy',3080,380,30),landmark('forest_arch','Root-wrapped aqueduct',2820,1140,'arch',{size:1.4}),sign('forest_mire_sign','The reed road',4270,1320,'Mire Bog →. Its archive sleeps beneath the black water.')]},
 {id:'mire_bog',name:'Mire Bog',subtitle:'Every drowned voice has a name',biome:'mire',spawn:point(140,1250),roads:[road([100,1250],[670,1240],[1150,980],[1770,1170],[2390,1360],[3100,1140],[3690,880],[4260,1050]),road([1150,980],[1390,540],[2260,440],[2950,700],[3100,1140]),road([1770,1170],[1670,1640],[2480,1680],[3100,1140])],water:[[[0,0],[4608,0],[4608,2016],[0,2016]]],islands:[[600,1180,660,155],[1280,800,650,570],[1910,1250,680,520],[2580,1400,560,460],[3200,1020,610,420],[3910,990,550,450],[2150,420,520,270]],groves:[[510,900,250,120,25],[1130,510,290,140,25],[2000,1430,280,160,28],[3250,830,230,160,25],[4050,1160,260,180,28]],objects:[landmark('mire_bell','The drowned bell',720,1210,'bell'),encounter('mire_entry',950,1090,['bog_stalker','slag_rat']),encounter('mire_pool',2000,1240,['mire_hulk','mutant_hound']),camp('mire_camp',2380,1320),encounter('mire_warden',3910,980,['mire_warden','bog_stalker'],{boss:true,name:'The keeper beneath'}),consoleAt('mire_archive','The submerged archive',4050,990),consoleAt('mire_memorial','Names below the water',2280,440),encounter('mire_west',1440,580,['bog_stalker','bog_stalker']),encounter('mire_steppingstones',2810,1610,['mire_hulk']),pickup('mire_coil','swamp_coil',2900,700),pickup('mire_food','food',1620,1630,40),landmark('mire_memory','A choir of broken masts',3250,1130,'masts'),sign('mire_warning','The low-water marker',3460,1030,'The archive keeper binds the marsh. Interrupt its gathering roots before they close.')]},
 {id:'crater_ember',name:'Crater Ember',subtitle:'The world’s warm heart',biome:'volcanic',spawn:point(700,1860),roads:[road([700,1910],[850,1490],[1460,1260],[2120,1500],[2890,1160],[3480,960],[4180,740]),road([1460,1260],[1510,710],[2190,410],[2950,490],[3480,960]),road([2120,1500],[2980,1720],[3710,1440],[4180,740])],water:[[[1780,690],[2170,600],[2570,780],[2750,1040],[2610,1390],[2100,1370],[1810,1110]],[[3190,0],[3250,470],[3700,560],[3950,420],[4608,320],[4608,0]]],groves:[[360,1100,200,230,12],[960,400,230,220,13],[3230,1440,170,150,13],[4060,1640,220,130,15]],objects:[landmark('crater_furnace','The second sunrise',2410,1040,'furnace',{size:2}),encounter('crater_entry',1080,1400,['ember_golem','gravbot']),camp('crater_camp',1550,1170),encounter('crater_bridge',2890,1160,['magma_behemoth'],{boss:true,name:'The bridge of cinders'}),encounter('crater_north',2420,430,['neon_cultist','ember_golem']),encounter('crater_lord',4130,760,['ember_lord'],{boss:true,name:'The furnace sovereign'}),consoleAt('crater_forge','The sun-forge',4260,690),encounter('crater_south',3250,1610,['ember_golem','slag_rat','slag_rat']),consoleAt('crater_pressure','Pressure manifold',3700,1430),pickup('crater_blade','magma_blade',2190,390),pickup('crater_energy','energy',3890,1470,60),landmark('crater_gate','The basalt teeth',3500,960,'arch',{size:1.5}),sign('crater_warning','A melted warning',3980,900,'When the sovereign opens its furnace, guard. The next breath carries the mountain.')]},
 {id:'orbital_reach',name:'Orbital Reach',subtitle:'The stairway that fell',biome:'snow',spawn:point(130,1080),town:{id:'orbital_reach',name:'Anchor Nine',x:1730,y:1020},roads:[road([100,1080],[760,1140],[1250,1020],[1730,1060],[2350,930],[3020,1110],[3740,990],[4510,1080]),road([1250,1020],[1010,620],[1090,110]),road([2350,930],[2550,510],[3320,510],[3740,990]),road([1730,1060],[1730,1480],[2660,1580],[3020,1110])],water:[[[0,1680],[630,1540],[1250,1620],[1700,1790],[2510,1840],[3060,1690],[3810,1720],[4608,1500],[4608,2016],[0,2016]]],groves:[[540,600,280,210,25],[1330,450,200,200,17],[2170,1410,250,170,20],[3130,440,350,180,30],[3870,1330,260,180,23]],objects:[landmark('orbital_tether','The broken stair',2240,1040,'elevator',{size:1.6}),encounter('orbital_entry',760,1140,['glacier_wolf','neon_cultist']),encounter('orbital_guard',1730,1052,['frost_revenant','gravbot'],{guard:'orbital_reach',name:'Anchor Nine’s sentry'}),consoleAt('orbital_lift','The elevator oath',2300,950),camp('orbital_camp',2730,1120),encounter('orbital_east',3430,1020,['frost_revenant','glacier_wolf']),encounter('orbital_upper',3100,510,['neon_cultist','sandworm']),consoleAt('orbital_blackbox','The anchor’s black box',2620,1520),pickup('orbital_ether','ether_cell',3210,470,4),pickup('orbital_ore','ore',1600,1450,70),landmark('orbital_arch','The white procession',4100,1000,'arch',{size:1.6}),sign('orbital_frost_sign','The rescue road',1070,310,'Frost Canyon ↑. Rune knows the old rescue marks.')]},
 {id:'frost_canyon',name:'Frost Canyon',subtitle:'Keep a light for the lost',biome:'ice',spawn:point(1120,1860),roads:[road([1120,1910],[1120,1480],[660,1160],[1330,880],[2080,1010],[2790,770],[3530,1120],[4180,810]),road([2080,1010],[1920,1460],[2730,1650],[3530,1120]),road([1330,880],[1160,470],[2310,420],[2790,770])],water:[[[1530,0],[1440,510],[1590,730],[1740,1120],[1600,1540],[1740,2016],[1920,2016],[1780,1510],[1930,1120],[1770,720],[1630,460],[1710,0]],[[3340,0],[3170,430],[3260,830],[3390,1330],[3110,1750],[3200,2016],[3350,2016],[3290,1730],[3570,1370],[3460,810],[3360,450],[3510,0]]],groves:[[530,560,240,190,23],[790,1450,250,200,20],[2380,1220,250,170,23],[3780,600,270,180,22],[4210,1510,230,210,20]],objects:[landmark('frost_shards','The seven listeners',2430,1020,'ice',{size:1.8}),encounter('frost_entry',950,1370,['glacier_wolf','glacier_wolf']),camp('frost_camp',2050,1000),obj('mara_lantern','npc',2050,945,{name:'Mara • Keeper of lights'}),encounter('frost_revenants',1220,510,['frost_revenant','neon_cultist']),encounter('frost_crossing',3050,940,['frost_revenant','glacier_wolf','glacier_wolf']),encounter('frost_colossus',4160,830,['frost_colossus'],{boss:true,name:'The last rescue engine'}),consoleAt('frost_beacon','The midnight beacon',4290,760,{style:'beacon',solid:true,w:38,h:18}),pickup('frost_plate_cache','frost_plate',2360,440),pickup('frost_food','food',2670,1610,60),landmark('frost_rescue','The silent rescue camp',2850,1560,'caravan'),sign('frost_warning','A sentinel’s field note',3850,1020,'The colossus gathers its storm in plain sight. Brace together when its heart turns white.')]},
 {id:'last_crown',name:'Last Crown',subtitle:'A garden made of human wishes',biome:'alien',spawn:point(130,1080),town:{id:'last_crown',name:'The Open Hand',x:1980,y:1110},roads:[road([100,1080],[700,950],[1290,1150],[1980,1140],[2670,1210],[3250,930],[3930,900],[4380,410]),road([1290,1150],[1480,600],[2240,440],[3040,590],[3250,930]),road([1980,1140],[2260,1630],[3290,1600],[3930,900])],water:[[[0,1520],[840,1490],[1630,1750],[2120,1860],[3030,1810],[3600,1900],[4608,1680],[4608,2016],[0,2016]],[[2570,0],[2590,370],[2780,710],[2790,900],[2960,950],[2970,690],[2770,350],[2790,0]]],groves:[[580,510,250,210,26],[920,1370,230,160,17],[1780,470,250,220,26],[2500,1500,230,160,24],[3540,490,270,220,26],[4120,1350,270,200,30]],objects:[landmark('crown_hand','The first gardener',760,1110,'hand',{size:1.8}),encounter('crown_entry',1090,1080,['wraith_core','gravbot']),encounter('crown_guard',1980,1142,['wraith_core','neon_cultist'],{guard:'last_crown',name:'The garden’s closed hand'}),camp('crown_camp',2500,1220),encounter('crown_herald',3230,940,['architect_herald'],{boss:true,name:'The voice of perfect things'}),consoleAt('crown_memory','The memory orchard',3360,820),encounter('crown_garden',1610,560,['mire_warden','neon_cultist']),encounter('crown_south',3100,1610,['wraith_core','wraith_core']),landmark('crown_spire','The unmade palace',4330,560,'palace',{size:2}),encounter('void_architect',4320,450,['void_architect'],{boss:true,name:'The Void Architect',requires:'final_ready'}),consoleAt('crown_last_word','A world left unfinished',4420,390),pickup('crown_scepter','void_scepter',2240,450),pickup('crown_energy','energy',3300,1560,90),sign('crown_warning','The last threshold',4070,690,'Beyond this threshold waits the one who made the silence. Bring the four living seals, the memory of the Crown, and a Transcendent settlement.')]}
];
export const REGIONS = Object.fromEntries(regions.map(r=>[r.id,{...r,width:W,height:H,era:'present',portals:[]} ]));
const interiors = {};
function addPortal(region,id,x,y,to,sx,sy,name,requires) { const p=obj(id,'portal',x,y,{to,spawn:point(sx,sy),name,requires}); REGIONS[region].portals.push(p); return p; }
addPortal('haventide','hav_to_ember',4510,1080,'emberline',160,1080,'Saltway • Emberline','beacon_restored');
addPortal('emberline','ember_to_hav',100,1080,'haventide',4450,1080,'Saltway • Haventide');
addPortal('emberline','ember_to_orbital',4510,1080,'orbital_reach',160,1080,'The high road • Orbital Reach',{tier:2,flag:'vex_recruited'});
addPortal('orbital_reach','orbital_to_ember',100,1080,'emberline',4450,1080,'The high road • Emberline');
addPortal('emberline','ember_to_forest',2460,1900,'forest_veil',2430,170,'The green road • Forest Veil','vex_recruited');
addPortal('forest_veil','forest_to_ember',2460,100,'emberline',2460,1840,'The green road • Emberline');
addPortal('forest_veil','forest_to_mire',4510,1250,'mire_bog',160,1250,'Reed causeway • Mire Bog','forest_seal');
addPortal('mire_bog','mire_to_forest',100,1250,'forest_veil',4450,1250,'Reed causeway • Forest Veil');
addPortal('emberline','ember_to_crater',3730,120,'crater_ember',700,1850,'The furnace road • Crater Ember',{tier:3});
addPortal('crater_ember','crater_to_ember',700,1910,'emberline',3730,190,'The furnace road • Emberline');
addPortal('orbital_reach','orbital_to_frost',1090,110,'frost_canyon',1120,1850,'The rescue road • Frost Canyon','rune_recruited');
addPortal('frost_canyon','frost_to_orbital',1120,1910,'orbital_reach',1090,175,'The rescue road • Orbital Reach');
addPortal('orbital_reach','orbital_to_crown',4510,1080,'last_crown',160,1080,'The garden road • Last Crown',{tier:3,flag:'rune_recruited'});
addPortal('last_crown','crown_to_orbital',100,1080,'orbital_reach',4450,1080,'The garden road • Orbital Reach');
const guards = {haventide:'hav_guard',emberline:'ember_guard',orbital_reach:'orbital_guard',last_crown:'crown_guard'};

for(const r of Object.values(REGIONS)) {
 if(r.town) {
  const t=r.town, id=r.id+'_town';
  // Put the visible blockade on the approach, clear of the building artwork.
  Object.assign(r.objects.find(o=>o.id===guards[r.id]),{x:t.x-44,y:t.y+68,gateName:t.name});
  r.objects.push(obj(r.id+'_entrance','town',t.x,t.y,{name:t.name,to:id,spawn:point(640,795),guard:guards[r.id],requires:r.id+'_liberated',solid:true,w:200,h:100}));
  const s={id,name:t.name,subtitle:'A place worth rebuilding',biome:r.biome,width:1280,height:900,interior:true,townId:r.id,kind:'town',spawn:point(640,795),roads:[],objects:[],portals:[obj(id+'_exit','portal',640,836,{name:'Return to '+r.name,to:r.id,spawn:point(t.x,t.y+74)})],walkAreas:[{x:60,y:110,w:1160,h:740}]};
  ['provisions','smith','inn','archivist','artificer','trainer'].forEach((service,i)=>{const x=[260,640,1020][i%3],y=i<3?310:585; s.objects.push(obj(r.id+'_'+service,'npc',x,y,{name:NPC_IDENTITIES[r.id+'_'+service].name,service,unlockTier:i<3?1:i===4?3:2,stall:true,solid:true,w:70,h:32}));});
  s.objects.push(obj(r.id+'_board','console',640,445,{name:'Settlement works',service:'construction'}),obj(r.id+'_resident','npc',845,725,{name:NPC_IDENTITIES[r.id+'_resident'].name,dialogue:'We were afraid this place would become another empty room. Thank you for opening the doors.'}));
  if(r.id==='haventide') {s.objects.push(obj('mara','npc',415,705,{name:'Mara'}),consoleAt('ending_beacon','The evening bell',1120,730)); r.objects=r.objects.filter(o=>o.id!=='mara');}
  if(r.id==='emberline') s.objects.push(obj('vex','npc',410,705,{name:'Vex',hero:'vex'}));
  if(r.id==='orbital_reach') s.objects.push(obj('rune','npc',410,705,{name:'Rune',hero:'rune'}));
  if(r.id==='last_crown') s.objects.push(consoleAt('rune_oath','The sentinel’s oath',1110,725));
  interiors[id]=s;
 }
}
const dwellings = {
 haventide:[['hav_house','The keeper’s cottage',1500,650],['hav_cave','Tideglass grotto',3290,690]],
 emberline:[['ember_house','A caravanserai',2860,1450],['ember_cave','The blue cistern',910,490]],
 forest_veil:[['forest_house','The seedkeeper’s cabin',1510,1250],['forest_cave','The root archive',3240,430]],
 mire_bog:[['mire_house','Reed-lantern refuge',2260,430],['mire_cave','The submerged annex',4150,1080]],
 crater_ember:[['crater_house','The furnace shelter',1560,640],['crater_cave','Obsidian gallery',3530,1460]],
 orbital_reach:[['orbital_house','The anchor keeper’s hut',2600,460],['orbital_cave','Buried station',2750,1520]],
 frost_canyon:[['frost_house','The last watchhouse',2670,1550],['frost_cave','The names in the ice',1190,410]],
 last_crown:[['crown_house','A room for tomorrow',2250,1510],['crown_cave','The unfinished gallery',1510,550]]
};
for (const [region,entries] of Object.entries(dwellings)) {
 for (const [id,name,x,y] of entries) {
  const cave=id.includes('cave'), r=REGIONS[region], sx=cave?200:384, sy=cave?780:490;
  r.objects.push(obj(id+'_door',cave?'cave':'house',x,y,{name,to:id,spawn:point(sx,sy),solid:true,w:cave?120:100,h:cave?50:65}));
  r.roads.push(road([x,y+45],closestRoadPoint(r,x,y+45)));
  const s={id,name,subtitle:cave?'Beneath the old world':'A light in the wilderness',biome:r.biome,interior:true,kind:cave?'cave':'house',width:cave?1280:768,height:cave?960:600,spawn:point(sx,sy),roads:[],objects:[],portals:[obj(id+'_exit','portal',sx,sy+44,{name:'Return to '+r.name,to:region,spawn:point(x,y+68)})]};
  s.walkAreas=cave?[{x:70,y:600,w:410,h:250},{x:290,y:420,w:210,h:320},{x:380,y:320,w:360,h:260},{x:680,y:390,w:200,h:150},{x:820,y:220,w:340,h:320},{x:910,y:470,w:180,h:250},{x:590,y:630,w:470,h:190}]:[{x:55,y:95,w:658,h:445}];
  if(cave) {s.objects.push(landmark(id+'_field_station','The last survey station',115,700,'interior_supply',{solid:true,w:65,h:30}),pickup(id+'_supply','ether_cell',980,690,2),consoleAt(id+'_record','An old field record',1010,310,{dialogue:'Someone kept this place lit until the very end. Their notebook ends with a list of names, and the words: let there be another morning.'}),landmark(id+'_relic','A memory under stone',565,400,'relic'));}
  else {s.objects.push(obj(id+'_keeper','npc',260,245,{name:'The keeper of '+name,dialogue:'Rest by the lamp. The road is long, but it is a road again.',service:'rest'}),pickup(id+'_food','food',600,170,12),consoleAt(id+'_letter','A letter on the table',510,280,{dialogue:'If you find this room, use it. A door is a promise that someone may come home.'}));}
  if(id==='mire_cave')s.objects.push(consoleAt('vex_echo','The missing countervoice',990,355));
  if(id==='frost_cave')s.objects.push(consoleAt('rune_names','The names of the Ninth',1000,350));
  interiors[id]=s;
 }
}
REGIONS.frost_canyon.roads[0].splice(1,0,point(1090,1760),point(1210,1635));
REGIONS.frost_canyon.objects.push(obj('frost_entry_column','tree',900,1780,{variant:1,size:1.16,solid:true,w:32,h:23}),obj('frost_entry_beacon','tree',1300,1720,{variant:3,size:1.02,solid:true,w:28,h:22}),obj('frost_entry_stone','rock',950,1660,{solid:true,w:49,h:24}));
REGIONS.last_crown.objects.push(obj('crown_entry_tree','tree',300,970,{variant:1,size:1.14,solid:true,w:34,h:25}),obj('crown_entry_antenna','tree',525,1240,{variant:3,size:.97,solid:true,w:26,h:22}),obj('crown_entry_stone','rock',410,1265,{solid:true,w:53,h:25}));
REGIONS.orbital_reach.objects.push(obj('orbital_entry_pine','tree',270,947,{variant:1,size:1.13,solid:true,w:32,h:23}),obj('orbital_entry_anchor','tree',567,1280,{variant:3,size:1.17,solid:true,w:30,h:24}),obj('orbital_entry_stone','rock',380,1290,{solid:true,w:57,h:26}));
REGIONS.crater_ember.objects.push(obj('crater_entry_tree','tree',480,1780,{variant:1,size:1.12,solid:true,w:35,h:24}),obj('crater_entry_pressure','tree',910,1630,{variant:3,size:.97,solid:true,w:27,h:24}),obj('crater_entry_obsidian','rock',587,1660,{solid:true,w:55,h:27}));
REGIONS.crater_ember.water.push([[950,1740],[1080,1640],[1150,1650],[1160,1840],[1080,1920],[980,1900]]);
REGIONS.forest_veil.roads[0].splice(1,0,point(2440,290));
REGIONS.mire_bog.objects.push(obj('mire_entry_willow','tree',270,1090,{variant:1,size:.97,solid:true,w:32,h:26}),obj('mire_entry_bell','tree',610,1320,{variant:3,size:.93,solid:true,w:23,h:23}));
REGIONS.forest_veil.objects.push(obj('forest_entry_root_left','tree',2190,340,{variant:1,size:1.07,solid:true,w:34,h:25}),obj('forest_entry_root_right','tree',2640,330,{variant:0,size:1.36,solid:true,w:38,h:27}));
// Emberline's first bend is framed by a copper cactus and an old wind-marker.
REGIONS.emberline.objects.push(
 obj('ember_gate_cactus','tree',245,943,{variant:1,size:1.05,solid:true,w:30,h:24}),
 obj('ember_gate_windmark','tree',423,972,{variant:3,size:.86,solid:true,w:20,h:20}),
 obj('ember_dune_cactus','tree',574,1275,{variant:2,size:1.17,solid:true,w:33,h:24}),
 obj('ember_gate_stone','rock',455,1265,{variant:1,solid:true,w:70,h:34}),
 obj('ember_pass_arch','ruin',1240,1250,{variant:2,solid:true,w:104,h:38})
);
// Civic plots form a small uphill settlement around the covered market. Their clearings
// are reserved before grove placement so construction never encloses an existing route.
const civicPlots=[
 ['farm','Terraced gardens',1080,655,168,76],
 ['mine','The stoneworks',1790,350,166,74],
 ['energy_extractor','Tidal energy works',1680,1343,165,65],
 ['barracks','The watch yard',870,745,158,74],
 ['forge','Saltforge works',1455,900,156,72],
 ['research_lab','The signal laboratory',1390,440,165,74],
 ['walls','The north gate',1190,835,165,65]
];
for(const [building,name,x,y,w,h]of civicPlots){const r=REGIONS.haventide;r.objects.push(landmark('hav_plot_'+building,name,x,y,'building',{building,solid:true,w,h}));
 // The tidal works sit on the coast; approach from land instead of paving into the sea.
 const approachY=building==='energy_extractor'?y-h-24:y+58;
 r.roads.push(road([x,approachY],closestRoadPoint(r,x,approachY)));
}
REGIONS.haventide.objects.find(o=>o.id==='haventide_entrance').building='town_center';
// Groves are authored by their mass and clearing shape. Individual trees have deterministic silhouettes.
function hash(n){n=Math.imul(n^(n>>>16),0x45d9f3b);return ((n^(n>>>16))>>>0)/4294967296;}
function closestRoadPoint(r,x,y){let best=[x,y],dist=Infinity;for(const rr of r.roads)for(let i=1;i<rr.length;i++){const a=rr[i-1],b=rr[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy))),px=a.x+t*dx,py=a.y+t*dy,d=(x-px)**2+(y-py)**2;if(d<dist){dist=d;best=[px,py];}}return best;}
for(const [ri,r] of Object.values(REGIONS).entries()) {
 r.groves.forEach(([cx,cy,rx,ry,count],gi)=>{for(let n=0;n<count;n++){const seed=ri*9029+gi*311+n*71+9,a=hash(seed)*Math.PI*2,rr=Math.sqrt(hash(seed+19)),x=Math.round(cx+Math.cos(a)*rx*rr),y=Math.round(cy+Math.sin(a)*ry*rr);if(distanceToRoad(r,x,y)<70||r.objects.some(o=>o.building?Math.abs(x-o.x)<o.w/2+58&&Math.abs(y-o.y)<o.h+75:Math.hypot(x-o.x,y-o.y)<85)||terrainAt(r,x,y)==='water')continue;r.objects.push(obj(`${r.id}_tree_${gi}_${n}`,'tree',x,y,{variant:Math.floor(hash(seed+4)*4),size:.8+hash(seed+11)*.65,solid:true,w:20,h:15}));}});
 // Long abandoned structures punctuate each leg, rather than evenly filling open ground.
 const ruins=[[630,780],[1420,1440],[2190,740],[3090,1360],[3930,620]];
 ruins.forEach(([x,y],i)=>{if(distanceToRoad(r,x,y)<100||terrainAt(r,x,y)==='water')return;r.objects.push(obj(r.id+'_ruin_'+i,'ruin',x,y,{variant:i%3,solid:true,w:105,h:40}));});
 const boulders=[[480,960],[1320,760],[2020,1090],[2580,680],[3340,1490],[4190,1210],[3840,800]];
 boulders.forEach(([x,y],i)=>{if(distanceToRoad(r,x,y)<65||terrainAt(r,x,y)==='water')return;r.objects.push(obj(r.id+'_rock_'+i,'rock',x,y,{variant:i%3,solid:true,w:40,h:22}));});
}
export function getScene(id) {const scene=REGIONS[id]||interiors[id];if(!scene)throw new Error(`Unknown scene: ${id}`);return scene;}
export function distanceToRoad(scene,x,y) {let min=Infinity;for(const line of scene.roads||[])for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],vx=b.x-a.x,vy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/(vx*vx+vy*vy||1)));min=Math.min(min,Math.hypot(x-a.x-vx*t,y-a.y-vy*t));}return min;}
export function insidePolygon(x,y,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
export function terrainAt(scene,x,y){
 if(scene.interior)return 'ground';
 const d=distanceToRoad(scene,x,y);if(d<35)return 'path';
 if(scene.islands?.some(([cx,cy,rx,ry])=>(x-cx)**2/(rx*rx)+(y-cy)**2/(ry*ry)<1))return 'ground';
 if(scene.water?.some(poly=>insidePolygon(x,y,poly)))return 'water';
 return 'ground';
}
export function isWalkable(scene,x,y){
 // Navigation nodes and interpolated motion share the same microunit boundary.
 x=Math.round(x*1e6)/1e6;y=Math.round(y*1e6)/1e6;
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<18||y<35||x>scene.width-18||y>scene.height-18)return false;
 if(scene.interior&&!scene.walkAreas.some(a=>x>=a.x+7&&x<=a.x+a.w-7&&y>=a.y+7&&y<=a.y+a.h-7))return false;
 if(terrainAt(scene,x,y)==='water')return false;
 for(const o of scene.objects){if(!o.solid)continue;const w=o.w||24,h=o.h||18;const bottom=(o.type==='town'||o.type==='house'||o.type==='cave')?o.y-12:o.y+3;if(x>o.x-w/2-6&&x<o.x+w/2+6&&y>bottom-h-5&&y<bottom+6)return false;}
 return true;
}
export function safeArrival(scene,x,y){
 if(isWalkable(scene,x,y))return{x,y};
 // Renovations can replace a former corner with a wall or furnishing. Search
 // all eight directions so saved positions can move back onto nearby floor.
 for(let d=8;d<180;d+=8)for(const [dx,dy]of [[0,d],[d,0],[-d,0],[0,-d],[d,d],[-d,d],[d,-d],[-d,-d]])if(isWalkable(scene,x+dx,y+dy))return{x:x+dx,y:y+dy};
 throw Error(`No safe arrival near ${scene.id} ${x},${y}`);
}
function interactionDistance(o,x,y){
 const a=o.interactionArea;if(!a)return Math.hypot(o.x-x,o.y-y);
 return Math.hypot(Math.max(0,Math.abs(x-o.x-a.x)-a.w/2),Math.max(0,Math.abs(y-o.y-a.y)-a.h/2));
}
// The prompt and F/Space use this same list. Keep battle/portal ranges unchanged:
// their automatic activation remains a separate, much smaller distance check.
export function nearby(scene,x,y,state){
 return [...scene.objects,...scene.portals].filter(o=>
  !['tree','rock','ruin','landmark'].includes(o.type)&&npcPresent(o,state)&&
  !(o.hero&&state?.heroes?.some(h=>h.id===o.hero))&&
  (!o.unlockTier||(state?.tier||1)>=o.unlockTier)&&!state?.pickups?.[o.id]&&
  !(o.type==='encounter'&&state?.cleared?.[o.id]&&(o.boss||o.guard||o.flag))&&
  interactionDistance(o,x,y)<(o.type==='encounter'?52:o.type==='portal'?62:['town','house','cave'].includes(o.type)?96:72)
 ).sort((a,b)=>interactionDistance(a,x,y)-interactionDistance(b,x,y)||Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
}
// Buildings are wider than an NPC: reveal their name near the footprint, not only the anchor.
// This is informational and deliberately separate from the interactable-object list.
export function nearbyBuildings(scene,x,y,state){const distance=o=>Math.hypot(Math.max(0,Math.abs(x-o.x)-(o.w||0)/2),Math.max(0,y-o.y,o.y-(o.h||0)-y));return scene.objects.filter(o=>o.building&&state?.buildings?.[o.building]>0&&distance(o)<60).sort((a,b)=>distance(a)-distance(b));}
export const ALL_SCENES = {...REGIONS,...interiors};
// Each refuge preserves a different small human story; caves have distinct branches and loops.
const refugeStories={
 haventide:['Anja, keeper of the tide books','The old bell used to count fishing boats. Now I ring it for every traveler who comes back. Help yourself to the broth.','The tide book','Forty-seven boats left before the silence. Forty-six returned. Beside the last name someone has drawn a lantern, and keeps drawing it every year.'],
 emberline:['Perrin of the rain caravan','Every jar in this house has crossed the desert twice. Empty on the way out, full on the way home. That is what I call optimism.','A water merchant’s ledger','Paid in water: twelve blankets. Paid in songs: one broken telescope. Paid in promises: everything else.'],
 forest_veil:['Tala, the seedkeeper','The forest is not taking our cities back. It is using what we left. There is a difference. Sit, and listen to the roof grow.','A botanical field book','The roots follow buried signal cables. Their growth rings repeat the pulse heard at Haventide. Life learned to listen before we did.'],
 mire_bog:['Esme, ferrier of names','I used to ferry people. Now I ferry their names to the archive, so that someone will remember which way they were going.','A lantern-maker’s note','Never hang a lantern for the dead alone. Hang a second for whoever comes looking for them.'],
 crater_ember:['Toll, the furnace tender','The mountain has been working longer than we have. You learn respect quickly here. The shelter plates are cool enough to sleep against.','A shift roster','The final shift volunteered to stay until the evacuation rails cooled. In the margin: we will argue about overtime when you get back.'],
 orbital_reach:['Iri, anchor keeper','Do you know why they built a stairway to the sky? To come home by a different road. I prefer to remember that part.','A child’s star chart','This constellation is called Mother’s Window. This one is Father’s Shift. Every star has an ordinary name underneath its official one.'],
 frost_canyon:['Hale, rescuer of the Ninth','If you see a lamp through snow, walk toward it. If you carry a lamp, hold it high. We made the rules simple for a reason.','A rescue manual','Rule one: nobody walks behind the last lantern. Rule two: there is always room for another name on the return list.'],
 last_crown:['Ari, gardener of imperfect things','The Architect made a flawless orchard. No fruit ever fell. No seed ever grew. I have been teaching the trees to make mistakes.','A gardener’s journal','Day 411: the first crooked branch. Day 419: a bird built its nest there. I do not think I have ever been more proud of anything.']
};
for(const [region,[keeper,spoken,title,letter]]of Object.entries(refugeStories)){const houseId=dwellings[region][0][0],caveId=dwellings[region][1][0],house=interiors[houseId],caveScene=interiors[caveId];Object.assign(house.objects.find(o=>o.type==='npc'),{name:NPC_IDENTITIES[houseId+'_keeper'].name,dialogue:spoken});Object.assign(house.objects.find(o=>o.id===houseId+'_letter'),{name:title,dialogue:letter});caveScene.objects.find(o=>o.id===caveId+'_record').dialogue=letter;}
const cavePlans={
 hav_cave:[[70,600,410,250],[300,230,360,440],[620,330,250,160],[810,200,350,350],[850,530,250,280],[430,660,510,150]],
 ember_cave:[[70,600,430,250],[300,400,490,280],[460,220,650,240],[1000,420,100,300],[820,640,340,180]],
 forest_cave:[[70,610,440,250],[320,330,390,400],[680,380,220,120],[830,200,330,350],[910,500,140,180],[730,620,390,220]],
 mire_cave:[[70,600,440,250],[300,380,220,290],[480,320,300,200],[730,380,170,160],[830,220,350,330],[920,500,150,240],[620,640,440,180]],
 crater_cave:[[70,600,410,250],[310,300,370,360],[650,350,270,150],[830,180,350,400],[800,540,360,280],[420,660,440,150]],
 orbital_cave:[[70,600,420,250],[320,300,350,420],[640,340,230,150],[820,210,360,360],[850,530,260,300],[430,680,450,130]],
 frost_cave:[[70,600,460,250],[350,350,410,320],[720,360,190,170],[830,200,350,360],[910,510,130,230],[590,650,500,180]],
 crown_cave:[[70,600,430,250],[310,300,370,400],[650,350,250,150],[830,200,350,390],[820,550,320,300],[430,660,440,150]]
};
for(const [id,areas]of Object.entries(cavePlans))interiors[id].walkAreas=areas.map(([x,y,w,h])=>({x,y,w,h}));
// Haventide's covered market opens toward the player: the first three services are visible at entry.
const havenMarket=interiors.haventide_town;
for(const o of havenMarket.objects){if(o.stall){const index=['provisions','smith','inn','archivist','artificer','trainer'].indexOf(o.service);o.x=index<3?[400,640,880][index]:[260,640,1020][index-3];o.y=index<3?640:270;o.w=135;o.h=38;}if(o.service==='construction'){o.x=700;o.y=744;}}
havenMarket.objects.push(landmark('hav_market_pillar_left','The west aisle',300,735,'interior_column',{solid:true,w:135,h:35}),landmark('hav_market_pillar_right','The east aisle',980,735,'interior_column',{solid:true,w:135,h:35}),landmark('hav_market_table','The tide books',260,400,'interior_shelf',{solid:true,w:135,h:35}));
for(const s of Object.values(interiors).filter(s=>s.kind==='cave'))for(const o of s.objects)if(o.type==='console')o.fieldRecord=true;
REGIONS.forest_veil.quietAreas=[{x:2135,y:958,rx:385,ry:255}];
Object.assign(REGIONS.forest_veil.objects.find(o=>o.id==='forest_greatroot'),{solid:true,w:125,h:55});
REGIONS.forest_veil.objects.push(obj('forest_root_edge_left','tree',1760,1055,{variant:1,size:.94,solid:true,w:40,h:27}),obj('forest_root_edge_right','tree',2440,897,{variant:3,size:.84,solid:true,w:33,h:25}));
// Domestic furniture occupies real floor footprints, leaving the central entry and stories reachable.
for(const [index,s]of Object.values(interiors).filter(s=>s.kind==='house').entries()){
 const mirror=[1,3,6].includes(index),fx=x=>mirror?768-x:x;
 const pieces=[['bed',610,240,120,70,176],['stove',135,250,90,43,162],['table',330,370,100,40,126],['bookshelf',345,183,95,26,142],['lantern',665,330,30,17,104],['chair',205,422,75,40,112],['pantry',620,440,108,35,122]];
 for(const[part,x,y,w,h,drawHeight]of pieces)s.objects.push(landmark(s.id+'_'+part,part,fx(x),y,'domestic',{part,drawHeight,solid:true,w,h}));
 const letter=s.objects.find(o=>o.id===s.id+'_letter');Object.assign(letter,{x:fx(515),y:300,domestic:true,solid:true,w:98,h:39});
 Object.assign(s.objects.find(o=>o.type==='pickup'),{x:fx(605),y:470});
 Object.assign(s.objects.find(o=>o.type==='npc'),{x:fx(270),y:247});
}
const frostListeners=REGIONS.frost_canyon.objects.find(o=>o.id==='frost_shards');Object.assign(frostListeners,{y:1190,size:1.25,solid:true,w:220,h:65});
// Reserve human-sized clearings before drawing the largest memory landmarks.
REGIONS.frost_canyon.objects=REGIONS.frost_canyon.objects.filter(o=>o.type!=='tree'||Math.hypot(o.x-frostListeners.x,o.y-frostListeners.y)>245);
REGIONS.last_crown.objects=REGIONS.last_crown.objects.filter(o=>o.type!=='tree'||((o.x-850)/175)**2+((o.y-1220)/185)**2>1);
for(const r of Object.values(REGIONS))for(const o of r.objects)if(o.type==='tree'){
 const wide=r.biome==='ice',sz=o.size||1;o.w=Math.max(o.w||0,(wide?65:38)*sz);o.h=Math.max(o.h||0,(wide?32:23)*sz);
}
for(const s of Object.values(interiors))for(const o of s.objects)if(o.service==='construction')Object.assign(o,{solid:true,w:95,h:38});
const civicSites=REGIONS.haventide.objects.filter(o=>o.building);REGIONS.haventide.objects=REGIONS.haventide.objects.filter(o=>o.type!=='tree'||!civicSites.some(b=>Math.abs(o.x-b.x)<(b.w||160)/2+90&&o.y>b.y-80&&o.y<b.y+180));
// Match only the new sprites' grounded pedestal / wheelbase. Their dish and
// canvas remain overhead: actors can walk behind them and use foreground fade.
// The caravan's resident stands beside its canvas, clear of the painted roof.
REGIONS.emberline.objects.find(o=>o.id==='mara_convoy').x=REGIONS.emberline.objects.find(o=>o.id==='ember_caravan').x+112;
for(const r of Object.values(REGIONS))for(const o of r.objects){
 if(o.type!=='landmark')continue;
 if(o.style==='dish')Object.assign(o,{solid:true,w:56*(o.size||1),h:20*(o.size||1)});
 if(o.style==='caravan')Object.assign(o,{solid:true,w:136,h:44});
}
// The final presentation grid is 960×540; retain six full screens per authored route.
for (const scene of Object.values(ALL_SCENES)) {
 const scale=1.25; scene.width*=scale;scene.height*=scale;
 for(const p of [scene.spawn,scene.town,...scene.objects,...scene.portals,...(scene.roads||[]).flat()])if(p){p.x*=scale;p.y*=scale;if(p.w)p.w*=scale;if(p.h)p.h*=scale;if(p.spawn){p.spawn.x*=scale;p.spawn.y*=scale;}}
 if(scene.floorZones)for(const zone of scene.floorZones)zone.points=zone.points.map(p=>p.map(v=>v*scale));
 if(scene.quietAreas)for(const area of scene.quietAreas)for(const k of ['x','y','rx','ry'])area[k]*=scale;
 if(scene.walkAreas)for(const a of scene.walkAreas){a.x*=scale;a.y*=scale;a.w*=scale;a.h*=scale;}
 if(scene.water)scene.water=scene.water.map(poly=>poly.map(p=>p.map(v=>v*scale)));
 if(scene.islands)scene.islands=scene.islands.map(a=>a.map(v=>v*scale));
 if(scene.groves)scene.groves=scene.groves.map(a=>a.map((v,i)=>i<4?v*scale:v));
}
configureHaventideInterior(ALL_SCENES.haventide_town);
for(const region of ['emberline','orbital_reach','last_crown'])configureRegionalInterior(ALL_SCENES[region+'_town']);

// A landmark is usable from the lower approach and either side of its base,
// rather than a small circle around the console hidden behind its artwork.
const observatoryLens=REGIONS.emberline.objects.find(o=>o.id==='ember_observatory'),observatoryDish=REGIONS.emberline.objects.find(o=>o.id==='ember_lens');
observatoryLens.interactionArea={x:observatoryDish.x-observatoryLens.x,y:observatoryDish.y-observatoryLens.y-10,w:180,h:60};

// Tavi remains at the rescue road after Mara returns to Haventide.
const rescueHost=REGIONS.frost_canyon.objects.find(o=>o.id==='mara_lantern');
REGIONS.frost_canyon.objects.push(obj('tavi_lantern','npc',rescueHost.x,rescueHost.y,{name:'Tavi • Keeper of the rescue light',dialogue:'I think I’ll stay until the last family has a place to go. This time Mara knows where I am.'}));
for(const scene of Object.values(ALL_SCENES))for(const o of scene.objects)if(o.type==='npc')o.npcIdentity=npcIdentity(o);
