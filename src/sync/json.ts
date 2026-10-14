/* The JSON helpers of the sync modules (src/sync/merge.ts, src/sync/events.ts): reading a
   value that may be damaged, the canonical JSON, and the rule for what has no rule of its
   own. Moved out of merge.ts unchanged so that events.ts and merge.ts need not import each
   other; merge.ts re-exports all of them. Pure: no `window`, no DOM, no storage. */

export function obj(x: any): any { return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
/* The keys of both, each once. A key is data, whatever it is called: one named like
   something every object inherits ("constructor", "toString") is listed like any other,
   and at() reads only what the object itself holds, so the inherited thing is never
   mistaken for a value. The one exception is "__proto__", which cannot be written back
   as an ordinary field and is left out of every record built here. */
export function keysOf(a: any, b: any) {
  var seen = Object.create(null), out: string[] = [];
  Object.keys(obj(a)).concat(Object.keys(obj(b))).forEach(function (k) {
    if (k !== "__proto__" && !seen[k]) { seen[k] = true; out.push(k); }
  });
  return out.sort();
}
export function at(o: any, k: any) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
export function plain(x: any) { return !!x && typeof x === "object" && !Array.isArray(x); }

/* JSON with object keys sorted at every level: jsonb hands keys back in its own order */
export function canon(x: any): string {
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  if (x && typeof x === "object") {
    return "{" + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ":" + canon(x[k]); }).join(",") + "}";
  }
  return JSON.stringify(x === undefined ? null : x);
}

/* What this version has no rule for is not its to drop: a later version of the site may
   have put it there. One rule covers every such value. Held by one side only, it is
   kept; held by both, the one whose canonical JSON (canon) is the later string is kept.
   That is a maximum, so order, grouping and repetition matter no more than they do for
   the fields with rules of their own. Each such field is merged by itself, not along
   with whichever record wins on the known fields. */
export function later(p: any, q: any) {
  if (p === undefined) return q;
  if (q === undefined) return p;
  return canon(p) >= canon(q) ? p : q;
}
/* adds to a freshly built record every field of x and y that is not in `known` */
export function carryOver(out: any, x: any, y: any, known: any) {
  keysOf(x, y).forEach(function (k) {
    if (known.indexOf(k) < 0) out[k] = later(at(x, k), at(y, k));
  });
  return out;
}
export function num(x: any) { x = Number(x); return isFinite(x) ? x : 0; }
export function str(x: any) { return typeof x === "string" ? x : ""; }
