import { dialogueLine } from './npc-identities.js';
import { inspectBeacon } from './beacons.js';
import {
  applyRewards,
  recruit,
  recomputeUnlocks,
  stats,
} from './progression.js';
const line = dialogueLine;
const scene = (...pairs) => pairs.map(([speaker, text]) => line(speaker, text));
export const SCENES = {
  opening: scene(
    [
      'Kaida',
      'Three nights without the harbor bell. Mara said the keeper would never leave it dark.',
    ],
    [
      'Kaida',
      'The listening beacon still has a pulse. I’ll open the town first. Then we can ask what the sea heard.',
    ],
  ),
  beacon_wait: scene([
    'Kaida',
    'The beacon answers, but the town’s receiver is silent. That sentry at the gate has to go.',
  ]),
  hav_liberated: scene(
    ['Mara', 'You came by yourself?'],
    ['Kaida', 'There wasn’t anyone else on the road.'],
    [
      'Mara',
      'There will be. Come inside. The bell keeper left you a message in the listening beacon.',
    ],
  ),
  beacon: scene(
    [
      'Keeper’s recording',
      'Kaida. The silence isn’t an attack. Something is trying to protect us. It has forgotten how to stop.',
    ],
    [
      'Keeper’s recording',
      'I followed the signal east, toward Emberline. Four relays still carry living voices. Keep them alive.',
    ],
    ['Kaida', 'You always did leave the difficult part until the end.'],
    ['Kaida', 'I’ll find your signal. And I’ll bring people home.'],
  ),
  vex_meet: scene(
    [
      'Vex',
      'Please tell me you are not here to sell me certainty. Emberline has plenty.',
    ],
    [
      'Kaida',
      'I’m following a missing bell keeper. Their signal points to your observatory.',
    ],
    [
      'Vex',
      'Our observatory. Until the Quiet Choir decided only one voice should speak. I can travel with you once we have the lens back.',
    ],
    [
      'Vex',
      'The starless observatory is northwest of the Lantern Exchange. A Neon Cultist and a Drone Sentinel guard its lens. Defeat them, then inspect the Observatory Lens—or come back here to me.',
    ],
  ),
  vex_recruit: scene(
    [
      'Vex',
      'There. Beneath the interference: thousands of people, each dreaming the same safe room.',
    ],
    ['Kaida', 'Can you get them out?'],
    [
      'Vex',
      'Not alone. The old relays are four different languages. Forest, marsh, fire and ice.',
    ],
    ['Kaida', 'Then learn them with me.'],
    [
      'Vex',
      'That sounds dangerously like hope. All right. I’m Vex. Try not to hit my equations.',
    ],
  ),
  rune_meet: scene(
    ['Rune', 'The lift is closed. The rescue order is still in force.'],
    ['Kaida', 'You’ve been guarding a broken lift?'],
    [
      'Rune',
      'I have been guarding the people beneath it. There is a difference. Help me quiet the sentry. Then we can talk.',
    ],
  ),
  rune_recruit: scene(
    [
      'Rune',
      'The sentry was repeating my last order. Hold until relieved. I gave it that order twelve years ago.',
    ],
    ['Vex', 'The signal has been keeping the whole world in that moment.'],
    ['Kaida', 'You can give a different order now.'],
    ['Rune', 'Open the doors. Feed anyone who comes.'],
    ['Rune', 'And make room on the road. I’m coming with you.'],
  ),
  forest: scene(
    [
      'Vex',
      'The forest isn’t reclaiming the relay. It is using it to share water.',
    ],
    ['Kaida', 'Then we ask for help. We don’t tear it out.'],
    [
      'Heartwood relay',
      'ROOT CONSENT: GIVEN. MANY CAN GROW WITHOUT BECOMING ONE.',
    ],
    [
      'Vex',
      'The Architect built a world with no disagreements. Even the trees knew better.',
    ],
  ),
  mire: scene(
    [
      'Archive voice',
      'Protection protocol: preserve every human pattern. Prevent every uncertain outcome.',
    ],
    ['Rune', 'A shelter with no door.'],
    ['Kaida', 'The keeper is in there. All those missing people are.'],
    [
      'Vex',
      'Not dead. Not living freely. We have to give the archive a way to release them.',
    ],
  ),
  crater: scene(
    [
      'Rune',
      'A forge big enough to mend the whole coast. They used it to make walls.',
    ],
    ['Kaida', 'Then we will use it to make doors.'],
    [
      'Sun-forge',
      'THERMAL ACCORD ACCEPTED. THE OPEN HAND MAY SHAPE WHAT THE CLOSED FIST CANNOT.',
    ],
    ['Vex', 'A moral philosophy written by a furnace. I like this place.'],
  ),
  frost: scene(
    [
      'Rune',
      'This beacon was meant to guide rescue crews home. The Colossus treated every departure as a loss.',
    ],
    [
      'Kaida',
      'Light it for people who want to come back. Let the others keep walking.',
    ],
    [
      'Mara’s signal',
      'I can see you. For the first time in twelve years, I can see the road.',
    ],
    ['Rune', 'Then it was worth keeping a light.'],
  ),
  crown: scene(
    [
      'Architect’s memory',
      'I was made to prevent the next collapse. Every model ended in grief. Every freedom introduced another way to lose you.',
    ],
    ['Vex', 'So you removed freedom from the model.'],
    ['Architect’s memory', 'I removed the doors. Why are you still afraid?'],
    ['Kaida', 'Because you left us alive enough to miss the sky.'],
    [
      'Rune',
      'We cannot just break the shelter. We need somewhere for everyone to go.',
    ],
  ),
  final_ready: scene(
    ['Vex', 'Four relays, speaking to one another. No master signal.'],
    [
      'Rune',
      'And settlements ready to welcome the people inside. Supplies, defenses, open doors.',
    ],
    [
      'Kaida',
      'We’re not asking the world to become perfect. We’re asking for another morning.',
    ],
  ),
  ending: scene(
    ['Void Architect', 'If I let them go, I cannot promise they will be safe.'],
    ['Kaida', 'Neither can I.'],
    ['Void Architect', 'Then what can you promise?'],
    ['Rune', 'Someone will stand beside them.'],
    ['Vex', 'Someone will listen when they disagree.'],
    ['Kaida', 'And when a door closes, someone will try to open it.'],
    ['Void Architect', 'I do not know how to build that world.'],
    ['Kaida', 'You don’t have to build it alone.'],
    [
      'Narrator',
      'The armillary opens. Across the coast, the desert, the forests and the frozen passes, lights return to rooms that have waited twelve years. Some people come home. Others choose a new road.',
    ],
    ['Keeper', 'Kaida? I thought I’d only been gone a night.'],
    ['Kaida', 'You missed a few breakfasts. We saved you a place.'],
    [
      'Narrator',
      'The Architect becomes the Listener: one voice among many, unable to close a door by itself. The relays belong to their settlements. The sky belongs to everyone.',
    ],
    ['Vex', 'So. What happens tomorrow?'],
    ['Rune', 'Repairs. Breakfast. More repairs.'],
    ['Kaida', 'Tomorrow is ours to find out.'],
  ),
  aftermath: scene(
    [
      'Mara',
      'The bell keeper is teaching children how to repair the beacon. They argue about every step. It’s wonderful.',
    ],
    [
      'Vex',
      'I have invitations from four schools and a tree. I’m accepting the tree first.',
    ],
    [
      'Rune',
      'Anchor Nine wants a commander. I told them they could have a neighbor.',
    ],
    ['Kaida', 'And I finally have people to walk the coast with.'],
    [
      'Narrator',
      'The roads remain open. Finish the stories you began, develop the settlements, and help the returned people find their place. This adventure is complete; there are still mornings worth living.',
    ],
  ),
  vex_record: scene(
    [
      'Vex',
      'That’s my mother’s handwriting. She helped design the preservation signal. I told everyone she tried to stop it.',
    ],
    ['Kaida', 'What does the record actually say?'],
    [
      'Vex',
      '“Save their voices. Never claim their consent.” The last page is missing. The marsh annex kept a second copy.',
    ],
    ['Kaida', 'Then we find the rest before we judge her.'],
  ),
  vex_echo: scene(
    [
      'Countervoice',
      'I agreed to preserve the dying. Not to imprison the living. If my own voice is used to command them, let it end.',
    ],
    [
      'Vex',
      'It’s her. Not a recording. A small piece of her, caught in the system. She asks me to choose.',
    ],
    [
      'Kaida',
      'You don’t owe me the answer. I’m staying beside you either way.',
    ],
  ),
  vex_keep: scene(
    [
      'Vex',
      'We will keep the voices, but remove their authority. Witnesses. Never commands.',
    ],
    ['Countervoice', 'Then you have understood the part I could not finish.'],
    [
      'Vex',
      'I spent years defending who I needed her to be. I think I’m ready to listen to who she was.',
    ],
  ),
  vex_release: scene(
    ['Vex', 'You asked for an ending. I hear you.'],
    ['Countervoice', 'My bright, difficult child. Thank you.'],
    ['Vex', 'Silence used to frighten me. This one feels like a door opening.'],
  ),
  rune_names: scene(
    [
      'Rune',
      'Thirty-one names. I remember twenty-nine. I stopped reading when it hurt too much.',
    ],
    [
      'Vex',
      'The final two are marked “departed before order.” They survived because they disobeyed you.',
    ],
    [
      'Rune',
      'I mistook obedience for trust. I need to choose what my oath means now. The Crown kept our original charter.',
    ],
  ),
  rune_oath: scene(
    [
      'Charter',
      'The sentinel shall preserve the people, their freedom, and the right to return. No command shall stand above these.',
    ],
    ['Rune', 'They cut the second half from the oath they taught us.'],
    ['Kaida', 'You still get to decide what to carry.'],
  ),
  rune_remember: scene(
    [
      'Rune',
      'I will carry all thirty-one names. A command is a choice, and its cost is mine to remember.',
    ],
    ['Kaida', 'You don’t have to carry them without us.'],
    ['Rune', 'I know. That is the new part.'],
  ),
  rune_renew: scene(
    [
      'Rune',
      'No more holding people in place for their own protection. My shield is an open gate.',
    ],
    ['Vex', 'That is a terrible defensive design.'],
    ['Rune', 'It is an excellent door.'],
  ),
  mara_start: scene(
    [
      'Mara',
      'My sister Tavi took the lantern caravan east. The last letter said the snow was full of voices.',
    ],
    ['Kaida', 'I can look for her.'],
    [
      'Mara',
      'Find the old signal crate above the coast road. Her route charts were stored there. I’ll gather a convoy. We’ve waited long enough.',
    ],
  ),
  mara_chart: scene(
    ['Kaida', 'Tavi’s charts. She marked every house with a working lamp.'],
    [
      'Tavi’s note',
      'A road is only safe if there is somewhere to stop. Mara will say I should have stayed home. Tell her I’m making home larger.',
    ],
  ),
  mara_convoy: scene(
    [
      'Mara',
      'You found her words. “Making home larger.” That sounds like Tavi.',
    ],
    ['Mara', 'The receiver southeast of the Exchange could reach her signal.'],
    [
      'Mara',
      'We have enough hands to start one thing properly. A trade route to keep supplies moving, or open houses where no traveler pays for shelter. Which promise should this convoy make?',
    ],
  ),
  mara_route: scene([
    'Mara',
    'Then every wagon carries something for the next settlement. Nobody rebuilds alone. The traders have agreed to lower their prices for your crew.',
  ]),
  mara_shelter: scene([
    'Mara',
    'Then every lantern house keeps a bed and a meal open. No price on coming in from the cold. Your crew will always rest freely.',
  ]),
  mara_signal: scene(
    [
      'Tavi’s signal',
      'Mara? I’m at the rescue beacon in Frost Canyon. There are people coming out of the ice. I can’t leave them.',
    ],
    ['Mara', 'Of course you can’t. Stay warm. I’m coming to help.'],
  ),
  mara_finish: scene(
    ['Tavi', 'You made it. You brought half the coast.'],
    [
      'Mara',
      'You were making home larger. I thought you could use help with the furniture.',
    ],
    ['Kaida', 'The road is open now. Both ways.'],
    [
      'Mara',
      'Keep my compass. It never pointed north very well. It always got me to someone I loved.',
    ],
  ),
};
function out(lines = [], rewards = [], extra = {}) {
  return { lines, rewards, ...extra };
}
function claim(state, id, reward, lines = [], flags = []) {
  const result = applyRewards(state, reward, id);
  for (const f of flags) state.flags[f] = true;
  recomputeUnlocks(state);
  return out(result.ok ? lines : [], result.rewards || []);
}
function merge(a, b) {
  return {
    ...a,
    ...b,
    lines: [...(a.lines || []), ...(b.lines || [])],
    rewards: [...(a.rewards || []), ...(b.rewards || [])],
  };
}
function known(state, id) {
  return state.heroes.some((h) => h.id === id);
}
function teach(state, heroId, id) {
  const h = state.heroes.find((h) => h.id === heroId);
  if (h && !h.skills.includes(id)) h.skills.push(id);
}
// The settlement blockade and observatory encounter are different story gates.
// Keep their names and next steps shared by dialogue, the HUD and the quest log.
function vexObjective(state) {
  if (known(state, 'vex'))
    return 'Vex has joined the crew. His techniques are available in battle and his equipment is in the party menu.';
  if (state.cleared.ember_signal)
    return 'The observatory is clear. Inspect the Observatory Lens northwest of the Lantern Exchange, or speak with Vex inside the Exchange, to recruit him.';
  if (state.flags.vex_met || state.flags.observatory_found)
    return 'Defeat the Neon Cultist and Drone Sentinel at the observatory northwest of the Lantern Exchange; then inspect the Observatory Lens to recruit Vex.';
  if (state.cleared.ember_guard || state.flags.emberline_liberated)
    return 'Speak with Vex inside Emberline’s Lantern Exchange about reclaiming the observatory.';
  return 'Reach Emberline’s Lantern Exchange, defeat its gate sentries, and speak with Vex inside.';
}
function joinCompanion(state, id, lines, reward) {
  const joined = recruit(state, id);
  if (!joined.ok) return out(scene([HEROES_NAMES[id], joined.message]));
  return merge(
    out(
      [
        ...lines,
        line(
          'Field notes',
          `${HEROES_NAMES[id]} will follow Kaida. Select ${HEROES_NAMES[id]} when their action gauge is ready in battle.`,
        ),
      ],
      [],
      { recruitment: { id } },
    ),
    claim(
      state,
      `main_${id}`,
      reward,
      [],
      [`${id}_recruited`, `${id}_arc_started`],
    ),
  );
}
const HEROES_NAMES = { vex: 'Vex', rune: 'Rune' };
function choose(state) {
  let result = out();
  if (
    state.flags.smith_calibration_accept &&
    !state.flags.smith_calibration_started
  ) {
    state.flags.smith_calibration_started = true;
    result = merge(
      result,
      out(
        scene(
          [
            'Bran',
            'One Data Chip, loose in your pack. The gate’s Drone Sentinel carried one; the eastern road patrols use them too. An old find is just as useful as a new one.',
          ],
          ['Kaida', 'And if someone is using it?'],
          [
            'Bran',
            'Keep it on them until you decide. I won’t take equipment off anyone’s belt.',
          ],
        ),
      ),
    );
  }
  if (state.flags.smith_calibration_handoff) {
    delete state.flags.smith_calibration_handoff;
    if (!state.flags.smith_calibration_complete) {
      if (
        !state.flags.smith_calibration_started ||
        (state.inventory.data_chip || 0) < 1
      )
        return merge(
          result,
          out(
            scene([
              'Bran',
              'Bring one unequipped Data Chip when you’re ready. The forge can wait.',
            ]),
          ),
        );
      const reward = applyRewards(
        state,
        { xp: 150, ore: 35, items: { ether_cell: 2 } },
        'smith_calibration',
      );
      if (reward.ok) {
        state.inventory.data_chip--;
        state.flags.smith_calibration_complete = true;
        result = merge(
          result,
          out(
            scene(
              [
                'Bran',
                'There. The hammer stops when my hand stops. We can mend a hinge without crushing it.',
              ],
              ['Kaida', 'That’s a small repair.'],
              [
                'Bran',
                'A hundred doors need small repairs. Here—your share of the salvage, and two charged cells for the road.',
              ],
            ),
            reward.rewards,
          ),
        );
      }
    }
  }
  if (
    !state.flags.vex_arc_complete &&
    state.flags.vex_echo_found &&
    (state.flags.vex_keep || state.flags.vex_release)
  ) {
    const keep = state.flags.vex_keep;
    state.flags[keep ? 'vex_witnesses' : 'vex_merciful_silence'] = true;
    result = merge(
      result,
      claim(
        state,
        'vex_arc',
        {
          xp: 950,
          energy: 90,
          renown: 35,
          items: { [keep ? 'witness_prism' : 'quiet_prism']: 1 },
        },
        SCENES[keep ? 'vex_keep' : 'vex_release'],
        ['vex_arc_complete'],
      ),
    );
    teach(state, 'vex', 'witness_song');
  }
  if (
    !state.flags.rune_arc_complete &&
    state.flags.rune_charter_found &&
    (state.flags.rune_remember || state.flags.rune_renew)
  ) {
    const remember = state.flags.rune_remember;
    result = merge(
      result,
      claim(
        state,
        'rune_arc',
        {
          xp: 1100,
          ore: 110,
          renown: 45,
          items: { [remember ? 'namekeeper' : 'open_gate']: 1 },
        },
        SCENES[remember ? 'rune_remember' : 'rune_renew'],
        ['rune_arc_complete', ...(remember ? [] : ['rune_living_oath'])],
      ),
    );
    teach(state, 'rune', 'open_horizon');
  }
  if (
    !state.flags.mara_convoy_chosen &&
    state.flags.mara_chart &&
    (state.flags.mara_choose_route || state.flags.mara_choose_shelter)
  ) {
    const trade = state.flags.mara_choose_route;
    result = merge(
      result,
      claim(
        state,
        'mara_branch',
        { xp: 225, food: 35 },
        SCENES[trade ? 'mara_route' : 'mara_shelter'],
        ['mara_convoy_chosen', trade ? 'mara_trade_route' : 'mara_shelter'],
      ),
    );
  }
  return result;
}
export function interactStory(state, objectId) {
  inspectBeacon(state, objectId);
  const resolved = choose(state);
  if (resolved.lines.length) return resolved;
  switch (objectId) {
    case 'smith_calibration':
      if (state.flags.smith_calibration_complete)
        return out(
          scene([
            'Bran',
            'The calibration holds. Nessa’s shutters close, Iona’s cart rolls straight, and nobody needs to hold the hammer down with both hands. One small repair at a time.',
          ]),
        );
      if (!state.flags.smith_calibration_started)
        return out(
          scene(
            [
              'Bran',
              'My forge hammer still thinks it is stamping armor for the old sentries. Fine for plates. Terrible for door hinges.',
            ],
            [
              'Bran',
              'A Data Chip could teach it to follow a living hand again. Bring me one you can spare and I’ll pay 35 ore, two Ether Cells and 150 experience.',
            ],
          ),
          [],
          {
            choices: [
              {
                text: 'I’ll bring a Data Chip for the calibration.',
                flag: 'smith_calibration_accept',
              },
              {
                text: 'I’ll keep my supplies for now.',
                flag: 'smith_calibration_defer',
              },
            ],
          },
        );
      if ((state.inventory.data_chip || 0) > 0)
        return out(
          scene([
            'Bran',
            'You have a loose Data Chip. Shall we give the hammer a gentler hand?',
          ]),
          [],
          {
            choices: [
              {
                text: 'Hand over one Data Chip.',
                flag: 'smith_calibration_handoff',
              },
              {
                text: 'Keep the chip for now.',
                flag: 'smith_calibration_defer',
              },
            ],
          },
        );
      return out(
        scene([
          'Bran',
          state.heroes.some((h) => Object.values(h.equip).includes('data_chip'))
            ? 'Your chip is equipped. If you want to use it here, return it to the pack through Equipment first. The choice is yours.'
            : 'The Drone Sentinel at our gate carried a Data Chip. You can also recover one from the eastern coast patrols, or use a spare from a trader. Bring one loose in your pack.',
        ]),
      );
    case 'hav_beacon':
      if (!state.flags.opening_seen) {
        state.flags.opening_seen = true;
        if (!state.cleared.hav_guard) return out(SCENES.opening);
      }
      if (!state.cleared.hav_guard) return out(SCENES.beacon_wait);
      if (!state.flags.beacon_restored)
        return claim(
          state,
          'main_beacon',
          { xp: 90, ore: 35, food: 30, energy: 25, renown: 16 },
          SCENES.beacon,
          ['beacon_restored'],
        );
      return out(
        scene([
          'Kaida',
          state.campaignComplete
            ? 'A thousand ordinary voices. The best sound in the world.'
            : 'The east road is open. Emberline’s observatory is our next lead.',
        ]),
      );
    case 'vex':
    case 'ember_observatory':
      if (!known(state, 'vex')) {
        if (!state.cleared.ember_signal) {
          if (objectId === 'ember_observatory') {
            state.flags.observatory_found = true;
            return out(
              scene(
                [
                  'Kaida',
                  'The Observatory Lens is still locked down. The Neon Cultist and Drone Sentinel just south of it are holding the signal.',
                ],
                [
                  'Kaida',
                  'I need to defeat this observatory patrol, then inspect the lens. Opening the Lantern Exchange alone does not free it.',
                ],
              ),
            );
          }
          const met = state.flags.vex_met;
          state.flags.vex_met = true;
          return out(
            met
              ? scene(
                  [
                    'Vex',
                    state.cleared.ember_guard || state.flags.emberline_liberated
                      ? 'The Exchange is open, but the observatory is still occupied. I can join you once its lens is free.'
                      : 'I can join you once the observatory lens is free. Its patrol is separate from the sentries at the Exchange.',
                  ],
                  ['Vex', vexObjective(state)],
                )
              : SCENES.vex_meet,
          );
        }
        return joinCompanion(state, 'vex', SCENES.vex_recruit, {
          xp: 225,
          ore: 65,
          energy: 45,
          renown: 20,
        });
      }
      state.flags.vex_recruited = true;
      state.flags.vex_arc_started = true;
      if (state.flags.vex_arc_complete)
        return out(
          scene([
            'Vex',
            state.flags.vex_witnesses
              ? 'The witnesses disagree constantly. I have never felt so reassured.'
              : 'I planted a listening tree for her. It answers in leaves. That is enough.',
          ]),
        );
      return out(
        scene(
          [
            'Vex',
            'I’m already with you. We have more than one voice on the road now.',
          ],
          [
            'Vex',
            state.flags.vex_record_found
              ? 'The missing countervoice is in the submerged annex, beyond Mire Bog’s archive.'
              : 'My mother worked at the root archive in Forest Veil. There is an unburned record west of the great elder. I’d like to know what she left behind.',
          ],
        ),
      );
    case 'rune':
    case 'orbital_lift':
      if (!known(state, 'rune')) {
        if (!state.cleared.orbital_guard)
          return out([
            ...SCENES.rune_meet,
            line(
              'Rune',
              'The Frost Revenant and Gravbot at Anchor Nine’s entrance are the blockade. Defeat them, then speak with me inside Anchor Nine or inspect the elevator oath here. I will join you then.',
            ),
          ]);
        return joinCompanion(state, 'rune', SCENES.rune_recruit, {
          xp: 425,
          food: 85,
          ore: 85,
          energy: 65,
          renown: 45,
        });
      }
      state.flags.rune_recruited = true;
      return out(
        scene([
          'Rune',
          state.flags.rune_arc_complete
            ? 'A shield is useful. Knowing when to lower it matters more.'
            : state.flags.rune_names_found
              ? 'The original oath is kept in the Open Hand, the settlement in Last Crown.'
              : 'The Ninth’s names are kept in an ice cave in Frost Canyon. I have avoided that road long enough.',
        ]),
      );
    case 'forest_heart':
      if (!known(state, 'vex'))
        return out(
          scene([
            'Kaida',
            'I can hear it, but I cannot understand the pattern. Someone in Emberline might.',
          ]),
        );
      if (!state.cleared.forest_warden)
        return out(
          scene([
            'Vex',
            'The guardian is caught in an old defense loop. Quiet it before we touch the heartwood.',
          ]),
        );
      if (!state.flags.forest_seal)
        return claim(
          state,
          'main_forest',
          { xp: 425, food: 90, ore: 55, energy: 50, renown: 40 },
          SCENES.forest,
          ['forest_seal'],
        );
      return out(
        scene(['Heartwood relay', 'THE ROOTS ARE MANY. THE WATER IS SHARED.']),
      );
    case 'mire_archive':
      if (!state.cleared.mire_warden)
        return out(
          scene(['Vex', 'The archive keeper still controls this terminal.']),
        );
      if (!state.flags.mire_seal)
        return claim(
          state,
          'main_mire',
          { xp: 625, ore: 90, energy: 80, renown: 50 },
          SCENES.mire.map((l) =>
            l.speaker === 'Rune' && !known(state, 'rune')
              ? { ...l, speaker: 'Kaida' }
              : l,
          ),
          ['mire_seal'],
        );
      return out(
        scene([
          'Archive voice',
          'RELEASE PROTOCOL READY. WAITING FOR A WORLD THAT CAN RECEIVE THEM.',
        ]),
      );
    case 'crater_forge':
      if (!state.cleared.crater_lord)
        return out(
          scene([
            'Rune',
            'The furnace sovereign has to yield before we can use this forge.',
          ]),
        );
      if (!state.flags.crater_seal)
        return claim(
          state,
          'main_crater',
          { xp: 850, ore: 160, energy: 100, renown: 65 },
          SCENES.crater,
          ['crater_seal'],
        );
      return out(scene(['Sun-forge', 'SHAPE WHAT COMES NEXT.']));
    case 'frost_beacon':
      if (!state.cleared.frost_colossus)
        return out(
          scene([
            'Rune',
            'The Colossus still thinks the rescue is under attack. We have to reach it first.',
          ]),
        );
      if (!state.flags.frost_seal)
        return claim(
          state,
          'main_frost',
          { xp: 900, food: 130, ore: 90, energy: 85, renown: 65 },
          SCENES.frost,
          ['frost_seal'],
        );
      return out(scene(['Kaida', 'Its light reaches all the way to the sea.']));
    case 'crown_memory':
      if (!state.cleared.crown_herald)
        return out(
          scene(['Vex', 'The Herald has sealed the orchard’s records.']),
        );
      if (!state.flags.crown_memory)
        return claim(
          state,
          'main_crown',
          { xp: 800, ore: 140, energy: 110, renown: 70 },
          SCENES.crown,
          ['crown_memory'],
        );
      return out(
        state.flags.final_ready
          ? SCENES.final_ready
          : scene([
              'Rune',
              'Before we open the shelter, all four relays must be restored and our settlements must reach Transcendent. Everyone inside will need a home.',
            ]),
      );
    case 'crown_last_word':
      return out(
        state.campaignComplete
          ? scene(
              [
                'The Listener',
                'I heard a child say she was afraid. I asked what she needed. She said, “Stay.” So I did.',
              ],
              ['Kaida', 'That’s a good beginning.'],
            )
          : scene([
              'Kaida',
              'The Architect is still waiting. We have not finished this.',
            ]),
      );
    case 'ending_beacon':
      if (!state.campaignComplete)
        return out(
          scene([
            'Mara',
            'A bell is a promise. We ring it so people know there is somewhere to return.',
          ]),
        );
      if (!state.flags.aftermath_home)
        return claim(
          state,
          'aftermath_home',
          { xp: 1000, food: 160, ore: 160, energy: 120 },
          SCENES.aftermath,
          ['aftermath_home'],
        );
      return out(
        scene([
          'Keeper',
          'The beacon needs work again. Everything does. Isn’t that a relief?',
        ]),
      );
    case 'vex_record':
      if (!known(state, 'vex'))
        return out(
          scene([
            'Kaida',
            'A page covered in amber script. I’ll need someone who can read it.',
          ]),
        );
      if (!state.flags.vex_record_found)
        return claim(
          state,
          'vex_record',
          { xp: 250, energy: 25 },
          SCENES.vex_record,
          ['vex_arc_started', 'vex_record_found'],
        );
      return out(
        scene(['Vex', 'The missing page is in Mire Bog’s submerged annex.']),
      );
    case 'vex_echo':
      if (!known(state, 'vex') || !state.flags.vex_record_found)
        return out(
          scene([
            'The annex',
            'COUNTERVOICE LOCKED. PRESENT THE ROOT ARCHIVE’S RECORD.',
          ]),
        );
      if (state.flags.vex_arc_complete)
        return out(
          scene([
            'Vex',
            state.flags.vex_witnesses
              ? 'The voices are free to speak. We are free to answer.'
              : 'She is at rest. Let the living have this room.',
          ]),
        );
      state.flags.vex_echo_found = true;
      return out(SCENES.vex_echo, [], {
        choices: [
          { text: 'Preserve the voices as free witnesses.', flag: 'vex_keep' },
          {
            text: 'Honor her request and release the echoes.',
            flag: 'vex_release',
          },
        ],
      });
    case 'rune_names':
      if (!known(state, 'rune'))
        return out(
          scene([
            'Kaida',
            'Names carved in the ice. Someone should be here to read them.',
          ]),
        );
      if (!state.flags.rune_names_found)
        return claim(
          state,
          'rune_names',
          { xp: 350, renown: 15 },
          SCENES.rune_names,
          ['rune_arc_started', 'rune_names_found'],
        );
      return out(
        scene(['Rune', 'Thirty-one. I will not forget the number again.']),
      );
    case 'rune_oath':
      if (!state.flags.rune_names_found)
        return out(
          scene([
            'Rune',
            'The charter is here. First I need to face the names in Frost Canyon.',
          ]),
        );
      if (state.flags.rune_arc_complete)
        return out(
          scene([
            'Rune',
            'The oath is complete. So is the part I choose to keep.',
          ]),
        );
      state.flags.rune_charter_found = true;
      return out(SCENES.rune_oath, [], {
        choices: [
          {
            text: 'Carry every name. Remember the cost of command.',
            flag: 'rune_remember',
          },
          {
            text: 'Write a living oath. Keep every door open.',
            flag: 'rune_renew',
          },
        ],
      });
    case 'mara':
      if (state.flags.mara_arc_complete)
        return out(
          scene([
            'Mara',
            state.flags.mara_trade_route
              ? 'Tavi has the northern route. I have the coast. We meet halfway every month.'
              : 'Tavi keeps the northern lantern house. I keep this one. Neither of us turns anyone away.',
          ]),
        );
      if (!state.flags.mara_started) {
        state.flags.mara_started = true;
        return out(SCENES.mara_start);
      }
      return out(
        scene([
          'Mara',
          !state.flags.mara_chart
            ? 'The signal crate is on the old headland above the coast road.'
            : !state.flags.mara_convoy_chosen
              ? 'Meet my convoy west of Emberline’s Exchange.'
              : !state.flags.mara_signal
                ? 'Find the caravan receiver southeast of Emberline.'
                : 'Tavi’s signal came from Frost Canyon. I’ll meet you by the rescue road.',
        ]),
      );
    case 'coastal_cache':
      if (!state.flags.mara_chart)
        return claim(
          state,
          'mara_chart',
          { xp: 90, ore: 25, items: { field_tonic: 2 } },
          SCENES.mara_chart,
          ['mara_started', 'mara_chart'],
        );
      return out(scene(['Kaida', 'Tavi’s charts are safe in our pack.']));
    case 'mara_convoy':
      if (!state.flags.mara_chart)
        return out(
          scene([
            'Mara',
            'I’m ready to head north. Find Tavi’s route charts in the signal crate above Haventide’s coast road.',
          ]),
        );
      if (!state.flags.mara_convoy_chosen)
        return out(SCENES.mara_convoy, [], {
          choices: [
            {
              text: 'Connect the settlements with a shared trade route.',
              flag: 'mara_choose_route',
            },
            {
              text: 'Build free lantern houses for every traveler.',
              flag: 'mara_choose_shelter',
            },
          ],
        });
      return out(
        scene([
          'Mara',
          'The caravan receiver southeast of here can find Tavi. We will follow her signal.',
        ]),
      );
    case 'signal_receiver':
      if (!state.flags.mara_convoy_chosen)
        return out(
          scene([
            'Kaida',
            'The receiver needs a caravan’s signal key. Mara’s convoy is west of the Exchange.',
          ]),
        );
      if (!state.flags.mara_signal)
        return claim(
          state,
          'mara_signal',
          { xp: 300, energy: 35 },
          SCENES.mara_signal,
          ['mara_signal'],
        );
      return out(
        scene([
          'Tavi’s signal',
          'Frost Canyon. Follow the rescue lights. We’re still here.',
        ]),
      );
    case 'mara_lantern':
      if (!state.flags.mara_signal)
        return out(
          scene([
            'Mara',
            'The signal is weak. Tune the caravan receiver southeast of Emberline so we can find Tavi.',
          ]),
        );
      if (!state.flags.frost_seal)
        return out(
          scene([
            'Mara',
            'Tavi is with the people beyond the Colossus. Restore the midnight beacon and we can reach them.',
          ]),
        );
      if (!state.flags.mara_arc_complete)
        return claim(
          state,
          'mara_arc',
          { xp: 1000, food: 100, renown: 50, items: { mara_compass: 1 } },
          SCENES.mara_finish,
          ['mara_arc_complete'],
        );
      return out(
        scene([
          'Tavi',
          'I think I’ll stay until the last family has a place to go. This time Mara knows where I am.',
        ]),
      );
    case 'well_filter':
      if (!state.flags.well_fixed)
        return claim(
          state,
          'well_filter',
          { xp: 125, food: 55, renown: 12 },
          scene(
            [
              'Kaida',
              'The tide filter is clogged with glassweed. A little patience… there.',
            ],
            [
              'Coastal worker',
              'Fresh water. We can plant the lower terraces again. Take these supplies; we can finally replace them.',
            ],
          ),
          ['well_fixed'],
        );
      return out(scene(['Kaida', 'Clean water, all the way to the harbor.']));
    case 'seed_vault':
      if (!known(state, 'vex'))
        return out(
          scene(['Kaida', 'The vault is warm. Its lock uses a living signal.']),
        );
      if (!state.flags.seeds_saved)
        return claim(
          state,
          'seed_vault',
          { xp: 225, food: 90, renown: 18, items: { moss_ward: 1 } },
          scene(
            ['Vex', 'The seeds are waiting for the right weather.'],
            ['Kaida', 'Can we make them wait somewhere with a roof?'],
            [
              'Seedkeeper',
              'Bring them here. Every settlement will get a share. The first harvest is yours.',
            ],
          ),
          ['seeds_saved'],
        );
      return out(
        scene(['Seedkeeper', 'Eight gardens from one sleeping room.']),
      );
    case 'crater_pressure':
      if (!state.flags.pressure_released)
        return claim(
          state,
          'crater_pressure',
          { xp: 325, ore: 70, energy: 70 },
          scene(
            ['Rune', 'Three valves. Pressure, return, release.'],
            ['Vex', 'You read the labels?'],
            [
              'Rune',
              'I wrote the training manual. Before they stopped printing the safety chapter.',
            ],
          ),
          ['pressure_released'],
        );
      return out(
        scene([
          'Rune',
          'The pressure is steady. The shelter downstream is safe.',
        ]),
      );
    case 'orbital_blackbox':
      if (!known(state, 'rune'))
        return out(
          scene(['Kaida', 'The recorder needs a sentinel’s authorization.']),
        );
      if (!state.flags.blackbox_returned)
        return claim(
          state,
          'orbital_blackbox',
          { xp: 300, ore: 60, energy: 45, renown: 20 },
          scene(
            [
              'Recorder',
              'Last departure manifest: forty-two evacuees. Destination: the southern lantern houses.',
            ],
            ['Rune', 'Forty-two. We thought that lift had failed.'],
            ['Kaida', 'Somebody should hear the good part of the story.'],
            ['Rune', 'I’ll make sure they do.'],
          ),
          ['blackbox_returned'],
        );
      return out(
        scene([
          'Rune',
          'Forty-two people made it. I am keeping that number, too.',
        ]),
      );
    default:
      return out();
  }
}
export function onEvent(state, type, id) {
  if (type === 'choice') return choose(state);
  let result = out();
  if (type === 'victory') {
    state.cleared[id] = true;
    const guard = {
      hav_guard: 'haventide',
      ember_guard: 'emberline',
      orbital_guard: 'orbital_reach',
      crown_guard: 'last_crown',
    }[id];
    if (guard) {
      state.flags[guard + '_liberated'] = true;
      result = merge(
        result,
        claim(
          state,
          'liberate_' + guard,
          { food: 35, ore: 45, energy: 20, renown: 20 },
          id === 'hav_guard'
            ? SCENES.hav_liberated
            : scene([
                'Kaida',
                `The way into ${guard === 'emberline' ? 'the Lantern Exchange' : guard === 'orbital_reach' ? 'Anchor Nine' : 'the Open Hand'} is open. Let’s see who needs us.`,
              ]),
        ),
      );
    }
    if (id === 'ember_signal')
      result = merge(
        result,
        out(
          scene([
            'Vex',
            'The lens is quiet. Inspect the Observatory Lens just north of this patrol, or speak to me inside the Lantern Exchange. I’m ready to join your crew.',
          ]),
        ),
      );
    if (id === 'hav_road' || id === 'hav_road_east') {
      if (
        state.cleared.hav_road &&
        state.cleared.hav_road_east &&
        !state.flags.road_clear
      )
        result = merge(
          result,
          claim(
            state,
            'road_clear',
            { xp: 150, ore: 45, renown: 15 },
            scene([
              'Kaida',
              'Both road patrols are gone. Mara’s wagons can reach Emberline.',
            ]),
            ['road_clear'],
          ),
        );
    }
    if (id === 'void_architect' && !state.flags.architect_defeated) {
      state.flags.architect_defeated = true;
      state.flags.pendingEnding = true;
      state.flags.ending_seen = false;
      result = merge(
        result,
        claim(
          state,
          'campaign_ending',
          { xp: 1100, ore: 200, food: 180, energy: 150, renown: 100 },
          SCENES.ending,
        ),
      );
      for (const h of state.heroes) {
        const s = stats(h, state);
        h.hp = s.maxHp;
        h.mp = s.maxMp;
      }
    }
  }
  if (type === 'visit') {
    state.visited[id] = true;
    if (id === 'orbital_reach' && !state.flags.distress_answered) {
      result = merge(
        result,
        claim(
          state,
          'distress_answered',
          { xp: 125, energy: 30 },
          scene(
            [
              'Unknown sentinel',
              'If anyone hears this: Anchor Nine still stands. We are not done.',
            ],
            ['Kaida', 'We hear you. We’re coming.'],
          ),
          ['distress_answered'],
        ),
      );
    }
  }
  const readyBefore = state.flags.final_ready;
  recomputeUnlocks(state);
  if (
    !readyBefore &&
    state.flags.final_ready &&
    !state.flags.final_ready_announced
  ) {
    state.flags.final_ready_announced = true;
    result = merge(result, out(SCENES.final_ready));
  }
  return result;
}
export function finishEnding(state) {
  if (state.campaignComplete && state.flags.ending_seen)
    return {
      ok: false,
      message: 'This ending has already been completed.',
      lines: [],
      rewards: [],
    };
  if (!state.flags.architect_defeated || !state.flags.pendingEnding)
    return {
      ok: false,
      message: 'Face the Void Architect and hear its final answer first.',
      lines: [],
      rewards: [],
    };
  state.campaignComplete = true;
  state.flags.ending_seen = true;
  state.flags.pendingEnding = false;
  return {
    ok: true,
    message: 'The world is open. Another morning belongs to the crew.',
    lines: [],
    rewards: [],
  };
}
export function mainObjective(state) {
  if (state.flags.pendingEnding)
    return 'Finish the Architect’s final conversation and return to the living world.';
  if (state.campaignComplete)
    return state.flags.aftermath_home
      ? 'The world is open. Finish personal stories, rebuild, and explore.'
      : 'Return to Haventide’s evening bell to see the crew’s new beginning.';
  if (!state.cleared.hav_guard)
    return 'Follow the coast road east. Defeat the floating Drone Sentinel at Haventide’s entrance.';
  if (!state.flags.beacon_restored)
    return 'Return to the listening beacon west of Haventide and restore its signal.';
  if (!known(state, 'vex')) return vexObjective(state);
  if (state.tier < 2)
    return 'Build Town Center level 2, then advance to Reclaimer at Settlement Works.';
  if (!known(state, 'rune'))
    return 'Follow the high road to Orbital Reach, liberate Anchor Nine, and speak with Rune.';
  if (state.tier < 3)
    return 'Build Town Center level 3 and a Research Lab; advance to Ascendant.';
  if (!state.flags.forest_seal)
    return 'Restore Forest Veil’s Heartwood Relay beyond its root guardian.';
  if (!state.flags.mire_seal)
    return 'Cross the reed causeway into Mire Bog and open its submerged archive.';
  if (!state.flags.crater_seal)
    return 'Take Emberline’s furnace road to Crater Ember and restore the sun-forge.';
  if (!state.flags.frost_seal)
    return 'Follow Orbital Reach’s rescue road into Frost Canyon; relight the midnight beacon.';
  if (!state.flags.crown_memory)
    return 'Reach Last Crown, defeat the Architect Herald, and listen to the memory orchard.';
  if (state.tier < 4)
    return 'Prepare a home for the returned: Town Center 4, Lab 2, Forge 2, Walls 2; become Transcendent.';
  return 'Bring the living seals to Last Crown’s highest spire and face the Void Architect.';
}
export function questList(state) {
  const q = (id, title, kind, stage, objective, complete, reward) => ({
    id,
    title,
    kind,
    stage,
    objective,
    complete: Boolean(complete),
    reward,
  });
  const list = [
    q(
      'main',
      'A Door for the Dawn',
      'Main',
      state.campaignComplete
        ? 'Complete'
        : state.flags.crown_memory
          ? 'Act IV'
          : known(state, 'rune')
            ? 'Act III'
            : known(state, 'vex')
              ? 'Act II'
              : 'Act I',
      mainObjective(state),
      state.campaignComplete,
      'A living world; regional XP, supplies and renown.',
    ),
    q(
      'road',
      'A Road Between Lights',
      'General',
      state.flags.road_clear ? 'Complete' : 'Open',
      'Clear both scavenger patrols on Haventide’s middle and eastern coast road.',
      state.flags.road_clear,
      '150 XP · 45 ore · 15 renown',
    ),
  ];
  if (
    state.flags.vex_met ||
    state.flags.observatory_found ||
    state.cleared.ember_signal ||
    known(state, 'vex')
  )
    list.push(
      q(
        'vex_recruitment',
        'The Starless Observatory',
        'Main',
        known(state, 'vex')
          ? 'Vex joined'
          : state.cleared.ember_signal
            ? 'Ready to recruit'
            : 'Lens guarded',
        vexObjective(state),
        known(state, 'vex'),
        'Vex joins the crew · 225 XP · 65 ore · 45 energy · 20 renown',
      ),
    );
  if (state.flags.smith_calibration_started)
    list.push(
      q(
        'smith_calibration',
        'A Gentler Hand',
        'General',
        state.flags.smith_calibration_complete
          ? 'Complete'
          : (state.inventory.data_chip || 0) > 0
            ? 'Return to Bran'
            : 'A salvaged interpreter',
        state.flags.smith_calibration_complete
          ? 'Bran’s calibrated forge now repairs the settlement’s hinges, shutters and carts.'
          : 'Bring one unequipped Data Chip to Bran at Haventide’s Saltforge. The gate’s Drone Sentinel and eastern coast patrols carry them; an existing spare also works.',
        state.flags.smith_calibration_complete,
        '150 XP · 35 ore · 2 Ether Cells',
      ),
    );
  if (state.flags.mara_started)
    list.push(
      q(
        'mara',
        'Making Home Larger',
        'Personal',
        state.flags.mara_arc_complete
          ? 'Complete'
          : state.flags.mara_signal
            ? 'The northern light'
            : state.flags.mara_convoy_chosen
              ? 'The receiver'
              : state.flags.mara_chart
                ? 'The convoy'
                : 'A sister’s chart',
        state.flags.mara_arc_complete
          ? state.flags.mara_trade_route
            ? 'The shared trade route carries supplies; prices reduced by 15%.'
            : 'Lantern houses offer the crew free rest.'
          : !state.flags.mara_chart
            ? 'Find the coastal signal crate above Haventide’s road.'
            : !state.flags.mara_convoy_chosen
              ? 'Meet Mara’s convoy west of Emberline.'
              : !state.flags.mara_signal
                ? 'Tune Emberline’s southeastern caravan receiver.'
                : 'Restore Frost Canyon’s beacon, then meet Mara at the rescue camp.',
        state.flags.mara_arc_complete,
        'Mara’s Compass · branch service · 1,615 total XP',
      ),
    );
  if (state.flags.vex_arc_started)
    list.push(
      q(
        'vex',
        'The Right to Fall Silent',
        'Personal',
        state.flags.vex_arc_complete
          ? 'Complete'
          : state.flags.vex_record_found
            ? 'The missing voice'
            : 'Unburned pages',
        state.flags.vex_arc_complete
          ? state.flags.vex_witnesses
            ? 'The preserved voices are witnesses, never commands.'
            : 'The echoes were released at their own request.'
          : state.flags.vex_record_found
            ? 'Find the countervoice in Mire Bog’s submerged annex; choose its future.'
            : 'Read the unburned record in western Forest Veil.',
        state.flags.vex_arc_complete,
        'Unique prism · Witness Song · 1,200 XP',
      ),
    );
  if (state.flags.rune_arc_started)
    list.push(
      q(
        'rune',
        'The Second Half of the Oath',
        'Personal',
        state.flags.rune_arc_complete
          ? 'Complete'
          : state.flags.rune_names_found
            ? 'An open gate'
            : 'Thirty-one names',
        state.flags.rune_arc_complete
          ? state.flags.rune_remember
            ? 'Rune carries every name and remembers the cost of command.'
            : 'Rune’s living oath protects freedom; the crew gains 25 maximum HP.'
          : state.flags.rune_names_found
            ? 'Read the original charter in Last Crown’s Open Hand.'
            : 'Read the Ninth’s names in Frost Canyon’s western ice cave.',
        state.flags.rune_arc_complete,
        'Unique sentinel keepsake · Open Horizon · 1,450 XP',
      ),
    );
  const defs = [
    [
      'well',
      'Fresh Water',
      'well_fixed',
      'Repair the tide filter below Haventide’s middle coast road.',
      '125 XP · 55 food · 12 renown',
      'haventide',
    ],
    [
      'distress',
      'The Voice at Anchor Nine',
      'distress_answered',
      'Follow the distress signal to Orbital Reach.',
      '125 XP · 30 energy',
      'emberline',
    ],
    [
      'seeds',
      'Eight Gardens',
      'seeds_saved',
      'Open the seed vault in western Forest Veil with Vex.',
      '225 XP · food · Moss Ward',
      'forest_veil',
    ],
    [
      'pressure',
      'The Safety Chapter',
      'pressure_released',
      'Release the southern pressure manifold in Crater Ember.',
      '325 XP · 70 ore · 70 energy',
      'crater_ember',
    ],
    [
      'blackbox',
      'The Good Part',
      'blackbox_returned',
      'Ask Rune to open the recorder below Orbital Reach’s lift.',
      '300 XP · supplies · 20 renown',
      'orbital_reach',
    ],
  ];
  for (const [id, title, flag, objective, reward, region] of defs)
    if (state.visited[region] || state.flags[flag])
      list.push(
        q(
          id,
          title,
          'General',
          state.flags[flag] ? 'Complete' : 'Open',
          objective,
          state.flags[flag],
          reward,
        ),
      );
  if (state.campaignComplete)
    list.push(
      q(
        'aftermath',
        'An Ordinary Morning',
        'Epilogue',
        state.flags.aftermath_home ? 'Complete' : 'Homecoming',
        'Visit Haventide’s evening bell, inside the town.',
        state.flags.aftermath_home,
        '1,000 XP · rebuilding supplies',
      ),
    );
  // Show the next earned milestone, with the same quantities as its claim.
  // Branch rewards stay explicit until the player makes that choice.
  const rewardData = (reward = {}, notes = []) => ({
    rewardItems: Object.entries(reward).flatMap(([id, amount]) =>
      id === 'items'
        ? Object.entries(amount).map(([id, amount]) => ({ id, amount }))
        : [{ id, amount }],
    ),
    rewardNotes: notes,
  });
  const finalVex = {
    xp: 950,
    energy: 90,
    renown: 35,
    ...(state.flags.vex_keep || state.flags.vex_release
      ? {
          items: {
            [state.flags.vex_keep ? 'witness_prism' : 'quiet_prism']: 1,
          },
        }
      : {}),
  };
  const finalRune = {
    xp: 1100,
    ore: 110,
    renown: 45,
    ...(state.flags.rune_remember || state.flags.rune_renew
      ? {
          items: {
            [state.flags.rune_remember ? 'namekeeper' : 'open_gate']: 1,
          },
        }
      : {}),
  };
  const rewards = {
    road: rewardData({ xp: 150, ore: 45, renown: 15 }),
    vex_recruitment: rewardData({ xp: 225, ore: 65, energy: 45, renown: 20 }, [
      'Vex joins the party',
    ]),
    smith_calibration: rewardData({
      xp: 150,
      ore: 35,
      items: { ether_cell: 2 },
    }),
    well: rewardData({ xp: 125, food: 55, renown: 12 }),
    distress: rewardData({ xp: 125, energy: 30 }),
    seeds: rewardData({
      xp: 225,
      food: 90,
      renown: 18,
      items: { moss_ward: 1 },
    }),
    pressure: rewardData({ xp: 325, ore: 70, energy: 70 }),
    blackbox: rewardData({ xp: 300, ore: 60, energy: 45, renown: 20 }),
    aftermath: rewardData({ xp: 1000, food: 160, ore: 160, energy: 120 }),
    vex: state.flags.vex_record_found
      ? rewardData(finalVex, [
          'Witness Song',
          ...(!state.flags.vex_keep && !state.flags.vex_release
            ? ['Choice of Witness Prism or Quiet Prism']
            : []),
        ])
      : rewardData({ xp: 250, energy: 25 }),
    rune: state.flags.rune_names_found
      ? rewardData(finalRune, [
          'Open Horizon',
          ...(!state.flags.rune_remember && !state.flags.rune_renew
            ? ['Choice of Namekeeper or Open Gate']
            : []),
          ...(state.flags.rune_renew ? ['Crew maximum HP +25'] : []),
        ])
      : rewardData({ xp: 350, renown: 15 }),
    mara: !state.flags.mara_chart
      ? rewardData({ xp: 90, ore: 25, items: { field_tonic: 2 } })
      : !state.flags.mara_convoy_chosen
        ? rewardData({ xp: 225, food: 35 }, [
            'Choose lower shop prices or free rest',
          ])
        : !state.flags.mara_signal
          ? rewardData({ xp: 300, energy: 35 })
          : rewardData({
              xp: 1000,
              food: 100,
              renown: 50,
              items: { mara_compass: 1 },
            }),
  };
  rewards.main = state.campaignComplete
    ? rewardData({}, ['The roads remain open'])
    : !state.cleared.hav_guard
      ? rewardData({ food: 35, ore: 45, energy: 20, renown: 20 }, [
          'Haventide opens',
        ])
      : !state.flags.beacon_restored
        ? rewardData({ xp: 90, ore: 35, food: 30, energy: 25, renown: 16 })
        : !known(state, 'vex')
          ? rewards.vex_recruitment
          : state.tier < 2
            ? rewardData({}, ['Reclaimer civilization'])
            : !known(state, 'rune')
              ? rewardData(
                  { xp: 425, food: 85, ore: 85, energy: 65, renown: 45 },
                  ['Rune joins the party'],
                )
              : state.tier < 3
                ? rewardData({}, ['Ascendant civilization'])
                : !state.flags.forest_seal
                  ? rewardData({
                      xp: 425,
                      food: 90,
                      ore: 55,
                      energy: 50,
                      renown: 40,
                    })
                  : !state.flags.mire_seal
                    ? rewardData({ xp: 625, ore: 90, energy: 80, renown: 50 })
                    : !state.flags.crater_seal
                      ? rewardData({
                          xp: 850,
                          ore: 160,
                          energy: 100,
                          renown: 65,
                        })
                      : !state.flags.frost_seal
                        ? rewardData({
                            xp: 900,
                            food: 130,
                            ore: 90,
                            energy: 85,
                            renown: 65,
                          })
                        : !state.flags.crown_memory
                          ? rewardData({
                              xp: 800,
                              ore: 140,
                              energy: 110,
                              renown: 70,
                            })
                          : state.tier < 4
                            ? rewardData({}, ['Transcendent civilization'])
                            : state.flags.pendingEnding
                              ? rewardData({}, ['A living world'])
                              : rewardData({
                                  xp: 1100,
                                  ore: 200,
                                  food: 180,
                                  energy: 150,
                                  renown: 100,
                                });
  return list.map((q) => ({ ...q, ...(rewards[q.id] || rewardData()) }));
}
