// Measured immutable RGBA source crops. Anchors are crop-relative source pixels.
// One source scale preserves body dimensions across every action.
// clearRects remove neighboring pose fragments from imported crops only.
const poseIndex = { idle:0, anticipate:1, attack:2, hurt:3, down:4, guard:5, cast:5, victory:0 };
export const MIRE_HULK_ART = Object.freeze({
  "id": "mire_hulk",
  "source": "assets/mire-hulk-source.png",
  "columns": 3,
  "rows": 2,
  "sourceWidth": 1536,
  "sourceHeight": 1024,
  "pixelScale": 0.235,
  "shadow": {
    "radiusX": 37,
    "radiusY": 8
  },
  "frames": [
    {
      "x": 31,
      "y": 7,
      "w": 449,
      "h": 490,
      "anchorX": 249,
      "anchorY": 484
    },
    {
      "x": 541,
      "y": 50,
      "w": 449,
      "h": 448,
      "anchorX": 249,
      "anchorY": 442
    },
    {
      "x": 1004,
      "y": 44,
      "w": 524,
      "h": 456,
      "anchorX": 286,
      "anchorY": 450
    },
    {
      "x": 33,
      "y": 517,
      "w": 417,
      "h": 470,
      "anchorX": 211,
      "anchorY": 464
    },
    {
      "x": 488,
      "y": 618,
      "w": 546,
      "h": 364,
      "anchorX": 262,
      "anchorY": 359
    },
    {
      "x": 1056,
      "y": 565,
      "w": 452,
      "h": 416,
      "anchorX": 224,
      "anchorY": 410
    }
  ],
  poseIndex,
});

export const GLACIER_WOLF_ART = Object.freeze({
  "id": "glacier_wolf",
  "source": "assets/glacier-wolf-source.png",
  "columns": 3,
  "rows": 2,
  "sourceWidth": 1536,
  "sourceHeight": 1024,
  "pixelScale": 0.22,
  "shadow": {
    "radiusX": 34,
    "radiusY": 6
  },
  "frames": [
    {
      "x": 19,
      "y": 63,
      "w": 494,
      "h": 402,
      "anchorX": 241,
      "anchorY": 396
    },
    {
      "x": 519,
      "y": 111,
      "w": 491,
      "h": 351,
      "anchorX": 233,
      "anchorY": 345
    },
    {
      "x": 1019,
      "y": 120,
      "w": 508,
      "h": 321,
      "anchorX": 251,
      "anchorY": 337
    },
    {
      "x": 25,
      "y": 572,
      "w": 460,
      "h": 376,
      "anchorX": 220,
      "anchorY": 371
    },
    {
      "x": 522,
      "y": 725,
      "w": 481,
      "h": 224,
      "anchorX": 220,
      "anchorY": 219
    },
    {
      "x": 1030,
      "y": 546,
      "w": 497,
      "h": 408,
      "anchorX": 247,
      "anchorY": 402
    }
  ],
  poseIndex,
});

export const EMBER_GOLEM_ART = Object.freeze({
  "id": "ember_golem",
  "source": "assets/ember-golem-source.png",
  "columns": 3,
  "rows": 2,
  "sourceWidth": 1536,
  "sourceHeight": 1024,
  "pixelScale": 0.255,
  "shadow": {
    "radiusX": 39,
    "radiusY": 7
  },
  "frames": [
    {
      "x": 10,
      "y": 143,
      "w": 505,
      "h": 325,
      "anchorX": 270,
      "anchorY": 320,
      "clearRects": [
        [
          491,
          0,
          14,
          195
        ]
      ]
    },
    {
      "x": 501,
      "y": 109,
      "w": 529,
      "h": 361,
      "anchorX": 294,
      "anchorY": 355,
      "clearRects": [
        [
          0,
          291,
          14,
          70
        ],
        [
          509,
          80,
          20,
          239
        ]
      ]
    },
    {
      "x": 1015,
      "y": 146,
      "w": 510,
      "h": 324,
      "anchorX": 305,
      "anchorY": 318,
      "clearRects": [
        [
          0,
          269,
          16,
          55
        ]
      ]
    },
    {
      "x": 52,
      "y": 568,
      "w": 425,
      "h": 367,
      "anchorX": 216,
      "anchorY": 362
    },
    {
      "x": 509,
      "y": 655,
      "w": 526,
      "h": 274,
      "anchorX": 276,
      "anchorY": 269
    },
    {
      "x": 1069,
      "y": 584,
      "w": 447,
      "h": 343,
      "anchorX": 211,
      "anchorY": 338
    }
  ],
  poseIndex,
});

export const FROST_REVENANT_ART = Object.freeze({
  "id": "frost_revenant",
  "source": "assets/frost-revenant-source.png",
  "columns": 3,
  "rows": 2,
  "sourceWidth": 1536,
  "sourceHeight": 1024,
  "pixelScale": 0.22,
  "shadow": {
    "radiusX": 23,
    "radiusY": 5
  },
  "frames": [
    {
      "x": 14,
      "y": 79,
      "w": 496,
      "h": 413,
      "anchorX": 306,
      "anchorY": 448,
      "clearRects": [
        [
          180,
          399,
          70,
          14
        ]
      ]
    },
    {
      "x": 671,
      "y": 34,
      "w": 298,
      "h": 464,
      "anchorX": 144,
      "anchorY": 493,
      "clearRects": [
        [
          268,
          136,
          30,
          140
        ]
      ]
    },
    {
      "x": 936,
      "y": 130,
      "w": 587,
      "h": 365,
      "anchorX": 444,
      "anchorY": 397,
      "clearRects": [
        [
          0,
          170,
          42,
          195
        ]
      ]
    },
    {
      "x": 93,
      "y": 476,
      "w": 380,
      "h": 524,
      "anchorX": 207,
      "anchorY": 551,
      "clearRects": [
        [
          187,
          0,
          140,
          24
        ],
        [
          362,
          424,
          18,
          100
        ]
      ]
    },
    {
      "x": 452,
      "y": 728,
      "w": 615,
      "h": 248,
      "anchorX": 343,
      "anchorY": 244,
      "clearRects": [
        [
          0,
          0,
          24,
          187
        ]
      ]
    },
    {
      "x": 1119,
      "y": 503,
      "w": 361,
      "h": 479,
      "anchorX": 211,
      "anchorY": 517
    }
  ],
  poseIndex,
});

export const WRAITH_CORE_ART = Object.freeze({
  "id": "wraith_core",
  "source": "assets/wraith-core-source.png",
  "columns": 3,
  "rows": 2,
  "sourceWidth": 1536,
  "sourceHeight": 1024,
  "pixelScale": 0.22,
  "shadow": {
    "radiusX": 29,
    "radiusY": 6
  },
  "frames": [
    {
      "x": 13,
      "y": 51,
      "w": 455,
      "h": 413,
      "anchorX": 247,
      "anchorY": 440
    },
    {
      "x": 525,
      "y": 70,
      "w": 478,
      "h": 394,
      "anchorX": 275,
      "anchorY": 421
    },
    {
      "x": 1005,
      "y": 58,
      "w": 522,
      "h": 409,
      "anchorX": 315,
      "anchorY": 433
    },
    {
      "x": 57,
      "y": 565,
      "w": 407,
      "h": 381,
      "anchorX": 213,
      "anchorY": 410
    },
    {
      "x": 530,
      "y": 697,
      "w": 484,
      "h": 231,
      "anchorX": 260,
      "anchorY": 228
    },
    {
      "x": 1103,
      "y": 549,
      "w": 334,
      "h": 397,
      "anchorX": 181,
      "anchorY": 426
    }
  ],
  poseIndex,
});

export const EMBER_LORD_ART = Object.freeze({
  "id": "ember_lord",
  "source": "assets/ember-lord-source.png",
  "columns": 3,
  "rows": 2,
  "sourceWidth": 1536,
  "sourceHeight": 1024,
  "pixelScale": 0.3,
  "shadow": {
    "radiusX": 46,
    "radiusY": 9
  },
  "frames": [
    {
      "x": 22,
      "y": 31,
      "w": 494,
      "h": 451,
      "anchorX": 253,
      "anchorY": 445,
      "clearRects": [
        [
          485,
          0,
          9,
          384
        ]
      ]
    },
    {
      "x": 507,
      "y": 9,
      "w": 497,
      "h": 482,
      "anchorX": 288,
      "anchorY": 476,
      "clearRects": [
        [
          490,
          151,
          7,
          285
        ]
      ]
    },
    {
      "x": 997,
      "y": 62,
      "w": 523,
      "h": 415,
      "anchorX": 328,
      "anchorY": 410,
      "clearRects": [
        [
          0,
          0,
          10,
          138
        ]
      ]
    },
    {
      "x": 56,
      "y": 535,
      "w": 414,
      "h": 453,
      "anchorX": 214,
      "anchorY": 448
    },
    {
      "x": 478,
      "y": 610,
      "w": 570,
      "h": 358,
      "anchorX": 282,
      "anchorY": 353
    },
    {
      "x": 1076,
      "y": 501,
      "w": 451,
      "h": 496,
      "anchorX": 224,
      "anchorY": 490
    }
  ],
  poseIndex,
});
