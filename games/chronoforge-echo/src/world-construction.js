import { createRegions } from './world-authored.js';
import {
  point,
  road,
  obj,
  consoleAt,
  pickup,
  landmark,
} from './world-objects.js';
import { distanceToRoad, terrainAt } from './world-geometry.js';
import { scaleScenes } from './world-scale.js';
import { configureRegionalInterior } from './regional-interior-layout.js';
import { configureHaventideInterior } from './haventide-interior-layout.js';
import { placeCommunitySites } from './community-world.js';
import { NPC_IDENTITIES, npcIdentity } from './npc-identities.js';
import {
  configureWorldScenery,
  configureCaveScenery,
} from './world-scenery.js';

export function buildWorld() {
  const REGIONS = createRegions();
  const interiors = {};

  // Native coordinates: connect scenes, reserve approaches, then populate them.
  connectRegions(REGIONS);
  createTownInteriors(REGIONS, interiors);
  createDwellingInteriors(REGIONS, interiors);
  prepareOutdoorRoutes(REGIONS);
  placeCivicSites(REGIONS);
  placeCommunitySites(REGIONS, closestRoadPoint);
  populateGroves(REGIONS);
  configureRefugeStories(interiors);
  configureCaveLayouts(REGIONS, interiors);
  configureInteriorDetails(interiors);
  placeForestEdges(REGIONS);
  furnishHouses(interiors);
  finalizeNativeFootprints(REGIONS, interiors);

  const ALL_SCENES = { ...REGIONS, ...interiors };
  scaleScenes(ALL_SCENES);

  // These layouts and interaction extents are already expressed in world units.
  configureHaventideInterior(ALL_SCENES.haventide_town);
  for (const region of ['emberline', 'orbital_reach', 'last_crown'])
    configureRegionalInterior(ALL_SCENES[region + '_town']);
  configureWorldInteractions(REGIONS, ALL_SCENES);

  // Grounded art footprints are the final collision geometry.
  configureWorldScenery(REGIONS);
  for (const scene of Object.values(ALL_SCENES)) configureCaveScenery(scene);
  return { REGIONS, ALL_SCENES };
}

function connectRegions(REGIONS) {
  function addPortal(region, id, x, y, to, sx, sy, name, requires) {
    const p = obj(id, 'portal', x, y, {
      to,
      spawn: point(sx, sy),
      name,
      requires,
    });
    REGIONS[region].portals.push(p);
    return p;
  }
  addPortal(
    'haventide',
    'hav_to_ember',
    4510,
    1080,
    'emberline',
    160,
    1080,
    'Saltway • Emberline',
    'beacon_restored',
  );
  addPortal(
    'emberline',
    'ember_to_hav',
    100,
    1080,
    'haventide',
    4450,
    1080,
    'Saltway • Haventide',
  );
  addPortal(
    'emberline',
    'ember_to_orbital',
    4510,
    1080,
    'orbital_reach',
    160,
    1080,
    'The high road • Orbital Reach',
    { tier: 2, flag: 'vex_recruited' },
  );
  addPortal(
    'orbital_reach',
    'orbital_to_ember',
    100,
    1080,
    'emberline',
    4450,
    1080,
    'The high road • Emberline',
  );
  addPortal(
    'emberline',
    'ember_to_forest',
    2460,
    1900,
    'forest_veil',
    2430,
    170,
    'The green road • Forest Veil',
    'vex_recruited',
  );
  addPortal(
    'forest_veil',
    'forest_to_ember',
    2460,
    100,
    'emberline',
    2460,
    1840,
    'The green road • Emberline',
  );
  addPortal(
    'forest_veil',
    'forest_to_mire',
    4510,
    1250,
    'mire_bog',
    160,
    1250,
    'Reed causeway • Mire Bog',
    'forest_seal',
  );
  addPortal(
    'mire_bog',
    'mire_to_forest',
    100,
    1250,
    'forest_veil',
    4450,
    1250,
    'Reed causeway • Forest Veil',
  );
  addPortal(
    'emberline',
    'ember_to_crater',
    3730,
    120,
    'crater_ember',
    700,
    1850,
    'The furnace road • Crater Ember',
    { tier: 3 },
  );
  addPortal(
    'crater_ember',
    'crater_to_ember',
    700,
    1910,
    'emberline',
    3730,
    190,
    'The furnace road • Emberline',
  );
  addPortal(
    'orbital_reach',
    'orbital_to_frost',
    1090,
    110,
    'frost_canyon',
    1120,
    1850,
    'The rescue road • Frost Canyon',
    'rune_recruited',
  );
  addPortal(
    'frost_canyon',
    'frost_to_orbital',
    1120,
    1910,
    'orbital_reach',
    1090,
    175,
    'The rescue road • Orbital Reach',
  );
  addPortal(
    'orbital_reach',
    'orbital_to_crown',
    4510,
    1080,
    'last_crown',
    160,
    1080,
    'The garden road • Last Crown',
    { tier: 3, flag: 'rune_recruited' },
  );
  addPortal(
    'last_crown',
    'crown_to_orbital',
    100,
    1080,
    'orbital_reach',
    4450,
    1080,
    'The garden road • Orbital Reach',
  );
}

function createTownInteriors(REGIONS, interiors) {
  const guards = {
    haventide: 'hav_guard',
    emberline: 'ember_guard',
    orbital_reach: 'orbital_guard',
    last_crown: 'crown_guard',
  };

  for (const r of Object.values(REGIONS)) {
    if (r.town) {
      const t = r.town,
        id = r.id + '_town';
      // Put the visible blockade on the approach, clear of the building artwork.
      Object.assign(
        r.objects.find((o) => o.id === guards[r.id]),
        { x: t.x - 44, y: t.y + 68, gateName: t.name },
      );
      r.objects.push(
        obj(r.id + '_entrance', 'town', t.x, t.y, {
          name: t.name,
          to: id,
          spawn: point(640, 795),
          guard: guards[r.id],
          requires: r.id + '_liberated',
          solid: true,
          w: 200,
          h: 100,
        }),
      );
      const s = {
        id,
        name: t.name,
        subtitle: 'A place worth rebuilding',
        biome: r.biome,
        width: 1280,
        height: 900,
        interior: true,
        townId: r.id,
        kind: 'town',
        spawn: point(640, 795),
        roads: [],
        objects: [],
        portals: [
          obj(id + '_exit', 'portal', 640, 836, {
            name: 'Return to ' + r.name,
            to: r.id,
            spawn: point(t.x, t.y + 74),
          }),
        ],
        walkAreas: [{ x: 60, y: 110, w: 1160, h: 740 }],
      };
      [
        'provisions',
        'smith',
        'inn',
        'archivist',
        'artificer',
        'trainer',
      ].forEach((service, i) => {
        const x = [260, 640, 1020][i % 3],
          y = i < 3 ? 310 : 585;
        s.objects.push(
          obj(r.id + '_' + service, 'npc', x, y, {
            name: NPC_IDENTITIES[r.id + '_' + service].name,
            service,
            unlockTier: i < 3 ? 1 : i === 4 ? 3 : 2,
            stall: true,
            solid: true,
            w: 70,
            h: 32,
          }),
        );
      });
      s.objects.push(
        obj(r.id + '_board', 'console', 640, 445, {
          name: 'Settlement works',
          service: 'construction',
        }),
        obj(r.id + '_resident', 'npc', 845, 725, {
          name: NPC_IDENTITIES[r.id + '_resident'].name,
          dialogue:
            'We were afraid this place would become another empty room. Thank you for opening the doors.',
        }),
      );
      if (r.id === 'haventide') {
        s.objects.push(
          obj('mara', 'npc', 415, 705, { name: 'Mara' }),
          consoleAt('ending_beacon', 'The evening bell', 1120, 730),
        );
        r.objects = r.objects.filter((o) => o.id !== 'mara');
      }
      if (r.id === 'emberline')
        s.objects.push(
          obj('vex', 'npc', 410, 705, { name: 'Vex', hero: 'vex' }),
        );
      if (r.id === 'orbital_reach')
        s.objects.push(
          obj('rune', 'npc', 410, 705, { name: 'Rune', hero: 'rune' }),
        );
      if (r.id === 'last_crown')
        s.objects.push(
          consoleAt('rune_oath', 'The sentinel’s oath', 1110, 725),
        );
      interiors[id] = s;
    }
  }
}

const dwellings = {
  haventide: [
    ['hav_house', 'The keeper’s cottage', 1500, 650],
    ['hav_cave', 'Tideglass grotto', 3290, 690],
  ],
  emberline: [
    ['ember_house', 'A caravanserai', 2860, 1450],
    ['ember_cave', 'The blue cistern', 910, 490],
  ],
  forest_veil: [
    ['forest_house', 'The seedkeeper’s cabin', 1510, 1250],
    ['forest_cave', 'The root archive', 3240, 430],
  ],
  mire_bog: [
    ['mire_house', 'Reed-lantern refuge', 2260, 430],
    ['mire_cave', 'The submerged annex', 4150, 1080],
  ],
  crater_ember: [
    ['crater_house', 'The furnace shelter', 1560, 640],
    ['crater_cave', 'Obsidian gallery', 3530, 1460],
  ],
  orbital_reach: [
    ['orbital_house', 'The anchor keeper’s hut', 2600, 460],
    ['orbital_cave', 'Buried station', 2750, 1520],
  ],
  frost_canyon: [
    ['frost_house', 'The last watchhouse', 2670, 1550],
    ['frost_cave', 'The names in the ice', 1190, 410],
  ],
  last_crown: [
    ['crown_house', 'A room for tomorrow', 2250, 1510],
    ['crown_cave', 'The unfinished gallery', 1510, 550],
  ],
};

function createDwellingInteriors(REGIONS, interiors) {
  for (const [region, entries] of Object.entries(dwellings)) {
    for (const [id, name, x, y] of entries) {
      const cave = id.includes('cave'),
        r = REGIONS[region],
        sx = cave ? 200 : 384,
        sy = cave ? 780 : 490;
      r.objects.push(
        obj(id + '_door', cave ? 'cave' : 'house', x, y, {
          name,
          to: id,
          spawn: point(sx, sy),
          solid: true,
          w: cave ? 120 : 100,
          h: cave ? 50 : 65,
        }),
      );
      r.roads.push(road([x, y + 45], closestRoadPoint(r, x, y + 45)));
      const s = {
        id,
        name,
        subtitle: cave ? 'Beneath the old world' : 'A light in the wilderness',
        biome: r.biome,
        interior: true,
        kind: cave ? 'cave' : 'house',
        width: cave ? 1280 : 768,
        height: cave ? 960 : 600,
        spawn: point(sx, sy),
        roads: [],
        objects: [],
        portals: [
          obj(id + '_exit', 'portal', sx, sy + 44, {
            name: 'Return to ' + r.name,
            to: region,
            spawn: point(x, y + 68),
          }),
        ],
      };
      s.walkAreas = cave
        ? [
            { x: 70, y: 600, w: 410, h: 250 },
            { x: 290, y: 420, w: 210, h: 320 },
            { x: 380, y: 320, w: 360, h: 260 },
            { x: 680, y: 390, w: 200, h: 150 },
            { x: 820, y: 220, w: 340, h: 320 },
            { x: 910, y: 470, w: 180, h: 250 },
            { x: 590, y: 630, w: 470, h: 190 },
          ]
        : [{ x: 55, y: 95, w: 658, h: 445 }];
      if (cave) {
        s.objects.push(
          landmark(
            id + '_field_station',
            'The last survey station',
            115,
            700,
            'interior_supply',
            { solid: true, w: 65, h: 30 },
          ),
          pickup(id + '_supply', 'ether_cell', 980, 690, 2),
          consoleAt(id + '_record', 'An old field record', 1010, 310, {
            dialogue:
              'Someone kept this place lit until the very end. Their notebook ends with a list of names, and the words: let there be another morning.',
          }),
          landmark(id + '_relic', 'A memory under stone', 565, 400, 'relic'),
        );
      } else {
        s.objects.push(
          obj(id + '_keeper', 'npc', 260, 245, {
            name: 'The keeper of ' + name,
            dialogue:
              'Rest by the lamp. The road is long, but it is a road again.',
            service: 'rest',
          }),
          pickup(id + '_food', 'food', 600, 170, 12),
          consoleAt(id + '_letter', 'A letter on the table', 510, 280, {
            dialogue:
              'If you find this room, use it. A door is a promise that someone may come home.',
          }),
        );
      }
      if (id === 'mire_cave')
        s.objects.push(
          consoleAt('vex_echo', 'The missing countervoice', 990, 355),
        );
      if (id === 'frost_cave')
        s.objects.push(
          consoleAt('rune_names', 'The names of the Ninth', 1000, 350),
        );
      interiors[id] = s;
    }
  }
}

function prepareOutdoorRoutes(REGIONS) {
  REGIONS.frost_canyon.roads[0].splice(
    1,
    0,
    point(1090, 1760),
    point(1210, 1635),
  );
  REGIONS.frost_canyon.objects.push(
    obj('frost_entry_column', 'tree', 900, 1780, {
      variant: 1,
      size: 1.16,
      solid: true,
      w: 32,
      h: 23,
    }),
    obj('frost_entry_beacon', 'tree', 1300, 1720, {
      variant: 3,
      size: 1.02,
      solid: true,
      w: 28,
      h: 22,
    }),
    obj('frost_entry_stone', 'rock', 950, 1660, { solid: true, w: 49, h: 24 }),
  );
  REGIONS.last_crown.objects.push(
    obj('crown_entry_tree', 'tree', 300, 970, {
      variant: 1,
      size: 1.14,
      solid: true,
      w: 34,
      h: 25,
    }),
    obj('crown_entry_antenna', 'tree', 525, 1240, {
      variant: 3,
      size: 0.97,
      solid: true,
      w: 26,
      h: 22,
    }),
    obj('crown_entry_stone', 'rock', 410, 1265, { solid: true, w: 53, h: 25 }),
  );
  REGIONS.orbital_reach.objects.push(
    obj('orbital_entry_pine', 'tree', 270, 947, {
      variant: 1,
      size: 1.13,
      solid: true,
      w: 32,
      h: 23,
    }),
    obj('orbital_entry_anchor', 'tree', 567, 1280, {
      variant: 3,
      size: 1.17,
      solid: true,
      w: 30,
      h: 24,
    }),
    obj('orbital_entry_stone', 'rock', 380, 1290, {
      solid: true,
      w: 57,
      h: 26,
    }),
  );
  REGIONS.crater_ember.objects.push(
    obj('crater_entry_tree', 'tree', 480, 1780, {
      variant: 1,
      size: 1.12,
      solid: true,
      w: 35,
      h: 24,
    }),
    obj('crater_entry_pressure', 'tree', 910, 1630, {
      variant: 3,
      size: 0.97,
      solid: true,
      w: 27,
      h: 24,
    }),
    obj('crater_entry_obsidian', 'rock', 587, 1660, {
      solid: true,
      w: 55,
      h: 27,
    }),
  );
  REGIONS.crater_ember.water.push([
    [950, 1740],
    [1080, 1640],
    [1150, 1650],
    [1160, 1840],
    [1080, 1920],
    [980, 1900],
  ]);
  REGIONS.forest_veil.roads[0].splice(1, 0, point(2440, 290));
  REGIONS.mire_bog.objects.push(
    obj('mire_entry_willow', 'tree', 270, 1090, {
      variant: 1,
      size: 0.97,
      solid: true,
      w: 32,
      h: 26,
    }),
    obj('mire_entry_bell', 'tree', 610, 1320, {
      variant: 3,
      size: 0.93,
      solid: true,
      w: 23,
      h: 23,
    }),
  );
  REGIONS.forest_veil.objects.push(
    obj('forest_entry_root_left', 'tree', 2190, 340, {
      variant: 1,
      size: 1.07,
      solid: true,
      w: 34,
      h: 25,
    }),
    obj('forest_entry_root_right', 'tree', 2640, 330, {
      variant: 0,
      size: 1.36,
      solid: true,
      w: 38,
      h: 27,
    }),
  );
  // Emberline's first bend is framed by a copper cactus and an old wind-marker.
  REGIONS.emberline.objects.push(
    obj('ember_gate_cactus', 'tree', 245, 943, {
      variant: 1,
      size: 1.05,
      solid: true,
      w: 30,
      h: 24,
    }),
    obj('ember_gate_windmark', 'tree', 423, 972, {
      variant: 3,
      size: 0.86,
      solid: true,
      w: 20,
      h: 20,
    }),
    obj('ember_dune_cactus', 'tree', 574, 1275, {
      variant: 2,
      size: 1.17,
      solid: true,
      w: 33,
      h: 24,
    }),
    obj('ember_gate_stone', 'rock', 455, 1265, {
      variant: 1,
      solid: true,
      w: 70,
      h: 34,
    }),
    obj('ember_pass_arch', 'ruin', 1240, 1250, {
      variant: 2,
      solid: true,
      w: 104,
      h: 38,
    }),
  );
}

function placeCivicSites(REGIONS) {
  // Civic plots form a small uphill settlement around the covered market. Their clearings
  // are reserved before grove placement so construction never encloses an existing route.
  const civicPlots = [
    ['farm', 'Terraced gardens', 1080, 655, 168, 76],
    ['mine', 'The stoneworks', 1790, 350, 166, 74],
    ['energy_extractor', 'Tidal energy works', 1680, 1343, 165, 65],
    ['barracks', 'The watch yard', 870, 745, 158, 74],
    ['forge', 'Saltforge works', 1455, 900, 156, 72],
    ['research_lab', 'The signal laboratory', 1390, 440, 165, 74],
    ['walls', 'The north gate', 1190, 835, 165, 65],
  ];
  for (const [building, name, x, y, w, h] of civicPlots) {
    const r = REGIONS.haventide;
    r.objects.push(
      landmark('hav_plot_' + building, name, x, y, 'building', {
        building,
        solid: true,
        w,
        h,
      }),
    );
    // The tidal works sit on the coast; approach from land instead of paving into the sea.
    const approachY = building === 'energy_extractor' ? y - h - 24 : y + 58;
    r.roads.push(road([x, approachY], closestRoadPoint(r, x, approachY)));
  }
  REGIONS.haventide.objects.find(
    (o) => o.id === 'haventide_entrance',
  ).building = 'town_center';
}

// Groves are authored by their mass and clearing shape. Individual trees have deterministic silhouettes.
function hash(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function closestRoadPoint(r, x, y) {
  let best = [x, y],
    dist = Infinity;
  for (const rr of r.roads)
    for (let i = 1; i < rr.length; i++) {
      const a = rr[i - 1],
        b = rr[i],
        dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)),
        ),
        px = a.x + t * dx,
        py = a.y + t * dy,
        d = (x - px) ** 2 + (y - py) ** 2;
      if (d < dist) {
        dist = d;
        best = [px, py];
      }
    }
  return best;
}

function populateGroves(REGIONS) {
  for (const [ri, r] of Object.values(REGIONS).entries()) {
    r.groves.forEach(([cx, cy, rx, ry, count], gi) => {
      for (let n = 0; n < count; n++) {
        const seed = ri * 9029 + gi * 311 + n * 71 + 9,
          a = hash(seed) * Math.PI * 2,
          rr = Math.sqrt(hash(seed + 19)),
          x = Math.round(cx + Math.cos(a) * rx * rr),
          y = Math.round(cy + Math.sin(a) * ry * rr);
        if (
          distanceToRoad(r, x, y) < 70 ||
          r.objects.some((o) =>
            o.building || o.communityProject
              ? Math.abs(x - o.x) < o.w / 2 + 58 && Math.abs(y - o.y) < o.h + 75
              : Math.hypot(x - o.x, y - o.y) < 85,
          ) ||
          terrainAt(r, x, y) === 'water'
        )
          continue;
        r.objects.push(
          obj(`${r.id}_tree_${gi}_${n}`, 'tree', x, y, {
            variant: Math.floor(hash(seed + 4) * 4),
            size: 0.8 + hash(seed + 11) * 0.65,
            solid: true,
            w: 20,
            h: 15,
          }),
        );
      }
    });
    // Long abandoned structures punctuate each leg, rather than evenly filling open ground.
    const ruins = [
      [630, 780],
      [1420, 1440],
      [2190, 740],
      [3090, 1360],
      [3930, 620],
    ];
    ruins.forEach(([x, y], i) => {
      if (distanceToRoad(r, x, y) < 100 || terrainAt(r, x, y) === 'water')
        return;
      r.objects.push(
        obj(r.id + '_ruin_' + i, 'ruin', x, y, {
          variant: i % 3,
          solid: true,
          w: 105,
          h: 40,
        }),
      );
    });
    const boulders = [
      [480, 960],
      [1320, 760],
      [2020, 1090],
      [2580, 680],
      [3340, 1490],
      [4190, 1210],
      [3840, 800],
    ];
    boulders.forEach(([x, y], i) => {
      if (distanceToRoad(r, x, y) < 65 || terrainAt(r, x, y) === 'water')
        return;
      r.objects.push(
        obj(r.id + '_rock_' + i, 'rock', x, y, {
          variant: i % 3,
          solid: true,
          w: 40,
          h: 22,
        }),
      );
    });
  }
}

function configureRefugeStories(interiors) {
  // Each refuge preserves a different small human story; caves have distinct branches and loops.
  const refugeStories = {
    haventide: [
      'Anja, keeper of the tide books',
      'The old bell used to count fishing boats. Now I ring it for every traveler who comes back. Help yourself to the broth.',
      'The tide book',
      'Forty-seven boats left before the silence. Forty-six returned. Beside the last name someone has drawn a lantern, and keeps drawing it every year.',
    ],
    emberline: [
      'Perrin of the rain caravan',
      'Every jar in this house has crossed the desert twice. Empty on the way out, full on the way home. That is what I call optimism.',
      'A water merchant’s ledger',
      'Paid in water: twelve blankets. Paid in songs: one broken telescope. Paid in promises: everything else.',
    ],
    forest_veil: [
      'Tala, the seedkeeper',
      'The forest is not taking our cities back. It is using what we left. There is a difference. Sit, and listen to the roof grow.',
      'A botanical field book',
      'The roots follow buried signal cables. Their growth rings repeat the pulse heard at Haventide. Life learned to listen before we did.',
    ],
    mire_bog: [
      'Esme, ferrier of names',
      'I used to ferry people. Now I ferry their names to the archive, so that someone will remember which way they were going.',
      'A lantern-maker’s note',
      'Never hang a lantern for the dead alone. Hang a second for whoever comes looking for them.',
    ],
    crater_ember: [
      'Toll, the furnace tender',
      'The mountain has been working longer than we have. You learn respect quickly here. The shelter plates are cool enough to sleep against.',
      'A shift roster',
      'The final shift volunteered to stay until the evacuation rails cooled. In the margin: we will argue about overtime when you get back.',
    ],
    orbital_reach: [
      'Iri, anchor keeper',
      'Do you know why they built a stairway to the sky? To come home by a different road. I prefer to remember that part.',
      'A child’s star chart',
      'This constellation is called Mother’s Window. This one is Father’s Shift. Every star has an ordinary name underneath its official one.',
    ],
    frost_canyon: [
      'Hale, rescuer of the Ninth',
      'If you see a lamp through snow, walk toward it. If you carry a lamp, hold it high. We made the rules simple for a reason.',
      'A rescue manual',
      'Rule one: nobody walks behind the last lantern. Rule two: there is always room for another name on the return list.',
    ],
    last_crown: [
      'Ari, gardener of imperfect things',
      'The Architect made a flawless orchard. No fruit ever fell. No seed ever grew. I have been teaching the trees to make mistakes.',
      'A gardener’s journal',
      'Day 411: the first crooked branch. Day 419: a bird built its nest there. I do not think I have ever been more proud of anything.',
    ],
  };
  for (const [region, [, spoken, title, letter]] of Object.entries(
    refugeStories,
  )) {
    const houseId = dwellings[region][0][0],
      caveId = dwellings[region][1][0],
      house = interiors[houseId],
      caveScene = interiors[caveId];
    Object.assign(
      house.objects.find((o) => o.type === 'npc'),
      { name: NPC_IDENTITIES[houseId + '_keeper'].name, dialogue: spoken },
    );
    Object.assign(
      house.objects.find((o) => o.id === houseId + '_letter'),
      { name: title, dialogue: letter },
    );
    caveScene.objects.find((o) => o.id === caveId + '_record').dialogue =
      letter;
  }
}

function configureCaveLayouts(REGIONS, interiors) {
  const cavePlans = {
    hav_cave: [
      [70, 600, 410, 250],
      [300, 230, 360, 440],
      [620, 330, 250, 160],
      [810, 200, 350, 350],
      [850, 530, 250, 280],
      [430, 660, 510, 150],
    ],
    ember_cave: [
      [70, 600, 430, 250],
      [300, 400, 490, 280],
      [460, 220, 650, 240],
      [1000, 420, 100, 300],
      [820, 640, 340, 180],
    ],
    forest_cave: [
      [70, 610, 440, 250],
      [320, 330, 390, 400],
      [680, 380, 220, 120],
      [830, 200, 330, 350],
      [910, 500, 140, 180],
      [730, 620, 390, 220],
    ],
    mire_cave: [
      [70, 600, 440, 250],
      [300, 380, 220, 290],
      [480, 320, 300, 200],
      [730, 380, 170, 160],
      [830, 220, 350, 330],
      [920, 500, 150, 240],
      [620, 640, 440, 180],
    ],
    crater_cave: [
      [70, 600, 410, 250],
      [310, 300, 370, 360],
      [650, 350, 270, 150],
      [830, 180, 350, 400],
      [800, 540, 360, 280],
      [420, 660, 440, 150],
    ],
    orbital_cave: [
      [70, 600, 420, 250],
      [320, 300, 350, 420],
      [640, 340, 230, 150],
      [820, 210, 360, 360],
      [850, 530, 260, 300],
      [430, 680, 450, 130],
    ],
    frost_cave: [
      [70, 600, 460, 250],
      [350, 350, 410, 320],
      [720, 360, 190, 170],
      [830, 200, 350, 360],
      [910, 510, 130, 230],
      [590, 650, 500, 180],
    ],
    crown_cave: [
      [70, 600, 430, 250],
      [310, 300, 370, 400],
      [650, 350, 250, 150],
      [830, 200, 350, 390],
      [820, 550, 320, 300],
      [430, 660, 440, 150],
    ],
  };
  for (const [id, areas] of Object.entries(cavePlans)) {
    const scene = interiors[id];
    scene.walkAreas = areas.map(([x, y, w, h]) => ({ x, y, w, h }));
    const entryRoom = scene.walkAreas[0],
      exit = scene.portals[0];
    // Seat the threshold just inside the north wall, with arrivals clear of it.
    exit.y = entryRoom.y + 12;
    scene.spawn = point(exit.x, exit.y + 96);
    scene.arrivalFacing = 'down';
    const entrance = REGIONS[exit.to].objects.find((o) => o.to === id);
    entrance.spawn = point(scene.spawn.x, scene.spawn.y);
  }
}

function configureInteriorDetails(interiors) {
  // Haventide's covered market opens toward the player: the first three services are visible at entry.
  const havenMarket = interiors.haventide_town;
  for (const o of havenMarket.objects) {
    if (o.stall) {
      const index = [
        'provisions',
        'smith',
        'inn',
        'archivist',
        'artificer',
        'trainer',
      ].indexOf(o.service);
      o.x = index < 3 ? [400, 640, 880][index] : [260, 640, 1020][index - 3];
      o.y = index < 3 ? 640 : 270;
      o.w = 135;
      o.h = 38;
    }
    if (o.service === 'construction') {
      o.x = 700;
      o.y = 744;
    }
  }
  havenMarket.objects.push(
    landmark(
      'hav_market_pillar_left',
      'The west aisle',
      300,
      735,
      'interior_column',
      { solid: true, w: 135, h: 35 },
    ),
    landmark(
      'hav_market_pillar_right',
      'The east aisle',
      980,
      735,
      'interior_column',
      { solid: true, w: 135, h: 35 },
    ),
    landmark('hav_market_table', 'The tide books', 260, 400, 'interior_shelf', {
      solid: true,
      w: 135,
      h: 35,
    }),
  );
  for (const s of Object.values(interiors).filter((s) => s.kind === 'cave'))
    for (const o of s.objects) if (o.type === 'console') o.fieldRecord = true;
}

function placeForestEdges(REGIONS) {
  REGIONS.forest_veil.quietAreas = [{ x: 2135, y: 958, rx: 385, ry: 255 }];
  Object.assign(
    REGIONS.forest_veil.objects.find((o) => o.id === 'forest_greatroot'),
    { solid: true, w: 125, h: 55 },
  );
  REGIONS.forest_veil.objects.push(
    obj('forest_root_edge_left', 'tree', 1760, 1055, {
      variant: 1,
      size: 0.94,
      solid: true,
      w: 40,
      h: 27,
    }),
    obj('forest_root_edge_right', 'tree', 2440, 897, {
      variant: 3,
      size: 0.84,
      solid: true,
      w: 33,
      h: 25,
    }),
  );
}

function furnishHouses(interiors) {
  // Domestic furniture occupies real floor footprints, leaving the central entry and stories reachable.
  for (const [index, s] of Object.values(interiors)
    .filter((s) => s.kind === 'house')
    .entries()) {
    const mirror = [1, 3, 6].includes(index),
      fx = (x) => (mirror ? 768 - x : x);
    const pieces = [
      ['bed', 610, 240, 120, 70, 176],
      ['stove', 135, 250, 90, 43, 162],
      ['table', 330, 370, 100, 40, 126],
      ['bookshelf', 345, 183, 95, 26, 142],
      ['lantern', 665, 330, 30, 17, 104],
      ['chair', 205, 422, 75, 40, 112],
      ['pantry', 620, 440, 108, 35, 122],
    ];
    for (const [part, x, y, w, h, drawHeight] of pieces)
      s.objects.push(
        landmark(s.id + '_' + part, part, fx(x), y, 'domestic', {
          part,
          drawHeight,
          solid: true,
          w,
          h,
        }),
      );
    const letter = s.objects.find((o) => o.id === s.id + '_letter');
    Object.assign(letter, {
      x: fx(515),
      y: 300,
      domestic: true,
      solid: true,
      w: 98,
      h: 39,
    });
    Object.assign(
      s.objects.find((o) => o.type === 'pickup'),
      { x: fx(605), y: 470 },
    );
    Object.assign(
      s.objects.find((o) => o.type === 'npc'),
      { x: fx(270), y: 247 },
    );
  }
}

function finalizeNativeFootprints(REGIONS, interiors) {
  const frostListeners = REGIONS.frost_canyon.objects.find(
    (o) => o.id === 'frost_shards',
  );
  Object.assign(frostListeners, {
    y: 1190,
    size: 1.25,
    solid: true,
    w: 220,
    h: 65,
  });
  // Reserve human-sized clearings before drawing the largest memory landmarks.
  REGIONS.frost_canyon.objects = REGIONS.frost_canyon.objects.filter(
    (o) =>
      o.type !== 'tree' ||
      Math.hypot(o.x - frostListeners.x, o.y - frostListeners.y) > 245,
  );
  REGIONS.last_crown.objects = REGIONS.last_crown.objects.filter(
    (o) =>
      o.type !== 'tree' ||
      ((o.x - 850) / 175) ** 2 + ((o.y - 1220) / 185) ** 2 > 1,
  );
  for (const r of Object.values(REGIONS))
    for (const o of r.objects)
      if (o.type === 'tree') {
        const wide = r.biome === 'ice',
          sz = o.size || 1;
        o.w = Math.max(o.w || 0, (wide ? 65 : 38) * sz);
        o.h = Math.max(o.h || 0, (wide ? 32 : 23) * sz);
      }
  for (const s of Object.values(interiors))
    for (const o of s.objects)
      if (o.service === 'construction')
        Object.assign(o, { solid: true, w: 95, h: 38 });
  const civicSites = REGIONS.haventide.objects.filter((o) => o.building);
  REGIONS.haventide.objects = REGIONS.haventide.objects.filter(
    (o) =>
      o.type !== 'tree' ||
      !civicSites.some(
        (b) =>
          Math.abs(o.x - b.x) < (b.w || 160) / 2 + 90 &&
          o.y > b.y - 80 &&
          o.y < b.y + 180,
      ),
  );
  // Match only the new sprites' grounded pedestal / wheelbase. Their dish and
  // canvas remain overhead: actors can walk behind them and use foreground fade.
  // The caravan's resident stands beside its canvas, clear of the painted roof.
  REGIONS.emberline.objects.find((o) => o.id === 'mara_convoy').x =
    REGIONS.emberline.objects.find((o) => o.id === 'ember_caravan').x + 112;
  for (const r of Object.values(REGIONS))
    for (const o of r.objects) {
      if (o.type !== 'landmark') continue;
      if (o.style === 'dish')
        Object.assign(o, {
          solid: true,
          w: 56 * (o.size || 1),
          h: 20 * (o.size || 1),
        });
      if (o.style === 'caravan')
        Object.assign(o, { solid: true, w: 136, h: 44 });
    }
}

function configureWorldInteractions(REGIONS, ALL_SCENES) {
  // A landmark is usable from the lower approach and either side of its base,
  // rather than a small circle around the console hidden behind its artwork.
  const observatoryLens = REGIONS.emberline.objects.find(
      (o) => o.id === 'ember_observatory',
    ),
    observatoryDish = REGIONS.emberline.objects.find(
      (o) => o.id === 'ember_lens',
    );
  observatoryLens.interactionArea = {
    x: observatoryDish.x - observatoryLens.x,
    y: observatoryDish.y - observatoryLens.y - 10,
    w: 180,
    h: 60,
  };

  // Tavi remains at the rescue road after Mara returns to Haventide.
  const rescueHost = REGIONS.frost_canyon.objects.find(
    (o) => o.id === 'mara_lantern',
  );
  REGIONS.frost_canyon.objects.push(
    obj('tavi_lantern', 'npc', rescueHost.x, rescueHost.y, {
      name: 'Tavi • Keeper of the rescue light',
      dialogue:
        'I think I’ll stay until the last family has a place to go. This time Mara knows where I am.',
    }),
  );
  for (const scene of Object.values(ALL_SCENES))
    for (const o of scene.objects)
      if (o.type === 'npc') o.npcIdentity = npcIdentity(o);
}
