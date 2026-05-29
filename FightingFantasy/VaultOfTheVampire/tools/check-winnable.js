// Winnability validator.
//
// Proves that at least one path runs from §1 to the victory ending (§400 — Katarina
// slain, Nastassia rescued, Castle Heydrich cleansed). Two things make this more than
// a plain BFS:
//
//   1. OPTIMISTIC reachability. "Do you have X?" branches are both real edges, so the
//      validator is free to take the favourable one. It therefore answers "does a
//      winning route EXIST for a suitably-equipped, lucky player?" — not "is every
//      route winnable". Stat/LUCK/item gates are assumed satisfiable.
//
//   2. COMPUTED gates. Several onward links are calculated by the player rather than
//      printed as "turn to N", so they are absent from the stored choice graph (see the
//      gate hubs in report:orphans). They are added explicitly below, otherwise the
//      Book-of-Swords questline and the Silver-Key library look unreachable.
//
// Also reports "stuck" sections: reachable from §1 but unable to reach victory while
// still having outgoing choices — i.e. you can wander in but never win (trap regions),
// as distinct from legitimate death/failure endings.
//
// Usage: node tools/check-winnable.js [--verbose]   (npm run check:winnable)

const path = require("path");

const VICTORY = 400;

// target = a paragraph the player computes, not a printed "turn to". Each is gated on
// an item the optimistic player is assumed to hold (Book of Swords / jar / Silver Key /
// solved cipher). See report:orphans "Gate hubs".
const gateEdges = {
  35: [94], //  half the magical-page number (188) — Book of Swords
  220: [94], // half the magical-page number (188)
  399: [376], // twice the magical-page number (188)
  48: [188], // paragraph = the magical-page number itself
  282: [169], // paragraph = the jar Karl-Heinz asked for
  123: [350], // decoded cipher → whisper Siegfried's name
  332: [378] //  paragraph = the number on the Silver Key (378) → the library
};

global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));
const data = global.window.GAMEBOOK_DATA;
const sections = data.sections || {};
const numbers = Object.keys(sections).map(Number).sort((a, b) => a - b);

function outEdges(n) {
  const stored = sections[String(n)]?.choices || [];
  const gates = gateEdges[n] || [];
  return [...new Set([...stored, ...gates])].filter((t) => sections[String(t)]);
}

// forward reachability from §1, with parents for path reconstruction
const parent = new Map([[1, null]]);
const queue = [1];
while (queue.length) {
  const cur = queue.shift();
  for (const next of outEdges(cur)) {
    if (!parent.has(next)) {
      parent.set(next, cur);
      queue.push(next);
    }
  }
}
const reachable = new Set(parent.keys());

// reverse reachability: which sections can still reach victory
const reverse = new Map(numbers.map((n) => [n, []]));
for (const n of numbers) for (const t of outEdges(n)) reverse.get(t).push(n);
const canWin = new Set([VICTORY]);
const rq = [VICTORY];
while (rq.length) {
  const cur = rq.shift();
  for (const prev of reverse.get(cur)) {
    if (!canWin.has(prev)) {
      canWin.add(prev);
      rq.push(prev);
    }
  }
}

const victoryReachable = reachable.has(VICTORY);
let shortestPath = null;
if (victoryReachable) {
  shortestPath = [];
  for (let n = VICTORY; n !== null; n = parent.get(n)) shortestPath.unshift(n);
}

// "stuck" = reachable from start, can't reach victory, but still has outgoing edges
// (so not a terminal ending) — you can enter but never win from here.
const stuck = numbers.filter(
  (n) => reachable.has(n) && !canWin.has(n) && outEdges(n).length > 0
);
// gate edges traversed on the winning path, surfaced so the claim is auditable
const pathGates = shortestPath
  ? shortestPath
      .filter((n) => gateEdges[n] && shortestPath.includes(gateEdges[n][0]))
      .map((n) => `§${n}→§${gateEdges[n][0]}`)
  : [];

const report = {
  title: data.title,
  victory: VICTORY,
  victoryReachable,
  pathLength: shortestPath ? shortestPath.length : null,
  pathGatesUsed: pathGates,
  reachableFromStart: reachable.size,
  canReachVictory: canWin.size,
  stuckSections: stuck.length,
  failures: victoryReachable ? [] : [`Victory §${VICTORY} is unreachable from §1.`]
};

if (process.argv.includes("--verbose")) {
  report.shortestPath = shortestPath;
  report.stuckSample = stuck.slice(0, 30);
}

console.log(JSON.stringify(report, null, 2));
process.exit(victoryReachable ? 0 : 1);
