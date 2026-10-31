// Course challenge is authored separately from the opponent difficulty setting.
export const TRACK_CHALLENGES = ['Warm-up', 'Easy', 'Medium', 'Hard'];

const challenges = {
  halcyon: 'Warm-up',
  orbital: 'Easy',
  'vesper-forest': 'Easy',
  nacre: 'Easy',
  glasswake: 'Easy',
  cindercoil: 'Medium',
  saffron: 'Medium',
  zephyr: 'Medium',
  helion: 'Hard',
  umbra: 'Hard',
  shatterline: 'Easy',
  worldspire: 'Medium',
  nightweir: 'Medium',
  colossus: 'Hard',
};

export const trackChallenge = (id) =>
  challenges[id.replace(/-wide$/, '')] ?? 'Unrated';
