/* data/gen/packs.js — Arena generators for the skill packs (Part V, beside the course).
   Pack A, "Ratios, Rates and Percent": sections 1–2 (ratios, proportions). Each problem uses
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
})();
