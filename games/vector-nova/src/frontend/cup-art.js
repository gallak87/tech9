import { CUPS, ALL_CUPS, cupDefinition, cupChampion } from '../race/cup.js';
import { assetURL } from '../assets/url.js';

const accents = {
  founders: '#85be99',
  frontier: '#e0d08b',
  horizon: '#de9191',
  apex: '#b38ae8',
};
export function cupArt(id) {
  const key = id === 'demo' ? 'founders' : id;
  return {
    accent: accents[key] ?? accents.founders,
    trophy: assetURL(`/assets/menu/cups/${key}-trophy.webp`),
    background: assetURL(`/assets/menu/cups/${key}-background.webp`),
  };
}
export function cupCard(cup, selected, collection) {
  const art = cupArt(cup.id),
    won = !!collection[cup.id];
  return `<button class="cup-card ${won ? 'is-earned' : ''}" data-cup="${cup.id}" aria-pressed="${selected === cup.id}" aria-label="${cup.name}, ${cup.tracks.length} races, ${won ? 'trophy earned' : 'not yet won'}" style="--cup-accent:${art.accent}"><img class="cup-card-background" src="${art.background}" alt=""><img class="cup-card-trophy" src="${art.trophy}" alt=""><span class="cup-card-label"><strong>${cup.name}</strong><small>${cup.tracks.length} races</small></span>${won ? '<span class="cup-earned-mark" aria-hidden="true">✓</span>' : ''}</button>`;
}
export function cupCabinet({ cups = {}, notice = '' } = {}) {
  const displayed = [
    ...CUPS,
    ...ALL_CUPS.filter(
      (cup) => cup.id === 'demo' && cups.demo && !CUPS.includes(cup),
    ),
  ];
  const count = displayed.filter((cup) => cups[cup.id]).length;
  return `<section class="cup-cabinet" aria-label="Earned cups"><div class="cup-cabinet-heading"><span>Trophy cabinet</span><span>${count}<span class="cup-cabinet-total"> / ${displayed.length}</span></span></div><ul style="--cup-count:${displayed.length}">${displayed
    .map((cup) => {
      const won = !!cups[cup.id],
        art = cupArt(cup.id);
      return `<li class="${won ? 'is-earned' : ''}" style="--cup-accent:${art.accent}" aria-label="${cup.name}: ${won ? 'trophy earned' : 'not yet won'}"><img src="${art.trophy}" alt=""><span>${cup.name.replace(' Cup', '')}</span><small>${won ? '✓ Won' : '—'}</small></li>`;
    })
    .join(
      '',
    )}</ul>${notice ? `<p class="cup-save" role="status">${notice}</p>` : ''}</section>`;
}
export function cupHero(cup, title, collection, rewards = '') {
  const art = cupArt(cup.id),
    won = !!collection[cup.id];
  return `<div class="cup-hero cup-art-hero ${won ? 'is-earned' : ''}" style="--cup-accent:${art.accent}"><img class="cup-card-background" src="${art.background}" alt=""><img class="cup-hero-trophy" src="${art.trophy}" alt=""><div class="cup-hero-caption"><span class="kicker">${won ? '✓ TROPHY EARNED' : 'CHAMPIONSHIP'}</span><h2 class="cup-title">${title}</h2><p>${cup.tracks.length} races · 9 rivals</p>${rewards}</div></div>`;
}
export function cupVictoryView(
  state,
  { fresh = false, delay = 0.6, notice = '' } = {},
) {
  const cup = cupDefinition(state.cupId),
    champion = cupChampion(state),
    art = cupArt(cup.id);
  const particles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    return `<i style="--spark-x:${Math.round(Math.cos(angle) * (115 + (i % 3) * 22))}px;--spark-y:${Math.round(Math.sin(angle) * 150)}px;--spark-turn:${i * 37}deg;--spark-lag:${(i % 4) * 45}ms"></i>`;
  }).join('');
  return `<section class="cup-victory" aria-labelledby="cup-victory-title" style="--cup-accent:${art.accent};--cup-reveal-delay:${delay}s"><img class="cup-victory-background" src="${art.background}" alt=""><div class="cup-victory-copy"><span class="kicker">CHAMPION / ${fresh ? 'TROPHY EARNED' : 'CUP DEFENDED'}</span><h1 id="cup-victory-title" tabindex="-1">${cup.name}</h1><p class="cup-victory-score">1st place <span>·</span> ${champion.points} points</p><p class="cup-victory-earned" role="status">${fresh ? '✓ Added to your collection' : '✓ Trophy in your collection'}</p>${notice ? `<p class="cup-save" role="status">${notice}</p>` : ''}<div class="front-actions"><button class="primary" data-action="cup-standings">View standings →</button><button data-action="cup-hub">Back to cups</button></div></div><div class="cup-victory-stage" aria-hidden="true"><div class="cup-victory-halo"></div><div class="cup-victory-sparks">${particles}</div><img class="cup-victory-trophy" src="${art.trophy}" alt=""></div></section>`;
}
