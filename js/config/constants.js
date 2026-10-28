(function (Otc) {
  'use strict';

  // All tunable values live here. Later tasks add entries.
  Otc.Const = {
    // Handicap stone corners in order: top-left, bottom-right, top-right, bottom-left.
    HANDICAP_CORNER_ORDER: ['tl', 'br', 'tr', 'bl'],

    // AI scale: one disc of difference is about DISC_SCALE points.
    DISC_SCALE: 10,
    // Finished game: +/-(WIN_SCORE + disc difference) for the winner / loser, 0 for a draw.
    WIN_SCORE: 100000,
    // Check the deadline once every this many search nodes.
    NODE_CHECK_INTERVAL: 2048,
    // Evaluation weights per game phase. The first entry with empties >= minEmpties applies.
    // position: per position-weight point, mobility: per legal-move difference,
    // stable: per corner-anchored stable disc difference, disc: per disc difference.
    EVAL_PHASES: [
      { name: 'opening', minEmpties: 41, position: 3, mobility: 40, stable: 60, disc: 0 },
      { name: 'midgame', minEmpties: 15, position: 3, mobility: 30, stable: 80, disc: 0 },
      { name: 'endgame', minEmpties: 0, position: 2, mobility: 15, stable: 100, disc: 10 }
    ],
    // Reaction judgement: search depth for the evaluation change, flipped-disc count for sadness,
    // and the evaluation-change thresholds for joy / panic (measured, see .claude/docs/reports/2026-10-29-delta-threshold.md).
    REACTION_SEARCH_DEPTH: 2,
    SADNESS_FLIPS: 5,
    JOY_DELTA: 197,
    PANIC_DELTA: 331,
    // How long a forced pass stays on screen before the turn changes (ms).
    PASS_DISPLAY_MS: 1500,
    // Speech bubble: maximum characters per line (counted with Array.from).
    BUBBLE_MAX_CHARS: 20,
    AI_LEVELS: {
      easy: { depth: 1, timeMs: 300, endgameEmpties: 0, randomRate: 0.3 },
      normal: { depth: 3, timeMs: 1000, endgameEmpties: 8, randomRate: 0 },
      strong: { depth: 6, timeMs: 1500, endgameEmpties: 12, randomRate: 0 },
      assist: { depth: 3, timeMs: 600, endgameEmpties: 0, randomRate: 0 }
    }
  };
})(window.Otc);
