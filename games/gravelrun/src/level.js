// Level data — owned by level agent
// Coordinate system: x increases right, y increases down
// All values in game pixels (canvas is 480x270 internally)

export const LEVEL = {
  width: 6400,   // total level width in game pixels
  height: 270,

  playerStart: { x: 80, y: 180 },

  exit: { x: 6280, y: 170, w: 40, h: 80 },

  // platforms: { x, y, w, h }
  // y is the TOP of the platform
  platforms: [
    // === INTRO SECTION (x: 0–1200) — learn to move and jump ===
    { x: 0,    y: 220, w: 500,  h: 50  },  // starting ground
    { x: 540,  y: 220, w: 300,  h: 50  },  // gap intro
    { x: 880,  y: 220, w: 400,  h: 50  },  // safe landing
    { x: 900,  y: 160, w: 120,  h: 16  },  // elevated platform (optional jump)
    { x: 1160, y: 220, w: 200,  h: 50  },  // small platform before gap

    // === EARLY MID (x: 1200–2400) — introduce walkers ===
    { x: 1420, y: 220, w: 340,  h: 50  },
    { x: 1500, y: 155, w: 140,  h: 16  },  // elevated shortcut
    { x: 1820, y: 220, w: 160,  h: 50  },  // narrow platform, awkward
    { x: 2040, y: 220, w: 400,  h: 50  },
    { x: 2100, y: 155, w: 100,  h: 16  },  // jumper perch

    // === MID (x: 2400–3600) — staircase section ===
    { x: 2500, y: 220, w: 180,  h: 50  },
    { x: 2740, y: 190, w: 180,  h: 50  },
    { x: 2980, y: 160, w: 180,  h: 50  },
    { x: 3220, y: 130, w: 180,  h: 50  },
    { x: 3220, y: 190, w: 100,  h: 16  },  // lower option
    { x: 3460, y: 160, w: 250,  h: 50  },
    { x: 3460, y: 100, w: 80,   h: 16  },  // jumper perch top

    // === LATE MID (x: 3600–5000) — dense enemies, tighter gaps ===
    { x: 3780, y: 220, w: 300,  h: 50  },
    { x: 4140, y: 220, w: 200,  h: 50  },
    { x: 4140, y: 155, w: 80,   h: 16  },
    { x: 4400, y: 220, w: 300,  h: 50  },
    { x: 4460, y: 155, w: 120,  h: 16  },
    { x: 4760, y: 220, w: 140,  h: 50  },
    { x: 4960, y: 220, w: 200,  h: 50  },

    // === FINAL APPROACH (x: 5000–6400) — hardest section ===
    { x: 5220, y: 220, w: 160,  h: 50  },
    { x: 5220, y: 155, w: 80,   h: 16  },
    { x: 5440, y: 190, w: 120,  h: 50  },
    { x: 5620, y: 160, w: 100,  h: 50  },
    { x: 5780, y: 130, w: 100,  h: 50  },
    { x: 5940, y: 110, w: 100,  h: 50  },
    { x: 6080, y: 130, w: 280,  h: 50  },  // final platform before exit
  ],

  // enemies: { type: 'walker'|'jumper', x, y }
  // x,y = spawn position (center-bottom of enemy)
  enemies: [
    // intro — easy, room to learn shooting
    { type: 'walker', x: 650,  y: 220 },
    { type: 'walker', x: 980,  y: 220 },

    // early mid — first stomps
    { type: 'walker', x: 1500, y: 220 },
    { type: 'jumper', x: 2130, y: 155 },
    { type: 'walker', x: 2120, y: 220 },

    // mid — staircase gauntlet
    { type: 'walker', x: 2620, y: 220 },
    { type: 'jumper', x: 3490, y: 100 },
    { type: 'walker', x: 3530, y: 160 },

    // late mid — pairs
    { type: 'walker', x: 3880, y: 220 },
    { type: 'walker', x: 4000, y: 220 },
    { type: 'jumper', x: 4480, y: 155 },
    { type: 'walker', x: 4500, y: 220 },
    { type: 'walker', x: 4640, y: 220 },

    // final approach — hardest
    { type: 'walker', x: 5280, y: 220 },
    { type: 'jumper', x: 5260, y: 155 },
    { type: 'walker', x: 5500, y: 190 },
    { type: 'walker', x: 5660, y: 160 },
    { type: 'jumper', x: 5820, y: 130 },
    { type: 'walker', x: 6120, y: 130 },
  ],
};
