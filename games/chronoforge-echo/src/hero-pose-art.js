// A pose may use its own immutable source without replacing the shared sheet.
// Body stature, rather than the raised weapon's height, sets the scale.
export const HERO_POSE_ASSETS = [
  {
    id: 'kaida_victory',
    heroId: 'kaida',
    pose: 'victory',
    url: 'assets/kaida/victory-v1-source.png',
    kind: 'heroPose',
    required: true,
    key: 'neutral-exterior',
    backgroundSeeds: [
      [527, 455],
      [515, 468],
    ],
    metadata: {
      sourceWidth: 1024,
      sourceHeight: 1536,
      pixelScale: 0.0755,
      frames: [{ x: 208, y: 44, w: 673, h: 1440, anchorX: 352, anchorY: 1431 }],
    },
  },
];
