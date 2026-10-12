/* data/gen/packs.js — Arena generators for the skill packs (Part V, beside the course).
   Pack A, "Ratios, Rates and Percent": sections 1–4 (ratios, proportions, percent, repeated change).
   Pack B, "Data and Statistics": sections 1-4 (center and spread; reading displays; scatterplots and lines of fit; samples and claims).
   Pack C, "Chance and Counting": sections 1-4 (probability as a fraction of outcomes; compound events;
   two-way tables and conditional probability; counting arrangements).
   Pack D, "Units and Measurement": sections 1-4 (converting units; rates with units; area and volume units;
   scale).
   Pack E, "Linear Models and Inequalities": sections 1-4 (slope as a rate of change; writing a linear
   model; inequalities in one unknown; inequalities in two unknowns and systems).
   The quartiles follow the median-of-halves rule of src/ui/chart.ts.

   A problem may carry a chart the Arena draws with the page widget (assets/widgets.js,
   W.chartFigure then W.chart):  chart: { kind, head, rows, caption, width? }
     kind     "dot" | "hist" | "box" | "scatter" (also "bar", not used yet)
     head     the column names, an array of strings (one for dot, hist, box)
     rows     numbers for dot, hist, box; [label, value] pairs for bar; [x, y] for scatter
     caption  one sentence, shown under the chart
     width    a histogram's bin width, set when the question states the bins
   The rows are the raw data; the widget bins them (half-open [lo, hi), as bins() in
   src/ui/chart.ts) and finds the quartiles itself. tools/check-gen.js checks the shape.
   Each problem uses
   only what its section has built so far. Hints name the next idea, never the numbers; steps
   are the worked solution; verify() recomputes the answer by a different route (the concrete
   counts behind a ratio, a cross-product, the unit rate). A dollar is written $\$9$ inside
   math, as on the pages. Pack generators are not in the frozen grade golden file: check-gen
   and the answer-type case tables cover them. */
(function () {
  "use strict";
  var G = window.BMGen;
  if (!G) return;
  var u = G.u, gcd = u.gcd, lcm = u.lcm;

  /* dollars from cents, as math: 460 gives $\$4.60$ */
  function usd(cents) {
    var c = cents % 100;
    return "$\\$" + Math.floor(cents / 100) + "." + (c < 10 ? "0" : "") + c + "$";
  }
  /* a number without float noise: 7.5, 17, 4.25 */
  function clean(x) { return String(Number(x.toFixed(6))); }
  /* "a:b" for a pair of terms */
  function ratioAns(parts) { return parts.join(":"); }
  /* "3 : 4" for the page text */
  function ratioTex(parts) { return "$" + parts.join(" : ") + "$"; }
  /* two positive integers with no common factor, different from each other */
  function coprimePair(r, hi) {
    var p, q, guard = 0;
    do { p = r.int(1, hi); q = r.int(2, hi); } while ((p === q || gcd(p, q) !== 1) && guard++ < 60);
    if (p === q || gcd(p, q) !== 1) { p = 2; q = 3; }
    return [p, q];
  }
  /* does "x:y" read as the ratio of the counts a and b, in lowest terms? */
  function isReduced(parts) { return parts.reduce(gcd) === 1; }

  /* --------------------------------------------- pack A §1: ratios and rates -- */

  var GROUPS = [
    ["girls", "boys", "A school club has", "members"],
    ["adults", "children", "A museum tour has", "people"],
    ["cats", "dogs", "A shelter has", "animals"],
    ["red marbles", "blue marbles", "A bag holds", "marbles"],
    ["cups of flour", "cups of sugar", "A bakery batch uses", "cups"]
  ];

  G.add({
    id: "pk-ratio-simplify", section: "pk-percent#ratios", par: 40, timed: true,
    make: function (r) {
      var g = r.pick(GROUPS), pq = coprimePair(r, 9), p = pq[0], q = pq[1], k = r.int(2, 9);
      var a = p * k, b = q * k, kind = r.pick(["first-second", "second-first", "first-whole"]);
      var whole = a + b, terms, ask, stepWhy;
      if (kind === "first-second") { terms = [p, q]; ask = "the " + g[0] + " to the " + g[1]; }
      else if (kind === "second-first") { terms = [q, p]; ask = "the " + g[1] + " to the " + g[0]; }
      else { terms = [p, p + q]; ask = "the " + g[0] + " to all the " + g[3]; }
      var left = kind === "second-first" ? b : a, right = kind === "first-whole" ? whole : (kind === "second-first" ? a : b);
      return {
        q: g[2] + " $" + a + "$ " + g[0] + " and $" + b + "$ " + g[1] + ". What is the ratio of " + ask + ", in lowest terms?",
        type: "ratio", answer: ratioAns(terms), placeholder: "e.g. 3:4",
        hint: kind === "first-whole"
          ? "The second quantity is all of them together, not just the other kind. Add first, then simplify."
          : "Write the two numbers in the order the question names them, then divide both by the largest number that goes into each.",
        steps: [
          kind === "first-whole"
            ? "All the " + g[3] + ": $" + a + " + " + b + " = " + whole + "$. The ratio is $" + a + " : " + whole + "$."
            : "In the order asked, the ratio is $" + left + " : " + right + "$.",
          "The largest number that divides both terms is $" + gcd(left, right) + "$, so divide both by it.",
          "In lowest terms the ratio is $" + terms.join(" : ") + "$."
        ],
        verify: function () {
          /* rebuild the counts from the key: scaling the key's terms up must give the counts back */
          var t = ratioAns(terms).split(":").map(Number), s = left / t[0];
          return isReduced(t) && s === Math.floor(s) && t[1] * s === right && s > 0 && (kind !== "first-whole" || t[1] - t[0] === (whole - a) / s);
        }
      };
    }
  });

  var BUYS = [
    ["bottle of juice", "ounce", "ounces"],
    ["box of cereal", "ounce", "ounces"],
    ["bag of flour", "ounce", "ounces"],
    ["pack of pencils", "pencil", "pencils"],
    ["jar of honey", "ounce", "ounces"],
    ["carton of eggs", "egg", "eggs"]
  ];
  var SIZES = [6, 8, 10, 12, 16, 20, 24, 32, 40, 48];

  G.add({
    id: "pk-unit-price", section: "pk-percent#ratios", par: 60, timed: true,
    make: function (r) {
      var b = r.pick(BUYS), n1, n2, guard = 0;
      do { n1 = r.pick(SIZES); n2 = r.pick(SIZES); } while ((n1 >= n2 || n2 > 3 * n1 + 6) && guard++ < 80);
      if (n1 >= n2) { n1 = 12; n2 = 20; }
      var u1 = r.int(20, 90), delta = r.nonzero(-14, 12), u2 = u1 + delta;
      if (u2 < 10) u2 = u1 + 5;
      var t1 = n1 * u1, t2 = n2 * u2, best = Math.min(u1, u2);
      return {
        q: "A " + b[0] + " comes in two sizes. The small one holds $" + n1 + "$ " + b[2] + " and costs " + usd(t1) +
          "; the large one holds $" + n2 + "$ " + b[2] + " and costs " + usd(t2) + ". What is the lower price per " + b[1] + ", in cents?",
        type: "number", answer: String(best), placeholder: "cents",
        hint: "A price per " + b[1] + " is a rate: divide each price by its own amount. Work in cents so the division comes out in whole numbers.",
        steps: [
          "Small size: $" + t1 + "$ cents for $" + n1 + "$ " + b[2] + " is $" + t1 + " \\div " + n1 + " = " + u1 + "$ cents per " + b[1] + ".",
          "Large size: $" + t2 + "$ cents for $" + n2 + "$ " + b[2] + " is $" + t2 + " \\div " + n2 + " = " + u2 + "$ cents per " + b[1] + ".",
          "The lower of the two is $" + best + "$ cents per " + b[1] + " (the " + (u1 < u2 ? "small" : "large") + " size is the better buy)."
        ],
        verify: function () {
          /* decide the better buy by cross-multiplying, with no division, then divide once */
          var smallBetter = t1 * n2 < t2 * n1;
          return (smallBetter ? t1 / n1 : t2 / n2) === best && n1 * best <= t1 && n2 * best <= t2 && (n1 * best === t1 || n2 * best === t2);
        }
      };
    }
  });

  G.add({
    id: "pk-speed-rate", section: "pk-percent#ratios", par: 50, timed: true,
    make: function (r) {
      /* each mover at a speed it could keep up: [name, slowest, fastest] in miles per hour */
      var kind = r.pick(["hours", "minutes"]), who = r.pick([["A runner", 5, 9], ["A cyclist", 10, 18], ["A bus", 20, 45], ["A delivery truck", 30, 60]]);
      var mover = who[0], v, d, text, steps, ans;
      if (kind === "hours") {
        var h = r.int(2, 6);
        v = r.int(who[1], who[2]); d = v * h;
        text = mover + " travels $" + d + "$ miles in $" + h + "$ hours at a steady speed. What is the speed in miles per hour?";
        ans = v;
        steps = ["Speed is distance divided by time: $" + d + " \\div " + h + " = " + v + "$.", "So the speed is $" + v + "$ miles per hour."];
      } else {
        /* a whole number of miles in m minutes, so the speed is a multiple of 60/m */
        var m = r.pick([10, 12, 15, 20, 30]), k = 60 / m;
        var d2 = r.int(Math.ceil(who[1] / k), Math.floor(who[2] / k));
        v = d2 * k;
        text = mover + " travels $" + d2 + "$ miles in $" + m + "$ minutes at a steady speed. What is the speed in miles per hour?";
        ans = v;
        steps = [
          "There are $" + (60 / m) + "$ periods of $" + m + "$ minutes in an hour, so the distance in an hour is $" + (60 / m) + " \\cdot " + d2 + " = " + v + "$ miles.",
          "So the speed is $" + v + "$ miles per hour."
        ];
        d = d2; h = m;
      }
      return {
        q: text, type: "number", answer: String(ans), placeholder: "miles per hour",
        hint: kind === "hours"
          ? "A rate is a quotient: the quantity you want per one of the other."
          : "The answer is per hour, but the time is given in minutes. First ask how many of those periods fit in an hour.",
        steps: steps,
        verify: function () {
          /* run the speed forward: at v miles per hour, the trip's time must come back */
          var minutes = kind === "hours" ? h * 60 : h;
          return v * minutes === d * 60 && Number.isInteger(v);
        }
      };
    }
  });

  /* ---------------------------------------------- pack A §2: proportions -- */

  G.add({
    id: "pk-proportion-solve", section: "pk-percent#proportions", par: 50, timed: true,
    make: function (r) {
      var pq = coprimePair(r, 7), p = pq[0], q = pq[1], s = r.int(2, 8), t = r.int(2, 9);
      if (s === t) t = s + 1;
      var vals = [p * s, q * s, p * t, q * t];   /* a/b = c/d */
      var hide = r.int(0, 3), ans = vals[hide], shown = vals.map(function (v, i) { return i === hide ? "x" : String(v); });
      /* x is found from the cross-products a·d = b·c */
      var steps = [
        "Cross-multiplying (multiply both sides by the two denominators) gives $" +
          (hide === 0 ? "x \\cdot " + shown[3] + " = " + shown[1] + " \\cdot " + shown[2]
          : hide === 1 ? shown[0] + " \\cdot " + shown[3] + " = x \\cdot " + shown[2]
          : hide === 2 ? shown[0] + " \\cdot " + shown[3] + " = " + shown[1] + " \\cdot x"
          : shown[0] + " \\cdot x = " + shown[1] + " \\cdot " + shown[2]) + "$.",
        "Divide both sides by the number multiplying $x$ to get $x = " + ans + "$.",
        "Check: $\\dfrac{" + vals[0] + "}{" + vals[1] + "} = \\dfrac{" + vals[2] + "}{" + vals[3] + "}$ because both reduce to $\\dfrac{" + p + "}{" + q + "}$."
      ];
      return {
        q: "Solve for $x$: $\\dfrac{" + shown[0] + "}{" + shown[1] + "} = \\dfrac{" + shown[2] + "}{" + shown[3] + "}$.",
        type: "number", answer: String(ans),
        hint: "Multiply both sides by both denominators, or compare each side to one fraction in lowest terms. Either way, equal fractions have equal cross-products.",
        steps: steps,
        verify: function () {
          var a = hide === 0 ? ans : vals[0], b = hide === 1 ? ans : vals[1], c = hide === 2 ? ans : vals[2], d = hide === 3 ? ans : vals[3];
          /* both sides reduce to p/q, and the cross-products agree */
          return a * d === b * c && a * q === b * p && c * q === d * p && b > 0 && d > 0;
        }
      };
    }
  });

  G.add({
    id: "pk-scale-word", section: "pk-percent#proportions", par: 75, timed: true,
    make: function (r) {
      var kind = r.pick(["recipe", "map", "pay"]);
      if (kind === "recipe") {
        var n = r.pick([4, 5, 10]), f = r.int(1, 5), m = r.int(6, 30);
        if (m % n === 0) m += 1;
        var egg = r.int(1, 3), oven = r.pick([325, 350, 375, 400]), mins = r.pick([20, 25, 30, 35]);
        var x = f * m / n;
        return {
          q: "A recipe makes $" + n + "$ muffins and uses $" + f + "$ cups of flour and $" + egg + "$ " + (egg === 1 ? "egg" : "eggs") +
            ". The muffins bake at $" + oven + "$ degrees for $" + mins + "$ minutes. How many cups of flour make $" + m + "$ muffins?",
          type: "number", answer: clean(x), placeholder: "cups of flour",
          hint: "Some of these numbers belong to a different question. Keep the two quantities that change together, and set their ratio equal to the same ratio at the new size.",
          steps: [
            "Only the flour and the number of muffins change together. The eggs, the oven and the time are not part of this question.",
            "Flour is in proportion to muffins: $\\dfrac{" + f + "}{" + n + "} = \\dfrac{x}{" + m + "}$.",
            "Multiply both sides by $" + m + "$: $x = \\dfrac{" + f + " \\cdot " + m + "}{" + n + "} = " + clean(x) + "$ cups."
          ],
          verify: function () {
            /* by the unit rate: flour per muffin, times the new count */
            return Math.abs((f / n) * m - Number(clean(x))) < 1e-9 && Math.abs(Number(clean(x)) * n - f * m) < 1e-9;
          }
        };
      }
      if (kind === "map") {
        var a = r.pick([1, 2, 4, 5]), b2 = r.int(2, 12) * (a === 1 ? 5 : a), dd = r.pick([2.5, 3.5, 4, 4.5, 5, 6, 7.5, 8]);
        var width = r.pick([20, 24, 30, 36]);
        var real = b2 * dd / a;
        return {
          q: "On a map, $" + a + "$ " + (a === 1 ? "inch stands" : "inches stand") + " for $" + b2 + "$ miles. The map is $" + width + "$ inches wide. Two towns are $" +
            dd + "$ inches apart on the map. How many miles apart are the towns?",
          type: "number", answer: clean(real), placeholder: "miles",
          hint: "The width of the map is not part of the question. Set up the map-to-miles ratio once, then again for the two towns.",
          steps: [
            "The scale gives one ratio: $" + a + "$ inches to $" + b2 + "$ miles. The width of the map plays no part.",
            "For the towns: $\\dfrac{" + a + "}{" + b2 + "} = \\dfrac{" + dd + "}{x}$.",
            "Cross-multiplying gives $" + a + "x = " + b2 + " \\cdot " + dd + "$, so $x = " + clean(real) + "$ miles."
          ],
          verify: function () {
            /* by the unit rate: miles per inch, times the inches between the towns */
            return Math.abs((b2 / a) * dd - real) < 1e-9 && Math.abs(real * a - b2 * dd) < 1e-9;
          }
        };
      }
      var h1 = r.int(3, 9), rate = r.int(8, 22), h2 = r.int(10, 30), days = r.int(3, 6);
      var pay1 = h1 * rate, pay2 = h2 * rate;
      return {
        q: "A tutor earns " + usd(pay1 * 100) + " for $" + h1 + "$ hours of work. Last week she worked $" + days + "$ days, $" + h2 +
          "$ hours in all, at the same rate. How many dollars did she earn last week?",
        type: "number", answer: String(pay2), placeholder: "dollars",
        hint: "The number of days is a distractor. Pay and hours go together at a constant rate, so find the pay for a single hour first.",
        steps: [
          "Pay is proportional to hours, so the number of days does not matter.",
          "Pay for one hour: $" + pay1 + " \\div " + h1 + " = " + rate + "$ dollars.",
          "Pay for $" + h2 + "$ hours: $" + h2 + " \\cdot " + rate + " = " + pay2 + "$ dollars."
        ],
        verify: function () { return pay2 * h1 === pay1 * h2 && pay2 / h2 === pay1 / h1; }
      };
    }
  });

  var TRIPLES = [
    ["cats", "dogs", "birds"],
    ["apples", "oranges", "pears"],
    ["red beads", "blue beads", "green beads"],
    ["pencils", "pens", "markers"],
    ["sedans", "trucks", "vans"]
  ];

  G.add({
    id: "pk-ratio-chain", section: "pk-percent#proportions", par: 70, timed: true,
    make: function (r) {
      var t = r.pick(TRIPLES), p, q, rr, s, guard = 0;
      do {
        var pq = coprimePair(r, 7), rs = coprimePair(r, 7);
        p = pq[0]; q = pq[1]; rr = rs[0]; s = rs[1];
      } while ((q === rr || lcm(q, rr) > 30) && guard++ < 80);
      if (q === rr) { p = 3; q = 4; rr = 6; s = 5; }
      var L = lcm(q, rr), x = p * (L / q), y = s * (L / rr), g = gcd(x, y), key = [x / g, y / g];
      return {
        q: "The ratio of " + t[0] + " to " + t[1] + " is " + ratioTex([p, q]) + ", and the ratio of " + t[1] + " to " + t[2] + " is " + ratioTex([rr, s]) +
          ". What is the ratio of " + t[0] + " to " + t[2] + ", in lowest terms?",
        type: "ratio", answer: ratioAns(key), placeholder: "e.g. 3:4",
        hint: "The two ratios share a middle quantity but write it with different numbers. Rewrite them so the middle number is the same, then compare the outer two.",
        steps: [
          "The middle quantity is the " + t[1] + ": it is $" + q + "$ in the first ratio and $" + rr + "$ in the second. Make both $" + L + "$ (their least common multiple).",
          "First ratio, scaled by $" + (L / q) + "$: $" + x + " : " + L + "$. Second ratio, scaled by $" + (L / rr) + "$: $" + L + " : " + y + "$.",
          "So " + t[0] + " : " + t[1] + " : " + t[2] + " is $" + x + " : " + L + " : " + y + "$, and " + t[0] + " to " + t[2] + " is $" + x + " : " + y + "$, which is $" + key.join(" : ") + "$ in lowest terms."
        ],
        verify: function () {
          /* build a real flock: L of the middle kind, then count the others and compare */
          var mid = L, first = p * mid / q, last = s * mid / rr;
          return Number.isInteger(first) && Number.isInteger(last) && first * key[1] === last * key[0] && isReduced(key);
        }
      };
    }
  });

  /* ------------------------------------------ pack A §3: percent and change -- */

  /* 8000 gives 8{,}000, so a thousands comma stays inside math */
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "{,}"); }
  /* whole dollars as math: 20000 gives $\$20{,}000$; a dollar amount that may carry cents is usd() or this */
  function dollars(x) {
    var s = clean(x), parts = s.split("."), whole = fmt(parts[0]);
    return "$\\$" + whole + (parts[1] ? "." + (parts[1].length < 2 ? parts[1] + "0" : parts[1]) : "") + "$";
  }
  /* a placeholder example that is never the key */
  function pctHolder(ans) { return String(ans) === "40" ? "e.g. 30%" : "e.g. 40%"; }
  /* a percent key that is not whole says so, since 32.5 rounded to 33 would be wrong */
  function exactPct(ans) { return Number.isInteger(Number(ans)) ? "" : " Give the exact percent."; }

  var FINDS = [
    ["A school has", "students", "ride a bus to school"],
    ["A survey asked", "people", "prefer tea to coffee"],
    ["A town has", "residents", "own a bicycle"],
    ["A choir has", "singers", "play an instrument"]
  ];
  var FIND_PCT = [10, 15, 20, 25, 30, 35, 40, 45, 60, 75, 80];

  G.add({
    id: "pk-percent-find", section: "pk-percent#percent", par: 50, timed: true,
    make: function (r) {
      var c = r.pick(FINDS), p = r.pick(FIND_PCT), N = 20 * r.int(2, 20), k = N * p / 100;
      var kind = r.pick(["part", "percent", "whole"]);
      if (kind === "part") {
        return {
          q: c[0] + " $" + N + "$ " + c[1] + ", and $" + p + "\\%$ of them " + c[2] + ". How many of them " + c[2] + "?",
          type: "number", answer: String(k), placeholder: c[1],
          hint: "A percent of a number is that percent, written as a decimal, times the number. \"Of\" means times.",
          steps: [
            "Write the percent as a decimal: $" + p + "\\% = " + clean(p / 100) + "$.",
            "Multiply by the whole: $" + clean(p / 100) + " \\cdot " + N + " = " + k + "$.",
            "So $" + k + "$ of the " + c[1] + " " + c[2] + "."
          ],
          verify: function () {
            /* the part over the whole must be the percent over 100: cross-multiplied, no division */
            return k * 100 === p * N && Number.isInteger(k) && k > 0 && k < N;
          }
        };
      }
      if (kind === "percent") {
        return {
          q: c[0] + " $" + N + "$ " + c[1] + ", and $" + k + "$ of them " + c[2] + ". What percent of the " + c[1] + " " + c[2] + "?",
          type: "percent", answer: String(p), placeholder: pctHolder(p),
          hint: "A percent is the part over the whole, put per hundred. Which number is the part, and which is the whole?",
          steps: [
            "Part over whole: $\\dfrac{" + k + "}{" + N + "} = " + clean(k / N) + "$.",
            "Per hundred, that is $" + clean(k / N) + " \\cdot 100 = " + p + "$.",
            "So $" + p + "\\%$ of the " + c[1] + " " + c[2] + "."
          ],
          verify: function () {
            /* the percent of the whole must give the part back */
            return Math.round(N * Number(String(p)) / 100) === k && k * 100 / N === p;
          }
        };
      }
      return {
        q: "$" + k + "$ " + c[1] + " " + c[2] + ", and that is $" + p + "\\%$ of all the " + c[1] + ". How many " + c[1] + " are there in all?",
        type: "number", answer: String(N), placeholder: c[1],
        hint: "The number given is a part, and the percent says how big a part of the whole it is. Which operation undoes taking a percent of something?",
        steps: [
          "Let the whole be $w$. Then $" + clean(p / 100) + " w = " + k + "$, because $" + p + "\\%$ of the whole is the part.",
          "Divide both sides by $" + clean(p / 100) + "$: $w = " + k + " \\div " + clean(p / 100) + " = " + N + "$."
        ],
        verify: function () {
          /* take the percent of the key: the part must come back */
          return N * p === k * 100 && N > k;
        }
      };
    }
  });

  var CHANGES = [
    /* most: the largest percent change the thing plausibly makes in one step */
    { money: true, what: "A bicycle's price", up: "rose", down: "fell", lo: 4, hi: 40, most: 50 },
    { money: true, what: "A household's monthly electric bill", up: "rose", down: "fell", lo: 3, hi: 12, most: 30 },
    { money: false, what: "Attendance at a school play", up: "rose", down: "fell", lo: 4, hi: 40, most: 60 },
    { money: false, what: "A town's population", up: "grew", down: "shrank", lo: 20, hi: 200, most: 15 }
  ];
  var CHANGE_PCT = [5, 10, 15, 20, 25, 30, 40, 50, 60];

  G.add({
    id: "pk-percent-change", section: "pk-percent#percent", par: 60, timed: true,
    make: function (r) {
      var kind = r.pick(["up", "down", "error"]);
      if (kind === "error") {
        var A = r.pick([20, 25, 40, 50, 80, 100, 200]), pe = r.pick([2, 4, 5, 10]), E = A * pe / 100, over = r.pick([true, false]);
        var M = over ? A + E : A - E, ctx = r.pick(["scale", "board"]);
        return {
          q: ctx === "scale"
            ? "A laboratory scale reads $" + clean(M) + "$ grams for a mass that is known to be exactly $" + A + "$ grams. What is the percent error of the reading?"
            : "A student measures a board as $" + clean(M) + "$ centimeters long. The board's true length is $" + A + "$ centimeters. What is the percent error of the measurement?",
          type: "percent", answer: String(pe), placeholder: pctHolder(pe),
          hint: "Percent error is the size of the error compared with the true value, not with the reading.",
          steps: [
            "The error is $|" + clean(M) + " - " + A + "| = " + clean(E) + "$.",
            "Compare it with the true value: $\\dfrac{" + clean(E) + "}{" + A + "} = " + clean(E / A) + "$.",
            "As a percent that is $" + pe + "\\%$."
          ],
          verify: function () {
            /* from the key outward: the true value times (1 +/- percent) is the reading */
            var back = over ? A * (100 + pe) / 100 : A * (100 - pe) / 100;
            return Math.abs(back - M) < 1e-9 && Math.abs(Math.abs(M - A) * 100 - pe * A) < 1e-9;
          }
        };
      }
      var c = r.pick(CHANGES), p = r.pick(CHANGE_PCT.filter(function (x) { return x <= c.most; })), base = 20 * r.int(c.lo, c.hi), up = kind === "up";
      var next = base * (up ? 100 + p : 100 - p) / 100;
      var f = function (x) { return c.money ? dollars(x) : "$" + fmt(x) + "$"; };
      var verb = up ? c.up : c.down, word = up ? "increase" : "decrease";
      return {
        q: c.what + " " + verb + " from " + f(base) + " to " + f(next) + ". What was the percent " + word + "?",
        type: "percent", answer: String(p), placeholder: pctHolder(p),
        hint: "A percent change compares the change with the amount you started from. Which of the two numbers is that?",
        steps: [
          "The change is the difference: $|" + fmt(next) + " - " + fmt(base) + "| = " + fmt(Math.abs(next - base)) + "$.",
          "The original is $" + fmt(base) + "$, so the percent change is $\\dfrac{" + fmt(Math.abs(next - base)) + "}{" + fmt(base) + "} = " + clean(Math.abs(next - base) / base) + "$.",
          "As a percent, that is a " + word + " of $" + p + "\\%$."
        ],
        verify: function () {
          /* apply the percent to the start: the other value must come back, by integer cross-products */
          var change = Math.abs(next - base);
          return change * 100 === p * base && (up ? next > base : next < base) && (up ? base * (100 + p) === next * 100 : base * (100 - p) === next * 100);
        }
      };
    }
  });

  var SHOP = ["pair of boots", "backpack", "jacket", "desk lamp", "pair of headphones"];

  G.add({
    id: "pk-percent-price", section: "pk-percent#percent", par: 70, timed: true,
    make: function (r) {
      var kind = r.pick(["tax", "tip", "discount-tax", "sale-reverse", "raise-reverse"]), item = r.pick(SHOP);
      if (kind === "tax") {
        var P = r.pick([20, 24, 30, 36, 40, 45, 50, 60, 75, 80]), t = r.pick([5, 6, 8, 10]);
        var total = P * (100 + t) / 100;
        return {
          q: "A " + item + " costs " + dollars(P) + " before tax, and the sales tax is $" + t + "\\%$. What is the total price with tax, in dollars?",
          type: "number", answer: clean(total), placeholder: "dollars",
          hint: "The price with tax is the price plus a percent of it. One multiplier does both steps at once.",
          steps: [
            "The tax is $" + clean(t / 100) + " \\cdot " + P + " = " + clean(P * t / 100) + "$ dollars.",
            "The total is $" + P + " + " + clean(P * t / 100) + " = " + clean(total) + "$ dollars.",
            "Check with the multiplier: $" + clean(1 + t / 100) + " \\cdot " + P + " = " + clean(total) + "$."
          ],
          verify: function () {
            /* in cents: the price plus the tax, each a whole number of cents */
            var cents = P * 100, taxCents = P * t;
            return cents + taxCents === Math.round(total * 100);
          }
        };
      }
      if (kind === "tip") {
        var B = r.int(24, 96), tp = r.pick([15, 18, 20, 25]);
        var paid = B * (100 + tp) / 100;
        return {
          q: "A restaurant bill is " + dollars(B) + " before the tip. You leave a $" + tp + "\\%$ tip on the bill. How many dollars do you pay in all?",
          type: "number", answer: clean(paid), placeholder: "dollars",
          hint: "You pay the bill and the tip together. The tip is a percent of the bill, not of the total.",
          steps: [
            "The tip is $" + clean(tp / 100) + " \\cdot " + B + " = " + clean(B * tp / 100) + "$ dollars.",
            "You pay $" + B + " + " + clean(B * tp / 100) + " = " + clean(paid) + "$ dollars.",
            "Check with the multiplier: $" + clean(1 + tp / 100) + " \\cdot " + B + " = " + clean(paid) + "$."
          ],
          verify: function () {
            var tipCents = B * tp, billCents = B * 100;
            return billCents + tipCents === Math.round(paid * 100) && tp > 0;
          }
        };
      }
      if (kind === "discount-tax") {
        var P2 = 20 * r.int(2, 10), d = r.pick([10, 20, 25, 30, 40]), t2 = r.pick([5, 8, 10]);
        var sale = P2 * (100 - d) / 100, tot = sale * (100 + t2) / 100;
        return {
          q: "A " + item + " costs " + dollars(P2) + ". It is marked $" + d + "\\%$ off, and then $" + t2 + "\\%$ sales tax is added to the sale price. What is the total in dollars?",
          type: "number", answer: clean(tot), placeholder: "dollars",
          hint: "Do the changes in the order they happen. The tax is charged on the sale price, not on the price before the discount.",
          steps: [
            "The sale price is $" + clean((100 - d) / 100) + " \\cdot " + P2 + " = " + clean(sale) + "$ dollars.",
            "The tax is charged on that: $" + clean(1 + t2 / 100) + " \\cdot " + clean(sale) + " = " + clean(tot) + "$ dollars."
          ],
          verify: function () {
            /* in cents, step by step: price, minus the discount, plus the tax on what is left */
            var cents = P2 * 100, afterCents = cents - cents * d / 100, totCents = afterCents + afterCents * t2 / 100;
            return Math.abs(totCents - tot * 100) < 1e-6 && Math.abs(afterCents - sale * 100) < 1e-6;
          }
        };
      }
      if (kind === "sale-reverse") {
        var O = 20 * r.int(2, 12), d3 = r.pick([10, 20, 25, 30, 40, 50]), s = O * (100 - d3) / 100;
        return {
          q: "During a sale every price is reduced by $" + d3 + "\\%$. A " + item + " now costs " + dollars(s) + ". What was its price before the sale, in dollars?",
          type: "number", answer: String(O), placeholder: "dollars",
          hint: "The sale price is a percent of the original price. Which percent? Then ask what the original must be.",
          steps: [
            "A $" + d3 + "\\%$ discount leaves $" + (100 - d3) + "\\%$ of the original, so $" + clean((100 - d3) / 100) + "x = " + s + "$.",
            "Divide both sides by $" + clean((100 - d3) / 100) + "$: $x = " + s + " \\div " + clean((100 - d3) / 100) + " = " + O + "$ dollars."
          ],
          verify: function () {
            /* discount the key: the sale price must come back, with the discount exactly d3 percent of it */
            return O - O * d3 / 100 === s && O * d3 % 100 === 0 && O > s;
          }
        };
      }
      var R = 100 * r.int(5, 15), g = r.pick([5, 10, 15, 20, 25]), nr = R * (100 + g) / 100;
      return {
        q: "After a $" + g + "\\%$ increase, the monthly rent on an apartment is " + dollars(nr) + ". What was the rent before the increase, in dollars?",
        type: "number", answer: String(R), placeholder: "dollars",
        hint: "The increase was a percent of the old rent, so the new rent is a multiple of the old. Which multiple?",
        steps: [
          "A $" + g + "\\%$ increase multiplies by $" + clean(1 + g / 100) + "$, so $" + clean(1 + g / 100) + "x = " + nr + "$.",
          "Divide both sides by $" + clean(1 + g / 100) + "$: $x = " + nr + " \\div " + clean(1 + g / 100) + " = " + R + "$ dollars."
        ],
        verify: function () {
          /* raise the key: the new rent must come back, and the key must be less */
          return R + R * g / 100 === nr && R < nr;
        }
      };
    }
  });

  /* ------------------------------------------- pack A §4: repeated change -- */

  /* one thing that grows or decays by a fixed percent per period: [text(B, r, n), rates, periods,
     smallest and largest start]. The start is a multiple of the smallest number that keeps every
     period's amount a whole number, so the answer terminates. */
  var GROWTHS = [
    { grow: true, rates: [5, 10], ns: [2, 3], lo: 5000, hi: 60000,
      text: function (B, p, n) { return "A town has $" + fmt(B) + "$ people and grows $" + p + "\\%$ a year. How many people live there after $" + n + "$ years?"; }, unit: "people" },
    { grow: true, rates: [20, 25, 50], ns: [2, 3], lo: 500, hi: 20000,
      text: function (B, p, n) { return "A culture starts with $" + fmt(B) + "$ bacteria and grows $" + p + "\\%$ every hour. How many bacteria are there after $" + n + "$ hours?"; }, unit: "bacteria" },
    { grow: true, rates: [5, 10], ns: [2, 3], lo: 1000, hi: 30000,
      text: function (B, p, n) { return "A savings account holds " + dollars(B) + " and earns $" + p + "\\%$ interest a year, which is added to the balance each year. How many dollars are in the account after $" + n + "$ years?"; }, unit: "dollars" },
    { grow: false, rates: [10, 20], ns: [2, 3], lo: 12000, hi: 40000, mult: 1000,
      text: function (B, p, n) { return "A car is worth " + dollars(B) + " when new and loses $" + p + "\\%$ of its value each year. What is it worth after $" + n + "$ years, in dollars?"; }, unit: "dollars" },
    { grow: false, rates: [25], ns: [2], lo: 800, hi: 2400, mult: 400,
      text: function (B, p, n) { return "A laptop is worth " + dollars(B) + " when new and loses $" + p + "\\%$ of its value each year. What is it worth after $" + n + "$ years, in dollars?"; }, unit: "dollars" },
    { grow: false, rates: [50], ns: [2, 3], lo: 48, hi: 400, mult: 8,
      text: function (B, p, n) { return "A patient takes a $" + B + "$-milligram dose of a drug whose amount in the blood falls $" + p + "\\%$ every $4$ hours. How many milligrams are left after $" + (4 * n) + "$ hours?"; }, unit: "milligrams" }
  ];

  G.add({
    id: "pk-repeat-grow", section: "pk-percent#repeated", par: 80, timed: true,
    make: function (r) {
      var c = r.pick(GROWTHS), p = r.pick(c.rates), n = r.pick(c.ns);
      var a = c.grow ? 100 + p : 100 - p, g = gcd(a, 100), na = a / g, nb = 100 / g, D = Math.pow(nb, n);
      var unit = c.mult || D, lo = Math.ceil(c.lo / unit), hi = Math.floor(c.hi / unit);
      var B = unit * (hi < lo ? lo : r.int(lo, hi));
      /* a base that is a multiple of D keeps every period whole */
      if (B % D !== 0) B = D * Math.ceil(B / D);
      var ans = B / D * Math.pow(na, n), mult = a / 100, chain = [B], i;
      for (i = 1; i <= n; i++) chain.push(chain[i - 1] * a / 100);
      var total = Number(Math.pow(mult, n).toFixed(6));
      return {
        q: c.text(B, p, n), type: "number", answer: String(ans), placeholder: c.unit,
        hint: "Each period's change is a percent of the amount at the start of that period, so the multipliers multiply and do not add. Find one period's multiplier first.",
        steps: [
          "One period multiplies by $" + clean(mult) + "$ (" + (c.grow ? "$1 + " : "$1 - ") + clean(p / 100) + "$).",
          "Period by period: $" + chain.map(fmt).join(" \\to ") + "$.",
          "All at once: $" + clean(mult) + "^{" + n + "} = " + clean(total) + "$, and $" + clean(total) + " \\cdot " + fmt(B) + " = " + fmt(ans) + "$."
        ],
        verify: function () {
          /* exact rationals, a period at a time: the amount (num/den) times (100 +/- p)/100, reduced */
          var num = B, den = 1, k, m = c.grow ? 100 + p : 100 - p;
          for (k = 0; k < n; k++) {
            num *= m; den *= 100;
            var g2 = gcd(num, den);
            num /= g2; den /= g2;
            if (den !== 1) return false;       /* every period's amount is a whole number */
          }
          return num === ans && (c.grow ? ans > B : ans < B);
        }
      };
    }
  });

  var DISCOUNT_PCT = [10, 20, 25, 30, 40, 50];
  var COUPON_PCT = [10, 20, 25, 30, 40];
  /* [name, dearest list price in dollars] */
  var WARES = [["jacket", 300], ["pair of sneakers", 200], ["backpack", 160], ["bicycle helmet", 120], ["winter coat", 400]];

  G.add({
    id: "pk-repeat-discount", section: "pk-percent#repeated", par: 80, timed: true,
    make: function (r) {
      var d1 = r.pick(DISCOUNT_PCT), d2 = r.pick(COUPON_PCT), wr = r.pick(WARES), ware = wr[0];
      var again = 0;
      while (d2 === d1 && again++ < 60) d2 = r.pick(COUPON_PCT);
      if (d2 === d1) d2 = d1 === 10 ? 20 : 10;
      var fits = [], q;
      for (q = 40; q <= wr[1]; q += 20) if ((q * (100 - d1) * (100 - d2)) % 10000 === 0) fits.push(q);
      var P = r.pick(fits.length ? fits : [120]);
      var final = P * (100 - d1) * (100 - d2) / 10000, left = (100 - d1) * (100 - d2) / 100, single = 100 - left;
      if (r.pick([true, false])) {
        return {
          q: "A " + ware + " is priced at " + dollars(P) + " and is $" + d1 + "\\%$ off. At the register a coupon takes a further $" + d2 + "\\%$ off the sale price. How many dollars does it cost?",
          type: "number", answer: String(final), placeholder: "dollars",
          hint: "The coupon is a percent of the sale price, not of the price on the tag. Each discount is a multiplier below 1.",
          steps: [
            "After the first discount: $" + clean((100 - d1) / 100) + " \\cdot " + P + " = " + clean(P * (100 - d1) / 100) + "$ dollars.",
            "The coupon is taken from that: $" + clean((100 - d2) / 100) + " \\cdot " + clean(P * (100 - d1) / 100) + " = " + final + "$ dollars.",
            "Check with one multiplier: $" + clean((100 - d1) / 100) + " \\cdot " + clean((100 - d2) / 100) + " = " + clean(left / 100) + "$, and $" + clean(left / 100) + " \\cdot " + P + " = " + final + "$."
          ],
          verify: function () {
            /* a single discount of `single` percent must reach the same price, and the order must not matter */
            var swapped = P * (100 - d2) / 100 * (100 - d1) / 100;
            return Math.abs(P - P * single / 100 - final) < 1e-6 && Math.abs(swapped - final) < 1e-6 && final < P;
          }
        };
      }
      return {
        q: "A store takes $" + d1 + "\\%$ off a price, then a further $" + d2 + "\\%$ off the reduced price. What single percent discount gives the same final price?" + exactPct(clean(single)),
        type: "percent", answer: clean(single), placeholder: pctHolder(clean(single)),
        hint: "Adding the two percents is wrong: the second discount is taken from the reduced price. Think about what part of the original price is left.",
        steps: [
          "The multipliers are $" + clean((100 - d1) / 100) + "$ and $" + clean((100 - d2) / 100) + "$, and $" + clean((100 - d1) / 100) + " \\cdot " + clean((100 - d2) / 100) + " = " + clean(left / 100) + "$ of the price is left.",
          "So $1 - " + clean(left / 100) + " = " + clean(single / 100) + "$ has gone: a single discount of $" + clean(single) + "\\%$."
        ],
        verify: function () {
          /* follow a price of 100 through both discounts */
          var first = 100 - d1, second = first - first * d2 / 100;
          return Math.abs(100 - second - single) < 1e-9 && single > Math.max(d1, d2) && single < d1 + d2;
        }
      };
    }
  });

  G.add({
    id: "pk-repeat-mixed", section: "pk-percent#repeated", par: 90, timed: true,
    make: function (r) {
      var kind = r.pick(["compare", "net", "nested-count", "nested-percent"]);
      if (kind === "compare") {
        var pr = r.pick([[2, 4], [2, 5], [2, 10], [2, 20], [3, 5], [3, 10], [3, 20]]), n = pr[0], p = pr[1], P;
        var cands = [1000, 2000, 3000, 4000, 5000, 8000, 10000, 15000, 20000].filter(function (x) {
          return (x * (Math.pow(100 + p, n) - Math.pow(100, n) - n * p * Math.pow(100, n - 1))) % Math.pow(100, n) === 0;
        });
        P = r.pick(cands.length ? cands : [10000]);
        var simple = P + n * (P * p / 100), compound = P * Math.pow(100 + p, n) / Math.pow(100, n), diff = compound - simple;
        return {
          q: "Two accounts start with " + dollars(P) + " and earn $" + p + "\\%$ a year. In Plan A each year pays $" + p + "\\%$ of the original " + dollars(P) +
            ". In Plan B each year's interest is added to the balance, and the next year's $" + p + "\\%$ is taken of that new balance. After $" + n + "$ years, how many dollars more does Plan B hold than Plan A?",
          type: "number", answer: clean(diff), placeholder: "dollars",
          hint: "Compare the two plans year by year. They differ from the second year on, where Plan B takes its percent of a bigger balance.",
          steps: [
            "Plan A pays the same each year: $" + clean(P * p / 100) + "$ dollars, a balance of $" + fmt(clean(simple)) + "$ after $" + n + "$ years.",
            "Plan B multiplies by $" + clean(1 + p / 100) + "$ each year: $" + clean(1 + p / 100) + "^{" + n + "} = " + clean(Math.pow(1 + p / 100, n)) + "$, a balance of $" + fmt(clean(compound)) + "$.",
            "The difference is $" + fmt(clean(compound)) + " - " + fmt(clean(simple)) + " = " + clean(diff) + "$ dollars."
          ],
          verify: function () {
            /* year by year in cents: Plan B's balance grows by p percent of itself, Plan A's by p percent of P */
            var a = P * 100, b = P * 100, y;
            for (y = 0; y < n; y++) { a += P * p; b += b * p / 100; }
            return Math.abs((b - a) / 100 - diff) < 1e-6 && diff > 0;
          }
        };
      }
      if (kind === "net") {
        var up, down, guard = 0;
        do { up = r.pick([10, 20, 25, 30, 40, 50]); down = r.pick([10, 20, 25, 30, 40, 50]); } while (((100 + up) * (100 - down) >= 10000) && guard++ < 80);
        if ((100 + up) * (100 - down) >= 10000) { up = 20; down = 20; }
        var net = 100 - (100 + up) * (100 - down) / 100, what = r.pick([["A stock's price", "week"], ["The price of a concert ticket", "month"]]);
        return {
          q: what[0] + " rises $" + up + "\\%$ in one " + what[1] + " and falls $" + down + "\\%$ the next " + what[1] + ". By what percent is the price lower after the two " + what[1] + "s than at the start?" + exactPct(clean(net)),
          type: "percent", answer: clean(net), placeholder: pctHolder(clean(net)),
          hint: "Do not add the two percents: the fall is a percent of the price after the rise. Follow an easy starting price through both changes.",
          steps: [
            "The multipliers are $" + clean(1 + up / 100) + "$ and $" + clean(1 - down / 100) + "$, and $" + clean(1 + up / 100) + " \\cdot " + clean(1 - down / 100) + " = " + clean((100 + up) * (100 - down) / 10000) + "$.",
            "So the price is $" + clean((100 + up) * (100 - down) / 100) + "\\%$ of the start: $" + clean(net) + "\\%$ lower."
          ],
          verify: function () {
            /* start at 100, then the rise, then the fall: the price must be `net` below 100 */
            var after = 100 + up, end = after - after * down / 100;
            return Math.abs(100 - end - net) < 1e-9 && net > 0;
          }
        };
      }
      var NEST = [
        { pl: "students", c1: "are in the band", c2: "the band members", c3: "play brass", ask: "play brass in the band", f: [10, 20, 25], s: [10, 20, 25, 40, 50] },
        { pl: "cars on the lot", c1: "are SUVs", c2: "the SUVs", c3: "are red", ask: "are red SUVs", f: [20, 25, 40, 50], s: [10, 20, 25, 30] },
        { pl: "trees in the orchard", c1: "are apple trees", c2: "the apple trees", c3: "are ripe", ask: "are ripe apple trees", f: [20, 25, 40, 50, 60, 80], s: [20, 25, 40, 50, 60, 80] }
      ];
      var nn = r.pick(NEST), a1 = r.pick(nn.f), a2 = r.pick(nn.s);
      var cand = [200, 400, 500, 800, 1000, 1200, 1600, 2000].filter(function (x) { return (x * a1 * a2) % 10000 === 0; });
      var N = r.pick(cand.length ? cand : [2000]), total = N * a1 * a2 / 10000;
      var lead = "Of the $" + fmt(N) + "$ " + nn.pl + ", $" + a1 + "\\%$ " + nn.c1 + ", and $" + a2 + "\\%$ of " + nn.c2 + " " + nn.c3 + ".";
      if (kind === "nested-count") {
        return {
          q: lead + " How many of the " + nn.pl + " " + nn.ask + "?",
          type: "number", answer: String(total), placeholder: "count",
          hint: "The second percent is of the group the first percent picked out, not of everything. Take the percents one after the other.",
          steps: [
            "The first group is $" + clean(a1 / 100) + " \\cdot " + fmt(N) + " = " + fmt(N * a1 / 100) + "$.",
            "The second percent is of that group: $" + clean(a2 / 100) + " \\cdot " + fmt(N * a1 / 100) + " = " + fmt(total) + "$."
          ],
          verify: function () {
            /* one multiplier for both: a1 percent of a2 percent is a1*a2/100 percent of the whole */
            return N * (a1 * a2 / 100) / 100 === total && total < N * a1 / 100;
          }
        };
      }
      var pct = a1 * a2 / 100;
      return {
        q: lead + " What percent of all the " + nn.pl + " " + nn.ask + "?" + exactPct(clean(pct)),
        type: "percent", answer: clean(pct), placeholder: pctHolder(clean(pct)),
        hint: "Percents of percents multiply, they do not add. Write each percent as a decimal.",
        steps: [
          "The second percent is of the first group, so multiply the decimals: $" + clean(a1 / 100) + " \\cdot " + clean(a2 / 100) + " = " + clean(a1 * a2 / 10000) + "$.",
          "As a percent of the whole, that is $" + clean(pct) + "\\%$."
        ],
        verify: function () {
          /* count it out with the whole as 10,000: the first group, then the second out of it */
          var first = 10000 * a1 / 100, second = first * a2 / 100;
          return Math.abs(second / 100 - pct) < 1e-9;
        }
      };
    }
  });

  /* ============================================================ pack B: data */

  /* the numbers of a list as math, "$4$, $9$, $11$" */
  function listTex(a) { return a.map(function (x) { return "$" + clean(x) + "$"; }).join(", "); }
  function sortedCopy(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  function sumOf(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
  /* the median of a list, whatever its order */
  function medianOf(a) {
    var s = sortedCopy(a), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  /* n different integers from lo..hi (a short list from a short range), in no order */
  function distinctInts(r, n, lo, hi) {
    var pool = [], i;
    for (i = lo; i <= hi; i++) pool.push(i);
    var out = [];
    while (out.length < n) out.push(pool.splice(r.int(0, pool.length - 1), 1)[0]);
    return out;
  }

  /* what the numbers measure, with a range each could plausibly take */
  var DATA_CONTEXTS = [
    { lo: 55, hi: 100, intro: "A student's quiz scores are", what: "a student's quiz scores", head: "Score", cap: "A student's quiz scores." },
    { lo: 48, hi: 92, intro: "The daily high temperatures last week, in degrees, were", what: "the daily high temperatures, in degrees, over a stretch of days", head: "Degrees", cap: "Daily high temperatures in degrees." },
    { lo: 10, hi: 90, intro: "The minutes of homework a student did on different nights were", what: "the minutes of homework a student did on different nights", head: "Minutes", cap: "Minutes of homework on different nights." },
    { lo: 40, hi: 98, intro: "A basketball team scored these points in its games:", what: "the points a basketball team scored in its games", head: "Points", cap: "Points scored by a basketball team." },
    { lo: 12, hi: 60, intro: "A shop counted these customers in different hours:", what: "the customers a shop counted in different hours", head: "Customers", cap: "Customers counted in different hours." }
  ];

  /* --------------------------------------------- pack B §1: center and spread -- */

  G.add({
    id: "pk-center-summary", section: "pk-data#center", par: 50, timed: true,
    make: function (r) {
      var c = r.pick(DATA_CONTEXTS), kind = r.pick(["mean", "median", "range", "mode"]);
      var n = kind === "median" ? r.int(5, 9) : r.int(5, 8), vals = [], guard = 0, i;
      if (kind === "mode") {
        /* one value three times, the rest all different from it and from each other */
        var pool = distinctInts(r, n - 2, c.lo, c.hi);
        vals = pool.slice(0, n - 3);
        var m0 = pool[n - 3];
        vals.push(m0, m0, m0);
        vals = r.shuffle(vals);
      } else {
        do {
          vals = [];
          for (i = 0; i < n; i++) vals.push(r.int(c.lo, c.hi));
          guard++;
        } while (kind === "mean" && sumOf(vals) % n !== 0 && guard < 400);
        if (kind === "mean" && sumOf(vals) % n !== 0) {
          /* never reached in practice; the fallback pairs v-k with v+k, so the mean is v and every value is in range */
          var v0 = Math.round((c.lo + c.hi) / 2), k0 = 1;
          vals = n % 2 ? [v0] : [];
          while (vals.length < n) { vals.push(v0 - k0, v0 + k0); k0++; }
        }
      }
      var s = sortedCopy(vals), total = sumOf(vals), len = vals.length, ans, steps, ask, hint;
      if (kind === "mean") {
        ans = total / len; ask = "mean";
        hint = "The mean shares the total out evenly: add the values, then divide by how many there are.";
        steps = ["The total is $" + vals.join(" + ") + " = " + total + "$.", "Divide by the number of values: $" + total + " \\div " + len + " = " + clean(ans) + "$."];
      } else if (kind === "median") {
        ans = medianOf(vals); ask = "median";
        hint = "Put the values in order first. The median is the middle one, or the midpoint of the middle two.";
        steps = ["In order: " + listTex(s) + ".", len % 2
          ? "There are $" + len + "$ values, so the median is the middle one, number $" + ((len + 1) / 2) + "$: $" + clean(ans) + "$."
          : "There are $" + len + "$ values, so the median is the midpoint of the middle two, $" + s[len / 2 - 1] + "$ and $" + s[len / 2] + "$: $" + clean(ans) + "$."];
      } else if (kind === "range") {
        ans = s[len - 1] - s[0]; ask = "range";
        hint = "The range is the distance from the smallest value to the largest.";
        steps = ["The largest value is $" + s[len - 1] + "$ and the smallest is $" + s[0] + "$.", "The range is $" + s[len - 1] + " - " + s[0] + " = " + ans + "$."];
      } else {
        ans = vals.filter(function (x) { return vals.filter(function (y) { return y === x; }).length === 3; })[0];
        ask = "mode";
        hint = "The mode is the value that occurs most often. Putting the values in order puts the repeats side by side.";
        steps = ["In order: " + listTex(s) + ".", "The value $" + ans + "$ appears three times and no other value repeats, so the mode is $" + ans + "$."];
      }
      return {
        q: c.intro + " " + listTex(vals) + ". What is the " + ask + "?",
        type: "number", answer: clean(ans), placeholder: ask,
        hint: hint, steps: steps,
        verify: function () {
          if (kind === "mean") return vals.reduce(function (d, x) { return d + (x - ans); }, 0) === 0;
          if (kind === "median") {
            /* a fresh sort, read by position: the middle one, or the midpoint of the middle two */
            var f = vals.slice().sort(function (a, b) { return a - b; });
            var le = f.filter(function (x) { return x <= ans; }).length, ge = f.filter(function (x) { return x >= ans; }).length;
            if (len % 2) return f[(len - 1) / 2] === ans && f.filter(function (x) { return x < ans; }).length <= (len - 1) / 2 && f.lastIndexOf(ans) >= (len - 1) / 2;
            /* the key sits between the middle two, so exactly half the values are at most it and half at least it (a tie in the middle adds to both) */
            return (f[len / 2 - 1] + f[len / 2]) / 2 === ans && le >= len / 2 && ge >= len / 2 && f.filter(function (x) { return x < ans; }).length <= len / 2 && f.filter(function (x) { return x > ans; }).length <= len / 2;
          }
          if (kind === "range") return Math.min.apply(null, vals) + ans === Math.max.apply(null, vals);
          var top = vals.filter(function (x) { return x === ans; }).length;
          return top === 3 && vals.every(function (x) { return x === ans || vals.filter(function (y) { return y === x; }).length === 1; });
        }
      };
    }
  });

  G.add({
    id: "pk-mean-missing", section: "pk-data#center", par: 70, timed: true,
    make: function (r) {
      var n = r.int(4, 7), m = r.int(70, 90), known, miss, guard = 0, i;
      do {
        known = [];
        for (i = 0; i < n - 1; i++) known.push(Math.max(50, Math.min(100, m + r.int(-14, 14))));
        miss = n * m - sumOf(known);
        guard++;
      } while ((miss < 40 || miss > 100) && guard < 400);
      if (miss < 40 || miss > 100) { m = 80; known = [76, 84, 90]; miss = 70; }
      var k = known.length, names = ["first", "second", "third", "fourth", "fifth", "sixth"];
      return {
        q: "A student's first $" + k + "$ test scores are " + listTex(known) + ". What score does the next test need, so that the mean of all $" + (k + 1) + "$ scores is $" + m + "$?",
        type: "number", answer: String(miss), placeholder: "score",
        hint: "A given mean fixes the total of all the tests. Work out that total first, then see how much of it is still missing.",
        steps: [
          "For a mean of $" + m + "$ over $" + (k + 1) + "$ scores the total must be $" + (k + 1) + " \\cdot " + m + " = " + ((k + 1) * m) + "$.",
          "The scores so far total $" + known.join(" + ") + " = " + sumOf(known) + "$.",
          "The score still needed is the rest: $" + ((k + 1) * m) + " - " + sumOf(known) + " = " + miss + "$."
        ],
        verify: function () {
          /* put the key in the list and take the mean */
          return (sumOf(known) + miss) / (known.length + 1) === m && miss >= 40 && miss <= 100;
        }
      };
    }
  });

  G.add({
    id: "pk-iqr", section: "pk-data#center", par: 90, timed: true,
    make: function (r) {
      var c = r.pick(DATA_CONTEXTS), n = r.int(7, 14), vals = [], i;
      for (i = 0; i < n; i++) vals.push(r.int(c.lo, c.hi));
      var s = sortedCopy(vals), h = n >> 1, lower = s.slice(0, h), upper = s.slice(n - h);
      var q1 = medianOf(lower), q3 = medianOf(upper), iqr = q3 - q1;
      var odd = n % 2 === 1;
      return {
        q: c.intro + " " + listTex(vals) + ". What is the interquartile range? (Split the ordered list into a lower and an upper half, leaving out the middle value when the count is odd.)",
        type: "number", answer: clean(iqr), placeholder: "IQR",
        hint: "Order the values, split them into two halves, and take the median of each half. The interquartile range is the distance between those two medians.",
        steps: [
          "In order: " + listTex(s) + ".",
          odd ? "There are $" + n + "$ values, so the median, $" + clean(medianOf(s)) + "$, is left out and each half has $" + h + "$ values."
              : "There are $" + n + "$ values, so each half has $" + h + "$ values.",
          "The lower half is " + listTex(lower) + ", with median $Q_1 = " + clean(q1) + "$. The upper half is " + listTex(upper) + ", with median $Q_3 = " + clean(q3) + "$.",
          "The interquartile range is $Q_3 - Q_1 = " + clean(q3) + " - " + clean(q1) + " = " + clean(iqr) + "$."
        ],
        verify: function () {
          /* the halves by position instead of by slicing, each median by trimming both ends in pairs */
          function trim(a) { a = a.slice(); while (a.length > 2) { a.shift(); a.pop(); } return (a[0] + a[a.length - 1]) / 2; }
          var lo = s.filter(function (x, j) { return j < Math.floor(n / 2); }), up = s.filter(function (x, j) { return j >= Math.ceil(n / 2); });
          /* and by counting: in each half at least half the values are at most its median, and at least half are at least it */
          function splits(half, med) {
            return half.filter(function (x) { return x <= med; }).length >= half.length / 2 && half.filter(function (x) { return x >= med; }).length >= half.length / 2 &&
              half.filter(function (x) { return x < med; }).length <= half.length / 2 && half.filter(function (x) { return x > med; }).length <= half.length / 2;
          }
          return trim(up) - trim(lo) === iqr && iqr >= 0 && lo.length === up.length && splits(lo, q1) && splits(up, q3) &&
            vals.filter(function (x) { return x < q1; }).length <= Math.floor(n / 2) / 2 && vals.filter(function (x) { return x > q3; }).length <= Math.floor(n / 2) / 2;
        }
      };
    }
  });

  /* --------------------------------------------- pack B §2: reading displays -- */

  /* the numbers of a list, counted by value: { value: how many } */
  function tally(a) {
    var t = {};
    a.forEach(function (x) { t[x] = (t[x] || 0) + 1; });
    return t;
  }

  var DOT_CONTEXTS = [
    { lo: 0, hi: 6, what: "the number of pets in each household on a street", head: "Pets", cap: "Pets in each household on one street.", subj: "households", pred: "have", noun: "pets" },
    { lo: 0, hi: 7, what: "the goals a school team scored in each of its games", head: "Goals", cap: "Goals scored by a school team, one dot per game.", subj: "games", pred: "had", noun: "goals" },
    { lo: 0, hi: 8, what: "the number of books each student in a class read last month", head: "Books", cap: "Books read last month, one dot per student.", subj: "students", pred: "read", noun: "books" },
    { lo: 1, hi: 8, what: "the number of emails a teacher got on each school day", head: "Emails", cap: "Emails received on each school day.", subj: "days", pred: "had", noun: "emails" }
  ];

  G.add({
    id: "pk-dot-read", section: "pk-data#displays", par: 60, timed: true,
    make: function (r) {
      var c = r.pick(DOT_CONTEXTS), n = r.int(10, 16), vals, guard = 0, i;
      /* one value with at least three dots and more than any other */
      function uniqueMode(a) {
        var t = tally(a), best = 0, nBest = 0;
        Object.keys(t).forEach(function (key) { if (t[key] > best) { best = t[key]; nBest = 1; } else if (t[key] === best) nBest++; });
        return nBest === 1 && best >= 3;
      }
      do {
        vals = [];
        for (i = 0; i < n; i++) vals.push(r.int(c.lo, c.hi));
        guard++;
      } while (!uniqueMode(vals) && guard < 400);
      if (!uniqueMode(vals)) vals = [c.lo + 1, c.lo + 1, c.lo + 1, c.lo, c.lo + 2, c.lo + 3, c.lo + 4, c.lo + 5, c.lo + 2, c.lo + 4]; /* never reached in practice */
      var s = sortedCopy(vals), len = vals.length, kind = r.pick(["mode", "median", "range", "atleast", "atmost"]);
      var k = r.int(c.lo + 2, c.hi - 1), ans, ask, hint, steps, cnt = tally(vals);
      if (kind === "mode") {
        ans = +Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; })[0];
        ask = "What is the mode?";
        hint = "The mode is the value with the most dots stacked above it. Look for the tallest stack.";
        steps = ["The tallest stack is above $" + ans + "$, with $" + cnt[ans] + "$ dots, more than any other value.", "The mode is $" + ans + "$."];
      } else if (kind === "median") {
        ans = medianOf(vals);
        ask = "What is the median?";
        hint = "Each dot is one value. Count the dots, then count in from the left end to the middle one, or the middle two.";
        steps = ["There are $" + len + "$ dots. Read from the left, the values are " + listTex(s) + ".",
          len % 2 ? "The median is the middle one, number $" + ((len + 1) / 2) + "$: $" + clean(ans) + "$."
                  : "The median is the midpoint of the middle two, numbers $" + (len / 2) + "$ and $" + (len / 2 + 1) + "$, which are $" + s[len / 2 - 1] + "$ and $" + s[len / 2] + "$: $" + clean(ans) + "$."];
      } else if (kind === "range") {
        ans = s[len - 1] - s[0];
        ask = "What is the range?";
        hint = "The range runs from the leftmost dot to the rightmost dot.";
        steps = ["The leftmost dot is at $" + s[0] + "$ and the rightmost is at $" + s[len - 1] + "$.", "The range is $" + s[len - 1] + " - " + s[0] + " = " + ans + "$."];
      } else {
        var up = kind === "atleast";
        /* the threshold sits inside the data's span, so the count is never every dot or none
           (the range is never 0: the mode is unique and there are at least ten values) */
        k = up ? r.int(s[0] + 1, s[len - 1]) : r.int(s[0], s[len - 1] - 1);
        var chosen = s.filter(function (x) { return up ? x >= k : x <= k; });
        ans = chosen.length;
        ask = "How many " + c.subj + " " + c.pred + " " + (up ? "at least" : "at most") + " $" + k + "$ " + c.noun + "?";
        hint = up ? "At least a value includes the stack at that value and every stack to its right. Add up the dots in those stacks."
                  : "At most a value includes the stack at that value and every stack to its left. Add up the dots in those stacks.";
        steps = ["The values " + (up ? "$" + k + "$ or more" : "$" + k + "$ or less") + " are " + listTex(chosen) + ".", "Counting those dots gives $" + ans + "$."];
      }
      return {
        q: "The dot plot shows " + c.what + ". " + ask,
        type: "number", answer: clean(ans), placeholder: "number",
        hint: hint, steps: steps,
        chart: { kind: "dot", head: [c.head], rows: vals, caption: c.cap },
        verify: function () {
          /* from the stacks: how many dots over each value, read off the chart's rows */
          var rows = this.chart ? this.chart.rows : vals;
          var t = tally(rows), keys = Object.keys(t).map(Number).sort(function (a, b) { return a - b; }), total = 0, sum = 0;
          keys.forEach(function (x) { total += t[x]; });
          if (total !== len) return false;
          if (kind === "mode") return t[ans] > 0 && keys.every(function (x) { return x === ans || t[x] < t[ans]; });
          if (kind === "median") {
            /* walk the stacks from the left to the dot at each middle position */
            var at = function (pos) { var run = 0, j; for (j = 0; j < keys.length; j++) { run += t[keys[j]]; if (run >= pos) return keys[j]; } return NaN; };
            return len % 2 ? at((len + 1) / 2) === ans : (at(len / 2) + at(len / 2 + 1)) / 2 === ans;
          }
          if (kind === "range") return keys[keys.length - 1] - keys[0] === ans;
          keys.forEach(function (x) { if (kind === "atleast" ? x >= k : x <= k) sum += t[x]; });
          return sum === ans && ans > 0 && ans < len; /* a count is never every dot or none */
        }
      };
    }
  });

  var HIST_CONTEXTS = [
    { what: "the quiz scores of the students in a class", w: 10, s0: 30, head: "Score", cap: "Quiz scores, one value per student." },
    { what: "the minutes each student took to get to school", w: 5, s0: 0, head: "Minutes", cap: "Minutes to get to school, one value per student." },
    { what: "the heights, in centimeters, of the seedlings in a greenhouse", w: 4, s0: 8, head: "Height", cap: "Seedling heights in centimeters." },
    { what: "the ages of the people on a bus tour", w: 10, s0: 10, head: "Age", cap: "Ages of the people on a bus tour." }
  ];

  G.add({
    id: "pk-hist-read", section: "pk-data#displays", par: 80, timed: true,
    make: function (r) {
      var c = r.pick(HIST_CONTEXTS), kind = r.pick(["bin", "range", "below", "median"]);
      var nb = r.int(4, 5), w = c.w, s0 = c.s0 + w * r.int(0, 2), i, j;
      var n = kind === "median" ? 2 * r.int(10, 19) + 1 : r.int(20, 40);
      /* the count in each bin: at least one, so the first and last bins hold the extremes and the chart bins exactly these */
      var counts = [];
      for (i = 0; i < nb; i++) counts.push(1);
      for (i = 0; i < n - nb; i++) counts[r.int(0, nb - 1)]++;
      var vals = [], edges = [];
      for (i = 0; i < nb; i++) for (j = 0; j < counts[i]; j++) vals.push(r.int(s0 + i * w, s0 + (i + 1) * w - 1));
      vals = r.shuffle(vals);
      for (i = 0; i <= nb; i++) edges.push(s0 + i * w);
      var lead = "The histogram shows " + c.what + ", in bins " + w + " wide. A value on the edge between two bins is counted in the bin to its right: a value of $" + edges[1] + "$ is in the bin that starts at $" + edges[1] + "$. ";
      var ans, ask, hint, steps, b = 0, lo = 0, hi = 0, e = 1;
      var countsTex = counts.map(function (x, bi) { return "$" + edges[bi] + "$ to $" + edges[bi + 1] + "$: $" + x + "$"; }).join("; ");
      var plus = function (a) { return a.map(function (x) { return "$" + x + "$"; }).join(" + "); };
      if (kind === "bin") {
        b = r.int(0, nb - 1);
        ans = counts[b];
        ask = "How many values are in the bin from $" + edges[b] + "$ up to $" + edges[b + 1] + "$?";
        hint = "Find the bar that starts at the left number of the bin and read its height. The height counts the values in the bin.";
        steps = ["Counting the values in each bin, " + countsTex + ".", "The bin from $" + edges[b] + "$ up to $" + edges[b + 1] + "$ holds $" + ans + "$ values."];
      } else if (kind === "range") {
        lo = r.int(0, nb - 2); hi = r.int(lo + 1, nb - 1);
        ans = 0;
        for (i = lo; i <= hi; i++) ans += counts[i];
        ask = "How many values are at least $" + edges[lo] + "$ but less than $" + edges[hi + 1] + "$?";
        hint = "That range is several whole bins side by side. Read the height of each of those bars and add them.";
        steps = ["Counting the values in each bin, " + countsTex + ".", "The range covers the bins from $" + edges[lo] + "$ to $" + edges[hi + 1] + "$: " + plus(counts.slice(lo, hi + 1)) + " $= " + ans + "$."];
      } else if (kind === "below") {
        e = r.int(1, nb - 1);
        ans = 0;
        for (i = 0; i < e; i++) ans += counts[i];
        ask = "How many values are less than $" + edges[e] + "$?";
        hint = "Values below an edge are in the bins to the left of it. Add the heights of all those bars.";
        steps = ["Counting the values in each bin, " + countsTex + ".", "Every bin left of $" + edges[e] + "$ counts: " + plus(counts.slice(0, e)) + " $= " + ans + "$."];
      } else {
        var mid = (n + 1) / 2, run = 0, mb = 0;
        while (run + counts[mb] < mid) { run += counts[mb]; mb++; }
        ans = edges[mb];
        ask = "The median is the middle value of the $" + n + "$ values. What is the left edge of the bin that holds the median?";
        hint = "Find the position of the middle value, then add the bar heights from the left until the running total reaches that position.";
        steps = ["With $" + n + "$ values the median is value number $" + mid + "$. Counting the values in each bin, " + countsTex + ".",
          "The bins before the bin from $" + edges[mb] + "$ to $" + edges[mb + 1] + "$ hold $" + run + "$ values, fewer than $" + mid + "$, and with that bin the total reaches $" + (run + counts[mb]) + "$. So value number $" + mid + "$ is in that bin.",
          "The left edge of that bin is $" + ans + "$."];
      }
      return {
        q: lead + ask,
        type: "number", answer: clean(ans), placeholder: "number",
        hint: hint, steps: steps,
        chart: { kind: "hist", head: [c.head], rows: vals, caption: c.cap, width: w },
        verify: function () {
          /* count the raw rows against the half-open edges [lo, hi), not through the bin counts */
          var rows = this.chart ? this.chart.rows : vals;
          function inRange(a, z) { return rows.filter(function (x) { return x >= a && x < z; }).length; }
          if (rows.length !== n) return false;
          if (kind === "bin") return inRange(edges[b], edges[b] + w) === ans;
          if (kind === "range") return inRange(edges[lo], edges[hi] + w) === ans;
          if (kind === "below") return rows.filter(function (x) { return x < edges[e]; }).length === ans;
          var m = sortedCopy(rows)[(n - 1) / 2], k2 = 0;
          while (!(edges[k2] <= m && m < edges[k2] + w)) k2++;
          return edges[k2] === ans;
        }
      };
    }
  });

  G.add({
    id: "pk-box-read", section: "pk-data#displays", par: 90, timed: true,
    make: function (r) {
      var c = r.pick(DATA_CONTEXTS), n = r.int(9, 15), vals = [], i;
      for (i = 0; i < n; i++) vals.push(r.int(c.lo, c.hi));
      var s = sortedCopy(vals), h = n >> 1, lower = s.slice(0, h), upper = s.slice(n - h);
      var q1 = medianOf(lower), q3 = medianOf(upper), med = medianOf(s), mn = s[0], mx = s[n - 1];
      var kind = r.pick(["median", "q1", "q3", "iqr", "range"]), ans, ask, hint, steps;
      var five = "The five numbers are the minimum, the first quartile, the median, the third quartile and the maximum. ";
      if (kind === "median") {
        ans = med; ask = "What is the median?";
        hint = "The median is the line inside the box. Read where it falls on the scale.";
        steps = [five + "Here they are $" + clean(mn) + "$, $" + clean(q1) + "$, $" + clean(med) + "$, $" + clean(q3) + "$ and $" + clean(mx) + "$.", "The median is the middle one, $" + clean(med) + "$."];
      } else if (kind === "q1") {
        ans = q1; ask = "What is the first quartile, $Q_1$?";
        hint = "The first quartile is where the box starts, its left end.";
        steps = [five + "Here they are $" + clean(mn) + "$, $" + clean(q1) + "$, $" + clean(med) + "$, $" + clean(q3) + "$ and $" + clean(mx) + "$.", "The box starts at the first quartile, $Q_1 = " + clean(q1) + "$."];
      } else if (kind === "q3") {
        ans = q3; ask = "What is the third quartile, $Q_3$?";
        hint = "The third quartile is where the box ends, its right end.";
        steps = [five + "Here they are $" + clean(mn) + "$, $" + clean(q1) + "$, $" + clean(med) + "$, $" + clean(q3) + "$ and $" + clean(mx) + "$.", "The box ends at the third quartile, $Q_3 = " + clean(q3) + "$."];
      } else if (kind === "iqr") {
        ans = q3 - q1; ask = "What is the interquartile range?";
        hint = "The interquartile range is the length of the box: its right end minus its left end.";
        steps = [five + "The box runs from $Q_1 = " + clean(q1) + "$ to $Q_3 = " + clean(q3) + "$.", "The interquartile range is $" + clean(q3) + " - " + clean(q1) + " = " + clean(ans) + "$."];
      } else {
        ans = mx - mn; ask = "What is the range?";
        hint = "The range is the whole spread of the data: from the end of the left whisker to the end of the right whisker.";
        steps = [five + "The whiskers end at $" + clean(mn) + "$ and $" + clean(mx) + "$.", "The range is $" + clean(mx) + " - " + clean(mn) + " = " + clean(ans) + "$."];
      }
      return {
        q: "The box plot shows " + c.what + ". A box plot shows five numbers: the minimum, the first quartile $Q_1$, the median, the third quartile $Q_3$ and the maximum. " + ask,
        type: "number", answer: clean(ans), placeholder: kind === "iqr" ? "IQR" : kind === "range" ? "range" : "number",
        hint: hint, steps: steps,
        chart: { kind: "box", head: [c.head], rows: vals, caption: c.cap },
        verify: function () {
          /* the quartiles of the chart's rows, each half trimmed in pairs from both ends (the page's hand method) */
          var rows = this.chart ? this.chart.rows : vals, f = sortedCopy(rows), m = f.length;
          function trim(a) { a = a.slice(); while (a.length > 2) { a.shift(); a.pop(); } return (a[0] + a[a.length - 1]) / 2; }
          var half = Math.floor(m / 2), a1 = trim(f.slice(0, half)), a3 = trim(f.slice(m - half)), am = m % 2 ? f[(m - 1) / 2] : (f[m / 2 - 1] + f[m / 2]) / 2;
          if (m !== n) return false;
          if (kind === "median") return am === ans;
          if (kind === "q1") return a1 === ans;
          if (kind === "q3") return a3 === ans;
          if (kind === "iqr") return a3 - a1 === ans && ans >= 0;
          return f[m - 1] - f[0] === ans;
        }
      };
    }
  });

  /* --------------------------------------- pack B §3: scatterplots and lines of fit -- */

  /* "y = -3x + 160", "y = 2x + 7" (m is never 0 or 1 here) */
  function lineTex(m, b) { return "y = " + (m < 0 ? "-" : "") + (Math.abs(m) === 1 ? "" : Math.abs(m)) + "x " + (b < 0 ? "- " : "+ ") + Math.abs(b); }

  /* what a scatterplot's two measurements are; x runs x0, x0+dx, ... for n points */
  var SCATTER_CONTEXTS = [
    { what: "the hours each of several students studied and their test scores", xh: "Hours studied", yh: "Test score", cap: "Hours studied and test score, one point per student.",
      xdesc: "the hours studied", ydesc: "the test score", yunit: "points", x0: 1, dx: 1, ms: [2, 3, 4], b: [30, 45], sign: 1, ymax: 100 },
    { what: "the temperature and the cups of hot chocolate a café sold on several days", xh: "Temperature (°F)", yh: "Cups sold", cap: "Temperature and cups of hot chocolate sold, one point per day.",
      xdesc: "the temperature in degrees", ydesc: "the cups sold", yunit: "cups", x0: 10, dx: 5, ms: [-2, -3, -4], b: [10, 30], sign: -1, ymax: 300 },
    { what: "the height of a plant at the end of each week", xh: "Week", yh: "Height (cm)", cap: "Height of a plant at the end of each week.",
      xdesc: "the week", ydesc: "the height in centimeters", yunit: "centimeters", x0: 1, dx: 1, ms: [2, 3, 4], b: [8, 20], sign: 1, ymax: 100 },
    { what: "the number of days students were absent and their final grades", xh: "Days absent", yh: "Final grade", cap: "Days absent and final grade, one point per student.",
      xdesc: "the days absent", ydesc: "the final grade", yunit: "points", x0: 1, dx: 1, ms: [-2, -3], b: [35, 50], sign: -1, ymax: 100 }
  ];

  /* a context, a line y = mx + b and n points above and below it by small whole residuals,
     none on the line, between 2 and n-2 of them above */
  function scatterData(r) {
    var c = r.pick(SCATTER_CONTEXTS), n = r.int(8, 12), m = r.pick(c.ms), xs = [], rows = [], res = [], i, guard = 0, above;
    for (i = 0; i < n; i++) xs.push(c.x0 + i * c.dx);
    var xmax = xs[n - 1], b = c.sign < 0 ? -m * xmax + r.int(c.b[0], c.b[1]) : r.int(c.b[0], c.b[1]);
    do {
      res = []; above = 0;
      for (i = 0; i < n; i++) { var e = r.pick([-3, -2, -1, 1, 2, 3]); res.push(e); if (e > 0) above++; }
      guard++;
    } while ((above < 2 || above > n - 2) && guard < 200);
    if (above < 2 || above > n - 2) { res = []; above = 0; for (i = 0; i < n; i++) { res.push(i % 2 ? -1 : 1); if (i % 2 === 0) above++; } }
    for (i = 0; i < n; i++) rows.push([xs[i], m * xs[i] + b + res[i]]);
    return { c: c, n: n, m: m, b: b, xs: xs, rows: rows, res: res, above: above };
  }
  function scatterLead(d) {
    return "The scatterplot shows " + d.c.what + ". A line of fit is $" + lineTex(d.m, d.b) + "$, where $x$ is " + d.c.xdesc + " and $y$ is " + d.c.ydesc + ". ";
  }
  /* every row's y and the line's value at every row's x lie in 0..ymax, and so does any extra number given */
  function inRange(d, rows, extra) {
    var ok = true;
    rows.forEach(function (p) { var pr = stepLine(d.m, d.b, p[0]); if (!(p[1] > 0 && p[1] <= d.c.ymax && pr > 0 && pr <= d.c.ymax)) ok = false; });
    (extra || []).forEach(function (v) { if (!(v > 0 && v <= d.c.ymax)) ok = false; });
    return ok;
  }
  function scatterChart(d) { return { kind: "scatter", head: [d.c.xh, d.c.yh], rows: d.rows, caption: d.c.cap }; }
  /* the prediction at x by stepping from the line's value at x = 0, one x at a time: another route to m*x + b */
  function stepLine(m, b, x) { var y = b, i; for (i = 0; i < x; i++) y += m; return y; }

  G.add({
    id: "pk-scatter-predict", section: "pk-data#scatter", par: 60, timed: true,
    make: function (r) {
      var d = scatterData(r), kind = r.pick(["predict", "predict", "solve"]);
      var lo = d.xs[0], hi = d.xs[d.n - 1], x = r.int(lo, hi), ans, ask, hint, steps;
      if (kind === "predict") {
        ans = d.m * x + d.b;
        ask = "What does the line predict for " + d.c.ydesc + " when $x = " + x + "$?";
        hint = "To predict, put the value of x into the equation of the line in its place, then multiply and add.";
        steps = ["Put $x = " + x + "$ into the line: $y = " + d.m + " \\cdot " + x + (d.b < 0 ? " - " : " + ") + Math.abs(d.b) + "$.", "That is $" + (d.m * x) + (d.b < 0 ? " - " : " + ") + Math.abs(d.b) + " = " + ans + "$."];
      } else {
        var target = d.m * x + d.b;
        ans = x;
        ask = "For what value of $x$ does the line predict $y = " + target + "$?";
        hint = "Set the line's y equal to the given value and solve for x with the two moves for an equation.";
        steps = ["Set $" + d.m + "x " + (d.b < 0 ? "- " : "+ ") + Math.abs(d.b) + " = " + target + "$.", "Take away $" + d.b + "$ from both sides: $" + d.m + "x = " + (target - d.b) + "$.", "Divide both sides by $" + d.m + "$: $x = " + x + "$."];
      }
      return {
        q: scatterLead(d) + ask,
        type: "number", answer: clean(ans), placeholder: kind === "solve" ? "x" : d.c.yunit,
        hint: hint, steps: steps, chart: scatterChart(d),
        verify: function () {
          var rows = this.chart ? this.chart.rows : d.rows;
          if (rows.length !== d.n || !inRange(d, rows, [d.m * x + d.b])) return false;
          if (kind === "predict") return stepLine(d.m, d.b, x) === ans;
          /* walk the x values up from the left until the predicted y reaches the target */
          var t = d.m * x + d.b, k, found = null;
          for (k = lo; k <= hi; k++) if (stepLine(d.m, d.b, k) === t) { found = k; break; }
          return found === ans;
        }
      };
    }
  });

  G.add({
    id: "pk-scatter-residual", section: "pk-data#scatter", par: 80, timed: true,
    make: function (r) {
      var d = scatterData(r), kind = r.pick(["residual", "above", "above", "residual"]), ans, ask, hint, steps, k = r.int(0, d.n - 1);
      if (kind === "residual") {
        var px = d.rows[k][0], py = d.rows[k][1], pred = d.m * px + d.b;
        ans = py - pred;
        ask = "What is the residual of the point at $x = " + px + "$? Take actual minus predicted.";
        hint = "A residual is the actual value minus the predicted value. Find what the line predicts at that x, then read the point's own y in the table.";
        steps = ["The point at $x = " + px + "$ has $y = " + py + "$. The line predicts $" + d.m + " \\cdot " + px + (d.b < 0 ? " - " : " + ") + Math.abs(d.b) + " = " + pred + "$.", "Actual minus predicted: $" + py + " - " + (pred < 0 ? "(" + pred + ")" : pred) + " = " + ans + "$."];
      } else {
        ans = d.above;
        ask = "How many of the $" + d.n + "$ points lie above the line?";
        hint = "A point is above the line when its actual y is larger than the line predicts at its x. Work out the prediction for each x and compare.";
        var preds = d.xs.map(function (x) { return d.m * x + d.b; }), up = [];
        d.rows.forEach(function (p, i) { if (p[1] > preds[i]) up.push(p[0]); });
        steps = ["The line predicts " + listTex(preds) + " for $x = " + d.xs.map(String).join(", ") + "$.", "The actual value is larger at $x = " + up.join(", ") + "$: that is $" + up.length + "$ points."];
      }
      return {
        q: scatterLead(d) + ask,
        type: "number", answer: clean(ans), placeholder: kind === "residual" ? "residual" : "points",
        hint: hint, steps: steps, chart: scatterChart(d),
        verify: function () {
          var rows = this.chart ? this.chart.rows : d.rows, i, cnt = 0;
          if (rows.length !== d.n || !inRange(d, rows)) return false;
          if (kind === "residual") return rows[k][1] - stepLine(d.m, d.b, rows[k][0]) === ans && ans !== 0;
          /* recount from the table: a point is above when its y exceeds the stepped prediction */
          for (i = 0; i < rows.length; i++) if (rows[i][1] > stepLine(d.m, d.b, rows[i][0])) cnt++;
          return cnt === ans && ans >= 1 && ans < rows.length;
        }
      };
    }
  });

  G.add({
    id: "pk-scatter-slope", section: "pk-data#scatter", par: 80, timed: true,
    make: function (r) {
      var d = scatterData(r), kind = r.pick(["slope", "perone", "twoPoint"]), ans, ask, hint, steps;
      /* two x values on the line, far enough apart to read: for a half-integer slope never needed here (m is whole) */
      var a = r.int(0, d.n - 4), x1 = d.xs[a], x2 = d.xs[a + r.int(2, 3)], y1 = d.m * x1 + d.b, y2 = d.m * x2 + d.b;
      var lead = "The scatterplot shows " + d.c.what + ". A line of fit passes through $(" + x1 + ", " + y1 + ")$ and $(" + x2 + ", " + y2 + ")$, where $x$ is " + d.c.xdesc + " and $y$ is " + d.c.ydesc + ". ";
      var rise = y2 - y1, run = x2 - x1;
      var work = ["The rise is $" + y2 + " - " + (y1 < 0 ? "(" + y1 + ")" : y1) + " = " + rise + "$ and the run is $" + x2 + " - " + x1 + " = " + run + "$.", "The slope is $\\frac{" + rise + "}{" + run + "} = " + d.m + "$."];
      var xq = d.xs[r.int(0, d.n - 1)];
      if (kind === "slope") {
        ans = d.m;
        ask = "What is the slope of the line?";
        hint = "The slope is the rise over the run between the two points: the change in y divided by the change in x.";
        steps = work;
      } else if (kind === "perone") {
        ans = d.m;
        ask = "By how much does the predicted $y$ change for each one more $x$? (A decrease is a negative number.)";
        hint = "That change per one more x is the slope. Find it from the rise and the run between the two points.";
        steps = work.concat("So the predicted $y$ changes by $" + d.m + "$ for each one more $x$.");
      } else {
        ans = d.m * xq + d.b;
        ask = "What does the line predict for " + d.c.ydesc + " when $x = " + xq + "$?";
        hint = "Find the slope from the two points first. Then move from one of the points to the new x, adding the slope for each one more x.";
        steps = work.concat("From $(" + x1 + ", " + y1 + ")$ to $x = " + xq + "$ is $" + (xq - x1) + "$ more in $x$, which changes $y$ by $" + d.m + " \\cdot " + (xq < x1 ? "(" + (xq - x1) + ")" : (xq - x1)) + " = " + (d.m * (xq - x1)) + "$, so $y = " + y1 + (d.m * (xq - x1) < 0 ? " - " : " + ") + Math.abs(d.m * (xq - x1)) + " = " + ans + "$.");
      }
      return {
        q: lead + ask,
        type: "number", answer: clean(ans), placeholder: kind === "twoPoint" ? d.c.yunit : "slope",
        hint: hint, steps: steps, chart: scatterChart(d),
        verify: function () {
          /* the slope from the points as a fraction, then, for a prediction, by interpolating between them */
          var s = (y2 - y1) / (x2 - x1);
          if (x2 === x1 || s !== d.m || !inRange(d, this.chart ? this.chart.rows : d.rows, [y1, y2, d.m * xq + d.b])) return false;
          if (kind !== "twoPoint") return s === ans;
          return y1 + (xq - x1) * (y2 - y1) / (x2 - x1) === ans;
        }
      };
    }
  });

  /* --------------------------------------------- pack B §4: samples and claims -- */

  /* a sample "In a random sample of $n$ students, $k$ walk to school." */
  var SAMPLE_CONTEXTS = [
    { pop: "A school has", noun: "students", does: "walk to school", all: "students walk to school" },
    { pop: "A town has", noun: "residents", does: "favor building a new park", all: "residents favor the park" },
    { pop: "A district has", noun: "voters", does: "support the measure", all: "voters support the measure" },
    { pop: "A gym has", noun: "members", does: "come at least three times a week", all: "members come that often" },
    { pop: "A college has", noun: "students", does: "own a bicycle", all: "students own a bicycle" }
  ];
  /* sample sizes for which 100k/n is a multiple of 0.5 */
  var SAMPLE_SIZES = [20, 25, 40, 50, 100, 200];
  function sampleLine(c, n, k) { return "In a random sample of $" + n + "$ " + c.noun + ", $" + k + "$ " + c.does + ". "; }

  G.add({
    id: "pk-sample-percent", section: "pk-data#samples", par: 50, timed: true,
    make: function (r) {
      var c = r.pick(SAMPLE_CONTEXTS), n = r.pick(SAMPLE_SIZES), kind = r.pick(["percent", "percent", "count"]);
      if (kind === "percent") {
        var k = r.int(2, n - 2), p = 100 * k / n;
        return {
          q: sampleLine(c, n, k) + "What percent of the sample is that?" + exactPct(clean(p)),
          type: "percent", answer: clean(p), placeholder: pctHolder(clean(p)),
          hint: "A sample percent is the part over the sample size, per hundred. Which number is the part, and which is the whole sample?",
          steps: ["The sample proportion is $\\frac{" + k + "}{" + n + "} = " + clean(k / n) + "$.", "As a percent that is $" + clean(p) + "\\%$."],
          verify: function () {
            /* the percent of the sample size must give back the count */
            return Math.abs(p * n / 100 - k) < 1e-9 && k > 0 && k < n;
          }
        };
      }
      var pc = r.pick([10, 15, 20, 24, 30, 35, 36, 45, 60, 65, 72, 85]), nn = r.pick([100, 200, 400, 500]);
      var cnt = pc * nn / 100;
      return {
        q: "In a random sample of $" + nn + "$ " + c.noun + ", $" + pc + "\\%$ " + c.does + ". How many of the " + c.noun + " in the sample is that?",
        type: "number", answer: String(cnt), placeholder: "count",
        hint: "A percent of the sample is a part of the sample. Write the percent as a decimal and multiply by the sample size.",
        steps: ["As a decimal, $" + pc + "\\% = " + clean(pc / 100) + "$.", "The count is $" + clean(pc / 100) + " \\cdot " + nn + " = " + cnt + "$."],
        verify: function () { return cnt * 100 === pc * nn && Number.isInteger(cnt) && cnt < nn; }
      };
    }
  });

  G.add({
    id: "pk-sample-estimate", section: "pk-data#samples", par: 80, timed: true,
    make: function (r) {
      var c = r.pick(SAMPLE_CONTEXTS), kind = r.pick(["estimate", "estimate", "two", "larger"]);
      if (kind === "estimate") {
        var n = r.pick([40, 50, 80, 100, 200, 250]), f = r.int(Math.ceil(1000 / n), Math.ceil(1000 / n) + 30), N = n * f, k = r.int(3, n - 3), ans = k * f;
        return {
          q: c.pop + " $" + fmt(N) + "$ " + c.noun + ". " + sampleLine(c, n, k) + "Estimate how many of all the " + c.all + ".",
          type: "number", answer: String(ans), placeholder: "count",
          hint: "Find the proportion of the sample, then take that same proportion of the whole group. It is a proportion of the kind in Pack A.2.",
          steps: ["The sample proportion is $\\frac{" + k + "}{" + n + "} = " + clean(k / n) + "$.", "Assume the whole group has the same proportion: $" + clean(k / n) + " \\cdot " + fmt(N) + " = " + fmt(ans) + "$."],
          verify: function () {
            /* cross-multiplication: k / n = ans / N */
            return k * N === ans * n && ans > 0 && ans < N;
          }
        };
      }
      if (kind === "two") {
        var n2 = r.pick([40, 50, 80, 100, 200]), f2 = r.int(Math.ceil(1000 / n2), Math.ceil(1000 / n2) + 30), N2 = n2 * f2, k1 = r.int(3, n2 - 8), k2 = k1 + r.int(2, 6);
        return {
          q: c.pop + " $" + fmt(N2) + "$ " + c.noun + ". One random sample of $" + n2 + "$ finds $" + k1 + "$ who " + c.does + ", and another random sample of $" + n2 + "$ finds $" + k2 + "$. Give the two estimates of how many of all the " + c.all + ", separated by a comma, smaller first.",
          type: "set", answer: (k1 * f2) + "," + (k2 * f2), placeholder: "e.g. 400,900",
          hint: "For each sample, find its proportion and take that proportion of the whole group.",
          steps: ["The first sample gives $\\frac{" + k1 + "}{" + n2 + "} \\cdot " + fmt(N2) + " = " + fmt(k1 * f2) + "$.", "The second gives $\\frac{" + k2 + "}{" + n2 + "} \\cdot " + fmt(N2) + " = " + fmt(k2 * f2) + "$."],
          verify: function () {
            /* both estimates by cross-multiplying, and the smaller first */
            var e1 = k1 * f2, e2 = k2 * f2;
            return k1 * N2 === e1 * n2 && k2 * N2 === e2 * n2 && e1 < e2 && e1 + "," + e2 === this.answer;
          }
        };
      }
      var big = r.pick([200, 500]), small = r.pick([50, 100]), g = r.int(2, 9), N3 = 1000 * g;
      var kb = r.int(10, big - 10), ks = Math.max(1, Math.min(small - 1, Math.round(kb * small / big) + r.pick([-3, -2, 2, 3])));
      var ans3 = kb * N3 / big;
      return {
        q: c.pop + " $" + fmt(N3) + "$ " + c.noun + ". A random sample of $" + small + "$ finds $" + ks + "$ who " + c.does + ", and another random sample of $" + big + "$ finds $" + kb + "$. Use the larger sample to estimate how many of all the " + c.all + ".",
        type: "number", answer: String(ans3), placeholder: "count",
        hint: "Larger samples vary less, so use the sample of " + big + ". Find its proportion, then take that proportion of the whole group.",
        steps: ["The larger sample is the one of $" + big + "$. Its proportion is $\\frac{" + kb + "}{" + big + "} = " + clean(kb / big) + "$.", "$" + clean(kb / big) + " \\cdot " + fmt(N3) + " = " + fmt(ans3) + "$."],
        verify: function () { return kb * N3 === ans3 * big && Number.isInteger(ans3) && big > small; }
      };
    }
  });

  G.add({
    id: "pk-sample-compare", section: "pk-data#samples", par: 70, timed: true,
    make: function (r) {
      var c = r.pick(SAMPLE_CONTEXTS), n = r.pick([20, 25, 40, 50]), k1 = r.int(2, n - 8), k2 = k1 + r.int(2, 6);
      var p1 = 100 * k1 / n, p2 = 100 * k2 / n, ans = p2 - p1;
      return {
        q: "Two random samples of $" + n + "$ " + c.noun + " are taken from the same group. In the first, $" + k1 + "$ " + c.does + "; in the second, $" + k2 + "$. By how many percentage points do the two sample percents differ?",
        type: "number", answer: clean(ans), placeholder: "percentage points",
        hint: "Find each sample's percent on its own, then subtract the smaller from the larger.",
        steps: ["The first sample is $\\frac{" + k1 + "}{" + n + "} = " + clean(p1) + "\\%$ and the second is $\\frac{" + k2 + "}{" + n + "} = " + clean(p2) + "\\%$.", "The difference is $" + clean(p2) + " - " + clean(p1) + " = " + clean(ans) + "$ percentage points."],
        verify: function () {
          /* both samples have the same size, so the gap in counts, per hundred of the sample */
          return Math.abs((k2 - k1) * 100 / n - ans) < 1e-9 && k2 > k1 && ans > 0;
        }
      };
    }
  });
  /* --------------------------------------------- pack C §1: probability as a fraction of outcomes -- */

  var fracAns = u.fracAns, fracTex = u.fracTex;
  /* how many items of an array pass a test */
  function countIf(a, f) { var n = 0; a.forEach(function (x) { if (f(x)) n++; }); return n; }
  /* a key "a/b" (or "a") as [numerator, denominator] */
  function keyParts(k) { var p = String(k).split("/"); return [Number(p[0]), p[1] === undefined ? 1 : Number(p[1])]; }
  /* the whole numbers 1 to n */
  function upTo(n) { var a = [], i; for (i = 1; i <= n; i++) a.push(i); return a; }
  /* an unreduced fraction as math: \frac{3}{8} */
  function fr(n, d) { return "\\frac{" + n + "}{" + d + "}"; }
  /* does the key "a/b" equal fav over total? (cross-multiplied, so no division) */
  function keyIs(key, fav, total) { var k = keyParts(key); return k[0] * total === fav * k[1]; }

  var WORDS = ["MISSISSIPPI", "PROBABILITY", "MATHEMATICS", "BANANA", "CALIFORNIA", "TENNESSEE"];

  G.add({
    id: "pk-prob-single", section: "pk-chance#outcomes", par: 40, timed: true,
    make: function (r) {
      var kind = r.pick(["bag", "bag", "die", "cards"]), q, total, fav, why, items, test;
      if (kind === "bag") {
        var cols = r.shuffle(["red", "blue", "green", "yellow", "white"]).slice(0, 3), cn = [r.int(2, 9), r.int(2, 9), r.int(2, 9)];
        var two = r.chance(0.3), pickIdx = r.int(0, 2), chosen = two ? [cols[pickIdx], cols[(pickIdx + 1) % 3]] : [cols[pickIdx]];
        total = cn[0] + cn[1] + cn[2];
        fav = 0;
        cols.forEach(function (c, i) { if (chosen.indexOf(c) > -1) fav += cn[i]; });
        items = [];
        cols.forEach(function (c, i) { var j; for (j = 0; j < cn[i]; j++) items.push(c); });
        test = function (x) { return chosen.indexOf(x) > -1; };
        q = "A bag holds $" + cn[0] + "$ " + cols[0] + ", $" + cn[1] + "$ " + cols[1] + " and $" + cn[2] + "$ " + cols[2] + " marbles. One marble is drawn at random. What is the probability that it is " + chosen.join(" or ") + "?";
        why = ["The bag holds $" + cn[0] + " + " + cn[1] + " + " + cn[2] + " = " + total + "$ marbles, all equally likely to be drawn.", "The favorable marbles are the " + chosen.join(" and the ") + " ones: $" + fav + "$ of them."];
      } else if (kind === "die") {
        var n = r.pick([6, 8, 10, 12]), ev = r.pick(["even", "greater", "multiple"]), m = r.pick([2, 3, 4, 5]), k = r.int(2, n - 2), text;
        if (ev === "even") { fav = n / 2; test = function (x) { return x % 2 === 0; }; text = "an even number"; }
        else if (ev === "greater") { fav = n - k; test = function (x) { return x > k; }; text = "a number greater than $" + k + "$"; }
        else { fav = Math.floor(n / m); test = function (x) { return x % m === 0; }; text = "a multiple of $" + m + "$"; }
        total = n; items = upTo(n);
        q = "A fair die has $" + n + "$ faces numbered $1$ to $" + n + "$. It is rolled once. What is the probability that it shows " + text + "?";
        why = ["The sample space is $1, 2, \\dots, " + n + "$: $" + n + "$ equally likely outcomes.",
          "The outcomes in the event are " + listTex(items.filter(test)) + ": $" + fav + "$ of them."];
      } else {
        var w = r.pick(WORDS), letters = w.split(""), vowel = r.chance(0.5), L = r.pick(letters);
        total = letters.length; items = letters;
        var t = {}; letters.forEach(function (x) { t[x] = (t[x] || 0) + 1; });
        if (vowel) { fav = (t.A || 0) + (t.E || 0) + (t.I || 0) + (t.O || 0) + (t.U || 0); test = function (x) { return "AEIOU".indexOf(x) > -1; }; }
        else { fav = t[L]; test = function (x) { return x === L; }; }
        q = "Each letter of the word " + w + " is written on its own card, and the cards are shuffled face down. One card is drawn. What is the probability that it shows " + (vowel ? "a vowel? Count Y as a consonant." : "the letter " + L + "?");
        why = ["The word has $" + total + "$ letters, so there are $" + total + "$ equally likely cards.", "The cards in the event number $" + fav + "$" + (vowel ? " (the vowels A, E, I, O, U)" : " (the letter " + L + " appears that many times)") + "."];
      }
      var ans = fracAns(fav, total);
      return {
        q: q, type: "fraction", answer: ans, placeholder: "e.g. 1/2",
        hint: "Probability is the number of favorable outcomes over the number of equally likely outcomes. Count each of the two before you divide.",
        steps: why.concat(["The probability is $" + fr(fav, total) + "$" + (u.gcd(fav, total) > 1 ? ", which is $" + fracTex(fav, total) + "$ in lowest terms." : ".")]),
        verify: function () {
          /* list every outcome and count those that pass the test */
          return keyIs(ans, countIf(items, test), items.length) && items.length === total && fav > 0 && fav < total;
        }
      };
    }
  });

  G.add({
    id: "pk-prob-complement", section: "pk-chance#outcomes", par: 40, timed: true,
    make: function (r) {
      var kind = r.pick(["count", "count", "percent", "fraction"]);
      if (kind === "count") {
        var c = r.pick([
          { lead: "A bag holds $N$ marbles, $K$ of them red. One marble is drawn at random.", ask: "that it is not red", yes: "red" },
          { lead: "A class has $N$ students, $K$ of whom walk to school. One student is chosen at random.", ask: "that the student does not walk to school", yes: "walk" },
          { lead: "A box holds $N$ pens, $K$ of them blue. One pen is picked at random.", ask: "that it is not blue", yes: "blue" }
        ]);
        var N = r.int(8, 24), K = r.int(2, N - 3), ans = fracAns(N - K, N);
        return {
          q: c.lead.replace("$N$", "$" + N + "$").replace("$K$", "$" + K + "$") + " What is the probability " + c.ask + "?",
          type: "fraction", answer: ans, placeholder: "e.g. 1/2",
          hint: "Either the event happens or it does not, and the two chances add to a whole. Find the chance of the event itself, or count what is left over.",
          steps: ["Of the $" + N + "$, the event has $" + K + "$, so the rest, $" + N + " - " + K + " = " + (N - K) + "$, are not in it.",
            "The probability is $" + fr(N - K, N) + "$" + (u.gcd(N - K, N) > 1 ? ", which is $" + fracTex(N - K, N) + "$ in lowest terms." : ".")],
          verify: function () {
            /* list the items and count those that are not the event */
            var all = [], i;
            for (i = 0; i < N; i++) all.push(i < K ? c.yes : "other");
            return keyIs(ans, countIf(all, function (x) { return x !== c.yes; }), all.length);
          }
        };
      }
      if (kind === "percent") {
        var p = 5 * r.int(1, 19), a = 100 - p, what = r.pick([
          ["The forecast says there is a $" + p + "\\%$ chance of rain tomorrow.", "that it does not rain"],
          ["A seed packet says each seed has a $" + p + "\\%$ chance of sprouting.", "that a seed does not sprout"],
          ["A player wins a game of chance $" + p + "\\%$ of the time.", "that the player loses"]
        ]);
        return {
          q: what[0] + " What is the chance, as a percent, " + what[1] + "?",
          type: "percent", answer: String(a), placeholder: pctHolder(a),
          hint: "The event and its opposite together cover every outcome. Think about what the whole amounts to when it is written as a percent.",
          steps: ["The whole is $100\\%$, and the event takes $" + p + "\\%$ of it.", "What is left is $100\\% - " + p + "\\% = " + a + "\\%$."],
          verify: function () {
            /* out of 100 equally likely cases, p are the event and the rest are not */
            return countIf(upTo(100), function (x) { return x > p; }) === a && a > 0 && a < 100;
          }
        };
      }
      var b = r.pick([5, 6, 7, 8, 9, 10, 12]), a0 = r.int(1, b - 1), ansF = fracAns(b - a0, b);
      return {
        q: "The probability that Maya wins a game is $" + fr(a0, b) + "$. What is the probability that she does not win?",
        type: "fraction", answer: ansF, placeholder: "e.g. 1/2",
        hint: "Winning and not winning together cover every outcome, so their probabilities add to a whole. Write the whole as a fraction with the same bottom.",
        steps: ["The whole is $" + fr(b, b) + "$.", "Not winning is $" + fr(b, b) + " - " + fr(a0, b) + " = " + fr(b - a0, b) + "$" + (u.gcd(b - a0, b) > 1 ? ", which is $" + fracTex(b - a0, b) + "$ in lowest terms." : ".")],
        verify: function () {
          /* the two probabilities add to 1: cross-multiplied sum */
          var k = keyParts(ansF), g = keyParts(fracAns(a0, b));
          return k[0] * g[1] + g[0] * k[1] === k[1] * g[1] && k[0] > 0 && k[0] < k[1];
        }
      };
    }
  });

  G.add({
    id: "pk-prob-expected", section: "pk-chance#outcomes", par: 60, timed: true,
    make: function (r) {
      var kind = r.pick(["die", "fraction", "past"]);
      if (kind === "die") {
        var ev = r.pick([["a six", 1, function (x) { return x === 6; }], ["an even number", 3, function (x) { return x % 2 === 0; }], ["a number greater than $4$", 2, function (x) { return x > 4; }], ["a $1$ or a $2$", 2, function (x) { return x < 3; }]]);
        var blocks = r.int(2, 20), t = 6 * blocks, ans = ev[1] * blocks;
        return {
          q: "A fair six-sided die is rolled $" + t + "$ times. About how many times would you expect it to show " + ev[0] + "?",
          type: "number", answer: String(ans), placeholder: "count",
          hint: "The expected count is the probability of the event times the number of trials. Find the probability from the faces first.",
          steps: ["The event contains $" + ev[1] + "$ of the $6$ equally likely faces, so the probability is $" + fr(ev[1], 6) + "$" + (u.gcd(ev[1], 6) > 1 ? ", which is $" + fracTex(ev[1], 6) + "$" : "") + ".",
            "The expected count is $" + fr(ev[1], 6) + " \\cdot " + t + " = " + ans + "$."],
          verify: function () {
            /* roll the die's six faces once per block of six rolls, and add up the hits */
            var hits = 0, i;
            for (i = 0; i < blocks; i++) hits += countIf(upTo(6), ev[2]);
            return hits === ans && blocks * 6 === t;
          }
        };
      }
      if (kind === "fraction") {
        var d = r.pick([4, 5, 6, 8, 10]), nn = r.int(1, d - 1), mult = r.int(3, 30), T = d * mult, ans2 = nn * mult;
        var what = r.pick(["a spinner lands on blue", "a seed sprouts", "a free throw goes in"]);
        return {
          q: "The probability that " + what + " is $" + fr(nn, d) + "$. In $" + T + "$ tries, about how many times would you expect it?",
          type: "number", answer: String(ans2), placeholder: "count",
          hint: "Multiply the probability by the number of tries. A fraction of a count is found by dividing by the bottom and multiplying by the top.",
          steps: ["The expected count is $" + fr(nn, d) + " \\cdot " + T + "$.", "Divide $" + T + "$ by $" + d + "$ to get $" + mult + "$, then multiply by $" + nn + "$: $" + ans2 + "$."],
          verify: function () {
            /* the same rate: expected count over tries equals the probability, cross-multiplied */
            return ans2 * d === nn * T && Number.isInteger(ans2);
          }
        };
      }
      var m = r.pick([20, 24, 25, 30, 40, 50]), k = r.int(3, m - 3), red = u.reduce(k, m), N = red.d * r.int(2, 12), ans3 = red.n * (N / red.d);
      var ctx = r.pick([["A player made $" + k + "$ of her last $" + m + "$ free throws.", "free throws", "makes"], ["A machine made $" + m + "$ parts, and $" + k + "$ of them were defective.", "parts", "defective ones"], ["Of $" + m + "$ seeds planted, $" + k + "$ sprouted.", "seeds", "sprouts"]]);
      return {
        q: ctx[0] + " Using these results as the probability, how many " + ctx[2] + " would you expect in the next $" + N + "$ " + ctx[1] + "?",
        type: "number", answer: String(ans3), placeholder: "count",
        hint: "The past results give an experimental probability, the part that succeeded out of all the trials. Then use probability times number of trials.",
        steps: ["The experimental probability is $" + fr(k, m) + "$, which is $" + fracTex(k, m) + "$.", "The expected count in $" + N + "$ is $" + fracTex(k, m) + " \\cdot " + N + " = " + ans3 + "$."],
        verify: function () {
          /* the new count over the new tries matches the old count over the old tries, cross-multiplied */
          return ans3 * m === k * N && Number.isInteger(ans3) && ans3 > 0 && ans3 < N;
        }
      };
    }
  });

  /* --------------------------------------------- pack C §2: compound events -- */

  /* one step of a two-step game: how it is told, its equally likely outcomes, and an event on them */
  function chanceStep(r, kind) {
    var n, k, e;
    if (kind === "coin") {
      e = r.pick([["the coin shows heads", function (o) { return o === "H"; }], ["the coin shows tails", function (o) { return o === "T"; }]]);
      return { act: "a fair coin is flipped", outcomes: ["H", "T"], text: e[0], test: e[1] };
    }
    if (kind === "die") {
      n = r.pick([6, 8]); k = r.int(2, n - 3);
      e = r.pick([["the die shows an even number", function (o) { return o % 2 === 0; }], ["the die shows a number greater than $" + k + "$", function (o) { return o > k; }], ["the die shows a multiple of $3$", function (o) { return o % 3 === 0; }]]);
      return { act: "a fair die with $" + n + "$ faces is rolled", outcomes: upTo(n), text: e[0], test: e[1] };
    }
    if (kind === "spinner") {
      n = r.pick([4, 5, 8, 10]); k = r.int(1, n - 2);
      e = r.pick([["the spinner stops on an even number", function (o) { return o % 2 === 0; }], ["the spinner stops on an odd number", function (o) { return o % 2 === 1; }], ["the spinner stops on a number less than $" + (k + 1) + "$", function (o) { return o <= k; }]]);
      return { act: "a spinner with $" + n + "$ equal sections numbered $1$ to $" + n + "$ is spun", outcomes: upTo(n), text: e[0], test: e[1] };
    }
    var red = r.int(2, 6), blue = r.int(2, 6), items = [], i;
    for (i = 0; i < red; i++) items.push("red");
    for (i = 0; i < blue; i++) items.push("blue");
    var col = r.pick(["red", "blue"]);
    return { act: "one marble is drawn at random from a bag of $" + red + "$ red and $" + blue + "$ blue marbles", outcomes: items, text: "the marble is " + col, test: function (o) { return o === col; } };
  }

  G.add({
    id: "pk-compound-and", section: "pk-chance#compound", par: 60, timed: true,
    make: function (r) {
      var kinds = r.shuffle(["coin", "die", "spinner", "bag"]).slice(0, 2), a = chanceStep(r, kinds[0]), b = chanceStep(r, kinds[1]);
      var fa = countIf(a.outcomes, a.test), fb = countIf(b.outcomes, b.test), ta = a.outcomes.length, tb = b.outcomes.length, ans = fracAns(fa * fb, ta * tb);
      return {
        q: "In a game, " + a.act + " and " + b.act + ". The two steps do not affect each other. What is the probability that " + a.text + " and " + b.text + "?",
        type: "fraction", answer: ans, placeholder: "e.g. 1/2",
        hint: "Find the probability of each step on its own. Because the steps do not affect each other, the chance of both is found by the rule for and.",
        steps: ["The first step: $" + fr(fa, ta) + "$" + (u.gcd(fa, ta) > 1 ? " $= " + fracTex(fa, ta) + "$" : "") + ". The second step: $" + fr(fb, tb) + "$" + (u.gcd(fb, tb) > 1 ? " $= " + fracTex(fb, tb) + "$" : "") + ".",
          "Multiply: $" + fr(fa, ta) + " \\cdot " + fr(fb, tb) + " = " + fr(fa * fb, ta * tb) + "$" + (u.gcd(fa * fb, ta * tb) > 1 ? ", which is $" + fracTex(fa * fb, ta * tb) + "$ in lowest terms." : ".")],
        verify: function () {
          /* list every pair of outcomes and count the pairs where both events happen */
          var pairs = 0, hits = 0;
          a.outcomes.forEach(function (x) { b.outcomes.forEach(function (y) { pairs++; if (a.test(x) && b.test(y)) hits++; }); });
          return pairs === ta * tb && keyIs(ans, hits, pairs) && hits > 0 && hits < pairs;
        }
      };
    }
  });

  G.add({
    id: "pk-compound-or", section: "pk-chance#compound", par: 80, timed: true,
    make: function (r) {
      var kind = r.pick(["multiples", "survey", "mixed"]);
      if (kind === "multiples") {
        var n = r.pick([20, 24, 30, 36, 40]), a, b, guard = 0;
        do { a = r.int(2, 9); b = r.int(2, 9); } while ((a === b || lcm(a, b) > n) && guard++ < 100);
        if (a === b || lcm(a, b) > n) { a = 3; b = 5; }
        var fa = Math.floor(n / a), fb = Math.floor(n / b), fab = Math.floor(n / lcm(a, b)), fav = fa + fb - fab, ans = fracAns(fav, n);
        return {
          q: "Cards numbered $1$ to $" + n + "$ are shuffled and one is drawn. What is the probability that the number is a multiple of $" + a + "$ or a multiple of $" + b + "$?",
          type: "fraction", answer: ans, placeholder: "e.g. 1/2",
          hint: "Adding the two counts counts some cards twice. Find which cards are in both groups, and take them away once.",
          steps: ["Multiples of $" + a + "$: $" + fa + "$ cards. Multiples of $" + b + "$: $" + fb + "$ cards. Multiples of both, that is of $" + lcm(a, b) + "$: $" + fab + "$ cards.",
            "Cards in either group: $" + fa + " + " + fb + " - " + fab + " = " + fav + "$.", "The probability is $" + fr(fav, n) + "$" + (u.gcd(fav, n) > 1 ? ", which is $" + fracTex(fav, n) + "$ in lowest terms." : ".")],
          verify: function () {
            /* list the cards and count those passing either test */
            return keyIs(ans, countIf(upTo(n), function (x) { return x % a === 0 || x % b === 0; }), n) && fav > 0 && fav < n;
          }
        };
      }
      if (kind === "mixed") {
        var N2 = r.pick([8, 10, 12, 20]), k = r.int(2, N2 - 4), evens = N2 / 2, big = N2 - k, both = evens - Math.floor(k / 2), fav2 = evens + big - both, ans2 = fracAns(fav2, N2);
        return {
          q: "A spinner has $" + N2 + "$ equal sections numbered $1$ to $" + N2 + "$. What is the probability that it stops on an even number or on a number greater than $" + k + "$?",
          type: "fraction", answer: ans2, placeholder: "e.g. 1/2",
          hint: "Count the outcomes that are even and the outcomes that are greater, then correct for any outcome in both groups before dividing.",
          steps: ["Even numbers: $" + evens + "$. Numbers greater than $" + k + "$: $" + big + "$. Even and greater than $" + k + "$: $" + both + "$.",
            "Outcomes in either group: $" + evens + " + " + big + " - " + both + " = " + fav2 + "$.", "The probability is $" + fr(fav2, N2) + "$" + (u.gcd(fav2, N2) > 1 ? ", which is $" + fracTex(fav2, N2) + "$ in lowest terms." : ".")],
          verify: function () {
            return keyIs(ans2, countIf(upTo(N2), function (x) { return x % 2 === 0 || x > k; }), N2) && fav2 > 0 && fav2 < N2;
          }
        };
      }
      var c = r.pick([["play soccer", "are in the band", "plays soccer", "is in the band"], ["have a dog", "have a cat", "has a dog", "has a cat"], ["take French", "take Spanish", "takes French", "takes Spanish"]]);
      var onlyA = r.int(2, 10), onlyB = r.int(2, 10), both2 = r.int(2, 8), none = r.int(1, 8), N3 = onlyA + onlyB + both2 + none, S = onlyA + both2, B = onlyB + both2, fav3 = S + B - both2, ans3 = fracAns(fav3, N3);
      return {
        q: "In a group of $" + N3 + "$ students, $" + S + "$ " + c[0] + ", $" + B + "$ " + c[1] + ", and $" + both2 + "$ do both. One student is chosen at random. What is the probability that the student " + c[2] + " or " + c[3] + "?",
        type: "fraction", answer: ans3, placeholder: "e.g. 1/2",
        hint: "The students who do both are inside each of the two counts. Add the counts, then take away the ones counted twice.",
        steps: ["Add the two counts: $" + S + " + " + B + " = " + (S + B) + "$. The $" + both2 + "$ who do both were counted twice.", "Students in either group: $" + (S + B) + " - " + both2 + " = " + fav3 + "$.",
          "The probability is $" + fr(fav3, N3) + "$" + (u.gcd(fav3, N3) > 1 ? ", which is $" + fracTex(fav3, N3) + "$ in lowest terms." : ".")],
        verify: function () {
          /* the three regions of the diagram: only one, only the other, both; the rest are in neither */
          var regions = (S - both2) + (B - both2) + both2;
          return regions === fav3 && N3 - none === regions && keyIs(ans3, regions, N3) && regions < N3;
        }
      };
    }
  });

  G.add({
    id: "pk-compound-noreplace", section: "pk-chance#compound", par: 90, timed: true,
    make: function (r) {
      var c = r.pick([["marbles", "marble", "red", "blue"], ["pens", "pen", "black", "green"], ["tiles", "tile", "red", "white"]]);
      var R = r.int(2, 9), B = r.int(2, 9), T = R + B, kind = r.pick(["first", "second", "mixed"]), fav, text, route, i;
      if (kind === "first") { fav = R * (R - 1); text = "both are " + c[2]; route = fr(R, T) + " \\cdot " + fr(R - 1, T - 1); }
      else if (kind === "second") { fav = B * (B - 1); text = "both are " + c[3]; route = fr(B, T) + " \\cdot " + fr(B - 1, T - 1); }
      else { fav = 2 * R * B; text = "one is " + c[2] + " and one is " + c[3]; route = fr(R, T) + " \\cdot " + fr(B, T - 1) + " + " + fr(B, T) + " \\cdot " + fr(R, T - 1); }
      var den = T * (T - 1), ans = fracAns(fav, den), items = [];
      for (i = 0; i < R; i++) items.push(c[2]);
      for (i = 0; i < B; i++) items.push(c[3]);
      return {
        q: "A bag holds $" + R + "$ " + c[2] + " and $" + B + "$ " + c[3] + " " + c[0] + ". Two " + c[0] + " are drawn one after the other without putting the first back. What is the probability that " + text + "?",
        type: "fraction", answer: ans, placeholder: "e.g. 1/2",
        hint: kind === "mixed"
          ? "There are two orders that give one of each, so work out each order and add. In each order, the second fraction is taken from a bag with one fewer."
          : "After the first draw the bag has one fewer, and the second fraction changes with it. Multiply the chance of the first draw by the chance of the second.",
        steps: kind === "mixed"
          ? ["First then second: $" + fr(R, T) + " \\cdot " + fr(B, T - 1) + "$. The other order: $" + fr(B, T) + " \\cdot " + fr(R, T - 1) + "$.", "Add: $" + route + " = " + fr(fav, den) + "$" + (u.gcd(fav, den) > 1 ? ", which is $" + fracTex(fav, den) + "$ in lowest terms." : ".")]
          : ["The first draw: $" + (kind === "first" ? fr(R, T) : fr(B, T)) + "$. With one gone, the second draw is $" + (kind === "first" ? fr(R - 1, T - 1) : fr(B - 1, T - 1)) + "$.",
            "Multiply: $" + route + " = " + fr(fav, den) + "$" + (u.gcd(fav, den) > 1 ? ", which is $" + fracTex(fav, den) + "$ in lowest terms." : ".")],
        verify: function () {
          /* every ordered pair of two different items, counted */
          var pairs = 0, hits = 0, x, y;
          for (x = 0; x < items.length; x++) for (y = 0; y < items.length; y++) {
            if (x === y) continue;
            pairs++;
            if (kind === "mixed" ? items[x] !== items[y] : (items[x] === items[y] && items[x] === (kind === "first" ? c[2] : c[3]))) hits++;
          }
          return pairs === den && keyIs(ans, hits, pairs) && hits > 0 && hits < pairs && T <= 20;
        }
      };
    }
  });

  /* --------------------------------------------- pack C §3: two-way tables and conditional probability -- */

  /* two questions asked of every member of a group; sg is the form that follows "the student", pl the form that follows "those who" */
  var TW_CONTEXTS = [
    { noun: "students", one: "student",
      A: [{ pl: "play a sport", sg: "plays a sport" }, { pl: "do not play a sport", sg: "does not play a sport" }],
      B: [{ pl: "ride the bus", sg: "rides the bus" }, { pl: "walk to school", sg: "walks to school" }] },
    { noun: "people", one: "person",
      A: [{ pl: "own a bike", sg: "owns a bike" }, { pl: "do not own a bike", sg: "does not own a bike" }],
      B: [{ pl: "live in town", sg: "lives in town" }, { pl: "live outside town", sg: "lives outside town" }] },
    { noun: "students", one: "student",
      A: [{ pl: "are in the band", sg: "is in the band" }, { pl: "are not in the band", sg: "is not in the band" }],
      B: [{ pl: "take Spanish", sg: "takes Spanish" }, { pl: "take French", sg: "takes French" }] },
    { noun: "families", one: "family",
      A: [{ pl: "have a dog", sg: "has a dog" }, { pl: "do not have a dog", sg: "does not have a dog" }],
      B: [{ pl: "have a yard", sg: "has a yard" }, { pl: "do not have a yard", sg: "does not have a yard" }] }
  ];

  /* a 2 by 2 table of counts, stated in words, with every cell at least 2 */
  function twoWay(r) {
    var c = r.pick(TW_CONTEXTS), cell = [[r.int(2, 12), r.int(2, 12)], [r.int(2, 12), r.int(2, 12)]];
    var rowT = [cell[0][0] + cell[0][1], cell[1][0] + cell[1][1]], colT = [cell[0][0] + cell[1][0], cell[0][1] + cell[1][1]], N = rowT[0] + rowT[1];
    var text = "A survey of $" + N + "$ " + c.noun + " found that $" + rowT[0] + "$ of them " + c.A[0].pl + " and the other $" + rowT[1] + "$ " + c.A[1].pl +
      ". Of those who " + c.A[0].pl + ", $" + cell[0][0] + "$ " + c.B[0].pl + " (the rest " + c.B[1].pl + "). Of those who " + c.A[1].pl + ", $" + cell[1][0] + "$ " + c.B[0].pl + " (the rest " + c.B[1].pl + ").";
    var fill = "The four cells: " + c.A[0].pl + " and " + c.B[0].pl + ", $" + cell[0][0] + "$; " + c.A[0].pl + " and " + c.B[1].pl + ", $" + rowT[0] + " - " + cell[0][0] + " = " + cell[0][1] + "$; " +
      c.A[1].pl + " and " + c.B[0].pl + ", $" + cell[1][0] + "$; " + c.A[1].pl + " and " + c.B[1].pl + ", $" + rowT[1] + " - " + cell[1][0] + " = " + cell[1][1] + "$.";
    /* the survey as a list of individuals, [row, column] for each person */
    var people = [], i, j, k;
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) for (k = 0; k < cell[i][j]; k++) people.push([i, j]);
    return { c: c, cell: cell, rowT: rowT, colT: colT, N: N, text: text, fill: fill, people: people };
  }
  function lowest(n, d) { return u.gcd(n, d) > 1 ? ", which is $" + fracTex(n, d) + "$ in lowest terms." : "."; }

  G.add({
    id: "pk-twoway-read", section: "pk-chance#twoway", par: 70, timed: true,
    make: function (r) {
      var t = twoWay(r), c = t.c, kind = r.pick(["cell", "row", "col"]), i = r.int(0, 1), j = r.int(0, 1), fav, q, say;
      if (kind === "cell") { fav = t.cell[i][j]; say = "the " + c.one + " " + c.A[i].sg + " and " + c.B[j].sg; }
      else if (kind === "row") { fav = t.rowT[i]; say = "the " + c.one + " " + c.A[i].sg; }
      else { fav = t.colT[j]; say = "the " + c.one + " " + c.B[j].sg; }
      var ans = fracAns(fav, t.N);
      q = t.text + " One " + c.one + " is chosen at random. What is the probability that " + say + "?";
      return {
        q: q, type: "fraction", answer: ans, placeholder: "e.g. 1/2",
        hint: "Fill in the four cells of a table first. Then count the cells the question asks about, and divide by the number of " + c.noun + " in the whole survey.",
        steps: [t.fill, kind === "cell" ? "The event is one cell: $" + fav + "$ of the $" + t.N + "$ " + c.noun + "." : "The event is a whole " + (kind === "row" ? "row" : "column") + ", its total: $" + fav + "$ of the $" + t.N + "$ " + c.noun + ".",
          "The probability is $" + fr(fav, t.N) + "$" + lowest(fav, t.N)],
        verify: function () {
          /* count the individuals one by one */
          var hits = countIf(t.people, function (p) { return kind === "cell" ? p[0] === i && p[1] === j : (kind === "row" ? p[0] === i : p[1] === j); });
          return t.people.length === t.N && keyIs(ans, hits, t.N) && hits > 0 && hits < t.N;
        }
      };
    }
  });

  G.add({
    id: "pk-twoway-given", section: "pk-chance#twoway", par: 80, timed: true,
    make: function (r) {
      var t = twoWay(r), c = t.c, byRow = r.chance(0.5), i = r.int(0, 1), j = r.int(0, 1), group, fav, q, ans;
      if (byRow) {
        group = t.rowT[i]; fav = t.cell[i][j];
        q = t.text + " One " + c.one + " is chosen at random from those who " + c.A[i].pl + ". What is the probability that the " + c.one + " " + c.B[j].sg + "?";
      } else {
        group = t.colT[j]; fav = t.cell[i][j];
        q = t.text + " One " + c.one + " is chosen at random from those who " + c.B[j].pl + ". What is the probability that the " + c.one + " " + c.A[i].sg + "?";
      }
      ans = fracAns(fav, group);
      return {
        q: q, type: "fraction", answer: ans, placeholder: "e.g. 1/2",
        hint: "The words after “from those who” name the group, and only that group counts. Fill in the table, find the group's total, and see how many of the group are in the event.",
        steps: [t.fill, "The group is " + (byRow ? "the row" : "the column") + " of those who " + (byRow ? c.A[i].pl : c.B[j].pl) + ": $" + group + "$ " + c.noun + ". Of them, $" + fav + "$ " + (byRow ? c.B[j].pl : c.A[i].pl) + ".",
          "The probability is $" + fr(fav, group) + "$" + lowest(fav, group)],
        verify: function () {
          /* keep only the people in the group, then count the event among them */
          var inGroup = t.people.filter(function (p) { return byRow ? p[0] === i : p[1] === j; });
          var hits = countIf(inGroup, function (p) { return p[0] === i && p[1] === j; });
          return inGroup.length === group && keyIs(ans, hits, inGroup.length) && hits > 0 && hits < group;
        }
      };
    }
  });

  G.add({
    id: "pk-twoway-compare", section: "pk-chance#twoway", par: 80, timed: true,
    make: function (r) {
      var c = r.pick(TW_CONTEXTS), sizes = [20, 25, 50], t1 = r.pick(sizes), t2 = r.pick(sizes), c1 = r.int(2, t1 - 2), c2 = r.int(2, t2 - 2), guard = 0;
      var kind = r.pick(["diff", "diff", "percent"]), j = r.int(0, 1);
      while (kind === "diff" && c1 * t2 === c2 * t1 && guard++ < 50) c2 = r.int(2, t2 - 2);
      if (kind === "diff" && c1 * t2 === c2 * t1) { t1 = 20; t2 = 20; c1 = r.int(2, 18); c2 = c1 === 10 ? 4 : 10; }
      var p1 = 100 * c1 / t1, p2 = 100 * c2 / t2;
      if (kind === "percent") {
        var ansP = String(p1);
        return {
          q: "Of the $" + t1 + "$ " + c.noun + " who " + c.A[0].pl + ", $" + c1 + "$ " + c.B[j].pl + ". What percent of those who " + c.A[0].pl + " " + c.B[j].pl + "?",
          type: "percent", answer: ansP, placeholder: pctHolder(p1),
          hint: "A percent is a part of the group named after \u201cof\u201d. Write the part over the group's total, then change it to a fraction whose bottom is one hundred.",
          steps: ["The group has $" + t1 + "$ " + c.noun + ", and $" + c1 + "$ of them are in the event.", "$" + fr(c1, t1) + " = " + fr(p1, 100) + " = " + p1 + "\\%$."],
          verify: function () { return (t1 - c1) * 100 === (100 - p1) * t1 && c1 >= 2 && c1 <= t1 - 2 && p1 > 0 && p1 < 100; }
        };
      }
      /* the group with the higher percent goes first, so the difference is positive */
      var A0 = c.A[0], A1 = c.A[1], B = c.B[j], ans = Math.abs(p1 - p2);
      var swap = p1 < p2, first = swap ? A1 : A0, second = swap ? A0 : A1;
      var tA = swap ? t2 : t1, cA = swap ? c2 : c1, tB = swap ? t1 : t2, cB = swap ? c1 : c2;
      return {
        q: "Of the $" + t1 + "$ " + c.noun + " who " + A0.pl + ", $" + c1 + "$ " + B.pl + ". Of the $" + t2 + "$ who " + A1.pl + ", $" + c2 + "$ " + B.pl + ". The percent of those who " + first.pl + " who " + B.pl + " is how many percentage points higher than the percent of those who " + second.pl + " who " + B.pl + "?",
        type: "number", answer: clean(ans), placeholder: "percentage points",
        hint: "The groups may differ in size, so compare fractions, not counts. Find each group's percent on its own, then subtract.",
        steps: ["Those who " + first.pl + ": $" + fr(cA, tA) + " = " + clean(100 * cA / tA) + "\\%$. Those who " + second.pl + ": $" + fr(cB, tB) + " = " + clean(100 * cB / tB) + "\\%$.",
          "The difference is $" + clean(100 * cA / tA) + " - " + clean(100 * cB / tB) + " = " + clean(ans) + "$ percentage points."],
        verify: function () {
          /* over a common bottom: the gap of cross products, per hundred */
          var gap = 100 * (cA * tB - cB * tA) / (tA * tB);
          return Math.abs(gap - ans) < 1e-9 && ans > 0 && ans < 100 && cA < tA && cB < tB;
        }
      };
    }
  });

  /* --------------------------------------------- pack C §4: counting arrangements -- */

  /* the number of sequences of k items from n, found by walking every one (repeat: an item may come again) */
  function seqCount(n, k, repeat) {
    var total = 0, used = [], i;
    for (i = 0; i < n; i++) used.push(false);
    (function walk(depth) {
      var x;
      if (depth === k) { total++; return; }
      for (x = 0; x < n; x++) {
        if (!repeat && used[x]) continue;
        used[x] = true; walk(depth + 1); used[x] = false;
      }
    })(0);
    return total;
  }
  /* every arrangement of 0..n-1 */
  function allPerms(n) {
    var out = [], cur = [], used = [], i;
    for (i = 0; i < n; i++) used.push(false);
    (function walk() {
      var x;
      if (cur.length === n) { out.push(cur.slice()); return; }
      for (x = 0; x < n; x++) {
        if (used[x]) continue;
        used[x] = true; cur.push(x); walk(); cur.pop(); used[x] = false;
      }
    })();
    return out;
  }
  function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }
  /* n times n-1 times ... for k factors, as math: 8 \cdot 7 \cdot 6 */
  function falling(n, k) { var a = [], i; for (i = 0; i < k; i++) a.push(n - i); return a.join(" \\cdot "); }
  function fallingVal(n, k) { var v = 1, i; for (i = 0; i < k; i++) v *= n - i; return v; }

  var CT_KINDS = [
    { lead: "Mo has ", items: ["shirts", "pairs of pants", "pairs of shoes"], tail: "An outfit is one of each kind. How many different outfits can Mo make?" },
    { lead: "A diner offers ", items: ["main dishes", "sides", "drinks"], tail: "A meal is one of each kind. How many different meals can be ordered?" },
    { lead: "A deli makes sandwiches from ", items: ["breads", "meats", "cheeses"], tail: "A sandwich has one of each kind. How many different sandwiches are possible?" }
  ];

  G.add({
    id: "pk-count-principle", section: "pk-chance#counting", par: 50, timed: true,
    make: function (r) {
      if (r.chance(0.6)) {
        var c = r.pick(CT_KINDS), m = r.int(2, 3), f = [], i;
        for (i = 0; i < m; i++) f.push(r.int(2, 9));
        var words = f.map(function (x, idx) { return "$" + x + "$ " + c.items[idx]; }), list = words.length === 2 ? words.join(" and ") : words[0] + ", " + words[1] + " and " + words[2];
        var prod = f.reduce(function (a, b) { return a * b; }, 1);
        return {
          q: c.lead + list + ". " + c.tail.replace("one of each kind", m === 2 ? "one of each of the two kinds" : "one of each kind"),
          type: "number", answer: String(prod), placeholder: "count",
          hint: "Each choice can be paired with every choice at the next step, and the number of choices at one step does not depend on the others. Multiply, or think of a list with one row for each first choice.",
          steps: ["There are " + f.map(function (x) { return "$" + x + "$"; }).join(", ") + " choices at the steps.", "The counting principle multiplies them: $" + f.join(" \\cdot ") + " = " + prod + "$."],
          verify: function () {
            /* walk every combination */
            var n = 0, a, b, d;
            for (a = 0; a < f[0]; a++) for (b = 0; b < f[1]; b++) for (d = 0; d < (f[2] || 1); d++) n++;
            return n === prod && prod <= 99999;
          }
        };
      }
      var D = r.pick([3, 4, 5, 6, 10]), K = r.int(2, 4);
      while (Math.pow(D, K) > 10000) K--;
      var total = Math.pow(D, K), what = D === 10 ? "each digit is any of $0$ to $9$" : "each digit is any of $1$ to $" + D + "$";
      return {
        q: "A lock code is $" + K + "$ digits long. In every place " + what + ", and a digit may be used again. How many different codes are there?",
        type: "number", answer: String(total), placeholder: "count",
        hint: "A digit may be used again, so every place has the same number of choices. Multiply the choices for the places.",
        steps: ["Each of the $" + K + "$ places has $" + D + "$ choices, since nothing is used up.", "$" + new Array(K + 1).join(D + " \\cdot ").replace(/ \\cdot $/, "") + " = " + total + "$."],
        verify: function () { return seqCount(D, K, true) === total && total <= 10000; }
      };
    }
  });

  G.add({
    id: "pk-count-arrange", section: "pk-chance#counting", par: 70, timed: true,
    make: function (r) {
      var kind = r.pick(["all", "some", "some", "choose"]);
      if (kind === "all") {
        var n = r.int(3, 7), c = r.pick([["different books", "stand in a row on a shelf"], ["different songs", "be played one after another"], ["students", "stand in a line for a photo"], ["different flags", "hang in a row on a wall"]]), ans = factorial(n);
        return {
          q: "In how many different orders can $" + n + "$ " + c[0] + " " + c[1] + "?",
          type: "number", answer: String(ans), placeholder: "count",
          hint: "Fill the places one at a time, left to right. Each time, ask how many of the items are still available.",
          steps: ["The first place has $" + n + "$ choices, the next has one fewer, and so on down to $1$ for the last.", "$" + falling(n, n) + " = " + ans + "$."],
          verify: function () { return allPerms(n).length === ans && ans <= 5040; }
        };
      }
      if (kind === "some") {
        var N = r.int(5, 9), K = r.int(2, 3), ans2 = fallingVal(N, K);
        var c2 = r.pick([
          ["A club of $" + N + "$ members elects a " + (K === 2 ? "president and a vice president" : "president, a vice president and a treasurer") + ", all different people. In how many ways can the offices be filled?"],
          ["$" + N + "$ runners race, and the " + (K === 2 ? "first and second" : "first, second and third") + " places win medals. In how many different ways can the medals go to runners?"],
          ["A code is $" + K + "$ different letters in order, chosen from $" + N + "$ letters, with no letter used twice. How many codes are there?"]
        ]);
        return {
          q: c2[0], type: "number", answer: String(ans2), placeholder: "count",
          hint: "Fill the " + (K === 2 ? "two places" : "three places") + " in order. Each choice uses up one of the items, so each step has one fewer choice than the step before.",
          steps: ["The first place has $" + N + "$ choices, and each place after it has one fewer, for $" + K + "$ places.", "$" + falling(N, K) + " = " + ans2 + "$."],
          verify: function () { return seqCount(N, K, false) === ans2 && ans2 <= 99999; }
        };
      }
      var M = r.int(4, 7), P = M <= 5 ? r.int(2, 3) : 2, ordered = fallingVal(M, P), per = factorial(P), ans3 = ordered / per;
      var who = r.pick([["students", "A teacher picks $" + P + "$ of $" + M + "$ students for a team"], ["players", "A coach picks $" + P + "$ of $" + M + "$ players to carry the equipment"], ["friends", "Ana picks $" + P + "$ of her $" + M + "$ friends to invite to a movie"]]);
      return {
        q: who[1] + ". The order does not matter, only who is picked. How many different groups can be picked?",
        type: "number", answer: String(ans3), placeholder: "count",
        hint: "First count the picks as if the order mattered. Then ask how many of those ordered picks give the same group, and divide by that.",
        steps: ["With order mattering: $" + falling(M, P) + " = " + ordered + "$.", "Each group is counted once for every order of its $" + P + "$ members, and there are $" + falling(P, P) + " = " + per + "$ orders.", "So the number of groups is $" + ordered + " \\div " + per + " = " + ans3 + "$."],
        verify: function () {
          /* walk every subset of the M items and keep those with P members */
          var cnt = 0, mask, bits, b;
          for (mask = 0; mask < (1 << M); mask++) { bits = 0; for (b = 0; b < M; b++) if (mask & (1 << b)) bits++; if (bits === P) cnt++; }
          return cnt === ans3 && Number.isInteger(ans3) && ans3 <= 99999;
        }
      };
    }
  });

  G.add({
    id: "pk-count-prob", section: "pk-chance#counting", par: 90, timed: true,
    make: function (r) {
      var kind = r.pick(["order", "guess", "top"]);
      if (kind === "order") {
        var n = r.int(3, 5), titles = ["Atlas", "Birds", "Cacti", "Drums", "Eagles"].slice(0, n), total = factorial(n), ans = fracAns(1, total);
        return {
          q: "The books " + titles.join(", ") + " are put on a shelf in a random order, every order equally likely. What is the probability that they stand in alphabetical order?",
          type: "fraction", answer: ans, placeholder: "e.g. 1/2",
          hint: "Only one order is alphabetical. Count all the equally likely orders, and put one over that count.",
          steps: ["The number of orders is $" + falling(n, n) + " = " + total + "$, all equally likely.", "Exactly one of them is alphabetical, so the probability is $\\frac{1}{" + total + "}$."],
          verify: function () {
            /* list the orders and keep those that are in increasing order */
            var perms = allPerms(n), good = countIf(perms, function (p) { return p.every(function (x, i) { return x === i; }); });
            return good === 1 && keyIs(ans, good, perms.length) && perms.length === total;
          }
        };
      }
      if (kind === "guess") {
        var rep = r.chance(0.5), K = r.int(2, 3), D = rep ? r.pick([4, 5, 6, 10]) : r.pick([5, 6, 8, 10]), tot = rep ? Math.pow(D, K) : fallingVal(D, K), ans2 = fracAns(1, tot);
        var range = D === 10 ? "$0$ to $9$" : "$1$ to $" + D + "$";
        return {
          q: "A lock code is $" + K + "$ digits, each digit from " + range + ", " + (rep ? "and a digit may be used again" : "and no digit is used twice") + ". Every code is equally likely. A person guesses one code at random. What is the probability that the guess is right?",
          type: "fraction", answer: ans2, placeholder: "e.g. 1/2",
          hint: "Only one code opens the lock. Count the equally likely codes with the counting principle, remembering whether a digit may be used again.",
          steps: ["The number of codes is $" + (rep ? new Array(K + 1).join(D + " \\cdot ").replace(/ \\cdot $/, "") : falling(D, K)) + " = " + tot + "$.", "One of them is right, so the probability is $\\frac{1}{" + tot + "}$."],
          verify: function () { return seqCount(D, K, rep) === tot && keyIs(ans2, 1, tot) && tot <= 10000; }
        };
      }
      var m = r.int(4, 7), ans3 = fracAns(1, m * (m - 1)), who = r.pick([["Ana", "Ben"], ["Cleo", "Dev"], ["Eli", "Fay"]]);
      return {
        q: "$" + m + "$ friends, including " + who[0] + " and " + who[1] + ", line up in a random order, every order equally likely. What is the probability that " + who[0] + " is first and " + who[1] + " is second?",
        type: "fraction", answer: ans3, placeholder: "e.g. 1/2",
        hint: "Count the equally likely orders of all the friends. Then count the orders that begin with the two named friends in the right places.",
        steps: ["All orders: $" + falling(m, m) + " = " + factorial(m) + "$.", "With the first two places fixed, the other " + (m - 2) + " friends can stand in $" + (m - 2 > 1 ? falling(m - 2, m - 2) : "1") + " = " + factorial(m - 2) + "$ orders.", "The probability is $" + fr(factorial(m - 2), factorial(m)) + "$" + lowest(factorial(m - 2), factorial(m))],
        verify: function () {
          /* list the orders; person 0 is first and person 1 second */
          var perms = allPerms(m), hits = countIf(perms, function (p) { return p[0] === 0 && p[1] === 1; });
          return perms.length === factorial(m) && keyIs(ans3, hits, perms.length) && hits > 0;
        }
      };
    }
  });

  /* --------------------------------------------- pack D §1: converting units -- */

  /* a number for the page, with float noise removed: 4.5, 126720 */
  function num(x) { return clean(x); }
  /* "5 feet" or "1.5 feet" as math plus the unit name: $5$ feet */
  function qty(x, name) { return "$" + num(x) + "$ " + (x === 1 ? one(name) : name); }
  /* the singular of every unit name used below (feet is not "feet" without its s) */
  var SINGULAR = {
    inches: "inch", feet: "foot", yards: "yard", miles: "mile", ounces: "ounce", pounds: "pound",
    cups: "cup", pints: "pint", quarts: "quart", gallons: "gallon",
    seconds: "second", minutes: "minute", hours: "hour", days: "day", weeks: "week",
    millimeters: "millimeter", centimeters: "centimeter", meters: "meter", kilometers: "kilometer",
    milligrams: "milligram", grams: "gram", kilograms: "kilogram", milliliters: "milliliter", liters: "liter"
  };
  function one(name) { return SINGULAR[name]; }
  /* each unit in a base unit of its own kind, from numbers that do not come from the fact tables below:
     inches, fluid ounces, seconds, meters, grams and liters. Used by verify() to compare both sides. */
  var BASE = {
    inches: 1, feet: 12, yards: 36, miles: 63360,
    ounces: 1, pounds: 16,
    cups: 8, pints: 16, quarts: 32, gallons: 128,
    seconds: 1, minutes: 60, hours: 3600, days: 86400, weeks: 604800,
    millimeters: 0.001, centimeters: 0.01, meters: 1, kilometers: 1000,
    milligrams: 0.001, grams: 1, kilograms: 1000, milliliters: 0.001, liters: 1
  };
  /* the same measurement in the base unit, on both sides */
  function sameSize(a, fromU, b, toU) {
    var x = a * BASE[fromU], y = b * BASE[toU];
    return Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y), 1);
  }
  /* one-step facts: big unit, small unit, how many small ones make one big one, and the biggest sensible count of big ones */
  var ONE_STEP = [
    { big: "feet", small: "inches", f: 12, max: 20, use: "a board" },
    { big: "yards", small: "feet", f: 3, max: 40, use: "a field" },
    { big: "miles", small: "feet", f: 5280, max: 6, use: "a road" },
    { big: "pounds", small: "ounces", f: 16, max: 12, use: "a bag of flour" },
    { big: "gallons", small: "quarts", f: 4, max: 15, use: "a tank of water" },
    { big: "quarts", small: "pints", f: 2, max: 20, use: "a jug of juice" },
    { big: "pints", small: "cups", f: 2, max: 20, use: "a bottle of milk" },
    { big: "hours", small: "minutes", f: 60, max: 12, use: "a class" },
    { big: "minutes", small: "seconds", f: 60, max: 30, use: "a song" },
    { big: "days", small: "hours", f: 24, max: 14, use: "a trip" },
    { big: "weeks", small: "days", f: 7, max: 12, use: "a project" }
  ];
  var HALVES = [2, 3, 4, 5, 6, 7, 8, 9, 12, 2.5, 3.5, 4.5, 1.5, 0.5];

  G.add({
    id: "pk-unit-one", section: "pk-units#convert", par: 40, timed: true,
    make: function (r) {
      var c = r.pick(ONE_STEP), up = r.chance(0.5), k, ans, given, from, to;
      /* k is the count of big units; the small count is k times the fact */
      var guard = 0, bad = function () { return k > c.max || Math.abs(k * c.f - Math.round(k * c.f)) > 1e-9; };
      do { k = r.pick(HALVES); } while (bad() && guard++ < 80);
      if (bad()) k = 2;
      if (!up) { from = c.big; to = c.small; given = k; ans = k * c.f; }
      else { from = c.small; to = c.big; given = k * c.f; ans = k; }
      return {
        q: "Convert " + qty(given, from) + " to " + to + ". How many " + to + " is that?",
        type: "number", answer: num(ans), placeholder: to,
        hint: "Write a conversion factor, a fraction equal to one, with the unit you are leaving on the bottom so that it cancels. Then ask whether the answer should be a bigger number or a smaller one.",
        steps: [
          "The fact is $1$ " + one(c.big) + " $= " + c.f + "$ " + c.small + ", so the factor is " + (up ? "$\\dfrac{1\\text{ " + one(c.big) + "}}{" + c.f + "\\text{ " + c.small + "}}$" : "$\\dfrac{" + c.f + "\\text{ " + c.small + "}}{1\\text{ " + one(c.big) + "}}$") + ", with " + from + " underneath.",
          (up ? "$" + num(given) + " \\div " + c.f + " = " + num(ans) + "$" : "$" + num(given) + " \\cdot " + c.f + " = " + num(ans) + "$") + " " + to + ".",
          "Check: " + (up ? "going to the bigger unit gives a smaller number" : "going to the smaller unit gives a bigger number") + ", as it should."
        ],
        verify: function () {
          /* convert back with the other factor, and check the size of the number against the unit */
          var back = up ? ans * c.f : ans / c.f;
          return Math.abs(back - given) < 1e-6 && sameSize(given, from, ans, to) && (up ? ans < given : ans > given) && ans > 0 && k * c.f <= 6 * 5280;
        }
      };
    }
  });

  /* two-step chains: the units in order, the facts between them, and a sensible count of the first unit */
  var CHAINS = [
    { u: ["hours", "minutes", "seconds"], f: [60, 60], ks: [2, 3, 4, 5, 6, 1.5, 2.5] },
    { u: ["days", "hours", "minutes"], f: [24, 60], ks: [2, 3, 4, 5, 7, 0.5, 1.5] },
    { u: ["weeks", "days", "hours"], f: [7, 24], ks: [2, 3, 4, 5, 6, 8] },
    { u: ["kilometers", "meters", "centimeters"], f: [1000, 100], ks: [2, 3, 4, 5, 6, 8, 9, 0.5, 1.5, 2.5] },
    { u: ["kilograms", "grams", "milligrams"], f: [1000, 1000], ks: [2, 3, 4, 5, 0.5, 1.5, 2.5] },
    { u: ["gallons", "quarts", "pints"], f: [4, 2], ks: [2, 3, 4, 5, 6, 8, 10, 12, 2.5, 3.5] },
    { u: ["quarts", "pints", "cups"], f: [2, 2], ks: [3, 4, 5, 6, 7, 8, 9, 12, 2.5, 3.5] },
    { u: ["yards", "feet", "inches"], f: [3, 12], ks: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 2.5, 4.5] },
    { u: ["miles", "yards", "feet"], f: [1760, 3], ks: [2, 3, 4, 5, 0.5, 1.5, 2.5] },
    { u: ["miles", "feet", "inches"], f: [5280, 12], ks: [0.5, 1.5, 2, 2.5] }
  ];

  G.add({
    id: "pk-unit-chain", section: "pk-units#convert", par: 70, timed: true,
    make: function (r) {
      var c = r.pick(CHAINS), k = r.pick(c.ks), up = r.chance(0.4), total = c.f[0] * c.f[1];
      var small = k * total, from = up ? c.u[2] : c.u[0], to = up ? c.u[0] : c.u[2];
      var given = up ? small : k, ans = up ? k : small;
      var unit = function (i) { return one(c.u[i]); };
      var fa = c.f[0], fb = c.f[1];
      return {
        q: "Convert " + qty(given, from) + " to " + to + ". How many " + to + " is that?",
        type: "number", answer: num(ans), placeholder: to,
        hint: "There is no single fact joining these two units, so go through the unit in the middle. Use two conversion factors, each with the unit you are leaving on the bottom.",
        steps: up ? [
          "Go from " + from + " to " + c.u[1] + " first: divide by $" + fb + "$ (there are $" + fb + "$ " + c.u[2] + " in one " + unit(1) + "), which gives $" + num(given / fb) + "$ " + c.u[1] + ".",
          "Then to " + to + ": divide by $" + fa + "$ (there are $" + fa + "$ " + c.u[1] + " in one " + unit(0) + "), which gives $" + num(ans) + "$ " + to + ".",
          "Check: both steps went to bigger units, so the number fell each time."
        ] : [
          "Go from " + from + " to " + c.u[1] + " first: multiply by $" + fa + "$ (one " + unit(0) + " is $" + fa + "$ " + c.u[1] + "), which gives $" + num(given * fa) + "$ " + c.u[1] + ".",
          "Then to " + to + ": multiply by $" + fb + "$ (one " + unit(1) + " is $" + fb + "$ " + c.u[2] + "), which gives $" + num(ans) + "$ " + to + ".",
          "Check: both steps went to smaller units, so the number rose each time."
        ],
        verify: function () {
          /* walk the answer back one factor at a time */
          var back = up ? ans * fa * fb : ans / fb / fa;
          return Math.abs(back - given) < 1e-6 && sameSize(given, from, ans, to) && (up ? ans < given : ans > given) && ans > 0;
        }
      };
    }
  });

  /* metric prefixes: the unit with the prefix, the base unit, and how many prefixed units make one base unit (or the reverse) */
  var METRIC = [
    { big: "kilometers", small: "meters", f: 1000, vs: [0.5, 1.5, 2.5, 3.2, 4.8, 6, 7.5, 9, 12, 18, 25] },
    { big: "meters", small: "centimeters", f: 100, vs: [0.5, 0.75, 1.5, 2.4, 3.6, 4.2, 6, 7.5, 12] },
    { big: "meters", small: "millimeters", f: 1000, vs: [0.5, 0.75, 1.5, 2.4, 3.6, 4.2, 6] },
    { big: "centimeters", small: "millimeters", f: 10, vs: [0.5, 1.5, 2.5, 3.2, 4.8, 6, 7.5, 12, 18, 24] },
    { big: "kilograms", small: "grams", f: 1000, vs: [0.5, 0.75, 1.5, 2.5, 3.2, 4.8, 6, 7.5, 9] },
    { big: "grams", small: "milligrams", f: 1000, vs: [0.25, 0.5, 0.75, 1.5, 2.5, 3.2, 4.8, 6] },
    { big: "liters", small: "milliliters", f: 1000, vs: [0.25, 0.5, 0.75, 1.5, 2.5, 3.2, 4.8, 6] }
  ];

  G.add({
    id: "pk-unit-metric", section: "pk-units#convert", par: 40, timed: true,
    make: function (r) {
      var c = r.pick(METRIC), v = r.pick(c.vs), up = r.chance(0.5);
      var smallCount = Math.round(v * c.f * 1000) / 1000, given = up ? smallCount : v, ans = up ? v : smallCount;
      var from = up ? c.small : c.big, to = up ? c.big : c.small;
      var shift = c.f === 1000 ? 3 : c.f === 100 ? 2 : 1;
      return {
        q: "Convert " + qty(given, from) + " to " + to + ". How many " + to + " is that?",
        type: "number", answer: num(ans), placeholder: to,
        hint: "The prefix says how many of the smaller unit make one of the larger: kilo and milli are a thousand, centi is a hundred. Put the unit you are leaving on the bottom of the factor, and decide whether the number should grow or shrink.",
        steps: [
          "One " + one(c.big) + " is $" + c.f + "$ " + c.small + ", so the factor is " + (up ? "$\\dfrac{1\\text{ " + one(c.big) + "}}{" + c.f + "\\text{ " + c.small + "}}$" : "$\\dfrac{" + c.f + "\\text{ " + c.small + "}}{1\\text{ " + one(c.big) + "}}$") + ".",
          up ? "$" + num(given) + " \\div " + c.f + " = " + num(ans) + "$ " + to + " (the decimal point moves " + shift + " place" + (shift > 1 ? "s" : "") + " to the left)."
             : "$" + num(given) + " \\cdot " + c.f + " = " + num(ans) + "$ " + to + " (the decimal point moves " + shift + " place" + (shift > 1 ? "s" : "") + " to the right).",
          "Check: " + (up ? "the larger unit needs fewer of them" : "the smaller unit needs more of them") + "."
        ],
        verify: function () {
          /* shift the digits instead of multiplying, then compare both sides in the base unit */
          var p = Math.pow(10, shift), back = up ? ans * p : ans / p;
          return Math.abs(back - given) < 1e-6 && sameSize(given, from, ans, to) && (up ? ans < given : ans > given) && ans > 0;
        }
      };
    }
  });

  /* --------------------------------------------- pack D §2: rates with units -- */

  /* a rate and the amounts behind it: the rate is chosen first so every total is exact */
  var UNIT_RATES = [
    { s: "A cyclist rides {a} miles in {b} hours.", a: "miles", b: "hours", per: "mile", pu: "hour", rates: [9, 10, 12, 14, 15, 16, 18], bs: [2, 3, 4, 5] },
    { s: "A car travels {a} miles in {b} hours.", a: "miles", b: "hours", per: "mile", pu: "hour", rates: [40, 45, 50, 55, 60, 65], bs: [2, 3, 4, 5, 6] },
    { s: "A runner covers {a} miles in {b} hours.", a: "miles", b: "hours", per: "mile", pu: "hour", rates: [6, 7.5, 8], bs: [2, 3, 4] },
    { s: "A typist enters {a} words in {b} minutes.", a: "words", b: "minutes", per: "word", pu: "minute", rates: [35, 40, 45, 50, 60, 65, 70], bs: [4, 5, 6, 8, 10] },
    { s: "A reader finishes {a} pages in {b} hours.", a: "pages", b: "hours", per: "page", pu: "hour", rates: [20, 25, 30, 36, 40, 45], bs: [2, 3, 4, 5] },
    { s: "A hose delivers {a} gallons in {b} minutes.", a: "gallons", b: "minutes", per: "gallon", pu: "minute", rates: [2, 2.5, 3, 4, 5, 7.5], bs: [4, 6, 8, 10, 12] },
    { s: "A car uses {b} gallons of gas to drive {a} miles.", a: "miles", b: "gallons", per: "mile", pu: "gallon", rates: [24, 28, 30, 32, 35, 40], bs: [4, 5, 8, 10, 12] },
    { s: "A heart beats {a} times in {b} minutes.", a: "beats", b: "minutes", per: "beat", pu: "minute", rates: [60, 66, 70, 72, 75, 80], bs: [3, 5, 10] }
  ];
  var PRICED = [
    { s: "{b} pounds of grapes cost {a}.", b: "pounds", pu: "pound", rates: [1.25, 1.5, 2.4, 2.75, 3.5, 4.25], bs: [2, 3, 4, 5, 6, 8] },
    { s: "{b} pounds of cheese cost {a}.", b: "pounds", pu: "pound", rates: [4.5, 5.25, 6, 7.5, 8.75], bs: [2, 3, 4, 5] },
    { s: "{b} gallons of paint cost {a}.", b: "gallons", pu: "gallon", rates: [18, 22.5, 25, 28], bs: [2, 3, 4, 5] },
    { s: "{b} feet of rope cost {a}.", b: "feet", pu: "foot", rates: [0.4, 0.55, 0.75, 1.2, 1.5], bs: [10, 15, 20, 25, 30] },
    { s: "{b} gallons of milk cost {a}.", b: "gallons", pu: "gallon", rates: [3.5, 3.75, 4.2, 4.5], bs: [2, 3, 4, 5, 6] },
    { s: "A worker earns {a} for {b} hours of work.", b: "hours", pu: "hour", rates: [9, 10.5, 12, 12.5, 14, 15, 16.5, 18], bs: [3, 4, 5, 6, 8] }
  ];

  G.add({
    id: "pk-rate-unit", section: "pk-units#rates", par: 50, timed: true,
    make: function (r) {
      var priced = r.chance(0.45), c = priced ? r.pick(PRICED) : r.pick(UNIT_RATES), rate = r.pick(c.rates), b = r.pick(c.bs);
      var cents = Math.round(rate * 100), total = cents * b, q, holder, perText;
      if (priced) {
        q = c.s.replace("{a}", usd(total)).replace("{b}", "$" + b + "$") + " How many dollars is that per " + c.pu + "?";
        holder = "dollars per " + c.pu; perText = "dollars per " + c.pu;
      } else {
        q = c.s.replace("{a}", "$" + num(total / 100) + "$").replace("{b}", "$" + b + "$") + " What is the rate in " + c.a + " per " + c.pu + "?";
        holder = c.a + " per " + c.pu; perText = c.a + " per " + c.pu;
      }
      return {
        q: q, type: "number", answer: num(rate), placeholder: holder,
        hint: "A rate is a quotient of two measurements, and its unit is the top unit per one of the bottom unit. Decide which quantity goes on the bottom, then divide.",
        steps: [
          "The question asks for " + perText + ", so the amount named after “per” goes on the bottom: $" + b + "$ " + c.b + ".",
          "Divide the other amount by it: $" + (priced ? "\\$" + num(total / 100) : num(total / 100)) + " \\div " + b + " = " + num(rate) + "$.",
          "The rate is $" + num(rate) + "$ " + perText + "."
        ],
        verify: function () {
          /* multiply the rate back by the bottom amount, in whole hundredths */
          return Math.round(Math.round(rate * 100) * b) === total && rate > 0 && (priced ? rate <= 30 : rate <= 80);
        }
      };
    }
  });

  /* distance, rate and time where the time is not in the unit of the rate */
  var MOVERS = [
    { who: "A cyclist", speeds: [9, 12, 15, 18], maxD: 80 },
    { who: "A bus", speeds: [24, 30, 36, 45], maxD: 200 },
    { who: "A car", speeds: [36, 45, 48, 60], maxD: 300 },
    { who: "A jogger", speeds: [6, 8], maxD: 13 }
  ];
  var MINS = [10, 15, 20, 30, 40, 45, 90, 120];

  G.add({
    id: "pk-rate-drt", section: "pk-units#rates", par: 70, timed: true,
    make: function (r) {
      var kind = r.pick(["dist", "dist", "time", "rate", "print"]), m = r.pick(MOVERS), S = r.pick(m.speeds), t, q, ans, holder, steps, hint, ver;
      if (kind === "dist") {
        var guard = 0, off = function () { return Math.abs(S * t / 60 * 100 - Math.round(S * t / 60 * 100)) > 1e-9 || S * t / 60 > m.maxD; };
        do { t = r.pick(MINS); } while (off() && guard++ < 80);
        if (off()) t = 30;
        ans = S * t / 60; holder = "miles";
        q = m.who + " goes at $" + S + "$ miles per hour for $" + t + "$ minutes. How many miles does it go?";
        hint = "Distance is rate times time, but the time must be in the unit the rate uses on the bottom. Change the minutes first, then multiply.";
        steps = ["The rate has hours on the bottom, so write the time in hours: $" + t + "$ minutes $= \\frac{" + t + "}{60}$ hour.", "$d = rt = " + S + " \\cdot \\frac{" + t + "}{60} = " + num(ans) + "$ miles."];
        ver = function () { return Math.abs((S / 60) * t - ans) < 1e-6; };
      } else if (kind === "time") {
        var th, tg = 0, inMin = r.chance(0.5), D;
        do { th = r.pick([0.5, 0.75, 1.25, 1.5, 2, 2.5, 3, 3.5, 4.5]); D = S * th; } while (D > m.maxD && tg++ < 80);
        if (D > m.maxD) { th = 1; D = S; }
        ans = inMin ? th * 60 : th; holder = inMin ? "minutes" : "hours";
        q = m.who + " goes $" + num(D) + "$ miles at $" + S + "$ miles per hour. How many " + holder + " does the trip take?";
        hint = "Time is distance divided by rate, and the units tell you so: miles divided by miles per hour leaves hours." + (inMin ? " The question wants minutes, so convert at the end." : "");
        steps = ["$t = d \\div r = " + num(D) + " \\div " + S + " = " + num(th) + "$ hours."];
        if (inMin) steps = ["$t = d \\div r = " + num(D) + " \\div " + S + " = " + num(th) + "$ hours.", "In minutes: $" + num(th) + " \\cdot 60 = " + num(ans) + "$."];
        ver = function () { return Math.abs(S * (ans / (inMin ? 60 : 1)) - D) < 1e-6; };
      } else if (kind === "rate") {
        var rate = r.pick([24, 30, 36, 45, 60]), tm = r.pick([10, 15, 20, 30, 40, 45, 90]), D2 = rate * tm / 60;
        S = rate; ans = rate; holder = "miles per hour";
        q = "A driver" + " covers $" + num(D2) + "$ miles in $" + tm + "$ minutes. What is the speed in miles per hour?";
        hint = "Rate is distance divided by time. The answer is wanted per hour, so the time on the bottom must be in hours.";
        steps = ["$" + tm + "$ minutes $= \\frac{" + tm + "}{60}$ hour.", "$r = d \\div t = " + num(D2) + " \\div \\frac{" + tm + "}{60} = " + num(rate) + "$ miles per hour."];
        ver = function () { return Math.abs((D2 / tm) * 60 - rate) < 1e-6 && rate <= 65; };
      } else {
        var ppm = r.pick([10, 12, 15, 20, 24, 30]), hrs = r.pick([0.5, 1.5, 2, 2.5]);
        ans = ppm * 60 * hrs; holder = "pages";
        q = "A printer prints $" + ppm + "$ pages per minute. How many pages does it print in $" + num(hrs) + "$ hours?";
        hint = "The rate is per minute and the time is in hours, so line the units up before you multiply.";
        steps = ["$" + num(hrs) + "$ hours $= " + num(hrs * 60) + "$ minutes.", "$" + ppm + " \\cdot " + num(hrs * 60) + " = " + num(ans) + "$ pages."];
        ver = function () { return Math.abs((ppm * 60) * hrs - ans) < 1e-6; };
      }
      return {
        q: q, type: "number", answer: num(ans), placeholder: holder, hint: hint, steps: steps,
        verify: function () { return ver() && ans > 0; }
      };
    }
  });

  /* converting a rate: the top and the bottom each get a factor.
     tn/td converts the top unit, bn/bd the bottom one: to = from * (tn/td) / (bn/bd) */
  var RATE_CASES = [
    { from: ["feet", "second"], to: ["miles", "hour"], tn: 1, td: 5280, bn: 1, bd: 3600, facts: "$1$ mile $= 5280$ feet and $1$ hour $= 3600$ seconds",
      names: ["feet per second", "miles per hour"], pairs: [[22, 15], [44, 30], [66, 45], [88, 60], [110, 75]], lead: "A car travels at" },
    { from: ["kilometers", "hour"], to: ["meters", "second"], tn: 1000, td: 1, bn: 3600, bd: 1, facts: "$1$ kilometer $= 1000$ meters and $1$ hour $= 3600$ seconds",
      names: ["kilometers per hour", "meters per second"], pairs: [[18, 5], [36, 10], [54, 15], [72, 20], [90, 25], [108, 30]], lead: "A bus travels at" },
    { from: ["gallons", "minute"], to: ["gallons", "hour"], tn: 1, td: 1, bn: 1, bd: 60, facts: "$1$ hour $= 60$ minutes",
      names: ["gallons per minute", "gallons per hour"], pairs: [[2, 120], [2.5, 150], [3, 180], [4, 240], [4.5, 270], [7.5, 450]], lead: "A pump delivers" },
    { from: ["kilometers", "hour"], to: ["meters", "minute"], tn: 1000, td: 1, bn: 60, bd: 1, facts: "$1$ kilometer $= 1000$ meters and $1$ hour $= 60$ minutes",
      names: ["kilometers per hour", "meters per minute"], pairs: [[3, 50], [3.6, 60], [4.2, 70], [4.5, 75], [5.4, 90], [6, 100]], lead: "A walker goes at" },
    { from: ["miles", "hour"], to: ["miles", "minute"], tn: 1, td: 1, bn: 60, bd: 1, facts: "$1$ hour $= 60$ minutes",
      names: ["miles per hour", "miles per minute"], pairs: [[15, 0.25], [24, 0.4], [30, 0.5], [36, 0.6], [45, 0.75], [48, 0.8], [60, 1]], lead: "A train runs at" },
    { from: ["dollars", "pound"], to: ["dollars", "ounce"], tn: 1, td: 1, bn: 16, bd: 1, facts: "$1$ pound $= 16$ ounces",
      names: ["dollars per pound", "dollars per ounce"], pairs: [[3.2, 0.2], [4.8, 0.3], [6.4, 0.4], [8, 0.5], [9.6, 0.6], [11.2, 0.7]], lead: "A shop sells coffee at", money: true }
  ];

  G.add({
    id: "pk-rate-convert", section: "pk-units#rates", par: 80, timed: true,
    make: function (r) {
      var c0 = r.pick(RATE_CASES), pr = r.pick(c0.pairs), rev = r.chance(0.5);
      /* going backwards swaps the two units and inverts both factors */
      var c = rev ? { from: c0.to, to: c0.from, tn: c0.td, td: c0.tn, bn: c0.bd, bd: c0.bn, names: [c0.names[1], c0.names[0]] } : c0;
      var given = rev ? pr[1] : pr[0], ans = rev ? pr[0] : pr[1], fromName = c.names[0], toName = c.names[1];
      /* money reads "$3.20 per pound": the dollar sign is already in the number */
      var gtxt = c0.money ? usd(Math.round(given * 100)) : "$" + num(given) + "$";
      var spoken = c0.money ? fromName.replace("dollars ", "") : fromName;
      var q = c0.lead + " " + gtxt + " " + spoken + ". What is that in " + toName + "?";
      var fq = function (n, d) { return d === 1 ? String(n) : "\\frac{" + n + "}{" + d + "}"; };
      var topStep = c.tn === c.td ? "The top unit (" + c.from[0] + ") stays the same." : "Top: " + c.from[0] + " to " + c.to[0] + ", multiply by $" + fq(c.tn, c.td) + "$.";
      var botStep = c.bn === c.bd ? "The bottom unit stays the same." : "Bottom: " + c.from[1] + " to " + c.to[1] + " multiplies the bottom by $" + fq(c.bn, c.bd) + "$, so the rate is divided by $" + fq(c.bn, c.bd) + "$.";
      return {
        q: q, type: "number", answer: num(ans), placeholder: toName,
        hint: "A rate has two units, one on the top and one on the bottom. Convert each with its own factor, set up so that each unit you are leaving cancels, and keep the top and the bottom straight.",
        steps: [
          "The facts: " + c0.facts + ".",
          topStep, botStep,
          "Together: $" + num(given) + " \\cdot " + fq(c.tn, c.td) + " \\div " + fq(c.bn, c.bd) + " = " + num(ans) + "$ " + toName + "."
        ],
        verify: function () {
          /* the factors multiply to the answer, and the reverse conversion returns the given rate */
          var fwd = given * c.tn * c.bd / (c.td * c.bn), back = ans * c.td * c.bn / (c.tn * c.bd);
          return Math.abs(fwd - ans) < 1e-9 && Math.abs(back - given) < 1e-9 && ans > 0 && given > 0 && (c0.money ? given <= 20 : given <= 450);
        }
      };
    }
  });

  /* --------------------------------------------- pack D §3: area and volume units -- */

  /* the same size in the base unit, to the power p (inches squared, meters cubed ...), on both sides */
  function sameSizeP(a, fromU, b, toU, p) {
    var x = a * Math.pow(BASE[fromU], p), y = b * Math.pow(BASE[toU], p);
    return Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y), 1);
  }
  /* a number for the page with the thousands marked as in the lessons: 10{,}000 (math only) */
  function numc(x) {
    var t = num(x), m = /^(-?\d+)(\..*)?$/.exec(t);
    if (!m || m[1].replace("-", "").length < 5) return t;
    return m[1].replace(/\B(?=(\d{3})+$)/g, "{,}") + (m[2] || "");
  }
  /* the word for a square or cubic unit: "square feet", "cubic yards" */
  function powName(name, p) { return (p === 2 ? "square " : "cubic ") + name; }
  function powOne(name, p) { return (p === 2 ? "square " : "cubic ") + one(name); }
  /* a length fact: the big unit, the small unit, the small ones in one big one, the sensible counts of the big unit (area, volume) */
  var LENGTH_FACTS = [
    { big: "feet", small: "inches", f: 12, ks2: [2, 3, 4, 5, 6, 7, 8, 9, 12, 2.5, 0.5], ks3: [0.5, 1, 2, 3] },
    { big: "yards", small: "feet", f: 3, ks2: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 2.5, 4.5, 0.5], ks3: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 2.5, 4.5] },
    { big: "yards", small: "inches", f: 36, ks2: [0.5, 1, 2, 3], ks3: [0.5, 1] },
    { big: "meters", small: "centimeters", f: 100, ks2: [2, 3, 4, 5, 6, 8, 9, 12, 0.5, 1.5, 2.5, 3.5, 7.5], ks3: [0.5, 1.5, 2, 3, 4, 5] },
    { big: "centimeters", small: "millimeters", f: 10, ks2: [2, 3, 4, 5, 6, 8, 9, 12, 15, 25, 1.5, 2.5, 3.5], ks3: [2, 3, 4, 5, 6, 8, 9, 12, 1.5, 2.5] },
    { big: "kilometers", small: "meters", f: 1000, ks2: [0.5, 1.5, 2, 3, 4, 5, 8], ks3: [] }
  ];

  /* the shared body of the square-unit and cubic-unit conversions */
  function powConvert(r, p) {
    var c = r.pick(p === 3 ? LENGTH_FACTS.filter(function (x) { return x.ks3.length; }) : LENGTH_FACTS), up = r.chance(0.5), k = r.pick(p === 2 ? c.ks2 : c.ks3), F = Math.pow(c.f, p);
    var smallCount = Math.round(k * F * 1000) / 1000;
    var from = up ? c.small : c.big, to = up ? c.big : c.small, given = up ? smallCount : k, ans = up ? k : smallCount;
    var fact = (p === 2 ? "$1$ " + one(c.big) + " $= " + c.f + "$ " + c.small + ", so one square " + one(c.big) + " is a square with sides of $" + c.f + "$ " + c.small + " and holds $" + c.f + " \\cdot " + c.f + " = " + numc(F) + "$ square " + c.small
      : "$1$ " + one(c.big) + " $= " + c.f + "$ " + c.small + ", so one cubic " + one(c.big) + " is a cube with edges of $" + c.f + "$ " + c.small + " and holds $" + c.f + "^3 = " + numc(F) + "$ cubic " + c.small);
    var factor = (up ? "\\dfrac{1\\text{ " + one(c.big) + "}}{" + c.f + "\\text{ " + c.small + "}}" : "\\dfrac{" + c.f + "\\text{ " + c.small + "}}{1\\text{ " + one(c.big) + "}}");
    return {
      q: "How many " + powName(to, p) + (given === 1 ? " is $" : " are $") + numc(given) + "$ " + (given === 1 ? powOne(from, p) : powName(from, p)) + "?",
      type: "number", answer: num(ans), placeholder: powName(to, p),
      hint: "Use the length fact with the same ‘the unit you are leaving goes underneath’ rule, but a " + (p === 2 ? "square" : "cube") + " has the length in " + (p === 2 ? "two directions" : "three directions") + ", so the factor is used " + (p === 2 ? "twice" : "three times") + ". Then ask whether the number should grow or shrink.",
      steps: [
        fact + ".",
        "The factor is $\\left(" + factor + "\\right)^" + p + "$, which is $" + numc(F) + "$ " + powName(c.small, p) + " per " + powOne(c.big, p) + ".",
        (up ? "$" + numc(given) + " \\div " + numc(F) + " = " + numc(ans) + "$" : "$" + numc(given) + " \\cdot " + numc(F) + " = " + numc(ans) + "$") + " " + (ans === 1 ? powOne(to, p) : powName(to, p)) + ".",
        "Check: " + (up ? "the larger unit needs fewer of them" : "the smaller unit needs more of them, far more than for a length") + "."
      ],
      verify: function () {
        /* through the base unit (inches, meters ...), one length at a time, instead of the squared factor */
        var viaBase = given * Math.pow(BASE[from] / BASE[to], p);
        return Math.abs(viaBase - ans) <= 1e-9 * Math.max(1, Math.abs(ans)) && sameSizeP(given, from, ans, to, p) && (up ? ans < given : ans > given) && ans > 0 && Math.max(given, ans) <= 10000000;
      }
    };
  }

  G.add({
    id: "pk-area-convert", section: "pk-units#area", par: 60, timed: true,
    make: function (r) { return powConvert(r, 2); }
  });

  G.add({
    id: "pk-volume-convert", section: "pk-units#area", par: 70, timed: true,
    make: function (r) {
      var kind = r.pick(["cubic", "cubic", "box", "liters"]);
      if (kind === "cubic") return powConvert(r, 3);
      if (kind === "box") {
        var l = r.pick([10, 12, 15, 20, 25, 30]), w = r.pick([4, 5, 8, 10, 12, 15]), h = r.pick([2, 4, 5, 6, 10]), v = l * w * h;
        return {
          q: "A box is $" + l + "$ centimeters long, $" + w + "$ centimeters wide and $" + h + "$ centimeters high. One milliliter fills exactly one cubic centimeter. How many milliliters does the box hold when it is full?",
          type: "number", answer: num(v), placeholder: "milliliters",
          hint: "The volume of a box is length times width times height. In the metric system a cubic centimeter and a milliliter are the same amount, so no conversion is needed.",
          steps: ["Volume: $" + l + " \\cdot " + w + " \\cdot " + h + " = " + v + "$ cubic centimeters.", "$1$ mL $= 1$ cm$^3$, so the box holds $" + v + "$ milliliters."],
          verify: function () {
            /* the base area times the height, and the layers of one centimeter */
            var layers = 0, i; for (i = 0; i < h; i++) layers += l * w;
            return layers === v && v === l * (w * h) && v >= 60 && v <= 20000;
          }
        };
      }
      var L = r.pick([0.25, 0.5, 0.75, 1.5, 2, 2.5, 3, 4, 5, 8, 12]), toLiters = r.chance(0.5), cm3 = Math.round(L * 1000);
      return {
        q: toLiters
          ? "A tank has a volume of $" + num(cm3) + "$ cubic centimeters. Use $1$ liter $= 1000$ milliliters and $1$ mL $= 1$ cm$^3$. How many liters does it hold?"
          : "A bottle holds $" + num(L) + "$ liters. Use $1$ liter $= 1000$ milliliters and $1$ mL $= 1$ cm$^3$. What is its volume in cubic centimeters?",
        type: "number", answer: num(toLiters ? L : cm3), placeholder: toLiters ? "liters" : "cubic centimeters",
        hint: "A milliliter and a cubic centimeter are the same amount, so first say the volume in milliliters. Then use the liter fact with the unit you are leaving underneath.",
        steps: toLiters ? [
          "$" + num(cm3) + "$ cm$^3$ is $" + num(cm3) + "$ mL, since $1$ mL $= 1$ cm$^3$.",
          "$" + num(cm3) + "\\text{ mL}\\cdot\\frac{1\\text{ L}}{1000\\text{ mL}} = " + num(L) + "$ liters.",
          "Check: liters are the larger unit, so the number fell."
        ] : [
          "$" + num(L) + "\\text{ L}\\cdot\\frac{1000\\text{ mL}}{1\\text{ L}} = " + num(cm3) + "$ mL.",
          "$1$ mL $= 1$ cm$^3$, so the volume is $" + num(cm3) + "$ cubic centimeters.",
          "Check: cubic centimeters are the small unit, so the number rose."
        ],
        verify: function () {
          /* a liter is a cube of 10 cm on each edge: 10 * 10 * 10 cubic centimeters */
          var perLiter = 10 * 10 * 10;
          return Math.abs(L * perLiter - cm3) < 1e-6 && L > 0 && cm3 <= 12000;
        }
      };
    }
  });

  /* rooms: whole-foot sides in multiples of three where a square yard matters, so the yards come out exact */
  G.add({
    id: "pk-area-rate", section: "pk-units#area", par: 70, timed: true,
    make: function (r) {
      var kind = r.pick(["room", "room", "perft", "yard", "peryd"]), guard = 0, l, w, cents, area;
      var pickRoom = function (step) { var arr = step === 3 ? [9, 12, 15, 18, 21] : [8, 9, 10, 11, 12, 14, 15, 16, 18, 20]; do { l = r.pick(arr); w = r.pick(arr); area = l * w; } while ((area < 80 || area > 400) && guard++ < 200); if (area < 80 || area > 400) { l = 12; w = 12; area = 144; } };
      if (kind === "room") {
        pickRoom(1); cents = r.pick([200, 225, 250, 275, 300, 350, 375, 400, 450, 500, 550, 600, 650, 700, 800]);
        var cost = area * cents;
        return {
          q: "A room is $" + l + "$ feet long and $" + w + "$ feet wide. Carpet costs " + usd(cents) + " per square foot. What is the cost, in dollars, to carpet the whole room?",
          type: "number", answer: num(cost / 100), placeholder: "dollars",
          hint: "The area of a rectangle is length times width, in square feet, and the price is per square foot. Find the area, then multiply by the price per square foot.",
          steps: ["Area: $" + l + " \\cdot " + w + " = " + area + "$ square feet.", "Cost: $" + area + "\\text{ ft}^2\\cdot " + usd(cents).slice(1, -1) + "\\text{ per ft}^2 = \\$" + num(cost / 100) + "$.", "The square feet cancel and dollars are left."],
          verify: function () {
            /* row by row: each foot of length is a strip of w square feet */
            var sum = 0, i; for (i = 0; i < l; i++) sum += w * cents;
            return sum === cost && area >= 80 && area <= 400 && cents >= 200 && cents <= 800;
          }
        };
      }
      if (kind === "perft") {
        pickRoom(1); cents = r.pick([200, 225, 250, 275, 300, 350, 375, 400, 450, 500, 550, 600, 650, 700, 800]);
        var total = area * cents;
        return {
          q: "Tile for a floor of $" + area + "$ square feet costs " + usd(total) + " in all. How many dollars per square foot is that?",
          type: "number", answer: num(cents / 100), placeholder: "dollars per square foot",
          hint: "A price per square foot is the total cost divided by the number of square feet. Put the cost on top and the area underneath.",
          steps: ["The rate is dollars per square foot, so the area goes on the bottom: $" + area + "$ square feet.", "$\\$" + num(total / 100) + " \\div " + area + " = \\$" + num(cents / 100) + "$ per square foot."],
          verify: function () { return Math.round(cents * area) === total && cents >= 200 && cents <= 800; }
        };
      }
      if (kind === "yard") {
        pickRoom(3); var perYd = r.pick([18, 20, 22.5, 24, 27, 30, 36, 40]), yards = area / 9, costY = Math.round(perYd * yards * 100);
        return {
          q: "A room is $" + l + "$ feet long and $" + w + "$ feet wide. Carpet costs " + usd(Math.round(perYd * 100)) + " per square yard. What is the cost, in dollars, to carpet the room? ($1$ yard $= 3$ feet.)",
          type: "number", answer: num(costY / 100), placeholder: "dollars",
          hint: "The price is per square yard, so the area must be in square yards. Convert the length and the width to yards, or convert the area with the squared factor, before you multiply by the price.",
          steps: ["A square yard is $3 \\cdot 3 = 9$ square feet, so the area in square yards is $" + area + " \\div 9 = " + num(yards) + "$.", "Cost: $" + num(yards) + " \\cdot " + usd(Math.round(perYd * 100)).slice(1, -1) + " = " + usd(costY).slice(1, -1) + "$."],
          verify: function () {
            /* price per square foot instead, on the area in square feet */
            var viaFeet = Math.round((perYd / 9) * area * 100);
            return Math.abs(viaFeet - costY) <= 1 && area % 9 === 0 && area >= 80 && area <= 400;
          }
        };
      }
      cents = r.pick([200, 250, 300, 350, 400, 450, 500, 600, 700, 800]);
      var perYard = cents * 9;
      return {
        q: "Flooring costs " + usd(cents) + " per square foot. How many dollars per square yard is that? ($1$ yard $= 3$ feet.)",
        type: "number", answer: num(perYard / 100), placeholder: "dollars per square yard",
        hint: "A square yard holds many square feet, and the price per square yard is for all of them. Find how many square feet make one square yard, then multiply the price per square foot by it.",
        steps: ["A square yard is a square $3$ feet on a side, so it holds $3 \\cdot 3 = 9$ square feet.", "$\\$" + num(cents / 100) + "\\text{ per ft}^2\\cdot 9\\text{ ft}^2\\text{ per yd}^2 = \\$" + num(perYard / 100) + "$ per square yard.", "Check: a square yard is the larger unit, so its price is the larger number."],
        verify: function () { return Math.round(cents * 3 * 3) === perYard && perYard > cents && cents >= 200 && cents <= 800; }
      };
    }
  });

  /* --------------------------------------------- pack D §4: scale -- */

  /* the scale as a word statement: one drawn unit stands for N real ones */
  var MAP_SCALES = [
    { d: "inches", rl: "miles", ds: "inch", ns: [5, 10, 20, 25, 40, 50, 100], ks: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5, 8], what: "two towns", src: "map" },
    { d: "centimeters", rl: "kilometers", ds: "centimeter", ns: [2, 5, 10, 20, 25, 50], ks: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5, 8, 12], what: "two lakes", src: "map" },
    { d: "inches", rl: "feet", ds: "inch", ns: [2, 4, 5, 8, 10], ks: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 6, 7.5, 9], what: "two corners of a floor plan", src: "plan" }
  ];

  G.add({
    id: "pk-scale-real", section: "pk-units#scale", par: 50, timed: true,
    make: function (r) {
      if (r.chance(0.35)) {
        /* a ratio with no units: the real length is N times the drawn one, in the same unit */
        var N = r.pick([100, 200, 250, 500, 1000, 2000, 5000]), d = r.pick([2, 3, 4, 4.5, 5, 6, 7.5, 8, 12]), cm = d * N, m = cm / 100;
        /* a wall up to 60 m; longer lengths are a path or a road */
        var obj = N <= 500 ? "wall" : (N === 1000 ? "path" : "road");
        return {
          q: "A plan has the scale $1 : " + N + "$. A " + obj + " measures $" + num(d) + "$ centimeters on the plan. How many meters long is the real " + obj + "?",
          type: "number", answer: num(m), placeholder: "meters",
          hint: "A ratio with no units means the real length is that many times the drawn length, in whatever unit you measure. Find the real length in the unit you measured, then convert to the unit asked for.",
          steps: ["The real length is $" + N + "$ times the drawn one: $" + num(d) + " \\cdot " + N + " = " + num(cm) + "$ centimeters.", "$" + num(cm) + "\\text{ cm}\\cdot\\frac{1\\text{ m}}{100\\text{ cm}} = " + num(m) + "$ meters.", "Check: the real length is far longer than its drawing."],
          verify: function () {
            /* the proportion drawn : real = 1 : N, with the real length in meters */
            return Math.abs(d / (m * 100) - 1 / N) < 1e-9 && sameSizeP(cm, "centimeters", m, "meters", 1) && m > d / 100 && m >= 2 && (obj === "wall" ? m <= 60 : m >= 20 && m <= 600);
          }
        };
      }
      var c = r.pick(MAP_SCALES), n = r.pick(c.ns), k = r.pick(c.ks), real = k * n;
      return {
        q: "On a " + c.src + ", $1$ " + c.ds + " stands for $" + n + "$ " + c.rl + ". " + c.what.charAt(0).toUpperCase() + c.what.slice(1) + " are $" + num(k) + "$ " + c.d + " apart on the " + c.src + ". How many " + c.rl + " apart are they really?",
        type: "number", answer: num(real), placeholder: c.rl,
        hint: "The scale is a conversion factor between the drawing and the world. Put the drawn unit underneath so that it cancels, and the real unit is left.",
        steps: ["The scale gives the factor $\\dfrac{" + n + "\\text{ " + c.rl + "}}{1\\text{ " + c.ds + "}}$, with the drawn unit underneath.", "$" + num(k) + "\\text{ " + c.d + "}\\cdot\\dfrac{" + n + "\\text{ " + c.rl + "}}{1\\text{ " + c.ds + "}} = " + num(real) + "$ " + c.rl + ".", "Check: the real distance is larger than the drawn one, as the scale says."],
        verify: function () {
          /* the proportion 1 : n = k : real, solved for the ratio of drawn to real instead of the product */
          return Math.abs(k / real - 1 / n) < 1e-12 && Math.abs(real / k - n) < 1e-9 && real > k && real <= 2000;
        }
      };
    }
  });

  var DRAW_SCALES = [
    { d: "inches", rl: "feet", ds: "inch", ns: [2, 4, 5, 8, 10, 12], drs: [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14], what: "a wall" },
    { d: "inches", rl: "miles", ds: "inch", ns: [5, 10, 20, 25, 40, 50], drs: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 9, 10], what: "a road" },
    { d: "centimeters", rl: "meters", ds: "centimeter", ns: [2, 5, 10, 20, 50], drs: [2, 3, 4, 4.5, 5, 6, 7, 7.5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], what: "a garden path" }
  ];

  G.add({
    id: "pk-scale-draw", section: "pk-units#scale", par: 60, timed: true,
    make: function (r) {
      var kind = r.pick(["draw", "draw", "scale", "model"]);
      if (kind === "draw") {
        var c = r.pick(DRAW_SCALES), n = r.pick(c.ns), dr = r.pick(c.drs), real = dr * n;
        return {
          q: "A drawing uses the scale $1$ " + c.ds + " $= " + n + "$ " + c.rl + ". " + c.what.charAt(0).toUpperCase() + c.what.slice(1) + " is really $" + num(real) + "$ " + c.rl + " long. How many " + c.d + " long is it on the drawing?",
          type: "number", answer: num(dr), placeholder: c.d,
          hint: "Use the scale as a conversion factor again, but this time you are leaving the real unit, so the real unit goes underneath.",
          steps: ["The factor is $\\dfrac{1\\text{ " + c.ds + "}}{" + n + "\\text{ " + c.rl + "}}$, with the real unit underneath so that it cancels.", "$" + num(real) + "\\text{ " + c.rl + "}\\cdot\\dfrac{1\\text{ " + c.ds + "}}{" + n + "\\text{ " + c.rl + "}} = " + num(dr) + "$ " + c.d + ".", "Check: the drawing is smaller than the real length, as it should be."],
          verify: function () { /* cross-multiplied: 1 : n = drawn : real */ return Math.abs(dr / real - 1 / n) < 1e-12 && dr < real && dr >= 1 && dr <= 24; }
        };
      }
      if (kind === "scale") {
        var e = r.pick([{ d: "inches", rl: "feet", ds: "inch", ns: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 20], page: [6, 7, 8, 9, 10, 11], what: "hall" }, { d: "centimeters", rl: "meters", ds: "centimeter", ns: [2, 4, 5, 6, 8, 10, 15, 20, 25, 30, 35, 40], page: [10, 12, 14, 15, 16, 18, 20, 22, 24], what: "field" }]);
        var nn = r.pick(e.ns), pg = r.pick(e.page), realLen = nn * pg;
        /* the text's own pair (a 36-foot hall on 9 inches) and the exercise pair (42 feet on 6 inches) are not repeated */
        if (e.what === "hall" && ((nn === 4 && pg === 9) || (nn === 7 && pg === 6))) { nn = 5; realLen = nn * pg; }
        return {
          q: "A " + e.what + " is $" + num(realLen) + "$ " + e.rl + " long. To fit a page it is drawn $" + num(pg) + "$ " + e.d + " long. How many " + e.rl + " does $1$ " + e.ds + " on the drawing stand for?",
          type: "number", answer: num(nn), placeholder: e.rl + " per " + e.ds,
          hint: "The scale is the real length for one drawn unit. A rate with the real length on top and the drawn length underneath gives it.",
          steps: ["The scale is real length over drawn length: $\\dfrac{" + num(realLen) + "\\text{ " + e.rl + "}}{" + num(pg) + "\\text{ " + e.d + "}}$.", "$" + num(realLen) + " \\div " + num(pg) + " = " + num(nn) + "$, so $1$ " + e.ds + " stands for $" + num(nn) + "$ " + e.rl + "."],
          verify: function () { /* drawn : real = 1 : n, cross-multiplied */ return Math.abs(pg / realLen - 1 / nn) < 1e-12 && nn < realLen && realLen <= 1000; }
        };
      }
      var N2 = r.pick([10, 20, 24, 25, 40, 50, 100]), mm = r.pick([4, 5, 6, 7, 8, 9, 10, 12, 14, 22, 15, 16, 18, 20, 21, 24, 25, 28, 30, 32, 35, 36, 40, 45]), mReal = mm * N2 / 100;
      return {
        q: "A model has the scale $1 : " + N2 + "$. The real object is " + qty(mReal, "meters") + " long. How many centimeters long is the model?",
        type: "number", answer: num(mm), placeholder: "centimeters",
        hint: "A ratio with no units means the real length is that many times the model. Put the real length in centimeters, then divide by the number in the ratio.",
        steps: ["The real object in centimeters: $" + num(mReal) + "\\text{ m}\\cdot\\frac{100\\text{ cm}}{1\\text{ m}} = " + num(mReal * 100) + "$ cm.", "The model is $1$ part to $" + N2 + "$ parts of the real length: $" + num(mReal * 100) + " \\div " + N2 + " = " + num(mm) + "$ centimeters."],
        verify: function () { return Math.abs(mm * N2 - Math.round(mReal * 100)) < 1e-6 && sameSizeP(mReal, "meters", mm * N2, "centimeters", 1) && mm < mReal * 100; }
      };
    }
  });

  G.add({
    id: "pk-scale-area", section: "pk-units#scale", par: 80, timed: true,
    make: function (r) {
      var kind = r.pick(["length", "area", "area", "map", "findk"]);
      if (kind === "length") {
        var k = r.pick([2, 3, 4, 5, 1.5, 2.5]), s = r.pick([2, 3, 4, 5, 6, 8, 10, 12]), big = k * s;
        return {
          q: "A rectangle is enlarged by a scale factor of $" + num(k) + "$. One side of the original is $" + num(s) + "$ centimeters. How many centimeters long is that side in the enlargement?",
          type: "number", answer: num(big), placeholder: "centimeters",
          hint: "A scale factor multiplies every length. It does not multiply the unit.",
          steps: ["Lengths are multiplied by the scale factor $k = " + num(k) + "$.", "$" + num(k) + " \\cdot " + num(s) + " = " + num(big) + "$ centimeters."],
          verify: function () { return Math.abs(big / k - s) < 1e-9 && big > s; }
        };
      }
      if (kind === "area") {
        var kk = r.pick([2, 3, 4, 5, 10, 1.5]), a = r.pick([2, 3, 4, 5, 6, 8, 12, 20]), a2;
        if (a === 20 && kk === 2) a = 12; /* the text's own check */
        a2 = a * kk * kk;
        return {
          q: "A figure with an area of $" + num(a) + "$ square centimeters is enlarged by a scale factor of $" + num(kk) + "$. What is the area of the enlargement, in square centimeters?",
          type: "number", answer: num(a2), placeholder: "square centimeters",
          hint: "Lengths are multiplied by the scale factor, and an area is a length times a length. So the area is multiplied by the scale factor used twice.",
          steps: ["Areas are multiplied by $k^2 = " + num(kk) + "^2 = " + num(kk * kk) + "$.", "$" + num(a) + " \\cdot " + num(kk * kk) + " = " + num(a2) + "$ square centimeters."],
          verify: function () {
            /* take a square of this area: its side times k, then square the new side */
            var side = Math.sqrt(a), newSide = side * kk;
            return Math.abs(newSide * newSide - a2) < 1e-6 && a2 > a;
          }
        };
      }
      if (kind === "map") {
        /* drawn areas that give real areas of 20 to 2000 square meters */
        var MAPS = { 100: [24, 30, 40, 48, 60, 80, 100, 120, 150], 200: [6, 8, 10, 12, 15, 20, 24, 30], 500: [2, 3, 4, 6, 8, 10, 12, 15], 1000: [1, 2, 3, 4, 5, 6, 8, 10, 12] };
        var N = r.pick([100, 200, 500, 1000]), sq = r.pick(MAPS[N]), cm2 = sq * N * N, m2 = cm2 / 10000;
        return {
          q: "A plan has the scale $1 : " + N + "$. A garden covers $" + num(sq) + "$ square centimeters on the plan. What is its real area, in square meters?",
          type: "number", answer: num(m2), placeholder: "square meters",
          hint: "Real lengths are the scale number times the drawn ones, so real areas are the square of that. Then convert square centimeters to square meters with the squared factor.",
          steps: ["Areas are multiplied by $" + N + "^2 = " + num(N * N) + "$: $" + num(sq) + " \\cdot " + num(N * N) + " = " + num(cm2) + "$ square centimeters.", "$1$ m$^2 = 10{,}000$ cm$^2$, so $" + num(cm2) + " \\div 10{,}000 = " + num(m2) + "$ square meters."],
          verify: function () {
            /* a square of this area: the drawn side times N is a real side in cm, then meters, then square */
            var side = Math.sqrt(sq), realSide = side * N / 100;
            return Math.abs(realSide * realSide - m2) <= 1e-9 * Math.max(1, m2) && m2 >= 20 && m2 <= 2000 && MAPS[N].indexOf(sq) >= 0;
          }
        };
      }
      var k3 = r.pick([2, 3, 4, 5, 6]), a3 = r.pick([2, 3, 5, 6, 7]), big3 = a3 * k3 * k3;
      return {
        q: "Two similar figures have areas of $" + num(a3) + "$ square inches and $" + num(big3) + "$ square inches. By what scale factor is the smaller figure enlarged to the larger?",
        type: "number", answer: num(k3), placeholder: "scale factor",
        hint: "Areas are multiplied by the scale factor squared. Divide the areas to find how many times larger the area is, then ask which number times itself gives that.",
        steps: ["The area is multiplied by $k^2$: $\\dfrac{" + num(big3) + "}{" + num(a3) + "} = " + num(k3 * k3) + "$.", "$k^2 = " + num(k3 * k3) + "$, and $" + num(k3) + " \\cdot " + num(k3) + " = " + num(k3 * k3) + "$, so $k = " + num(k3) + "$."],
        verify: function () { return Math.abs(Math.sqrt(big3 / a3) - k3) < 1e-9 && a3 * k3 * k3 === big3 && k3 > 1; }
      };
    }
  });

  /* --------------------------------------------- pack E: linear models -- */

  /* The six settings the slope and model generators share. A model is y = b + m x with a start b and a
     rate (the size of m); sign says whether the quantity rises (1) or falls (-1). lo/hi bound the rate
     and ymin/ymax every value the line takes for x up to xmax, so a story stays plausible. */
  var LIN = [
    { id: "taxi", xp: "miles", xs: "mile", y: "dollars", ys: "dollar", money: true, sign: 1, L: "n", Y: "F", name: "fare",
      per: "dollars per mile", yin: "in dollars", th: ["Distance (miles)", "Fare (dollars)"],
      rates: [2, 2.5, 3, 3.5, 4], starts: [3, 4, 5, 6, 8], xmax: 14, lo: 2, hi: 4, ymin: 0, ymax: 80,
      pts: "A taxi ride of {x1} costs {y1}, and a ride of {x2} costs {y2}. The fare follows a straight line in the distance.",
      tell: "A taxi charges {b} to start and {m} for each mile.",
      ask: "Write the fare in dollars for a ride of ${L}$ miles, in terms of ${L}$.",
      model: "A taxi's fare $F$, in dollars, for a ride of $n$ miles is modeled by",
      at: "for a ride of {X}", when: "How many miles can you ride?", whenWith: "The fare comes to {T}.", tab: "A taxi company lists fares for rides of different lengths." },
    { id: "plumber", xp: "hours", xs: "hour", y: "dollars", ys: "dollar", money: true, sign: 1, L: "h", Y: "B", name: "bill",
      per: "dollars per hour", yin: "in dollars", th: ["Time (hours)", "Bill (dollars)"],
      rates: [40, 45, 50, 60, 75, 80, 90, 100, 120], starts: [20, 25, 30, 40, 50, 60], xmax: 8, lo: 40, hi: 120, ymin: 0, ymax: 1100,
      pts: "A plumber's bill is {y1} for {x1} of work and {y2} for {x2} of work. The bill follows a straight line in the time.",
      tell: "A plumber charges a visit fee of {b} plus {m} for each hour of work.",
      ask: "Write the bill in dollars for ${L}$ hours of work, in terms of ${L}$.",
      model: "A plumber's bill $B$, in dollars, for $h$ hours of work is modeled by",
      when: "For how many hours did the plumber work?", at: "for {X} of work", whenWith: "The bill comes to {T}.", tab: "A plumber's bill is recorded for jobs of different lengths." },
    { id: "plant", xp: "weeks", xs: "week", y: "centimeters", ys: "centimeter", sign: 1, L: "n", Y: "H", name: "height",
      per: "centimeters per week", yin: "in centimeters", th: ["Time (weeks)", "Height (centimeters)"],
      rates: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5], starts: [4, 5, 6, 8, 10, 12, 15, 20], xmax: 10, lo: 1, hi: 5, ymin: 0, ymax: 80,
      pts: "A plant is {y1} tall after {x1} and {y2} tall after {x2}. Its height follows a straight line in the time.",
      tell: "A plant is {b} tall and grows {m} each week.",
      ask: "Write the height in centimeters after ${L}$ weeks, in terms of ${L}$.",
      model: "A plant's height $H$, in centimeters, after $n$ weeks is modeled by",
      when: "After how many weeks is the plant that tall?", at: "after {X}", whenWith: "Later the plant is {T} tall.", tab: "A gardener measures a plant each week." },
    { id: "tank", xp: "minutes", xs: "minute", y: "gallons", ys: "gallon", sign: -1, L: "t", Y: "G", name: "amount of water in the tank",
      per: "gallons per minute", yin: "in gallons", th: ["Time (minutes)", "Water in the tank (gallons)"],
      rates: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20], starts: [100, 150, 200, 240, 300, 400], xmax: 20, lo: 2, hi: 20, ymin: 0, ymax: 400,
      pts: "A tank holds {y1} after {x1} of draining and {y2} after {x2} of draining. The amount follows a straight line in the time.",
      tell: "A tank holds {b} and drains {m} each minute.",
      ask: "Write the number of gallons left after ${L}$ minutes, in terms of ${L}$.",
      model: "The water $G$, in gallons, left in a draining tank after $t$ minutes is modeled by",
      when: "After how many minutes is that much left?", at: "after {X} of draining", whenWith: "Later the tank holds {T}.", tab: "A pump drains a tank, and the water is measured over time." },
    { id: "warm", xp: "hours", xs: "hour", y: "degrees Fahrenheit", ys: "degree Fahrenheit", deg: true, sign: 1, L: "h", Y: "T", name: "temperature",
      per: "degrees per hour", per1: "degree per hour", yin: "in degrees Fahrenheit", th: ["Time (hours)", "Temperature (°F)"],
      rates: [1, 2, 3, 4, 5], starts: [-10, 0, 10, 20, 30, 40, 50], xmax: 8, lo: 1, hi: 5, ymin: -20, ymax: 110,
      pts: "On a morning that warms steadily, it is {y1} after {x1} and {y2} after {x2}.",
      tell: "At 6 a.m. the temperature is {b}, and it rises {m} each hour.",
      ask: "Write the temperature in degrees Fahrenheit ${L}$ hours after 6 a.m., in terms of ${L}$.",
      model: "The temperature $T$, in degrees Fahrenheit, $h$ hours after 6 a.m. is modeled by",
      at: "after {X}", when: "After how many hours does it get there?", whenWith: "Later it is {T}.", tab: "A weather station logs the temperature on a warming morning." },
    { id: "cool", xp: "hours", xs: "hour", y: "degrees Fahrenheit", ys: "degree Fahrenheit", deg: true, sign: -1, L: "h", Y: "T", name: "temperature",
      per: "degrees per hour", per1: "degree per hour", yin: "in degrees Fahrenheit", th: ["Time (hours)", "Temperature (°F)"],
      rates: [1, 2, 3, 4, 5], starts: [30, 40, 50, 60, 70, 80, 90], xmax: 8, lo: 1, hi: 5, ymin: -20, ymax: 110,
      pts: "On an evening that cools steadily, it is {y1} after {x1} and {y2} after {x2}.",
      tell: "At 3 p.m. the temperature is {b}, and it falls {m} each hour.",
      ask: "Write the temperature in degrees Fahrenheit ${L}$ hours after 3 p.m., in terms of ${L}$.",
      model: "The temperature $T$, in degrees Fahrenheit, $h$ hours after 3 p.m. is modeled by",
      at: "after {X}", when: "After how many hours does it get there?", whenWith: "Later it is {T}.", tab: "A weather station logs the temperature on a cooling evening." }
  ];

  /* a value of the quantity as the page writes it: $\$12.50$, $18$ centimeters, $-5$°F */
  function linY(c, v) {
    if (c.money) return v === Math.floor(v) ? "$\\$" + v + "$" : usd(Math.round(v * 100));
    if (c.deg) return "$" + clean(v) + "$°F";
    return "$" + clean(v) + "$ " + (v === 1 ? c.ys : c.y);
  }
  /* a count of the x unit: $1$ mile, $5$ miles */
  function linX(c, x) { return "$" + clean(x) + "$ " + (x === 1 ? c.xs : c.xp); }
  function fill(s, map) { return s.replace(/\{(\w+)\}/g, function (all, k) { return map.hasOwnProperty(k) ? map[k] : all; }); }
  /* the value of y = b + m x for the model's own numbers */
  function linAt(b, m, x) { return Number((b + m * x).toFixed(6)); }
  /* does the line stay in the setting's plausible values from 0 to xmax? */
  function linInRange(c, b, m) {
    var top = linAt(b, m, c.xmax);
    return Math.min(b, top) >= c.ymin && Math.max(b, top) <= c.ymax;
  }
  /* a start and a rate for a setting; whole asks for whole numbers only. Returns { b, rate, m } with m signed */
  function linPick(r, c, whole) {
    /* whole also keeps a start above 0 and a rate above 1, so a key never reads "1h+0" */
    var rs = c.rates.filter(function (v) { return !whole || (v === Math.floor(v) && v > 1); });
    var bs = c.starts.filter(function (v) { return !whole || (v === Math.floor(v) && v > 0); });
    var b, rate, guard = 0;
    do { b = r.pick(bs); rate = r.pick(rs); } while (!linInRange(c, b, c.sign * rate) && guard++ < 80);
    if (!linInRange(c, b, c.sign * rate)) { b = bs[0]; rate = rs[0]; }
    return { b: b, rate: rate, m: c.sign * rate };
  }
  /* the term m x as written: "3n", "n" for a rate of 1, with a minus for a falling line */
  function linTerm(c, m) { return (m < 0 ? "-" : "") + (Math.abs(m) === 1 ? "" : clean(Math.abs(m))) + c.L; }
  /* y = b + m x, written b first: "5 + 3n" or "300 - 12t"; a zero start is left out ("5h") and a rate of 1 is "h" */
  function linEq(c, b, m) {
    var a = linTerm(c, Math.abs(m));
    if (b === 0) return (m < 0 ? "-" : "") + a;
    return clean(b) + (m < 0 ? " - " : " + ") + a;
  }
  /* the same line as the page's expr key: every spelling, in the order learners write them */
  function linKey(c, b, m) {
    var a = linTerm(c, Math.abs(m));
    if (b === 0) return (m < 0 ? "-" : "") + a;
    return m < 0 ? clean(b) + "-" + a + "|-" + a + "+" + clean(b) : a + "+" + clean(b) + "|" + clean(b) + "+" + a;
  }
  /* read a sum such as "5 + 3n", "-12t+300" or "n" at a count, from its text alone */
  function linEval(s, L, x) {
    var text = s.replace(/\s+/g, ""), terms = text.match(/[+-]?[^+-]+/g) || [], t = 0, k;
    for (k = 0; k < terms.length; k++) {
      var sign = terms[k].charAt(0) === "-" ? -1 : 1, body = terms[k].replace(/^[+-]/, "");
      if (body.charAt(body.length - 1) === L) {
        var coef = body.slice(0, -1);
        t += sign * (coef === "" ? 1 : Number(coef)) * x;
      } else t += sign * Number(body);
    }
    return Number(t.toFixed(6));
  }
  /* the units of a slope in words: "dollars per mile" is c.per; after a rate of exactly 1 the setting's
     per1 ("degree per hour") when it has one, so a step never reads "1 degrees per hour" */
  function linPer(c, m) { return Math.abs(m) === 1 && c.per1 ? c.per1 : c.per; }
  function linSlopeHelp(c) { return c.sign < 0 ? " Use a negative number, because the quantity falls." : ""; }
  var SLOPE_PLAIN_M = [-4, -3, -2, -1, 1, 2, 3, 4, 5, 6, -0.5, 0.5, 1.5, 2.5, -1.5];

  G.add({
    id: "pk-slope-points", section: "pk-linear#slope", par: 50, timed: true,
    make: function (r) {
      var kind = r.pick(["story", "story", "story", "plain", "plain", "frac"]);
      if (kind === "story") {
        var c = r.pick(LIN), p = linPick(r, c, false), x1 = r.int(1, Math.floor(c.xmax / 2)), x2 = x1 + r.int(2, Math.floor(c.xmax / 2));
        x2 = Math.min(x2, c.xmax);
        var y1 = linAt(p.b, p.m, x1), y2 = linAt(p.b, p.m, x2), swap = r.chance(0.4);
        var A = swap ? [x2, y2] : [x1, y1], B = swap ? [x1, y1] : [x2, y2];
        var ask = c.id === "taxi" || c.id === "plumber" ? "the rate of change of the " + c.name + "" : "the rate of change";
        return {
          q: fill(c.pts, { x1: linX(c, A[0]), y1: linY(c, A[1]), x2: linX(c, B[0]), y2: linY(c, B[1]) }) + " What is " + ask + ", in " + c.per + "?" + linSlopeHelp(c),
          type: "number", answer: clean(p.m), placeholder: c.per,
          hint: "The rate of change is the change in the quantity divided by the change in the count. Decide which difference goes on top, and subtract both in the same order.",
          steps: [
            "Rate of change $= \\dfrac{\\text{change in the " + c.name + "}}{\\text{change in the " + c.xp + "}}$.",
            "$\\dfrac{" + clean(B[1]) + " - " + (A[1] < 0 ? "(" + clean(A[1]) + ")" : clean(A[1])) + "}{" + clean(B[0]) + " - " + clean(A[0]) + "} = \\dfrac{" + clean(B[1] - A[1]) + "}{" + clean(B[0] - A[0]) + "} = " + clean(p.m) + "$.",
            "The rate is $" + clean(p.m) + "$ " + linPer(c, p.m) + "."
          ],
          verify: function () {
            /* subtract in the other order, then find the line through the first point and test the second */
            var rev = (A[1] - B[1]) / (A[0] - B[0]), b1 = A[1] - rev * A[0];
            return Math.abs(rev - p.m) < 1e-9 && Math.abs(rev * B[0] + b1 - B[1]) < 1e-9 && Math.abs(b1 - p.b) < 1e-9 &&
              p.rate >= c.lo && p.rate <= c.hi && linInRange(c, p.b, p.m) && A[0] !== B[0];
          }
        };
      }
      var m, x1p, x2p, y1p, y2p, dy, dx, ans, type = "number", guard = 0;
      if (kind === "frac") {
        do { dx = r.int(2, 5); dy = r.nonzero(-7, 7); } while ((gcd(Math.abs(dy), dx) !== 1 || Math.abs(dy) === dx) && guard++ < 80);
        if (gcd(Math.abs(dy), dx) !== 1) { dx = 3; dy = 2; }
        type = "fraction"; ans = dy + "/" + dx; m = dy / dx;
        x1p = r.int(-6, 4); y1p = r.int(-6, 6);
      } else {
        m = r.chance(0.1) ? 0 : r.pick(SLOPE_PLAIN_M);
        dx = (m !== Math.floor(m)) ? r.pick([2, 4]) : r.int(1, 4);
        dy = m * dx; ans = clean(m);
        x1p = r.int(-5, 4); y1p = r.int(-6, 6);
      }
      x2p = x1p + dx; y2p = y1p + dy;
      var flip = r.chance(0.4), P = flip ? [x2p, y2p] : [x1p, y1p], Q = flip ? [x1p, y1p] : [x2p, y2p];
      var pt = function (v) { return "(" + clean(v[0]) + ", " + clean(v[1]) + ")"; };
      return {
        q: "Find the slope of the line through $" + pt(P) + "$ and $" + pt(Q) + "$." + (type === "fraction" ? " Give it as a fraction in lowest terms." : ""),
        type: type, answer: ans, placeholder: type === "fraction" ? "e.g. 3/4" : "e.g. 2.5",
        hint: "The slope is the change in $y$ divided by the change in $x$. Subtract the coordinates of the two points in the same order on the top and the bottom.",
        steps: [
          "Slope $= \\dfrac{y_2 - y_1}{x_2 - x_1}$, with the points taken in one fixed order.",
          "$\\dfrac{" + clean(Q[1]) + " - " + (P[1] < 0 ? "(" + clean(P[1]) + ")" : clean(P[1])) + "}{" + clean(Q[0]) + " - " + (P[0] < 0 ? "(" + clean(P[0]) + ")" : clean(P[0])) + "} = \\dfrac{" + clean(Q[1] - P[1]) + "}{" + clean(Q[0] - P[0]) + "}" + (type === "fraction" ? "" : " = " + ans) + "$."
        ],
        verify: function () {
          /* the points in the other order give the same quotient, and the line through P with that slope meets Q */
          var rev = (P[1] - Q[1]) / (P[0] - Q[0]), b = P[1] - rev * P[0];
          return Math.abs(rev - m) < 1e-9 && Math.abs(rev * Q[0] + b - Q[1]) < 1e-9 && P[0] !== Q[0] && (type !== "fraction" || gcd(Math.abs(dy), dx) === 1);
        }
      };
    }
  });

  /* a table of values in a row layout, as math */
  function linTable(head, xs, ys) {
    return "$$\\begin{array}{c|" + xs.map(function () { return "c"; }).join("") + "} \\text{" + head[0] + "} & " + xs.map(clean).join(" & ") +
      " \\\\ \\hline \\text{" + head[1] + "} & " + ys.map(clean).join(" & ") + " \\end{array}$$";
  }

  G.add({
    id: "pk-slope-table", section: "pk-linear#slope", par: 60, timed: true,
    make: function (r) {
      var c = r.pick(LIN), p = linPick(r, c, false), unequal = r.chance(0.5), xs = [], guard = 0, x0, step, i;
      if (!unequal) {
        do {
          x0 = r.pick([0, 1, 2, 3]); step = r.pick([1, 2, 3, 4, 5]);
          xs = [x0, x0 + step, x0 + 2 * step, x0 + 3 * step];
        } while (xs[3] > c.xmax && guard++ < 80);
        if (xs[3] > c.xmax) xs = [0, 1, 2, 3];
      } else {
        do {
          var pool = []; for (i = 0; i <= c.xmax; i++) pool.push(i);
          xs = r.shuffle(pool).slice(0, 4).sort(function (a, b) { return a - b; });
        } while ((xs[1] - xs[0] === xs[2] - xs[1] && xs[2] - xs[1] === xs[3] - xs[2]) && guard++ < 80);
        if (xs[1] - xs[0] === xs[2] - xs[1] && xs[2] - xs[1] === xs[3] - xs[2]) xs = [0, 1, 3, 6];
      }
      var ys = xs.map(function (x) { return linAt(p.b, p.m, x); });
      return {
        q: c.tab + " " + linTable(c.th, xs, ys) + " What is the rate of change, in " + c.per + "?" + linSlopeHelp(c),
        type: "number", answer: clean(p.m), placeholder: c.per,
        hint: unequal ? "The columns are not evenly spaced, so the rate is not the gap between two neighboring values. Pick two columns and divide the change in the quantity by the change in the count." : "A table of a straight line has one rate everywhere. Pick two columns and divide the change in the quantity by the change in the count.",
        steps: [
          "Pick the first and the last columns: the count goes from $" + clean(xs[0]) + "$ to $" + clean(xs[3]) + "$, a change of $" + clean(xs[3] - xs[0]) + "$.",
          "The " + c.name + " goes from $" + clean(ys[0]) + "$ to $" + clean(ys[3]) + "$, a change of $" + clean(ys[3] - ys[0]) + "$.",
          "$\\dfrac{" + clean(ys[3] - ys[0]) + "}{" + clean(xs[3] - xs[0]) + "} = " + clean(p.m) + "$ " + linPer(c, p.m) + "."
        ],
        verify: function () {
          /* walk from the first value by the rate, one unit of the count at a time, and land on every later value;
             the first-to-last quotient and every neighboring quotient agree with the rate */
          var cur = ys[0], k, x;
          for (k = 1; k < 4; k++) {
            for (x = xs[k - 1]; x < xs[k]; x++) cur = Number((cur + p.m).toFixed(6));
            if (Math.abs(cur - ys[k]) > 1e-9) return false;
            if (Math.abs((ys[k] - ys[k - 1]) / (xs[k] - xs[k - 1]) - p.m) > 1e-9) return false;
          }
          if (Math.abs((ys[3] - ys[0]) / (xs[3] - xs[0]) - p.m) > 1e-9) return false;
          return xs[0] < xs[1] && xs[1] < xs[2] && xs[2] < xs[3] && p.rate >= c.lo && p.rate <= c.hi && linInRange(c, p.b, p.m);
        }
      };
    }
  });

  G.add({
    id: "pk-slope-read", section: "pk-linear#slope", par: 50, timed: true,
    make: function (r) {
      var c = r.pick(LIN), p = linPick(r, c, false), kind = r.pick(["rate", "start", "change"]), k = r.int(2, 6), ans, ask, hint, steps;
      var rhs = linEq(c, p.b, p.m), fall = c.sign < 0;
      if (kind === "rate") {
        ans = p.m;
        ask = "By how many " + c.y + " does the " + c.name + " change for each extra " + c.xs + "? Give the rate in " + c.per + "." + linSlopeHelp(c);
        hint = "In " + "$y = b + mx$, one of the two numbers is the change for one more unit. Decide which one multiplies the count.";
        steps = ["The number that multiplies $" + c.L + "$ is the change for each extra " + c.xs + ": $" + clean(p.m) + "$ " + linPer(c, p.m) + "."];
      } else if (kind === "start") {
        ans = p.b;
        ask = "What is the " + c.name + " at the start, when $" + c.L + " = 0$? Give it " + c.yin + ".";
        hint = "At the start the count is zero, so the part that depends on the count has nothing in it. See what is left.";
        steps = ["Put $" + c.L + " = 0$: the term with $" + c.L + "$ is $0$, so the value is $" + clean(p.b) + "$ " + c.y + "."];
      } else {
        ans = c.sign * p.rate * k;
        ask = "By how much does the " + c.name + " change when $" + c.L + "$ grows by " + linX(c, k) + "? Give the change " + c.yin + "." + linSlopeHelp(c);
        hint = "Each extra unit changes the quantity by the rate. Find the rate in the model first, then think about how many units were added.";
        steps = ["The rate is $" + clean(p.m) + "$ " + linPer(c, p.m) + ".", "Over $" + k + "$ more " + c.xp + ": $" + clean(p.m) + " \\cdot " + k + " = " + clean(ans) + "$ " + c.y + "."];
      }
      return {
        q: c.model + " $" + c.Y + " = " + rhs + "$. " + ask,
        type: "number", answer: clean(ans), placeholder: kind === "rate" ? c.per : c.y,
        hint: hint, steps: steps,
        verify: function () {
          /* read the same numbers by evaluating the written sum at 0, 1 and k */
          var at0 = linEval(rhs, c.L, 0), at1 = linEval(rhs, c.L, 1), atk = linEval(rhs, c.L, k);
          var want = kind === "rate" ? at1 - at0 : kind === "start" ? at0 : atk - at0;
          return Math.abs(want - ans) < 1e-9 && p.rate >= c.lo && p.rate <= c.hi && linInRange(c, p.b, p.m) && (kind !== "change" || (fall ? ans < 0 : ans > 0));
        }
      };
    }
  });

  G.add({
    id: "pk-model-write", section: "pk-linear#model", par: 50, timed: true,
    make: function (r) {
      var c0 = r.pick(LIN), p = linPick(r, c0, true);
      /* the count is x here: tools/check-gen.js reads x in a key and no other letter */
      var c = {}, key, ph, k0;
      for (k0 in c0) if (c0.hasOwnProperty(k0)) c[k0] = c0[k0];
      c.L = "x"; key = linKey(c, p.b, p.m);
      var story = fill(c.tell, { b: linY(c, p.b), m: linY(c, p.rate) });
      /* an example that is not an answer: rate 7 is in no setting, and a different example stands in if it ever matched */
      ph = c.sign < 0 ? "90-7x" : "7x+3";
      if (key.split("|").indexOf(ph) >= 0) ph = c.sign < 0 ? "95-9x" : "9x+2";
      if (key.split("|").indexOf(ph) >= 0) throw new Error("pk-model-write: the placeholder is an alternative of the key");
      return {
        q: story + " " + fill(c.ask, { L: "x" }),
        type: "expr", answer: key, placeholder: "e.g. " + ph,
        hint: "The start is what you have before any " + c.xs + " goes by, and the rate is what each " + c.xs + " adds or takes away. Decide which of the two multiplies the count.",
        steps: [
          "The value at the start is $" + clean(p.b) + "$ " + c.y + ".",
          "Each " + c.xs + " " + (c.sign < 0 ? "removes" : "adds") + " $" + clean(p.rate) + "$, so " + (c.sign < 0 ? "$" + c.L + "$ of them remove $" + clean(p.rate) + c.L + "$" : "$" + c.L + "$ of them add $" + clean(p.rate) + c.L + "$") + ".",
          "Together: $" + linEq(c, p.b, p.m) + "$."
        ],
        verify: function () {
          /* the key at two counts against the story told one step at a time */
          var ns = [2, 5], i, n, run, j, alts = key.split("|");
          for (i = 0; i < ns.length; i++) {
            n = ns[i]; run = p.b;
            for (j = 0; j < n; j++) run += p.m;
            if (alts.some(function (alt) { return Math.abs(linEval(alt, c.L, n) - run) > 1e-9; })) return false;
          }
          return p.rate !== 1 && p.rate >= c.lo && p.rate <= c.hi && linInRange(c, p.b, p.m);
        }
      };
    }
  });

  G.add({
    id: "pk-model-two-points", section: "pk-linear#model", par: 70, timed: true,
    make: function (r) {
      var c = r.pick(LIN), p = linPick(r, c, false), kind = r.pick(["slope", "start", "predict", "predict"]);
      var guard = 0, x1, x2, x3;
      do {
        x1 = r.int(1, 4); x2 = x1 + r.int(2, 5); x3 = x2 + r.int(1, 4);
      } while ((x2 > c.xmax || x3 > c.xmax) && guard++ < 80);
      if (x2 > c.xmax || x3 > c.xmax) { x1 = 1; x2 = 3; x3 = 4; }
      var y1 = linAt(p.b, p.m, x1), y2 = linAt(p.b, p.m, x2), y3 = linAt(p.b, p.m, x3);
      var intro = fill(c.pts, { x1: linX(c, x1), y1: linY(c, y1), x2: linX(c, x2), y2: linY(c, y2) }), ans, ask, hint, steps;
      if (kind === "slope") {
        ans = p.m; ask = "What is the rate of change, in " + c.per + "?" + linSlopeHelp(c);
        hint = "Two points on a line give its rate: the change in the quantity over the change in the count.";
        steps = ["$\\dfrac{" + clean(y2) + " - " + (y1 < 0 ? "(" + clean(y1) + ")" : clean(y1)) + "}{" + clean(x2) + " - " + clean(x1) + "} = " + clean(p.m) + "$ " + linPer(c, p.m) + "."];
      } else if (kind === "start") {
        ans = p.b; ask = "What was the value at the start, at " + linX(c, 0) + "? Give it " + c.yin + ".";
        hint = "Find the rate from the two points first. Then go back from one of the points to where the count is zero.";
        steps = ["Rate: $\\dfrac{" + clean(y2 - y1) + "}{" + clean(x2 - x1) + "} = " + clean(p.m) + "$.", "Put one point into $y = b + mx$: $" + clean(y1) + " = b + " + (p.m < 0 ? "(" + clean(p.m) + ")" : clean(p.m)) + " \\cdot " + clean(x1) + "$, so $b = " + clean(p.b) + "$."];
      } else {
        ans = y3; ask = "Using the line, what is the value " + fill(c.at, { X: linX(c, x3) }) + "? Give it " + c.yin + ".";
        hint = "Find the rate and the starting value of the line first. Then put the new count into the model.";
        steps = ["Rate: $\\dfrac{" + clean(y2 - y1) + "}{" + clean(x2 - x1) + "} = " + clean(p.m) + "$; start: $b = " + clean(p.b) + "$.", "At $" + clean(x3) + "$: $" + (p.b === 0 ? (p.m < 0 ? "-" : "") : clean(p.b) + (p.m < 0 ? " - " : " + ")) + clean(Math.abs(p.m)) + " \\cdot " + clean(x3) + " = " + clean(y3) + "$."];
      }
      return {
        q: intro + " " + ask, type: "number", answer: clean(ans), placeholder: kind === "slope" ? c.per : c.y,
        hint: hint, steps: steps,
        verify: function () {
          /* the start from each point agrees, and the third value follows from point 2 by the rate alone */
          var m = (y2 - y1) / (x2 - x1), b1 = y1 - m * x1, b2 = y2 - m * x2, want = kind === "slope" ? m : kind === "start" ? b1 : y2 + m * (x3 - x2);
          return Math.abs(b1 - b2) < 1e-9 && Math.abs(want - ans) < 1e-9 && p.rate >= c.lo && p.rate <= c.hi && linInRange(c, p.b, p.m) && x1 < x2 && x2 < x3;
        }
      };
    }
  });

  G.add({
    id: "pk-model-when", section: "pk-linear#model", par: 70, timed: true,
    make: function (r) {
      var c, p, x0, T, tries = 0, ok;
      /* the target lies strictly inside the setting's range, and above 0 for money, height and water */
      function good() { return T > c.ymin && T < c.ymax && (c.deg || T > 0); }
      do {
        c = r.pick(LIN); p = linPick(r, c, false); x0 = r.int(2, Math.max(2, c.xmax - 1)); T = linAt(p.b, p.m, x0); ok = good();
      } while (!ok && tries++ < 200);
      if (!ok) { c = LIN[0]; p = { b: 3, rate: 2, m: 2 }; x0 = 2; T = 7; }
      var story = fill(c.tell, { b: linY(c, p.b), m: linY(c, p.rate) }), eq = linEq(c, p.b, p.m), term = linTerm(c, p.m);
      return {
        q: story + " " + fill(c.whenWith, { T: linY(c, T) }) + " " + c.when,
        type: "number", answer: clean(x0), placeholder: c.xp,
        hint: "Set the model equal to the value you are given and solve for the count. First take away the part that does not depend on the count, then split what is left by the rate.",
        steps: [
          "The model is $" + c.Y + " = " + eq + "$, and we want $" + c.Y + " = " + clean(T) + "$.",
          p.b === 0 ? "There is no start to take away, so $" + clean(T) + " = " + term + "$." : "$" + clean(T) + " = " + eq + "$, so $" + clean(T - p.b) + " = " + term + "$.",
          "$" + c.L + " = " + clean(T - p.b) + " \\div " + (p.m < 0 ? "(" + clean(p.m) + ")" : clean(p.m)) + " = " + clean(x0) + "$ " + c.xp + "."
        ],
        verify: function () {
          /* put the answer back into the model, and solve the other way round */
          /* count steps from the start by the rate until the value reaches the target, and compare with the answer */
          var cur = p.b, steps = 0;
          while ((p.m > 0 ? cur < T - 1e-9 : cur > T + 1e-9) && steps < 400) { cur = Number((cur + p.m).toFixed(6)); steps++; }
          return steps === x0 && Math.abs(cur - T) < 1e-9 && good() &&
            Math.abs(linAt(p.b, p.m, x0) - T) < 1e-9 && Math.abs((T - p.b) / p.m - x0) < 1e-9 && x0 === Math.floor(x0) && x0 >= 2 && x0 <= c.xmax &&
            p.rate >= c.lo && p.rate <= c.hi && linInRange(c, p.b, p.m);
        }
      };
    }
  });

  /* ------------------------------------------ pack E: inequalities -- */

  var IREL = {
    "<": { tex: "<", flip: ">" }, "<=": { tex: "\\le", flip: ">=" },
    ">": { tex: ">", flip: "<" }, ">=": { tex: "\\ge", flip: "<=" }
  };
  var IRELS = ["<", "<=", ">", ">="];
  /* does l rel r hold? */
  function ineqHolds(rel, l, r) {
    if (rel === "<") return l < r;
    if (rel === "<=") return l <= r;
    if (rel === ">") return l > r;
    return l >= r;
  }
  /* a term of a sum, signed: "3x" first, " - 2y" after; a coefficient of 1 is left out */
  function iTerm(a, v, first) {
    var mag = Math.abs(a) === 1 ? "" : clean(Math.abs(a));
    if (first) return (a < 0 ? "-" : "") + mag + v;
    return (a < 0 ? " - " : " + ") + mag + v;
  }
  /* a x + b, or b + a x when the constant is written first */
  function iLin(a, b, constFirst) {
    if (b === 0) return iTerm(a, "x", true);
    if (constFirst) return clean(b) + iTerm(a, "x", false);
    return iTerm(a, "x", true) + (b < 0 ? " - " : " + ") + clean(Math.abs(b));
  }
  /* an integer test: ceil and floor without float noise (the values here are multiples of 0.5) */
  function iFloor(v) { return Math.floor(v + 1e-9); }
  function iCeil(v) { return Math.ceil(v - 1e-9); }
  /* the money format of the pack: $\$12$ */
  function iMoney(v) { return "$\\$" + clean(v) + "$"; }
  function iPlace(ans, first, second) { return "e.g. " + ans === first ? second : first; }
  /* n / d in lowest terms as math, with a decimal after it when it is not whole: \frac{89}{6} (about 14.83) */
  function iQuot(n, d) {
    var g = gcd(Math.abs(n), Math.abs(d)) || 1, nn = n / g, dd = d / g;
    if (dd < 0) { nn = -nn; dd = -dd; }
    if (dd === 1) return clean(nn);
    var dec = nn / dd;
    return (nn < 0 ? "-" : "") + "\\frac{" + Math.abs(nn) + "}{" + dd + "}" + (Math.abs(dec * 2 - Math.round(dec * 2)) < 1e-9 ? " = " + clean(dec) : " \\approx " + dec.toFixed(2));
  }

  /* a x + b rel c for a whole-number a (not 0, not 1 or -1), a whole or half-whole boundary k, a whole b and c */
  function ineqPick(r) {
    var a, b, k, c, guard = 0, ok = false;
    do {
      a = r.pick([-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]);
      k = r.int(-10, 10) + ((a % 2 === 0 && r.chance(0.4)) ? 0.5 : 0);
      b = r.nonzero(-20, 20);
      c = a * k + b;
      ok = k !== 0 && Math.abs(c) <= 60 && c === Math.floor(c) && c !== b;
    } while (!ok && guard++ < 120);
    if (!ok) { a = 3; b = 5; k = 4; c = 17; }
    return { a: a, b: b, k: k, c: c };
  }

  G.add({
    id: "pk-ineq-solve", section: "pk-linear#ineq1", par: 60, timed: true,
    make: function (r) {
      var p = ineqPick(r), rel = r.pick(IRELS), constFirst = r.chance(0.35), a = p.a, b = p.b, c = p.c, k = p.k;
      var sol = a > 0 ? rel : IREL[rel].flip, below = sol === "<" || sol === "<=";
      var kind = r.pick(["bound", "extreme", "extreme"]);
      var lhs = iLin(a, b, constFirst), ans, ask, tail;
      if (kind === "bound") {
        ans = k;
        ask = "Solve $" + lhs + " " + IREL[rel].tex + " " + clean(c) + "$. The solution is every $x$ on one side of a boundary. What is the boundary value, the number $k$ in the answer?";
        tail = "The boundary is $x = " + clean(k) + "$.";
      } else if (below) {
        ans = sol === "<=" ? iFloor(k) : iCeil(k) - 1;
        ask = "What is the greatest integer $x$ that satisfies $" + lhs + " " + IREL[rel].tex + " " + clean(c) + "$?";
        tail = "The solution is $x " + IREL[sol].tex + " " + clean(k) + "$, so the greatest integer is $" + clean(ans) + "$.";
      } else {
        ans = sol === ">=" ? iCeil(k) : iFloor(k) + 1;
        ask = "What is the least integer $x$ that satisfies $" + lhs + " " + IREL[rel].tex + " " + clean(c) + "$?";
        tail = "The solution is $x " + IREL[sol].tex + " " + clean(k) + "$, so the least integer is $" + clean(ans) + "$.";
      }
      var key = clean(ans);
      var step1 = (b > 0 ? "Subtract $" + clean(b) + "$ from" : "Add $" + clean(-b) + "$ to") + " both sides, and the sign stays: $" + iTerm(a, "x", true) + " " + IREL[rel].tex + " " + clean(c - b) + "$.";
      var step2 = a > 0 ? "Divide both sides by $" + clean(a) + "$, which is positive, so the sign stays: $x " + IREL[sol].tex + " " + clean(k) + "$."
        : "Divide both sides by $" + clean(a) + "$, which is negative, so the sign turns around: $x " + IREL[sol].tex + " " + clean(k) + "$.";
      return {
        q: ask, type: "number", answer: key, placeholder: iPlace(key, "e.g. 5", "e.g. 6"),
        hint: "Undo the addition or subtraction first, then undo the multiplication. Ask whether the number you divide by is positive or negative before you write the sign.",
        steps: [step1, step2, tail],
        verify: function () {
          /* a test number on each side of the boundary, put into the original inequality */
          var lo = k - 1, hi = k + 1, at = function (x) { return ineqHolds(rel, a * x + b, c); };
          if (at(k) !== (rel === "<=" || rel === ">=")) return false;
          if (at(lo) === at(hi)) return false;
          if (at(hi) !== !below) return false;
          if (kind === "bound") return Math.abs(ans - k) < 1e-9;
          if (below) return at(ans) && !at(ans + 1) && at(ans - 1);
          return at(ans) && !at(ans - 1) && at(ans + 1);
        }
      };
    }
  });

  /* stories with a start s, a step p for each item, and a limit T. dir "max" (the total may not pass T) or "min" (the total must reach T);
     lo/hi bound the limit; the answer count stays between 3 and 30 */
  var IWORDS = [
    { id: "hall", dir: "max", money: true, ss: [20, 25, 30, 40, 50], ps: [6, 8, 9, 12, 15, 18], tlo: 60, thi: 500,
      story: "A hall charges {s} to book and {p} for each guest. The organizers ", ask: "What is the largest number of guests they can invite?",
      phrase: { "<=": "can spend at most {T}.", "<": "want the total to come to less than {T}." } },
    { id: "books", dir: "max", money: true, ss: [5, 8, 10, 12, 15], ps: [3, 4, 5, 7, 9, 11], tlo: 40, thi: 300,
      story: "A school orders notebooks at {p} each, with a shipping fee of {s}. The school ", ask: "What is the largest number of notebooks it can order?",
      phrase: { "<=": "has a budget of {T}, and the order may use all of it.", "<": "needs the order to cost under {T}." } },
    { id: "lift", dir: "max", money: false, unit: "pounds", ss: [140, 160, 180, 200, 220], ps: [15, 20, 25, 30, 35, 45], tlo: 400, thi: 1500,
      story: "A worker who weighs {s} loads crates of {p} each onto a freight elevator. The elevator ", ask: "What is the greatest number of crates the worker can load and still ride along?",
      phrase: { "<=": "is rated for at most {T}.", "<": "must carry under {T}." } },
    { id: "save", dir: "min", money: true, ss: [20, 35, 50, 75, 90], ps: [8, 10, 12, 15, 20, 25], tlo: 100, thi: 500,
      story: "You have {s} and save {p} each week. You ", ask: "What is the fewest number of weeks you must save?",
      phrase: { ">=": "want to have at least {T}.", ">": "want to have more than {T}." } },
    { id: "points", dir: "min", money: false, unit: "points", ss: [40, 60, 80, 120, 150], ps: [8, 12, 15, 20, 25], tlo: 200, thi: 700,
      story: "A student has {s} in a course and earns {p} for each quiz. The student ", ask: "What is the fewest number of quizzes the student must take?",
      phrase: { ">=": "needs at least {T} to earn the badge.", ">": "needs more than {T} to earn the badge." } }
  ];
  function iVal(w, v) { return w.money ? iMoney(v) : "$" + clean(v) + "$ " + w.unit; }

  /* the limit that makes n0 the answer, with offset off in 0..p-1 (see the cases: each leaves n0 + 1 or n0 - 1 on the wrong side) */
  function iLimit(rel, s, p, n0, off) {
    if (rel === "<=") return s + p * n0 + off;
    if (rel === "<") return s + p * n0 + 1 + off;
    if (rel === ">=") return s + p * n0 - off;
    return s + p * (n0 - 1) + off;
  }

  G.add({
    id: "pk-ineq-words", section: "pk-linear#ineq1", par: 70, timed: true,
    make: function (r) {
      var w = r.pick(IWORDS), s, p, n0, T, guard = 0, ok = false, n, i;
      var rel = r.pick(w.dir === "max" ? ["<=", "<=", "<"] : [">=", ">=", ">"]);
      do {
        s = r.pick(w.ss); p = r.pick(w.ps); n0 = r.int(3, 25);
        T = iLimit(rel, s, p, n0, r.int(0, p - 1));
        ok = T >= w.tlo && T <= w.thi;
      } while (!ok && guard++ < 200);
      if (!ok) {
        s = w.ss[0]; p = w.ps[0];
        for (n = 3; n <= 30 && !ok; n++) { n0 = n; T = iLimit(rel, s, p, n0, 0); ok = T >= w.tlo && T <= w.thi; }
      }
      var kx = (T - s) / p, key, steps;
      if (w.dir === "max") key = String(rel === "<=" ? iFloor(kx) : iCeil(kx) - 1);
      else key = String(rel === ">=" ? iCeil(kx) : iFloor(kx) + 1);
      steps = [
        "With $n$ items the total is $" + clean(s) + " + " + clean(p) + "n$, and the story needs it $" + IREL[rel].tex + " " + clean(T) + "$.",
        "$" + clean(p) + "n " + IREL[rel].tex + " " + clean(T - s) + "$, so $n " + IREL[rel].tex + " " + iQuot(T - s, p) + "$.",
        "The count is a whole number, so the " + (w.dir === "max" ? "greatest" : "least") + " count that works is $" + key + "$."
      ];
      return {
        q: w.story.replace("{s}", iVal(w, s)).replace("{p}", iVal(w, p)) + w.phrase[rel].replace("{T}", iVal(w, T)) + " " + w.ask,
        type: "number", answer: key, placeholder: iPlace(key, "e.g. 12", "e.g. 13"),
        hint: "Write the total as a start plus the amount for each item, and compare it with the limit. Solve it as an equation first, then ask which whole numbers keep the comparison true.",
        steps: steps,
        verify: function () {
          /* try the counts one at a time, adding the step each time, and read off the last or the first that works */
          var m, best = -1, firstOk = -1, tot;
          for (m = 0; m <= 60; m++) {
            tot = s;
            for (i = 0; i < m; i++) tot += p;
            if (ineqHolds(rel, tot, T)) { if (firstOk < 0) firstOk = m; best = m; }
          }
          var found = w.dir === "max" ? best : firstOk;
          return String(found) === key && found === n0 && found >= 3 && found <= 30 && T >= w.tlo && T <= w.thi;
        }
      };
    }
  });

  /* the integers from -40 to 40 that satisfy every test, in increasing order */
  function iScan(tests) {
    var out = [], x, j, good;
    for (x = -40; x <= 40; x++) {
      good = true;
      for (j = 0; j < tests.length; j++) if (!tests[j](x)) { good = false; break; }
      if (good) out.push(x);
    }
    return out;
  }

  G.add({
    id: "pk-ineq-range", section: "pk-linear#ineq1", par: 70, timed: true,
    make: function (r) {
      var kind = r.pick(["chain", "chain", "solved"]), guard = 0, ok = false, q, keyList, tests, steps, lo, hi, r1, r2, i, n;
      if (kind === "chain") {
        do {
          lo = r.int(-8, 4); hi = lo + r.int(2, 8); r1 = r.pick(["<", "<="]); r2 = r.pick(["<", "<="]);
          n = (hi - lo + 1) - (r1 === "<" ? 1 : 0) - (r2 === "<" ? 1 : 0);
          ok = n >= 2 && n <= 7;
        } while (!ok && guard++ < 100);
        if (!ok) { lo = -2; hi = 3; r1 = "<"; r2 = "<="; }
        var first = r1 === "<" ? lo + 1 : lo, last = r2 === "<" ? hi - 1 : hi;
        keyList = [];
        for (i = first; i <= last; i++) keyList.push(i);
        q = "List all the integers $x$ that satisfy $" + clean(lo) + " " + IREL[r1].tex + " x " + IREL[r2].tex + " " + clean(hi) + "$, separated by commas.";
        tests = [function (x) { return ineqHolds(r1, lo, x) && ineqHolds(r2, x, hi); }];
        steps = [
          "The inequality asks for both at once: $x$ is " + (r1 === "<" ? "greater than" : "at least") + " $" + clean(lo) + "$ and " + (r2 === "<" ? "less than" : "at most") + " $" + clean(hi) + "$.",
          "The least integer allowed is $" + clean(first) + "$ and the greatest is $" + clean(last) + "$.",
          "The integers are $" + keyList.join(", ") + "$."
        ];
      } else {
        var a, b, k, c, rel, solRel, other, L, below, lim, simple;
        do {
          var pk = ineqPick(r);
          a = pk.a; b = pk.b; k = pk.k; c = pk.c; rel = r.pick(IRELS);
          solRel = a > 0 ? rel : IREL[rel].flip; below = solRel === "<" || solRel === "<=";
          other = below ? r.pick([">", ">="]) : r.pick(["<", "<="]);
          L = k + (below ? -1 : 1) * r.int(2, 6);
          L = Math.round(L);
          tests = [function (x) { return ineqHolds(rel, a * x + b, c); }, function (x) { return ineqHolds(other, x, L); }];
          keyList = iScan(tests);
          ok = keyList.length >= 2 && keyList.length <= 7 && Math.abs(L) <= 12 && Math.abs(a) <= 9;
        } while (!ok && guard++ < 150);
        if (!ok) {
          a = 2; b = 1; c = 9; rel = "<="; k = 4; L = 0; other = ">"; solRel = "<="; below = true;
          tests = [function (x) { return ineqHolds(rel, a * x + b, c); }, function (x) { return ineqHolds(other, x, L); }];
          keyList = iScan(tests);
        }
        q = "List all the integers $x$ that satisfy both $" + iLin(a, b, false) + " " + IREL[rel].tex + " " + clean(c) + "$ and $x " + IREL[other].tex + " " + clean(L) + "$, separated by commas.";
        lim = keyList;
        steps = [
          "Solve the first one: " + (b > 0 ? "subtract $" + clean(b) + "$" : "add $" + clean(-b) + "$") + " to get $" + iTerm(a, "x", true) + " " + IREL[rel].tex + " " + clean(c - b) + "$, then divide by $" + clean(a) + "$" + (a < 0 ? ", which turns the sign around" : "") + ": $x " + IREL[solRel].tex + " " + clean(k) + "$.",
          "Both together: $x " + IREL[solRel].tex + " " + clean(k) + "$ and $x " + IREL[other].tex + " " + clean(L) + "$.",
          "The integers are $" + keyList.join(", ") + "$."
        ];
      }
      var key = keyList.join(",");
      return {
        q: q, type: "set", answer: key, placeholder: key === "1,2,3" ? "e.g. 4,5,6" : "e.g. 1,2,3",
        hint: kind === "chain" ? "Decide for each end whether the number itself is allowed, then list the whole numbers between the ends in increasing order."
          : "Solve the first inequality on its own, taking care with the sign when you divide. Then keep the numbers that meet both conditions.",
        steps: steps,
        verify: function () {
          /* try every integer from -40 to 40 in the original statement; the list is in increasing order and has 2 to 7 elements */
          var scan = iScan(tests), j;
          for (j = 1; j < scan.length; j++) if (scan[j] <= scan[j - 1]) return false;
          return scan.join(",") === key && scan.length >= 2 && scan.length <= 7 && Math.abs(scan[0]) < 40 && Math.abs(scan[scan.length - 1]) < 40;
        }
      };
    }
  });

  G.add({
    id: "pk-ineq2-side", section: "pk-linear#ineq2", par: 55, timed: true,
    make: function (r) {
      var m, b, x0, v, rel, guard = 0, ok = false, ans, lowest, y;
      do {
        m = r.pick([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5]);
        b = r.nonzero(-9, 9); x0 = r.nonzero(-6, 6); v = m * x0 + b; rel = r.pick(IRELS);
        ok = Math.abs(v) <= 40 && v !== 0;
      } while (!ok && guard++ < 100);
      if (!ok) { m = 2; b = 3; x0 = 4; v = 11; rel = "<"; }
      lowest = rel === ">" || rel === ">=";
      if (rel === "<") ans = iCeil(v) - 1; else if (rel === "<=") ans = iFloor(v); else if (rel === ">") ans = iFloor(v) + 1; else ans = iCeil(v);
      var key = String(ans), line = iLin(m, b, false);
      return {
        q: "A region of the plane is described by $y " + IREL[rel].tex + " " + line + "$. For the points of the region with $x = " + clean(x0) + "$, what is the " + (lowest ? "smallest" : "largest") + " integer $y$?",
        type: "number", answer: key, placeholder: iPlace(key, "e.g. 3", "e.g. 4"),
        hint: "Fix the value of $x$ first: the right side becomes one number. Then ask which integers $y$ stand on the correct side of it, and whether that number itself is allowed.",
        steps: [
          "At $x = " + clean(x0) + "$ the right side is $" + (m < 0 ? "(" + clean(m) + ")" : clean(m)) + " \\cdot " + (x0 < 0 ? "(" + clean(x0) + ")" : clean(x0)) + (b < 0 ? " - " + clean(-b) : " + " + clean(b)) + " = " + clean(v) + "$.",
          "So the condition is $y " + IREL[rel].tex + " " + clean(v) + "$" + ((rel === "<" || rel === ">") ? ", and $" + clean(v) + "$ itself is " + (v === Math.floor(v) ? "not allowed" : "not a whole number anyway") + "." : "."),
          "The " + (lowest ? "smallest" : "largest") + " integer that works is $" + key + "$."
        ],
        verify: function () {
          /* test the integers near the line in the original inequality */
          var lo = Math.floor(v) - 4, hi = Math.ceil(v) + 4, good = [], t;
          for (t = lo; t <= hi; t++) if (ineqHolds(rel, t, m * x0 + b)) good.push(t);
          if (!good.length) return false;
          y = lowest ? good[0] : good[good.length - 1];
          return y === ans && good.length >= 4 && !ineqHolds(rel, lowest ? ans - 1 : ans + 1, v) && ineqHolds(rel, ans, v);
        }
      };
    }
  });

  /* two items sold at a price each (whole dollars); the limit stays between $20 and $500 */
  var IBUY = [
    { X: "sandwiches", Y: "juices", px: [6, 7, 8, 9, 10, 12], py: [2, 3, 4, 5] },
    { X: "adult tickets", Y: "child tickets", px: [9, 12, 15, 18, 20], py: [5, 6, 8, 10] },
    { X: "pens", Y: "notebooks", px: [2, 3, 4, 5], py: [3, 4, 6, 7, 9] },
    { X: "wraps", Y: "smoothies", px: [7, 8, 9, 11], py: [4, 5, 6] },
    { X: "paint cans", Y: "brushes", px: [14, 18, 22, 25], py: [3, 5, 7, 9] }
  ];

  G.add({
    id: "pk-ineq2-budget", section: "pk-linear#ineq2", par: 70, timed: true,
    make: function (r) {
      var it = r.pick(IBUY), px, py, T, x0, rem, ans, guard = 0, ok = false, mode = r.pick(["y", "y", "x"]), extra;
      do {
        px = r.pick(it.px); py = r.pick(it.py); x0 = r.int(2, 12); extra = r.int(0, py - 1);
        ans = r.int(2, 14);
        if (mode === "y") T = px * x0 + py * ans + extra;
        else { ans = r.int(3, 30); T = px * ans + r.int(0, px - 1); }
        ok = T >= 20 && T <= 500 && px !== py;
      } while (!ok && guard++ < 150);
      if (!ok) { it = IBUY[0]; px = 6; py = 2; x0 = 4; ans = 5; extra = 0; T = 34; mode = "y"; }
      var q = "At a shop, $x$ is the number of " + it.X + " bought, at " + iMoney(px) + " each, and $y$ is the number of " + it.Y + " bought, at " + iMoney(py) + " each. The total must be within a budget of " + iMoney(T) + ", so $" + clean(px) + "x + " + clean(py) + "y \\le " + clean(T) + "$, with $x \\ge 0$ and $y \\ge 0$. ";
      var steps, key;
      if (mode === "y") {
        rem = T - px * x0; key = String(ans);
        q += "If " + clean(x0) + " " + it.X + " are bought, what is the greatest number of " + it.Y + " that can also be bought?";
        steps = [
          "Put $x = " + clean(x0) + "$: $" + clean(px) + " \\cdot " + clean(x0) + " = " + clean(px * x0) + "$, so $" + clean(py) + "y \\le " + clean(T) + " - " + clean(px * x0) + " = " + clean(rem) + "$.",
          "$y \\le " + iQuot(rem, py) + "$, and $y$ counts " + it.Y + ", so it is a whole number.",
          "The greatest is $y = " + key + "$."
        ];
      } else {
        key = String(ans);
        q += "If no " + it.Y + " are bought, what is the greatest number of " + it.X + " that can be bought?";
        steps = [
          "Put $y = 0$: $" + clean(px) + "x \\le " + clean(T) + "$.",
          "$x \\le " + iQuot(T, px) + "$, and $x$ counts " + it.X + ", so it is a whole number.",
          "The greatest is $x = " + key + "$."
        ];
      }
      return {
        q: q, type: "number", answer: key, placeholder: iPlace(key, "e.g. 8", "e.g. 9"),
        hint: "Put the number you are given into the constraint, so only one unknown is left. Then find how many whole items fit under the budget.",
        steps: steps,
        verify: function () {
          /* buy one more at a time until the next one would break the budget */
          var n = 0, cost = mode === "y" ? px * x0 : 0, step = mode === "y" ? py : px, guardN = 0;
          if (cost > T) return false;
          while (cost + step <= T && guardN++ < 200) { cost += step; n++; }
          return String(n) === key && cost <= T && cost + step > T && n >= 2 && n <= 30 && T >= 20 && T <= 500;
        }
      };
    }
  });

  /* a x + b y rel c, with a and b whole and not both 0 */
  function iLin2(a, b) { return iTerm(a, "x", true) + (b === 0 ? "" : iTerm(b, "y", false)); }

  G.add({
    id: "pk-ineq2-count", section: "pk-linear#ineq2", par: 90, timed: true,
    make: function (r) {
      var X, Y, a1, b1, c1, rel1, a2, b2, c2, rel2, guard = 0, ok = false, cols, total;
      function countAll() {
        var cc = [], x, y, t;
        for (x = 0; x <= X; x++) {
          t = 0;
          for (y = 0; y <= Y; y++) if (ineqHolds(rel1, a1 * x + b1 * y, c1) && ineqHolds(rel2, a2 * x + b2 * y, c2)) t++;
          cc.push(t);
        }
        return cc;
      }
      do {
        X = r.int(3, 6); Y = r.int(3, 6);
        a1 = r.int(1, 3); b1 = r.int(1, 3); rel1 = r.pick(["<", "<="]); c1 = r.int(4, 14);
        a2 = r.pick([1, 1, 2]); b2 = r.pick([-1, -1, -2]); rel2 = r.pick([">", ">=", "<", "<="]); c2 = r.int(-3, 3);
        cols = countAll(); total = 0;
        cols.forEach(function (v) { total += v; });
        ok = total >= 6 && total <= 30 && total < (X + 1) * (Y + 1) - 2;
      } while (!ok && guard++ < 200);
      if (!ok) {
        X = 4; Y = 4; a1 = 1; b1 = 1; rel1 = "<="; c1 = 5; a2 = 1; b2 = -1; rel2 = ">="; c2 = 0;
        cols = countAll(); total = 0;
        cols.forEach(function (v) { total += v; });
      }
      var key = String(total), parts = [], x;
      for (x = 0; x <= X; x++) parts.push("$x = " + x + "$: " + cols[x]);
      return {
        q: "The whole-number points $(x, y)$ with $0 \\le x \\le " + X + "$ and $0 \\le y \\le " + Y + "$ are marked. How many of them satisfy both $" + iLin2(a1, b1) + " " + IREL[rel1].tex + " " + clean(c1) + "$ and $" + iLin2(a2, b2) + " " + IREL[rel2].tex + " " + clean(c2) + "$?",
        type: "number", answer: key, placeholder: iPlace(key, "e.g. 12", "e.g. 13"),
        hint: "Go through the values of $x$ one at a time. For each, put it into both inequalities and see which values of $y$ in the box are left.",
        steps: [
          "For each $x$, count the whole numbers $y$ from $0$ to $" + Y + "$ that meet both conditions: " + parts.join("; ") + ".",
          "Add them: $" + cols.join(" + ") + " = " + key + "$."
        ],
        verify: function () {
          /* list the points row by row (y first) and test each one in the original two inequalities */
          var y, x2, n = 0, pts = [];
          for (y = 0; y <= Y; y++) for (x2 = 0; x2 <= X; x2++) {
            if (ineqHolds(rel1, a1 * x2 + b1 * y, c1) && ineqHolds(rel2, a2 * x2 + b2 * y, c2)) { n++; pts.push([x2, y]); }
          }
          return String(n) === key && n === pts.length && n >= 6 && n <= 30;
        }
      };
    }
  });
})();
