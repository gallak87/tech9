# Audio Integration Notes — Void Sentinel: Breach

## Module

```js
import { initAudio, playSound } from './audio.js';
```

---

## Init hook

Call once on the MENU → PLAYING transition (first user gesture). This satisfies browser autoplay policy.

```js
// game.js — state transition handler
case 'PLAYING':
  initAudio();
  break;
```

Or on the "Start Game" button click, whichever fires first.

---

## Event map

| `playSound()` call | Where to call it in game.js |
|---|---|
| `playSound('shoot_t1')` | Player fires, weapon tier 1 |
| `playSound('shoot_t2')` | Player fires, weapon tier 2 |
| `playSound('shoot_t3')` | Player fires, weapon tier 3 |
| `playSound('shoot_t4')` | Player fires, weapon tier 4 |
| `playSound('shoot_t5')` | Player fires, weapon tier 5 |
| `playSound('shoot_t6')` | Player fires, weapon tier 6 |
| `playSound('shoot_t7')` | Player fires, weapon tier 7 |
| `playSound('enemy_hit')` | Any enemy takes a hit (non-lethal) |
| `playSound('enemy_death_small')` | Small/grunt enemy dies |
| `playSound('enemy_death_large')` | Heavy/elite enemy dies |
| `playSound('weapon_tier_up')` | Player picks up weapon upgrade |
| `playSound('bomb_blast')` | Player detonates bomb |
| `playSound('boss_phase_transition')` | Boss HP crosses a phase threshold |
| `playSound('boss_death')` | Boss reaches 0 HP |
| `playSound('player_hit')` | Player takes damage |
| `playSound('pickup_weapon')` | Player collects weapon pickup (use `weapon_tier_up` for upgrades) |
| `playSound('pickup_bomb')` | Player collects bomb pickup |

---

## Suggested hook locations

### Shoot — tie to weapon firing logic
```js
// fire() or handleShooting() — wherever bullets spawn
playSound(`shoot_t${player.weaponTier}`);
```

### Enemy hit / death
```js
// In enemy.takeDamage() or collision handler
if (enemy.hp <= 0) {
  playSound(enemy.isLarge ? 'enemy_death_large' : 'enemy_death_small');
} else {
  playSound('enemy_hit');
}
```

### Weapon tier up
```js
// In collectWeaponUpgrade()
player.weaponTier = Math.min(player.weaponTier + 1, 7);
playSound('weapon_tier_up');
```

### Boss phase transition
```js
// In boss.takeDamage() at each phase threshold
if (crossedPhaseThreshold) {
  playSound('boss_phase_transition');
}
```

### Boss death
```js
// Boss reaches 0 hp
playSound('boss_death');
```

### Bomb
```js
// In detonateBomb()
playSound('bomb_blast');
```

### Player hit
```js
// In player.takeDamage()
playSound('player_hit');
```

### Pickups
```js
// In collectPickup() switch
case 'weapon': playSound('pickup_weapon'); break;
case 'bomb':   playSound('pickup_bomb');  break;
```

---

## Volume notes

- Shoot sounds are intentionally soft (0.2–0.35) — they fire constantly, don't fatigue
- T7 bass thud is loud (0.7) by design — should feel like a different category of weapon
- Boss death layers for ~1 second; don't cut it with a scene transition immediately
- `boss_phase_transition` is 600ms — safe to briefly pause enemy spawning over it for dramatic effect

---

## Browser gotcha

`playSound()` silently no-ops if `initAudio()` hasn't been called or if ctx is suspended. If sounds stop mid-session, check that `initAudio()` was called and that no unhandled promise rejection killed the AudioContext. The module calls `ctx.resume()` defensively on every `playSound()` invocation.
