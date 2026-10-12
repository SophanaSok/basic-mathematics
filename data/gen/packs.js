/* data/gen/packs.js — Arena generators for the skill packs (Part V, beside the course).
   Pack A, "Ratios, Rates and Percent": sections 1–4 (ratios, proportions, percent, repeated change).
   Pack B, "Data and Statistics": section 1 so far (center and spread; the quartiles follow the
   median-of-halves rule of src/ui/chart.ts). Each problem uses
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
    { lo: 55, hi: 100, intro: "A student's quiz scores are" },
    { lo: 48, hi: 92, intro: "The daily high temperatures last week, in degrees, were" },
    { lo: 10, hi: 90, intro: "The minutes of homework a student did on different nights were" },
    { lo: 40, hi: 98, intro: "A basketball team scored these points in its games:" },
    { lo: 12, hi: 60, intro: "A shop counted these customers in different hours:" }
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
            if (len % 2) return f[(len - 1) / 2] === ans && f.filter(function (x) { return x < ans; }).length <= (len - 1) / 2 && f.lastIndexOf(ans) >= (len - 1) / 2;
            return (f[len / 2 - 1] + f[len / 2]) / 2 === ans;
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
          return trim(up) - trim(lo) === iqr && iqr >= 0 && lo.length === up.length;
        }
      };
    }
  });
})();
