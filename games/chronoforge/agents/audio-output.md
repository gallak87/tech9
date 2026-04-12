# Audio Spec — Chronoforge

Synthwave-leaning audio direction, scoped to Web Audio API procedural SFX + a handful of short looped music tracks. Consumed by dev for the event→sound wiring.

---

## 1. Implementation approach

**SFX: procedural via Web Audio API.** No sample files for combat/UI effects. Each SFX is an oscillator + filter chain with envelope. Keeps byte cost near zero, fits the synthwave palette, and doesn't block on art-pipeline-style generation. Dev exposes a single helper:

```js
playSfx(id, { pitch = 1, gain = 0.6 } = {})
```

**Music: short .ogg (or .mp3 fallback) loops.** Three 30-60s loops covering the major moods. Generated later from any stock synthwave kit or AI tool of choice. Until they ship, dev plays **silent track + UI SFX only** — no crash.

**Master mix:** Web Audio graph with three buses — `master → [sfxBus, musicBus, ambBus]`. Settings tab sliders bind to bus gains.

**Volume defaults:** master 0.8, sfx 0.9, music 0.6, ambience 0.5.

---

## 2. SFX event catalog (procedural)

Every event has a rough recipe — dev is free to tune envelope/frequency but should keep the palette consistent.

### UI
| id | recipe |
|----|--------|
| `ui_tab_switch` | square wave 440Hz → 660Hz, 60ms, lowpass 2k, gain 0.3 |
| `ui_hover` | sine 880Hz, 30ms, gain 0.15 |
| `ui_click` | triangle 220Hz, 50ms pitch-down, gain 0.35 |
| `ui_menu_open` | reverse-sweep 200→800Hz sine, 180ms, slight reverb |
| `ui_menu_close` | sweep 800→200Hz sine, 140ms |

### Overworld
| id | recipe |
|----|--------|
| `ow_footstep` | filtered noise burst, 40ms, tile-based pitch variance ±10% |
| `ow_encounter_trigger` | descending minor-third sting, square wave, 300ms, reverb |
| `ow_city_enter` | 3-note arpeggio (C–E–G in synth pad), 600ms |
| `ow_fast_travel` | cyan shimmer: triangle 1.5kHz with slow filter sweep, 500ms |

### Battle
| id | recipe |
|----|--------|
| `bt_atb_fill` | soft tick, sine 1.2kHz, 20ms — plays when a hero's gauge hits 100 |
| `bt_action_select` | square 660Hz, 40ms |
| `bt_basic_attack` | noise crunch + sawtooth thud, 120ms |
| `bt_tech_cast` | rising sweep, saw+square layered, 250ms, reverb |
| `bt_combo_intro` | dramatic 3-note stab (magenta mood), 400ms — plays during time-freeze |
| `bt_combo_hit` | big impact: noise burst + low saw 80Hz, 180ms, screen-shake synced |
| `bt_crit_hit` | layered impact + high shimmer, 220ms |
| `bt_miss` | muted thud, lowpass 400Hz, 80ms |
| `bt_hurt` | party takes hit: saw 180Hz punch, 120ms |
| `bt_heal` | ascending major-third, triangle, 300ms |
| `bt_dodge` | quick whoosh: filtered noise sweep, 100ms |
| `bt_victory` | 4-note synth fanfare (I–iii–V–I, in D major), 1.2s — used as music-track stinger, not looped |
| `bt_defeat` | slow descending minor chord, strings-pad, 2s |

### Base
| id | recipe |
|----|--------|
| `base_resource_tick_food` | wood-knock: noise short burst + triangle 500Hz, 50ms |
| `base_resource_tick_ore` | metal-ping: triangle 1.2kHz + ring mod, 60ms |
| `base_resource_tick_energy` | electric spark: noise + high sine 2kHz, 50ms |
| `base_build_start` | low thunk + rising ramp, 400ms |
| `base_build_complete` | satisfying 2-note chime (C–G), bell-synth, 500ms |
| `base_upgrade_complete` | 3-note chime with reverb swell, 800ms |
| `base_tier_advance` | full fanfare + shimmer pad, 2s — major story beat |

---

## 3. Music tracks (looped)

Three short loops (30-60s each), OGG primary + MP3 fallback, mono acceptable for v1.

| id | mood | tempo | timbre | when it plays |
|----|------|-------|--------|---------------|
| `mus_splash` | mysterious, wistful | 80 bpm | pad + slow arp + vinyl crackle | title screen only |
| `mus_overworld` | hopeful drift | 95 bpm | warm saw pad, soft kick, synth bass | overworld exploration |
| `mus_battle` | driving, tense | 140 bpm | sidechained saws, fast arp, crunchy drums | all battle encounters |
| `mus_base` | chill work groove | 100 bpm | warm keys, shaker, gentle bass | base management scene |

**Ambience beds (optional, Phase 5):** one 30s loop per biome (grassland_ruins, neon_wastes, alien_terraform) — low wind, distant hums, faint static.

**Track crossfade:** 300ms fade when state transitions.

---

## 4. Audio data contract (for dev)

```js
// audio.js exposes:
initAudio()                         // lazy init on first user gesture (browser autoplay policy)
playSfx(id, opts?)                  // fires a procedural SFX
playMusic(id, { loop = true } = {}) // crossfades to target track
stopMusic(fadeMs = 300)
setBusGain(bus, value)              // 'master' | 'sfx' | 'music' | 'amb'
```

All SFX recipes live in a `SFX_RECIPES` map keyed by id — dev implements the oscillator/envelope/filter graph per recipe. Adding a new SFX = adding an entry to that map.

---

## 5. Scope gates

- **Phase 1 (now):** spec only. No code.
- **Phase 3:** dev wires `playSfx` + combat SFX recipes. Music track `mus_battle` if available, else silence.
- **Phase 4:** base SFX + `mus_base`.
- **Phase 5:** ambience beds, fast-travel + menu SFX polish.
- **Phase 6:** final mix pass, ensure Settings sliders behave sensibly.

---

## 6. Deferred

- Exact synthesis parameters per recipe (envelope shapes, filter Q) — dev tunes by ear during Phase 3
- Whether to ship actual OGG files or procedurally synthesize music too — decide at Phase 3 based on effort budget
- Accessibility: caption/subtitle support for SFX cues — punt to post-v1
