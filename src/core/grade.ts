/* How a typed answer is graded against its key: the one copy, for assets/site.js (which
   reaches it through window.BMCore, src/ui/core.ts), the tools that grade (check-static's
   placeholder check, check-gen, smoke-scenes) and the tests.

   A facade over src/core/answer/ (decision 0002, the typed grader): grade(), matches() and
   alternatives() are check.ts's, true only where judge() says right, and judge(),
   specOf(), GRADER and readNumber() come from there too. The rest, basicClean(),
   toNumber(), sameNumber(), normExpr(), numberList() and the types, is the old grader's,
   legacy.ts, the byte copy of this file as it stood before the typed grader, which
   tools/gen-grade-golden.js grades the frozen baseline with; the named exports below
   shadow the grade(), matches() and alternatives() its `export *` brings in. judgeOff(),
   the ledger tool's switch, is not here, so it never reaches BMCore.

   src/core/grade.test.ts holds grade() to the baseline, tools/fixtures/grade-golden.json,
   case by case, with every change listed in tools/fixtures/grade-ledger.json. Pure: no
   `window`, no DOM. */

export * from "./answer/legacy.ts";
export { GRADER, judge, specOf, grade, matches, alternatives, readNumber } from "./answer/check.ts";
