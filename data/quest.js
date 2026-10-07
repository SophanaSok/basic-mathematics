/* data/quest.js
   window.BM_QUEST: the quest dressing over the course. Plain data, read by
   assets/encounter.js (the practice-set bosses), assets/map3d.js and the Arena.

   regions  one per Part: a place name and the solid that stands for it
   bosses   one per chapter: the misconception behind its opening puzzle, given a
            name. `tempting` is the 0-based index, in that chapter's <ul class="guess">,
            of the wrong answer the misconception leads to (checked against each
            chapter's .puzzle-answer). The taunt voices the mistake and never the answer.
   echoes   the mixed-review sets at the end of each Part, which stay anonymous */
window.BM_QUEST = {
  regions: {
    algebra: { name: "The Foundry", solid: "cube", motif: "forge" },
    geometry: { name: "The Fields", solid: "tetra", motif: "fields" },
    coordinates: { name: "The Grid", solid: "octa", motif: "grid" },
    topics: { name: "The Observatory", solid: "icosa", motif: "stars" }
  },
  bosses: {
    ch01: { name: "The Number Trick", tempting: 0,
      taunt: "Choose a different number and you will get a different answer. Obviously." },
    ch02: { name: "The Snap Answer", tempting: 0,
      taunt: "The answer is staring at you. Who needs an equation for something this easy?" },
    ch03: { name: "The Hidden Fraction", tempting: 0,
      taunt: "With a big enough numerator and denominator, some fraction must land on me exactly." },
    ch04: { name: "The Fenced Field", tempting: 3,
      taunt: "Forty meters of fence is forty meters of fence. The shape cannot matter." },
    interlude: { name: "The Backwards Arrow", tempting: 1,
      taunt: "If a vowel means an even number, then surely an even number means a vowel." },
    ch05: { name: "The Torn Triangle", tempting: 3,
      taunt: "Every triangle is different. Why would their corners always make the same thing?" },
    ch06: { name: "The Order of Moves", tempting: 0,
      taunt: "Same two moves, same result. The order is just bookkeeping." },
    ch07: { name: "The Half-Again Pizza", tempting: 0,
      taunt: "Half again as wide is half again as much pizza. Pay for the width." },
    ch08: { name: "The Last Triple", tempting: 1,
      taunt: "Whole-number right triangles are rare birds. A few more and the supply runs out." },
    ch09: { name: "The Fourth Corner", tempting: 0,
      taunt: "Add the two far corners and you are done. A parallelogram has only one way to close." },
    ch10: { name: "The Crossing Road", tempting: 1,
      taunt: "Turn a road through a right angle? Just flip the sign of its slope." },
    ch11: { name: "The Angle Without a Triangle", tempting: 3,
      taunt: "Show me a right triangle with a 150° corner. Until then, its sine means nothing." },
    ch12: { name: "The Halfway Day", tempting: 0,
      taunt: "Half the lake, half the time. Growth is growth." },
    ch13: { name: "The Full Hotel", tempting: 0,
      taunt: "Every room is taken. Full means full, however many rooms there are." },
    ch14: { name: "The Number Off the Line", tempting: 0,
      taunt: "Every number lives on the number line. There is nowhere else to go." },
    ch15: { name: "The Last Nine", tempting: 0,
      taunt: "However many nines you write, there is always a sliver left before 1." },
    ch16: { name: "The Slanted Field", tempting: 3,
      taunt: "Slanted sides mean angles, and angles mean trigonometry." }
  },
  echoes: {
    algebra: "Echoes of Part I",
    geometry: "Echoes of Part II",
    coordinates: "Echoes of Part III",
    topics: "Echoes of Part IV"
  }
};
