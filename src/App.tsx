import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";

import PrivacyPolicy from "./PrivacyPolicy";

import { supabase } from "./supabase";

// Offline fallback QR encoder. The real 'qrcode' npm package is preferred at
// runtime by <ClubQR/> (it's proven to scan); this is used only if absent.
import { generateQR as generateQRFallback } from "./qrEncoder";

/* ============================================================================
   TOAST SYSTEM
   A tiny global notifier. Call toast("Saved ✓") or toast("Failed", "error")
   from anywhere. <ToastHost/> renders them. We also shim window.alert so the
   ~30 existing alert() calls become toasts automatically — no per-call edits.
   ============================================================================ */
const _toastListeners = new Set<(t: { id: number; message: string; kind: string }) => void>();
let _toastId = 0;
function toast(message: string, kind: string = "info") {
  const t = { id: ++_toastId, message: String(message), kind };
  _toastListeners.forEach((fn) => fn(t));
}
// Route legacy alert() calls through the toast system. Errors are auto-detected
// from common phrasing so they get the red treatment.
const rrWindow = window as any;

if (typeof window !== "undefined" && !rrWindow.__rrAlertShimmed) {
  rrWindow.__rrAlertShimmed = true;
  window.alert = (msg) => {
    const s = String(msg);
    const isError = /fail|error|could not|cannot|unable|invalid|wrong/i.test(s);
    toast(s, isError ? "error" : "info");
  };
}
/* ============================================================================
   RallyRank v4 — Complete Platform
   Sections (search this file by these markers):
   § CONSTANTS & TOKENS       — colors, tiers, scale
   § COUNTRIES                — full country + dial list
   § RATING ENGINE            — Elo math, seeding, matchmaking quality
   § SCORE VALIDATION         — badminton 21-pt / pickleball 11 or 15
   § MATCHMAKING ENGINE       — round generation, odds, rest enforcement
   § BADGES                   — badge definitions and award logic
   § DEMO DATA                — sample players, clubs, events
   § PRIMITIVES               — shared UI atoms (Button, Card, Pill…)
   § LOGO                     — SVG mark
   § APP ROOT                 — view routing, global state
   § LANDING                  — public home page
   § AUTH                     — sign-up / sign-in / Google / email-link
   § ONBOARDING               — 9-step wizard, two-pane layout
   § TOPBAR + FOOTER          — persistent nav
   § PROFILE                  — player card, badges, ratings, verification
   § LADDERS                  — live rankings table
   § CLUBS                    — club list, search, join, admin dashboard
   § PLAYER DISCOVERY         — find players near my rating, challenge
   § EVENTS LIST              — browse + join events
   § EVENT CREATION           — full wizard (courts, rounds, organizers…)
   § EVENT LOBBY              — check-in, QR code, share link
   § EVENT RUNNING            — round manager, score entry, rest enforcement
   § EVENT RESULTS            — final dashboard, mini stats, finalize
   § ACCOUNT                  — personal info, photo, billing, badges
   § ADMIN                    — role management
   § CONTACT                  — contact form
   ============================================================================ */

// § CONSTANTS & TOKENS -------------------------------------------------------
const C = {
  indigo: "#241B3A",
  indigo2: "#332751",
  butter: "#FFF8EC",
  butter2: "#FBEFD8",
  cream: "#FFFDF8",
  lime: "#A6E22E",
  limeDk: "#6FA00A",
  coral: "#FF6B5E",
  coralDk: "#E8503F",
  sky: "#5BC8FF",
  skyDk: "#1E90C7",
  gold: "#FFC24B",
  ink: "#1C1530",
  mute: "#8A7FA6",
  muteOnDark: "#B6A9D6",
  line: "#EEE3CE",
  green: "#16A34A",
  red: "#DC2626",
};

// Per-sport theme: badminton skews lime/green, pickleball skews coral.
// Used for accents AND the page background tint so toggling sport restyles
// the whole app.
function THEME(sport) {
  const isP = String(sport).toLowerCase() === "pickleball";
  return isP
    ? {
        sport: "pickleball",
        accent: C.coral,
        accentDk: C.coralDk,
        accentSoft: "#FFE9E6",
        // background tint (coral-leaning)
        bg: `
          radial-gradient(1200px 600px at 110% -10%, rgba(255,107,94,0.16), transparent 60%),
          radial-gradient(1000px 500px at -10% 110%, rgba(255,194,75,0.14), transparent 55%),
          linear-gradient(180deg, #FFF8EC 0%, #FFF1EC 100%)
        `,
      }
    : {
        sport: "badminton",
        accent: C.lime,
        accentDk: C.limeDk,
        accentSoft: "#F0FBD9",
        // background tint (lime-leaning)
        bg: `
          radial-gradient(1200px 600px at 110% -10%, rgba(166,226,46,0.18), transparent 60%),
          radial-gradient(1000px 500px at -10% 110%, rgba(91,200,255,0.12), transparent 55%),
          linear-gradient(180deg, #FFF8EC 0%, #F6FBEC 100%)
        `,
      };
}
// Maps a rating to its tier label, color, and background
const TIER = (r) =>
  r >= 7000
    ? { name: "Elite", color: "#B06BFF", bg: "#F1E8FF" }
    : r >= 6000
    ? { name: "Advanced", color: C.skyDk, bg: "#E3F5FF" }
    : r >= 4500
    ? { name: "Intermediate", color: C.limeDk, bg: "#F0FBD9" }
    : { name: "Beginner", color: C.coralDk, bg: "#FFE9E6" };

// § COUNTRIES ----------------------------------------------------------------
// Full list of countries with ISO2 and dial code used in all dropdowns
const COUNTRIES = [
  ["Afghanistan", "AF", "93"],
  ["Albania", "AL", "355"],
  ["Algeria", "DZ", "213"],
  ["Argentina", "AR", "54"],
  ["Australia", "AU", "61"],
  ["Austria", "AT", "43"],
  ["Bangladesh", "BD", "880"],
  ["Belgium", "BE", "32"],
  ["Bhutan", "BT", "975"],
  ["Brazil", "BR", "55"],
  ["Canada", "CA", "1"],
  ["China", "CN", "86"],
  ["Denmark", "DK", "45"],
  ["Egypt", "EG", "20"],
  ["France", "FR", "33"],
  ["Germany", "DE", "49"],
  ["Hong Kong", "HK", "852"],
  ["India", "IN", "91"],
  ["Indonesia", "ID", "62"],
  ["Ireland", "IE", "353"],
  ["Italy", "IT", "39"],
  ["Japan", "JP", "81"],
  ["Malaysia", "MY", "60"],
  ["Maldives", "MV", "960"],
  ["Mexico", "MX", "52"],
  ["Nepal", "NP", "977"],
  ["Netherlands", "NL", "31"],
  ["New Zealand", "NZ", "64"],
  ["Norway", "NO", "47"],
  ["Pakistan", "PK", "92"],
  ["Philippines", "PH", "63"],
  ["Portugal", "PT", "351"],
  ["Qatar", "QA", "974"],
  ["Russia", "RU", "7"],
  ["Saudi Arabia", "SA", "966"],
  ["Singapore", "SG", "65"],
  ["South Africa", "ZA", "27"],
  ["South Korea", "KR", "82"],
  ["Spain", "ES", "34"],
  ["Sri Lanka", "LK", "94"],
  ["Sweden", "SE", "46"],
  ["Switzerland", "CH", "41"],
  ["Taiwan", "TW", "886"],
  ["Thailand", "TH", "66"],
  ["UAE", "AE", "971"],
  ["United Kingdom", "GB", "44"],
  ["United States", "US", "1"],
  ["Vietnam", "VN", "84"],
];

function flagForCountry(countryCode) {
  if (!countryCode) return "🌍";
  let code = String(countryCode).trim();

  // If we were given a full country name (e.g. "United States") or a dial code,
  // resolve it to its ISO-2 via the COUNTRIES table.
  if (code.length !== 2) {
    const match = COUNTRIES.find(
      (c) =>
        c[0].toLowerCase() === code.toLowerCase() || // name
        c[2] === code.replace("+", "") // dial code
    );
    if (match) code = match[1];
  }

  // Only valid 2-letter alpha codes can become a flag emoji.
  if (!/^[A-Za-z]{2}$/.test(code)) return "🌍";

  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

// Returns the +dial string for a given ISO code
const dialFor = (iso) =>
  (COUNTRIES.find((c) => c[1] === iso) || ["", "", "91"])[2];

// § RATING ENGINE ------------------------------------------------------------
const RD_MIN = 40,
  RD_MAX = 350,
  K_BASE = 32;
// Clamps a rating within the 3000–8500 RallyRank scale
const clampR = (r) => Math.max(3000, Math.min(8500, Math.round(r)));
// Converts rating deviation to a 0–100% reliability score
const reliabilityFromRD = (rd) =>
  Math.round(((RD_MAX - rd) / (RD_MAX - RD_MIN)) * 100);
// Elo expected win probability for player A vs B
const eloExpected = (rA, rB) => 1 / (1 + Math.pow(10, (rB - rA) / 400));
// Margin-of-victory multiplier: big wins move rating less when expected
const movMult = (pd, rd) => {
  const m = Math.log(Math.abs(pd) + 1) * (2.2 / (Math.abs(rd) * 0.001 + 2.2));
  return Math.max(0.5, Math.min(1.75, m));
};
// Updates two players' ratings after a singles match, returns deltas + new RDs
const updateSingles = (A, B, aWon, sa = 21, sb = 15, verified = true) => {
  const eA = eloExpected(A.rating, B.rating);
  const K =
    K_BASE *
    (1 + (1 - A.reliability / 100) * 1.5) *
    movMult(sa - sb, A.rating - B.rating);
  const delta = K * ((aWon ? 1 : 0) - eA);
  const shrink = verified ? 0.96 : 0.99;
  return {
    rA: clampR(A.rating + delta),
    rB: clampR(B.rating - delta),
    dA: Math.round(delta),
    rdA: Math.max(RD_MIN, A.rd * shrink),
    rdB: Math.max(RD_MIN, B.rd * shrink),
  };
};
// Doubles: team rating = mean of partners; split delta by rating deviation share
const doublesTeamRating = (p1, p2, key) =>
  (p1[key].rating + p2[key].rating) / 2;
const updateDoubles = (t1p1, t1p2, t2p1, t2p2, key, t1Won, sa, sb) => {
  const rT1 = doublesTeamRating(t1p1, t1p2, key);
  const rT2 = doublesTeamRating(t2p1, t2p2, key);
  const eT1 = eloExpected(rT1, rT2);
  const K = K_BASE * movMult(sa - sb, rT1 - rT2);
  const teamDelta = K * ((t1Won ? 1 : 0) - eT1);
  // Each partner absorbs delta proportional to their own RD (more uncertain = larger swing)
  const split = (p1, p2, sign) => {
    const s1 = p1[key].rd / (p1[key].rd + p2[key].rd);
    return [
      Math.round(teamDelta * sign * s1 * 2),
      Math.round(teamDelta * sign * (1 - s1) * 2),
    ];
  };
  const [d1a, d1b] = split(t1p1, t1p2, 1);
  const [d2a, d2b] = split(t2p1, t2p2, -1);
  return { d1a, d1b, d2a, d2b };
};
// A player is Verified when they have ≥10 games against ≥4 distinct opponents
const isVerified = (games, opponents) => games >= 10 && opponents >= 4;
// Match quality score 0–100 used for matchmaking pairing
const matchQuality = (rA, rB, rdA, rdB) => {
  const closeness = 1 - Math.min(1, Math.abs(rA - rB) / 600);
  const uncertainty = (rdA + rdB) / (2 * RD_MAX);
  const fairness = 1 - Math.abs(eloExpected(rA, rB) - 0.5) * 2;
  return Math.round(
    100 * (0.6 * closeness + 0.2 * uncertainty + 0.2 * fairness)
  );
};
// Win probability percentage for display in match cards
const winPct = (rA, rB) => Math.round(eloExpected(rA, rB) * 100);

// Onboarding frequency options and their rating adjustments
const FREQ_OPTIONS = [
  ["Less than once a month", -150],
  ["1–3 times a month", -60],
  ["Once a week", 0],
  ["2–3 times a week", 80],
  ["4–5 times a week", 150],
  ["Daily", 220],
];
// Tournament history options and their starting-rating bonuses
const TOURNAMENT_OPTIONS = [
  ["Casual play only", 0],
  ["Apartment / society tournament", 0],
  ["Corporate tournament", 100],
  ["Local Open", 100],
  ["District ranked", 200],
  ["State ranked", 400],
  ["National ranked", 600],
  ["International", 800],
];
const BMTN_TIERS = [
  "Beginner",
  "Lower Intermediate",
  "Intermediate",
  "Upper Intermediate",
  "Advanced",
  "State Level",
  "National Level",
];
const PKL_TIERS = [
  "Beginner",
  "2.5",
  "3.0",
  "3.5",
  "4.0",
  "4.5+",
  "Tournament Player",
];
// Skill assessment questions used in onboarding
const SKILL_Q = [
  {
    icon: "🏃",
    title: "Court movement",
    q: "How well can you cover the court?",
    anchors: [
      [1, "Struggle to reach many shots."],
      [5, "Cover the court but recovery is inconsistent."],
      [10, "Recover efficiently and hold position throughout rallies."],
    ],
  },
  {
    icon: "🎯",
    title: "Shot quality",
    q: "How many shots can you execute consistently?",
    anchors: [
      [1, "Basic clears and lifts."],
      [5, "Drops, clears, smashes, drives."],
      [10, "Full repertoire with deception."],
    ],
  },
  {
    icon: "🎚️",
    title: "Consistency",
    q: "How often do you make unforced errors?",
    anchors: [
      [1, "Frequently."],
      [5, "Occasionally under pressure."],
      [10, "Rarely."],
    ],
  },
  {
    icon: "🧠",
    title: "Tactical awareness",
    q: "Can you identify and exploit opponent weaknesses?",
    anchors: [
      [1, "Mostly react."],
      [5, "Some strategic planning."],
      [10, "Actively adapt during matches."],
    ],
  },
  {
    icon: "💪",
    title: "Fitness / endurance",
    q: "How long before your performance drops?",
    anchors: [
      [1, "About 1 game."],
      [5, "3–4 games."],
      [10, "Full session without much drop."],
    ],
  },
];
// Computes a seeded starting rating from skill answers, frequency, tournament history, and calibration
const skillAvg = (s) => {
  const v = s.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 1;
};
function computeSeed(d) {
  const skill = skillAvg(d.skill);
  const base = Math.round(3000 + ((skill - 1) / 9) * 4000);
  const freqAdj = d.freqIdx != null ? FREQ_OPTIONS[d.freqIdx][1] : 0;
  const tBonus = d.tIdx != null ? TOURNAMENT_OPTIONS[d.tIdx][1] : 0;
  let calNudge = 0;
  if (d.calIdx != null) {
    const tiers = d.sport === "pickleball" ? PKL_TIERS : BMTN_TIERS;
    const expected = 3000 + (d.calIdx / (tiers.length - 1)) * 5000;
    const pre = clampR(base + freqAdj + tBonus);
    calNudge = Math.max(
      -150,
      Math.min(150, Math.round((expected - pre) * 0.25))
    );
  }
  return {
    skill,
    base,
    freqAdj,
    tBonus,
    calNudge,
    final: clampR(base + freqAdj + tBonus + calNudge),
  };
}

// § SCORE VALIDATION ---------------------------------------------------------
// Returns { valid, error } for a badminton game score
// Rules: win to 21, win by 2, cap 30; or best of 3 rubber game to 30 flat
const validateBadmintonScore = (a, b) => {
  if (isNaN(a) || isNaN(b))
    return { valid: false, error: "Enter both scores." };
  if (a < 0 || b < 0)
    return { valid: false, error: "Scores cannot be negative." };
  if (a === b) return { valid: false, error: "Badminton can't end in a tie." };
  const hi = Math.max(a, b),
    lo = Math.min(a, b);
  if (hi < 21) return { valid: false, error: "Winner must reach at least 21." };
  if (hi === 30 && lo < 29)
    return { valid: false, error: "At 29-all, first to 30 wins." };
  if (hi > 30)
    return { valid: false, error: "Maximum score in badminton is 30." };
  if (hi >= 21 && hi < 30 && hi - lo < 2)
    return { valid: false, error: "Must win by 2 (below 30)." };
  return { valid: true, error: null };
};
// Returns { valid, error } for a pickleball game score
// Default to 11-pt; organisers can choose 15 or 21 pt formats
const validatePickleballScore = (a, b, target = 11) => {
  if (isNaN(a) || isNaN(b))
    return { valid: false, error: "Enter both scores." };
  if (a < 0 || b < 0)
    return { valid: false, error: "Scores cannot be negative." };
  if (a === b) return { valid: false, error: "Pickleball can't end in a tie." };
  const hi = Math.max(a, b),
    lo = Math.min(a, b);
  if (hi < target)
    return { valid: false, error: `Winner must reach ${target}.` };
  if (hi - lo < 2) return { valid: false, error: "Must win by 2." };
  if (hi > target + 10)
    return {
      valid: false,
      error: "Score seems too high — check and resubmit.",
    };
  return { valid: true, error: null };
};

// § MATCHMAKING ENGINE -------------------------------------------------------
// Generates balanced mixer pairings for ONE round across N courts.
// Enforces, in priority order:
//   1. Fairness — players with the fewest games so far get on court first.
//   2. No repeat partners (doubles) — never pair the same two people twice.
//   3. No repeat opponents — avoid facing someone you've already faced.
//   4. Small rating gaps — keep each match (and each team) tight.
// Every court is filled with a DISTINCT match (no player appears twice in a
// round). getRating extracts the right rating for the sport + format.
// Players store ratings as player.badminton.singles, player.pickleball.doubles…

function getRating(player, sport, format) {
  const sportKey =
    String(sport).toLowerCase() === "pickleball" ? "pickleball" : "badminton";

  const formatKey =
    String(format).toLowerCase() === "singles" ? "singles" : "doubles";

  return player?.[sportKey]?.[formatKey] || 4500;
}

function getPlayerIdsFromGame(game) {
  return [...(game.team1 || []), ...(game.team2 || [])].map((p) => p.id);
}

function getPairKey(a, b) {
  return [a, b].sort().join("__");
}

function buildHistory(rounds = []) {
  const partners = new Set();
  const opponents = new Set();
  const playedCounts = {};

  for (const round of rounds || []) {
    for (const game of round.games || []) {
      const team1 = game.team1 || [];
      const team2 = game.team2 || [];

      [...team1, ...team2].forEach((p) => {
        playedCounts[p.id] = (playedCounts[p.id] || 0) + 1;
      });

      if (team1.length === 2)
        partners.add(getPairKey(team1[0].id, team1[1].id));
      if (team2.length === 2)
        partners.add(getPairKey(team2[0].id, team2[1].id));

      for (const a of team1) {
        for (const b of team2) {
          opponents.add(getPairKey(a.id, b.id));
        }
      }
    }
  }

  return { partners, opponents, playedCounts };
}

function combo(arr, size) {
  if (size === 0) return [[]];
  if (arr.length < size) return [];

  const [first, ...rest] = arr;
  return [
    ...combo(rest, size - 1).map((c) => [first, ...c]),
    ...combo(rest, size),
  ];
}

function ratingDiffScore(a, b) {
  return Math.abs(a - b);
}

/* ----------------------------------------------------------------------------
   Scoring weights. Bigger number = stronger avoidance. Fairness dominates so
   nobody gets stuck on the bench while others rack up games; then we strongly
   avoid repeat partners, then repeat opponents, then tighten rating gaps.
   ---------------------------------------------------------------------------- */
const MM_W = {
  gamesPlayed: 100000, // each prior game a chosen player has → huge penalty
  repeatPartner: 6000, // pairing two people who've already partnered
  repeatOpponent: 1500, // facing someone already faced
  ratingGap: 1, // 1 point of rating difference = 1 point of penalty
};

// Score a singles match (lower is better).
function scoreSinglesMatch(p1, p2, history, sport) {
  const r1 = getRating(p1, sport, "singles");
  const r2 = getRating(p2, sport, "singles");

  const games =
    (history.playedCounts[p1.id] || 0) + (history.playedCounts[p2.id] || 0);

  const repeatOpponent = history.opponents.has(getPairKey(p1.id, p2.id))
    ? MM_W.repeatOpponent
    : 0;

  return (
    games * MM_W.gamesPlayed +
    repeatOpponent +
    ratingDiffScore(r1, r2) * MM_W.ratingGap
  );
}

// Score a doubles match for one specific team split (lower is better).
// team1 = [a,b], team2 = [c,d]
function scoreDoublesSplit(team1, team2, history, sport) {
  const [a, b] = team1;
  const [c, d] = team2;

  const t1 = getRating(a, sport, "doubles") + getRating(b, sport, "doubles");
  const t2 = getRating(c, sport, "doubles") + getRating(d, sport, "doubles");

  const games = [a, b, c, d].reduce(
    (s, p) => s + (history.playedCounts[p.id] || 0),
    0
  );

  let repeatPartner = 0;
  if (history.partners.has(getPairKey(a.id, b.id)))
    repeatPartner += MM_W.repeatPartner;
  if (history.partners.has(getPairKey(c.id, d.id)))
    repeatPartner += MM_W.repeatPartner;

  let repeatOpponents = 0;
  for (const x of team1)
    for (const y of team2)
      if (history.opponents.has(getPairKey(x.id, y.id)))
        repeatOpponents += MM_W.repeatOpponent;

  return (
    games * MM_W.gamesPlayed +
    repeatPartner +
    repeatOpponents +
    ratingDiffScore(t1, t2) * MM_W.ratingGap
  );
}

// Given any 4 players, return the best of the 3 possible team splits.
function bestDoublesSplit(group, history, sport) {
  const [w, x, y, z] = group;
  const splits = [
    [
      [w, x],
      [y, z],
    ],
    [
      [w, y],
      [x, z],
    ],
    [
      [w, z],
      [x, y],
    ],
  ];

  let best = null;
  for (const [team1, team2] of splits) {
    const score = scoreDoublesSplit(team1, team2, history, sport);
    if (!best || score < best.score) best = { team1, team2, score };
  }
  return best;
}

/* ----------------------------------------------------------------------------
   Greedy multi-court filler.

   We fill courts one at a time. For each court we evaluate every still-possible
   match among the remaining (unused) players, pick the lowest-scoring one, lock
   those players out, and move to the next court. Because the fairness term in
   the score is recomputed against the *running* history (we fold each chosen
   match back into history as we go), later courts in the same round keep
   avoiding repeats created earlier in the round too.

   To keep this fast on big check-ins we cap how many candidate combinations we
   look at per court — we pre-sort remaining players by (games played, rating)
   and only consider a sensible window, which still finds near-optimal pairings.
   ---------------------------------------------------------------------------- */

const MM_CANDIDATE_WINDOW = 14; // how many top "neediest" players we comb through

function liveHistoryAdd(history, team1, team2) {
  // Returns a *new* lightweight history with this match folded in so the next
  // court avoids reusing partners/opponents formed earlier this round.
  const partners = new Set(history.partners);
  const opponents = new Set(history.opponents);
  const playedCounts = { ...history.playedCounts };

  [...team1, ...team2].forEach((p) => {
    playedCounts[p.id] = (playedCounts[p.id] || 0) + 1;
  });
  if (team1.length === 2) partners.add(getPairKey(team1[0].id, team1[1].id));
  if (team2.length === 2) partners.add(getPairKey(team2[0].id, team2[1].id));
  for (const a of team1)
    for (const b of team2) opponents.add(getPairKey(a.id, b.id));

  return { partners, opponents, playedCounts };
}

function fillCourtsSingles(available, courtCount, history, sport) {
  let remaining = [...available];
  let liveHistory = history;
  const matches = [];

  for (let c = 0; c < courtCount; c++) {
    if (remaining.length < 2) break;

    // Neediest first: fewest games, then closest ratings get a chance.
    const sorted = [...remaining].sort((a, b) => {
      const ga = liveHistory.playedCounts[a.id] || 0;
      const gb = liveHistory.playedCounts[b.id] || 0;
      if (ga !== gb) return ga - gb;
      return getRating(b, sport, "singles") - getRating(a, sport, "singles");
    });

    const window = sorted.slice(0, MM_CANDIDATE_WINDOW);
    const pairs = combo(window, 2);

    let best = null;
    for (const [p1, p2] of pairs) {
      const score = scoreSinglesMatch(p1, p2, liveHistory, sport);
      if (!best || score < best.score) best = { p1, p2, score };
    }
    if (!best) break;

    matches.push({ team1: [best.p1], team2: [best.p2] });
    liveHistory = liveHistoryAdd(liveHistory, [best.p1], [best.p2]);
    remaining = remaining.filter(
      (p) => p.id !== best.p1.id && p.id !== best.p2.id
    );
  }

  return matches;
}

function fillCourtsDoubles(available, courtCount, history, sport) {
  let remaining = [...available];
  let liveHistory = history;
  const matches = [];

  for (let c = 0; c < courtCount; c++) {
    if (remaining.length < 4) break;

    const sorted = [...remaining].sort((a, b) => {
      const ga = liveHistory.playedCounts[a.id] || 0;
      const gb = liveHistory.playedCounts[b.id] || 0;
      if (ga !== gb) return ga - gb;
      return getRating(b, sport, "doubles") - getRating(a, sport, "doubles");
    });

    const window = sorted.slice(0, MM_CANDIDATE_WINDOW);
    const groups = combo(window, 4);

    let best = null;
    for (const group of groups) {
      const split = bestDoublesSplit(group, liveHistory, sport);
      if (!best || split.score < best.score) best = split;
    }
    if (!best) break;

    matches.push({ team1: best.team1, team2: best.team2 });
    liveHistory = liveHistoryAdd(liveHistory, best.team1, best.team2);
    const usedIds = new Set([...best.team1, ...best.team2].map((p) => p.id));
    remaining = remaining.filter((p) => !usedIds.has(p.id));
  }

  return matches;
}

function generateRound({
  players,
  courts,
  restIds = new Set(),
  format = "doubles",
  sport = "Badminton",
  previousRounds = [],
}) {
  const fmt =
    String(format).toLowerCase() === "singles" ? "singles" : "doubles";
  const courtCount = Math.max(1, courts || 1);
  const perMatch = fmt === "doubles" ? 4 : 2;
  const minimumPlayersRequired = perMatch; // need at least one full match

  const available = players.filter((p) => !restIds.has(p.id));
  const history = buildHistory(previousRounds);

  if (available.length < minimumPlayersRequired) {
    return {
      games: [],
      restingThisRound: players.map((p) => p.id),
      error: `Need at least ${minimumPlayersRequired} available players (have ${available.length}).`,
    };
  }

  const matches =
    fmt === "doubles"
      ? fillCourtsDoubles(available, courtCount, history, sport)
      : fillCourtsSingles(available, courtCount, history, sport);

  const used = new Set();
  const games = matches.map((m, c) => {
    [...m.team1, ...m.team2].forEach((p) => used.add(p.id));

    const rT1 = m.team1.reduce((s, p) => s + getRating(p, sport, fmt), 0);
    const rT2 = m.team2.reduce((s, p) => s + getRating(p, sport, fmt), 0);

    return {
      id: `g${Date.now()}-${c}-${Math.random().toString(36).slice(2, 6)}`,
      team1: m.team1,
      team2: m.team2,
      court: c + 1,
      odds: [winPct(rT1, rT2), winPct(rT2, rT1)],
      score: null,
      validated: false,
      skipped: false,
    };
  });

  const restingThisRound = players
    .filter((p) => !used.has(p.id))
    .map((p) => p.id);

  return { games, restingThisRound };
}

// § BADGES -------------------------------------------------------------------
// Badge definitions: each badge has an id, emoji, label, description, and earn condition
const BADGE_DEFS = [
  {
    id: "first_game",
    emoji: "🎮",
    label: "First game",
    desc: "Played your first rated match.",
  },
  {
    id: "verified",
    emoji: "🎯",
    label: "Verified player",
    desc: "Reached Verified status (10 games, 4+ opponents).",
  },
  {
    id: "ten_wins",
    emoji: "🏅",
    label: "10 wins",
    desc: "Won 10 rated matches.",
  },
  {
    id: "streak_5",
    emoji: "🔥",
    label: "5-match streak",
    desc: "Won 5 matches in a row.",
  },
  {
    id: "streak_20",
    emoji: "🔥🔥",
    label: "20-match streak",
    desc: "Won 20 matches in a row.",
  },
  {
    id: "hundred_games",
    emoji: "💯",
    label: "100 games",
    desc: "Played 100 rated games.",
  },
  {
    id: "tournament_win",
    emoji: "🏆",
    label: "Tournament winner",
    desc: "Won a RallyRank event.",
  },
  {
    id: "club_organizer",
    emoji: "👥",
    label: "Club organizer",
    desc: "Admin of a RallyRank club.",
  },
  {
    id: "both_sports",
    emoji: "🏸🥒",
    label: "Double threat",
    desc: "Rated in both badminton and pickleball.",
  },
  {
    id: "doubles_ace",
    emoji: "🤝",
    label: "Doubles ace",
    desc: "Won 10 doubles matches.",
  },
];
// Computes which badges a player has earned based on their stats
const computeBadges = (player) => {
  const bd = player.badminton || {},
    pk = player.pickleball || {};
  const totalGames = (bd.games || 0) + (pk.games || 0);
  const totalWins = (bd.wins || 0) + (pk.wins || 0);
  const streak = player.currentStreak || 0;
  const earned = [];
  if (totalGames >= 1) earned.push("first_game");
  if (
    isVerified(bd.games || 0, bd.opponents || 0) ||
    isVerified(pk.games || 0, pk.opponents || 0)
  )
    earned.push("verified");
  if (totalWins >= 10) earned.push("ten_wins");
  if (streak >= 5) earned.push("streak_5");
  if (streak >= 20) earned.push("streak_20");
  if (totalGames >= 100) earned.push("hundred_games");
  if (player.tournamentWins >= 1) earned.push("tournament_win");
  if (
    player.role === "CLUB_ADMIN" ||
    player.role === "ORGANIZER" ||
    player.role === "OWNER"
  )
    earned.push("club_organizer");
  if (
    player.sports?.includes("badminton") &&
    player.sports?.includes("pickleball")
  )
    earned.push("both_sports");
  if ((bd.doublesWins || 0) + (pk.doublesWins || 0) >= 10)
    earned.push("doubles_ace");
  return earned;
};

const PRESET_CLUBS = ["Bellevue Badminton Club"];

// § PRIMITIVES ---------------------------------------------------------------
// Reusable pill badge component
// ── Toast host: renders queued toasts, auto-dismisses ───────────────────────
function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const onToast = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 4000);
    };
    _toastListeners.add(onToast);
    return () => _toastListeners.delete(onToast);
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "min(92vw, 420px)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
        const isErr = t.kind === "error";
        const isOk = t.kind === "success";
        return (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              pointerEvents: "auto",
              cursor: "pointer",
              background: isErr ? "#FFF3F1" : isOk ? "#F0FBD9" : C.indigo,
              color: isErr ? C.coralDk : isOk ? C.limeDk : "#FFF8EC",
              border: `1px solid ${
                isErr ? C.coral : isOk ? C.lime : "transparent"
              }`,
              borderRadius: 14,
              padding: "12px 16px",
              font: "600 13.5px var(--body)",
              boxShadow: "0 12px 32px rgba(36,27,58,.22)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              animation: "rrToastIn .22s ease",
            }}
          >
            <span style={{ fontSize: 15 }}>
              {isErr ? "⚠️" : isOk ? "✅" : "🔔"}
            </span>
            <span style={{ flex: 1 }}>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Skeleton: shimmer placeholder shown while data loads ────────────────────
function Skeleton({ h = 16, w = "100%", r = 8, style }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: r,
        background:
          "linear-gradient(90deg, rgba(36,27,58,.06) 25%, rgba(36,27,58,.12) 37%, rgba(36,27,58,.06) 63%)",
        backgroundSize: "400% 100%",
        animation: "rrShimmer 1.3s ease infinite",
        ...style,
      }}
    />
  );
}

const Pill = React.memo(({ children, color = C.indigo, bg, dark }) => (
  <span
    style={{
      font: "700 11px/1 var(--body)",
      letterSpacing: ".04em",
      color: dark ? "#fff" : color,
      background: dark ? color : bg || color + "1A",
      padding: "6px 11px",
      borderRadius: 99,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
));
// Primary button with multiple style variants
const Btn = React.memo(
  ({
    children,
    onClick,
    kind = "primary",
    disabled,
    full,
    big,
    type = "button",
  }) => {
    const S = {
      primary: {
        background: C.coral,
        color: "#fff",
        boxShadow: "0 4px 14px rgba(255,107,94,.35)",
      },
      lime: {
        background: C.lime,
        color: C.indigo,
        boxShadow: "0 4px 14px rgba(166,226,46,.4)",
      },
      dark: { background: C.indigo, color: "#fff" },
      sky: { background: C.skyDk, color: "#fff" },
      ghost: {
        background: "transparent",
        color: C.ink,
        border: `2px solid ${C.line}`,
      },
      red: { background: C.red, color: "#fff" },
      plain: { background: "transparent", color: C.mute },
    };
    return (
      <button
        type={type}
        disabled={disabled}
        onClick={onClick}
        onMouseDown={(e) =>
          !disabled && (e.currentTarget.style.transform = "scale(.97)")
        }
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        style={{
          font: `800 ${big ? 17 : 15}px/1 var(--body)`,
          padding: big ? "16px 28px" : "12px 20px",
          borderRadius: 99,
          cursor: disabled ? "not-allowed" : "pointer",
          border: "2px solid transparent",
          transition: "transform .08s ease",
          width: full ? "100%" : "auto",
          opacity: disabled ? 0.4 : 1,
          ...S[kind],
        }}
      >
        {children}
      </button>
    );
  }
);
// Standard card container
const Card = React.memo(
  ({ children, pad = 26, style, color = "rgba(255,255,255,.82)" }) => (
    <div
      style={{
        background: color,
        borderRadius: 28,
        padding: pad,
        border: "1px solid rgba(255,255,255,.72)",
        boxShadow:
          "0 18px 45px rgba(36,27,58,.08), inset 0 1px 0 rgba(255,255,255,.75)",
        backdropFilter: "blur(12px)",
        ...style,
      }}
    >
      {children}
    </div>
  )
);
// Uppercase section label
const Label = React.memo(({ children, color = C.coralDk }) => (
  <span
    style={{
      font: "800 12px/1 var(--body)",
      letterSpacing: ".1em",
      textTransform: "uppercase",
      color,
    }}
  >
    {children}
  </span>
));
// Page-level heading
const H1 = ({ children, onDark }) => (
  <h1
    style={{
      font: "700 clamp(28px,4.5vw,44px)/1.02 var(--display)",
      letterSpacing: "-0.025em",
      color: onDark ? "#fff" : C.ink,
      margin: "0 0 12px",
    }}
  >
    {children}
  </h1>
);
// Muted sub-heading paragraph
const Sub = ({ children, onDark }) => (
  <p
    style={{
      font: "400 16px/1.55 var(--body)",
      color: onDark ? C.muteOnDark : C.mute,
      margin: 0,
      maxWidth: 580,
    }}
  >
    {children}
  </p>
);
// Standard form field wrapper with label and optional hint
const Field = ({ label, children, hint }) => (
  <label style={{ display: "block", marginBottom: 14 }}>
    <span
      style={{
        font: "700 13px var(--body)",
        color: C.ink,
        display: "block",
        marginBottom: 7,
      }}
    >
      {label}
    </span>
    {children}
    {hint && (
      <span
        style={{
          font: "400 12px var(--body)",
          color: C.mute,
          display: "block",
          marginTop: 5,
        }}
      >
        {hint}
      </span>
    )}
  </label>
);
// Standard text/select input style
const inp = {
  width: "100%",
  padding: "13px 15px",
  borderRadius: 13,
  border: `2px solid ${C.line}`,
  font: "500 15px var(--body)",
  color: C.ink,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const SoftPanel = ({ children, style }) => (
  <div
    style={{
      background: "rgba(255,255,255,.72)",
      border: "1px solid rgba(255,255,255,.78)",
      borderRadius: 22,
      padding: 16,
      boxShadow: "0 12px 30px rgba(36,27,58,.07)",
      ...style,
    }}
  >
    {children}
  </div>
);

const MiniStat = ({ label, value, accent = C.indigo }) => (
  <div
    style={{
      background: "#fff",
      border: `1px solid ${C.line}`,
      borderRadius: 16,
      padding: "12px 14px",
    }}
  >
    <div style={{ font: "800 20px var(--display)", color: accent }}>
      {value}
    </div>
    <div style={{ font: "700 11px var(--body)", color: C.mute }}>{label}</div>
  </div>
);

const AvatarBubble = ({ name, photo, size = 44 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 999,
      background: photo ? `center/cover url(${photo})` : C.indigo,
      color: "#fff",
      display: "grid",
      placeItems: "center",
      font: "800 15px var(--body)",
      boxShadow: "0 8px 18px rgba(36,27,58,.18)",
      flex: "0 0 auto",
    }}
  >
    {!photo && (name || "?")[0]}
  </div>
);

// Full country dropdown
const CountrySelect = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} style={inp}>
    {COUNTRIES.map(([n, iso]) => (
      <option key={iso} value={iso}>
        {n}
      </option>
    ))}
  </select>
);
// Dial-code dropdown keyed by ISO to prevent US/CA clash
const DialSelect = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} style={inp}>
    {COUNTRIES.map(([n, iso, dial]) => (
      <option key={iso} value={iso}>
        {iso} +{dial}
      </option>
    ))}
  </select>
);
// Utility: format a date+time string for display
const fmtDT = (date, time) => {
  if (!date) return "TBD";
  try {
    return new Date(`${date}T${time || "00:00"}`).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return date;
  }
};
// Formats ms duration as "Xh Ym"
const fmtDur = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
// Reliability arc SVG component
const ReliabilityArc = React.memo(function ReliabilityArc({
  pct,
  size = 120,
  accent = C.lime,
}) {
  const r = size / 2 - 11,
    cx = size / 2,
    cy = size / 2,
    circ = Math.PI * r,
    dash = (pct / 100) * circ;
  return (
    <div style={{ width: size, textAlign: "center", margin: "0 auto" }}>
      <svg
        width={size}
        height={size / 2 + 16}
        viewBox={`0 0 ${size} ${size / 2 + 16}`}
      >
        <path
          d={`M11 ${cy} A${r} ${r} 0 0 1 ${size - 11} ${cy}`}
          fill="none"
          stroke={C.line}
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={`M11 ${cy} A${r} ${r} 0 0 1 ${size - 11} ${cy}`}
          fill="none"
          stroke={accent}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray .6s ease" }}
        />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          style={{ font: "700 22px var(--display)", fill: C.ink }}
        >
          {pct}%
        </text>
      </svg>
      <div
        style={{
          font: "800 10px var(--body)",
          letterSpacing: ".1em",
          color: C.mute,
        }}
      >
        RELIABILITY
      </div>
    </div>
  );
});
// Sport toggle pill (only renders if player has more than one sport)
const SportToggle = React.memo(function SportToggle({
  sport,
  setSport,
  sports,
}) {
  const all = [
    ["badminton", "🏸 Badminton", C.limeDk],
    ["pickleball", "🥒 Pickleball", C.coralDk],
  ];
  const shown = all.filter(([k]) => !sports || sports.includes(k));
  if (shown.length < 2) return null;
  return (
    <div
      style={{
        display: "inline-flex",
        background: "#fff",
        borderRadius: 99,
        padding: 4,
        gap: 4,
        border: `1px solid ${C.line}`,
      }}
    >
      {shown.map(([k, l, col]) => (
        <button
          key={k}
          onClick={() => setSport(k)}
          style={{
            font: "700 14px var(--body)",
            padding: "9px 16px",
            borderRadius: 99,
            cursor: "pointer",
            border: "none",
            background: sport === k ? col : "transparent",
            color: sport === k ? "#fff" : C.mute,
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
});
// Tier bar for landing page scale display
function TierBar() {
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 48,
          borderRadius: 14,
          overflow: "hidden",
          gap: 4,
        }}
      >
        {[
          ["Beginner", 1500, C.coral],
          ["Intermediate", 1500, C.lime],
          ["Advanced", 1000, C.sky],
          ["Elite", 1500, "#B06BFF"],
        ].map(([n, flex, col]) => (
          <div
            key={n}
            style={{
              flex,
              background: col,
              display: "grid",
              placeItems: "center",
              borderRadius: 10,
            }}
          >
            <span
              style={{
                font: "700 13px var(--display)",
                color: n === "Intermediate" ? C.indigo : "#fff",
              }}
            >
              {n}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          font: "700 12px var(--body)",
          color: C.mute,
        }}
      >
        <span>3000</span>
        <span>4500</span>
        <span>6000</span>
        <span>7000</span>
        <span>8500</span>
      </div>
    </div>
  );
}

// § LOGO ---------------------------------------------------------------------
// SVG logo combining shuttle arc (badminton) and holed ball (pickleball)
function Logo({ size = 44, onDark = false }) {
  const word = onDark ? "#FFF8EC" : C.ink;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        aria-hidden
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="rrbadge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={C.indigo} />
            <stop offset="1" stopColor="#3A2D5C" />
          </linearGradient>
        </defs>

        {/* dark rounded badge */}
        <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#rrbadge)" />

        <g transform="translate(24,24)">
          {/* badminton racket (lime), angled left */}
          <g
            transform="rotate(-32)"
            stroke={C.lime}
            strokeWidth="2.6"
            fill="none"
          >
            <ellipse cx="0" cy="-9" rx="6.4" ry="8.4" />
            <line x1="0" y1="-0.6" x2="0" y2="15" strokeLinecap="round" />
          </g>
          {/* pickleball paddle (coral), angled right */}
          <g transform="rotate(32)">
            <rect
              x="-6.4"
              y="-18"
              width="12.8"
              height="16.8"
              rx="5.6"
              fill={C.coral}
            />
            <rect x="-2" y="-3" width="4" height="18" rx="2" fill={C.coral} />
          </g>
        </g>
      </svg>
      <span
        style={{
          fontFamily: "var(--display)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontSize: size * 0.56,
          color: word,
          lineHeight: 1,
        }}
      >
        Rally<span style={{ color: onDark ? C.coral : C.coralDk }}>Rank</span>
      </span>
    </span>
  );
}

function ratingRowsForPlayer(playerId, player) {
  const rows = [];
  const sports = (player.sports || []).map((s) => String(s).toLowerCase());

  if (sports.includes("badminton")) {
    rows.push(
      {
        player_id: playerId,
        sport: "badminton",
        format: "singles",
        rating: player.badminton?.singles || 4500,
        rd: player.badminton?.rd || 280,
        games: player.badminton?.games || 0,
        wins: player.badminton?.wins || 0,
      },
      {
        player_id: playerId,
        sport: "badminton",
        format: "doubles",
        rating: player.badminton?.doubles || 4500,
        rd: player.badminton?.rd || 280,
        games: player.badminton?.games || 0,
        wins: player.badminton?.wins || 0,
      }
    );
  }

  if (sports.includes("pickleball")) {
    rows.push(
      {
        player_id: playerId,
        sport: "pickleball",
        format: "singles",
        rating: player.pickleball?.singles || 4500,
        rd: player.pickleball?.rd || 280,
        games: player.pickleball?.games || 0,
        wins: player.pickleball?.wins || 0,
      },
      {
        player_id: playerId,
        sport: "pickleball",
        format: "doubles",
        rating: player.pickleball?.doubles || 4500,
        rd: player.pickleball?.rd || 280,
        games: player.pickleball?.games || 0,
        wins: player.pickleball?.wins || 0,
      }
    );
  }

  return rows;
}

function attachRatingsToPlayer(player, ratings = [], stats = []) {
  const out = {
    ...player,
    badminton: {
      singles: 4500,
      doubles: 4500,
      rd: 350,
      games: 0,
      opponents: 0,
      wins: 0,
      doublesWins: 0,
    },
    pickleball: {
      singles: 4500,
      doubles: 4500,
      rd: 350,
      games: 0,
      opponents: 0,
      wins: 0,
      doublesWins: 0,
    },
  };

  for (const r of ratings) {
    const sport = String(r.sport).toLowerCase();
    const format = String(r.format).toLowerCase();

    if (!out[sport]) continue;

    if (format === "singles") {
      out[sport].singles = r.rating;
    }

    if (format === "doubles") {
      out[sport].doubles = r.rating;
    }

    out[sport].rd = Number(r.rd || 350);
    out[sport].games = r.games || 0;
    out[sport].opponents = r.opponents || 0;
    out[sport].wins = r.wins || 0;
    out[sport].doublesWins = r.doubles_wins || 0;
  }
  for (const s of stats) {
    const sport = String(s.sport).toLowerCase();

    if (!out[sport]) continue;
    if (s.games == null && s.wins == null && s.opponents == null) continue;

    out[sport].games = Number(s.games ?? out[sport].games);
    out[sport].wins = Number(s.wins ?? out[sport].wins);
    out[sport].opponents = Number(s.opponents ?? out[sport].opponents);
  }

  return out;
}

// § APP ROOT -----------------------------------------------------------------
// Global view routing and shared state
const ONB_STEPS = [
  "sport",
  "identity",
  "contact",
  "frequency",
  "skill",
  "calibration",
  "result",
];

async function ensureRatingsForPlayer(player) {
  if (!player?.id) return;

  const sports = player.sports?.length ? player.sports : ["badminton"];

  const rows = [];

  if (sports.includes("badminton")) {
    rows.push(
      {
        player_id: player.id,
        sport: "badminton",
        format: "singles",
        rating: player.badminton?.singles || 4500,
      },
      {
        player_id: player.id,
        sport: "badminton",
        format: "doubles",
        rating: player.badminton?.doubles || 4500,
      }
    );
  }

  if (sports.includes("pickleball")) {
    rows.push(
      {
        player_id: player.id,
        sport: "pickleball",
        format: "singles",
        rating: player.pickleball?.singles || 4500,
        rd: player.pickleball?.rd || 280,
      },
      {
        player_id: player.id,
        sport: "pickleball",
        format: "doubles",
        rating: player.pickleball?.doubles || 4500,
        rd: player.pickleball?.rd || 280,
      }
    );
  }

  const { error } = await supabase.from("ratings").upsert(rows, {
    onConflict: "player_id,sport,format",
  });

  if (error) alert("Ratings save failed: " + error.message);
}

// Picks the sport a player has actually been active in, so the dashboard opens
// on something meaningful instead of a sport with zero games. Falls back to the
// player's first chosen sport, then badminton.
function defaultSportFor(player) {
  if (!player) return "badminton";
  const bg = player.badminton?.games || 0;
  const pg = player.pickleball?.games || 0;
  if (bg > 0 || pg > 0) return pg > bg ? "pickleball" : "badminton";
  return player.sports?.[0] || "badminton";
}

async function registerForEvent(eventId, playerId) {
  const { error } = await supabase.from("event_registrations").upsert(
    {
      event_id: eventId,
      player_id: playerId,
    },
    {
      onConflict: "event_id,player_id",
    }
  );

  if (error) {
    alert("Registration failed: " + error.message);
    return false;
  }

  return true;
}

export default function App() {
  // existing state declarations...
  // Top-level navigation state
  const isPrivacyPage = window.location.pathname.toLowerCase() === "/privacy";

  if (isPrivacyPage) {
    return <PrivacyPolicy />;
  }

  const [view, setView] = useState("landing");
  const [authMode, setAuthMode] = useState("signup");
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("profile");
  const [sport, setSport] = useState("badminton");
  const [players, setPlayers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeEventId, setActiveEventId] = useState(null); //
  const [activePlayerId, setActivePlayerId] = useState(null); // currently open event
  // When a challenge is accepted in Discover, this carries the opponent into the
  // Events tab's "Log a match" panel and auto-opens it.
  const [logMatchOpponent, setLogMatchOpponent] = useState(null);
  // Bumped to force the Events "Log a match" panel open (from a notification).
  const [openLogPanelSignal, setOpenLogPanelSignal] = useState(0);
  // Set when someone authenticates (e.g. Google) but has no profile row yet.
  const [pendingAuthUser, setPendingAuthUser] = useState(null);
  // Captured from the URL (?joinClub= / ?claimClub= / ?join=) before auth, then
  // acted on once `me` exists. Survives the sign-in detour via sessionStorage.
  const [pendingDeepLink, setPendingDeepLink] = useState(null);

  // Navigate to dashboard; if signed out go to landing
  const goHome = useCallback(() => {
    if (me) {
      setView("app");
      setTab("profile");
    } else setView("landing");
  }, [me]);

  const openPlayerProfile = useCallback((playerId) => {
    setActivePlayerId(playerId);
    setTab("playerProfile");

    // force newly opened player profile to start clean
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Complete onboarding: create the player object with only chosen sports
  const completeProfile = useCallback((player) => {
    console.log("COMPLETE PROFILE PLAYER:", player);

    setSport(player.sports?.[0] || "badminton");
    setMe(player);
    setView("app");
    setTab("profile");

    supabase.auth.getSession().then(({ data, error }) => {
      console.log("AUTH SESSION:", data?.session);
      console.log("AUTH USER:", data?.session?.user);
      console.log("AUTH USER ERROR:", error);

      const user = data?.session?.user;
      if (!user) {
        console.error("No logged-in user found");
        return;
      }

      supabase
        .from("players")
        .upsert(
          {
            auth_id: user.id,
            name: player.name || user.email?.split("@")[0],
            handle:
              player.handle ||
              `${user.email?.split("@")[0]}-${user.id.slice(0, 6)}`,

            city: player.city || null,
            country: player.country || "US",
            gender: player.gender || null,
            dominant_hand: player.dominant_hand || player.hand || null,
            sports: player.sports || [],
          },
          {
            onConflict: "auth_id",
          }
        )
        .select()
        .single()
        .then(async ({ data: savedPlayer, error }) => {
          console.log("UPSERT PLAYER RESULT");
          console.log("savedPlayer:", savedPlayer);
          console.log("error:", error);

          if (error) {
            alert("PLAYER UPSERT FAILED: " + error.message);
            return;
          }

          if (!savedPlayer) {
            alert("PLAYER UPSERT RETURNED NULL");
            return;
          }
          console.log("UPSERT PLAYER:", savedPlayer);
          console.log("UPSERT ERROR:", error);

          if (error || !savedPlayer) return;

          await ensureRatingsForPlayer({
            ...savedPlayer,
            badminton: player.badminton,
            pickleball: player.pickleball,
          });
        });
    });
  }, []);

  useEffect(() => {
    // Route a logged-in auth user to their dashboard, or to onboarding if they
    // have no profile yet. Shared by the initial check and the auth listener.
    async function handleUser(user) {
      if (!user) return;
      const { data: player } = await supabase
        .from("players")
        .select("*, ratings(*)")
        .eq("auth_id", user.id)
        .maybeSingle();

      if (!player) {
        // New Google user — carry their Google name/photo into onboarding.
        const meta = user.user_metadata || {};
        setPendingAuthUser({
          auth_id: user.id,
          email: user.email || null,
          name: meta.full_name || meta.name || user.email?.split("@")[0] || "",
          photo: meta.avatar_url || meta.picture || null,
        });
        setView("onboarding");
        return;
      }

      const { data: statsData } = await supabase
        .from("player_rating_stats")
        .select("*");

      const appPlayer = attachRatingsToPlayer(
        player,
        player.ratings || [],
        (statsData || []).filter((s) => s.player_id === player.id)
      );

      setSport(defaultSportFor(appPlayer));
      setMe(appPlayer);

      const { data: allPlayers, error: allPlayersError } = await supabase
        .from("players")
        .select("*, ratings(*)");
      if (!allPlayersError) {
        setPlayers(
          (allPlayers || []).map((p) =>
            attachRatingsToPlayer(
              p,
              p.ratings || [],
              (statsData || []).filter((s) => s.player_id === p.id)
            )
          )
        );
      }

      setView("app");
      setTab("profile");
    }

    // 1) check any session already present on load
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) handleUser(data.session.user);
    });

    // 2) react when the session arrives/changes — this is what catches the
    //    Google redirect resolving AFTER the page has already mounted.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        handleUser(session.user);
      } else if (event === "SIGNED_OUT") {
        setMe(null);
        setView("landing");
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadPlayers() {
      // Apply inactivity decay first so the ratings we fetch are current (feature 4).
      await applyInactivityDecay();

      const { data, error } = await supabase
        .from("players")
        .select("*, ratings(*)");

      const { data: statsData } = await supabase
        .from("player_rating_stats")
        .select("*");

      if (error) {
        console.error("Players load failed:", error);
        return;
      }

      setPlayers(
        (data || []).map((p) =>
          attachRatingsToPlayer(
            p,
            p.ratings || [],
            (statsData || []).filter((s) => s.player_id === p.id)
          )
        )
      );
    }

    loadPlayers();
  }, []);

  const reloadPlayers = useCallback(async () => {
    const { data, error } = await supabase
      .from("players")
      .select("*, ratings(*)");

    const { data: statsData } = await supabase
      .from("player_rating_stats")
      .select("*");

    if (error) {
      console.error("Players reload failed:", error);
      return;
    }

    const updatedPlayers = (data || []).map((p) =>
      attachRatingsToPlayer(
        p,
        p.ratings || [],
        (statsData || []).filter((s) => s.player_id === p.id)
      )
    );

    setPlayers(updatedPlayers);

    if (me?.id) {
      const updatedMe = updatedPlayers.find((p) => p.id === me.id);
      if (updatedMe) setMe(updatedMe);
    }
  }, [me?.id]);

  const reloadClubs = useCallback(async () => {
    const { data, error } = await supabase.from("clubs").select(`
        *,
        club_members(player_id),
        player_favorite_clubs(player_id)
      `);
    if (error) {
      // clubs table may not exist yet on older databases — fail quietly
      console.warn("Clubs reload skipped:", error.message);
      return;
    }
    setClubs(
      (data || []).map((c) => ({
        ...c,
        adminId: c.admin_id,

        joined: (c.club_members || []).map((m) => m.player_id),

        favoritedBy: (c.player_favorite_clubs || []).map((f) => f.player_id),

        members: (c.club_members || []).length,

        favorites: (c.player_favorite_clubs || []).length,
      }))
    );
  }, []);

  useEffect(() => {
    reloadClubs();
  }, [reloadClubs]);

  // ---- DEEP LINK CAPTURE -----------------------------------------------------
  // On first load, read ?joinClub= / ?claimClub= / ?join= from the URL and stash
  // it. We persist to sessionStorage so it survives an OAuth round-trip (Google
  // sign-in navigates away and back). Then we strip the query string so a
  // refresh doesn't re-trigger it.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const joinClubId = params.get("joinClub");
      const claimClubId = params.get("claimClub");
      const claimCode = params.get("code");
      const joinEventId = params.get("join");

      let link = null;
      if (joinClubId) link = { type: "joinClub", clubId: joinClubId };
      else if (claimClubId)
        link = {
          type: "claimClub",
          clubId: claimClubId,
          code: claimCode || "",
        };
      else if (joinEventId) link = { type: "joinEvent", eventId: joinEventId };

      if (link) {
        sessionStorage.setItem("rr_pending_deeplink", JSON.stringify(link));
        setPendingDeepLink(link);
        // Clean the URL so refreshes/back don't replay it.
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
      } else {
        const stored = sessionStorage.getItem("rr_pending_deeplink");
        if (stored) setPendingDeepLink(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Deep link parse skipped:", e);
    }
  }, []);

  const reloadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*, event_registrations(player_id)");

    if (error) {
      console.error("Events reload failed:", error);
      return;
    }

    setEvents(
      (data || []).map((e) => ({
        ...e,
        maxPlayers: e.max_players,
        registeredIds: (e.event_registrations || []).map((r) => r.player_id),
        rounds_data: e.rounds_data || [],
        finalized: e.finalized || false,
        checkInOpen: e.check_in_open || false,
      }))
    );
  }, []);

  // ---- DEEP LINK RESOLUTION --------------------------------------------------
  // Once we have a signed-in player, act on any pending link, then clear it.
  // Placed here (after reloadClubs + reloadEvents are defined) so its dependency
  // array doesn't reference those callbacks before they're initialized.
  useEffect(() => {
    if (!pendingDeepLink || !me?.id || me.id === "me") return;
    let cancelled = false;

    (async () => {
      const link = pendingDeepLink;
      try {
        if (link.type === "joinClub") {
          const already = clubs
            .find((c) => c.id === link.clubId)
            ?.joined?.includes(me.id);
          if (!already) {
            const { error } = await supabase
              .from("club_members")
              .insert({ club_id: link.clubId, player_id: me.id });
            if (error && !/duplicate|unique/i.test(error.message)) throw error;
          }
          await reloadClubs?.();
          if (!cancelled) {
            setView("app");
            setTab("clubs");
            toast("You've joined the club! 🎉", "success");
          }
        } else if (link.type === "claimClub") {
          const res = await claimClubOwnership(link.clubId, link.code, me.id);
          await reloadClubs?.();
          if (!cancelled) {
            setView("app");
            setTab("clubs");
            toast(
              res.ok ? "Club is now yours to manage! 🏆" : res.message,
              res.ok ? "success" : "error"
            );
          }
        } else if (link.type === "joinEvent") {
          // Fixes the previously-dead ?join= event link.
          const already = events
            .find((e) => e.id === link.eventId)
            ?.registeredIds?.includes(me.id);
          if (!already) {
            const { error } = await supabase
              .from("event_registrations")
              .insert({ event_id: link.eventId, player_id: me.id });
            if (error && !/duplicate|unique/i.test(error.message)) throw error;
          }
          await reloadEvents?.();
          if (!cancelled) {
            setActiveEventId(link.eventId);
            setView("app");
            setTab("events");
            toast("You're registered for the event! 🎉", "success");
          }
        }
      } catch (e) {
        if (!cancelled)
          toast("Couldn't complete the invite: " + e.message, "error");
      } finally {
        sessionStorage.removeItem("rr_pending_deeplink");
        if (!cancelled) setPendingDeepLink(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingDeepLink, me?.id, clubs, events, reloadClubs, reloadEvents]);

  useEffect(() => {
    const channel = supabase
      .channel("rallyrank-live-events")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_registrations",
        },
        async () => {
          await reloadPlayers();
          await reloadEvents();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
        },
        async () => {
          await reloadEvents();
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reloadPlayers, reloadEvents]);

  useEffect(() => {
    async function loadEvents() {
      const { data, error } = await supabase
        .from("events")
        .select("*, event_registrations(player_id)");

      if (error) {
        console.error("Events load failed:", error);
        return;
      }

      setEvents(
        (data || []).map((e) => ({
          ...e,
          maxPlayers: e.max_players,
          registeredIds: (e.event_registrations || []).map((r) => r.player_id),
          rounds_data: e.rounds_data || [],
          finalized: e.finalized || false,
          checkInOpen: e.check_in_open || false,
        }))
      );
    }

    loadEvents();
  }, []);

  if (view === "landing")
    return (
      <Landing
        onSignup={() => {
          setAuthMode("signup");
          setView("auth");
        }}
        onSignin={() => {
          setAuthMode("signin");
          setView("auth");
        }}
        onContact={() => setView("contact")}
        onLogo={goHome}
      />
    );
  if (view === "contact")
    return <ContactUs me={me} onBack={goHome} onLogo={goHome} />;
  if (view === "auth")
    return (
      <Auth
        mode={authMode}
        setMode={setAuthMode}
        onLogo={goHome}
        onAuthed={(isNew, player) => {
          if (isNew) {
            setView("onboarding");
            return;
          }

          setSport(defaultSportFor(player));
          setMe(player);
          setView("app");
          setTab("profile");
        }}
        onBack={() => setView("landing")}
      />
    );
  if (view === "onboarding")
    return (
      <Onboarding
        onDone={completeProfile}
        onExit={() => setView("landing")}
        onLogo={goHome}
        prefill={pendingAuthUser}
      />
    );

  // Main in-app view
  const openEvent = events.find((e) => e.id === activeEventId);
  return (
    <Shell sport={sport}>
      <TopBar
        me={me}
        tab={tab}
        sport={sport}
        setTab={setTab}
        onLogo={goHome}
        onProfile={() => setTab("account")}
        onOpenNotification={(n) => {
          // Route a clicked notification to the right place.
          const link = n?.link || "";
          const eventId = n?.payload?.event_id;
          const t = n?.type || "";
          // Casual match + dispute flows live in the inbox under Events.
          const matchTypes = [
            "match_pending",
            "match_accepted",
            "match_declined",
            "casual_logged",
            "disputed",
            "dispute_resolved",
          ];
          if (link.startsWith("events")) {
            const id = link.includes(":") ? link.split(":")[1] : eventId;
            if (id) setActiveEventId(id);
            setTab("events");
          } else if (matchTypes.includes(t)) {
            setOpenLogPanelSignal((x) => x + 1);
            setTab("events");
          } else if (t === "challenge") {
            setTab("discover");
          } else if (link === "discover") {
            setTab("discover");
          } else if (link === "profile") {
            setTab("profile");
          } else if (link === "ladders") {
            setTab("ladders");
          } else if (n?.payload?.player_id) {
            openPlayerProfile(n.payload.player_id);
          } else if (t === "role_changed" || t === "rating_adjusted") {
            setTab("profile");
          } else {
            setTab("discover");
          }
        }}
        onExit={async () => {
          await supabase.auth.signOut();
          setMe(null);
          setView("landing");
        }}
      />
      <div
        className="rr-page-card"
        style={{
          maxWidth: 1120,
          margin: "28px auto 60px",
          padding: "28px 24px 46px",
        }}
      >
        {tab === "playerProfile" && activePlayerId && (
          <PlayerProfilePage
            playerId={activePlayerId}
            me={me}
            players={players}
            onOpenPlayer={openPlayerProfile}
            onBack={() => {
              setActivePlayerId(null);
              setTab("profile");
            }}
          />
        )}
        {tab === "profile" && (
          <Profile
            me={me}
            setMe={setMe}
            sport={sport}
            setSport={setSport}
            onEdit={() => setTab("account")}
            events={events}
            players={players}
            clubs={clubs}
            reloadPlayers={reloadPlayers}
            onOpenEvent={(id) => {
              setActiveEventId(id);
              setTab("events");
            }}
            onOpenPlayer={openPlayerProfile}
          />
        )}
        {tab === "ladders" && (
          <Ladders
            players={players}
            sport={sport}
            setSport={setSport}
            onOpenPlayer={openPlayerProfile}
          />
        )}
        {tab === "clubs" && (
          <Clubs
            me={me}
            clubs={clubs}
            setClubs={setClubs}
            players={players}
            events={events}
            setMe={setMe}
            reloadPlayers={reloadPlayers}
            reloadClubs={reloadClubs}
            goToEvents={() => setTab("events")}
          />
        )}
        {tab === "discover" && (
          <PlayerDiscovery
            me={me}
            setMe={setMe}
            players={players}
            sport={sport}
            setSport={setSport}
            reloadPlayers={reloadPlayers}
            onLogMatch={(opponentId) => {
              setLogMatchOpponent(opponentId || null);
              setTab("events");
            }}
          />
        )}
        {tab === "events" && !activeEventId && (
          <EventsList
            me={me}
            events={events}
            setEvents={setEvents}
            players={players}
            reloadPlayers={reloadPlayers}
            reloadEvents={reloadEvents}
            onOpen={(id) => setActiveEventId(id)}
            logMatchOpponent={logMatchOpponent}
            clearLogMatchOpponent={() => setLogMatchOpponent(null)}
            openLogPanelSignal={openLogPanelSignal}
          />
        )}
        {tab === "events" && activeEventId && openEvent && (
          <EventDetail
            event={openEvent}
            me={me}
            players={players}
            setEvents={setEvents}
            events={events}
            onBack={() => setActiveEventId(null)}
            reloadPlayers={reloadPlayers}
            onOpenPlayer={openPlayerProfile}
          />
        )}
        {tab === "admin" && (
          <Admin
            me={me}
            players={players}
            setPlayers={setPlayers}
            events={events}
            setEvents={setEvents}
            reloadPlayers={reloadPlayers}
            reloadEvents={reloadEvents}
          />
        )}
        {tab === "account" && (
          <Account
            me={me}
            setMe={setMe}
            onLogout={async () => {
              await supabase.auth.signOut();
              setMe(null);
              setView("landing");
            }}
          />
        )}
        {tab === "contact" && <ContactPanel me={me} />}
      </div>
      <SiteFooter onContact={() => setTab("contact")} onLogo={goHome} />
    </Shell>
  );
}

// § SHELL + CSS -----------------------------------------------------------
function Shell({ children, sport }) {
  useEffect(() => {
    if (!document.querySelector('meta[name="viewport"]')) {
      const m = document.createElement("meta");
      m.name = "viewport";
      m.content = "width=device-width, initial-scale=1, viewport-fit=cover";
      document.head.appendChild(m);
    }
  }, []);
  const themedBg = sport
    ? THEME(sport).bg
    : `
          radial-gradient(900px 500px at 100% -5%, ${C.lime}22, transparent 60%),
          radial-gradient(800px 480px at -10% 8%, ${C.sky}24, transparent 55%),
          radial-gradient(760px 520px at 50% 108%, ${C.coral}18, transparent 60%),
          linear-gradient(180deg, ${C.butter} 0%, ${C.cream} 48%, ${C.butter2} 100%)
        `;
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        color: C.ink,
        background: themedBg,
        transition: "background 0.5s ease",
        backgroundAttachment: "fixed",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');

        :root {
          --display: 'Fredoka', 'Inter', sans-serif;
          --body: 'Inter', -apple-system, sans-serif;
        }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          background: ${C.butter};
        }

        textarea {
          font-family: var(--body);
        }

        button, input, select, textarea {
          font-family: var(--body);
        }

        button:focus-visible,
        input:focus-visible,
        select:focus-visible,
        textarea:focus-visible {
          outline: 3px solid ${C.sky};
          outline-offset: 2px;
        }

        input:focus,
        select:focus,
        textarea:focus {
          border-color: ${C.coral} !important;
        }

        .rr-page-card {
          background: rgba(255,255,255,.68);
          border: 1px solid rgba(255,255,255,.75);
          border-radius: 32px;
          box-shadow:
            0 20px 60px rgba(36,27,58,.08),
            inset 0 1px 0 rgba(255,255,255,.65);
          backdrop-filter: blur(14px);
          flex: 1 0 auto;
          width: 100%;
        }

        /* ---- Mobile responsiveness ---- */
        @media (max-width: 720px) {
          .rr-page-card {
            margin: 14px auto 28px !important;
            padding: 16px 14px 30px !important;
            border-radius: 22px;
          }
          /* any 2+ column grid collapses to a single column on phones */
          .rr-page-card [style*="grid-template-columns"],
          .rr-page-card [style*="gridTemplateColumns"] {
            grid-template-columns: 1fr !important;
          }
          h1 { font-size: 26px !important; }

          /* top bar: let it grow to two rows and scroll the tabs */
          .rr-topbar-inner {
            height: auto !important;
            flex-wrap: wrap !important;
            padding: 10px 14px !important;
            gap: 8px;
          }
          .rr-topnav {
            order: 3;
            width: 100%;
            flex-wrap: nowrap !important;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            justify-content: flex-start !important;
          }
          .rr-topnav button { flex: 0 0 auto; }
        }

        @media (max-width: 480px) {
          .rr-page-card {
            padding: 14px 11px 26px !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }

        @keyframes rrToastIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rrShimmer {
          0%   { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {children}
      <ToastHost />
    </div>
  );
}

// § TOPBAR + FOOTER ----------------------------------------------------------
const TABS = [
  ["profile", "Profile"],
  ["ladders", "Ladders"],
  ["clubs", "Clubs"],
  ["discover", "Discover"],
  ["events", "Events"],
  ["admin", "Admin"],
];
const ROLE_META = {
  OWNER: ["Owner", "#B06BFF"],
  ORGANIZER: ["Organizer", C.sky],
  CLUB_ADMIN: ["Club admin", C.limeDk],
  PLAYER: ["Player", C.mute],
};
// Top navigation bar with logo, tabs, and avatar menu
// ── Notification bell + dropdown (top bar) ──────────────────────────────────
// Refreshes data when the user returns to the tab/window (focus or visibility),
// so inboxes feel near-instant without an aggressive poll. Also keeps a gentle
// interval as a fallback for long idle sessions.
function useFocusRefresh(fn, intervalMs = 30000) {
  useEffect(() => {
    fn();
    const onFocus = () => fn();
    const onVisible = () => {
      if (document.visibilityState === "visible") fn();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(fn, intervalMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [fn, intervalMs]);
}

function NotificationBell({ me, setTab, onOpenNotification }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    if (!me?.id || me.id === "me") return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient", me.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems(data || []);
  }, [me?.id]);

  // refresh on focus/visibility + a 45s fallback poll
  useFocusRefresh(load, 45000);

  const unread = items.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!unread) return;
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const openItem = async (n) => {
    // mark just this one read
    if (!n.read) {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", n.id);
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
    }
    setOpen(false);
    // route to the related place
    if (onOpenNotification) onOpenNotification(n);
    else if (n.link === "discover") setTab?.("discover");
    else if (n.link?.startsWith("events")) setTab?.("events");
  };

  const timeAgo = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markAllRead();
        }}
        style={{
          position: "relative",
          width: 40,
          height: 40,
          borderRadius: 99,
          border: "2px solid #ffffff33",
          background: "#ffffff14",
          cursor: "pointer",
          fontSize: 18,
          color: "#fff",
        }}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 99,
              background: C.coral,
              color: "#fff",
              font: "800 11px var(--body)",
              display: "grid",
              placeItems: "center",
              border: `2px solid ${C.indigo}`,
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute",
            right: 0,
            top: 48,
            width: 320,
            maxHeight: 420,
            overflowY: "auto",
            background: "#fff",
            borderRadius: 18,
            border: `1px solid ${C.line}`,
            boxShadow: "0 14px 40px rgba(0,0,0,.18)",
            padding: 8,
            zIndex: 100,
          }}
        >
          <div
            style={{
              padding: "8px 10px",
              font: "800 12px var(--body)",
              letterSpacing: ".06em",
              color: C.mute,
              textTransform: "uppercase",
            }}
          >
            Notifications
          </div>
          {items.length === 0 && (
            <div
              style={{
                padding: "16px 10px",
                font: "400 13px var(--body)",
                color: C.mute,
              }}
            >
              You're all caught up.
            </div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                background: n.read
                  ? "rgba(255,255,255,.65)"
                  : `linear-gradient(135deg, ${C.butter2}, #fff)`,
                border: `1px solid ${n.read ? C.line : C.lime}`,
                boxShadow: n.read ? "none" : "0 8px 18px rgba(36,27,58,.08)",
                cursor: "pointer",
                marginBottom: 4,
                display: "block",
              }}
            >
              <div style={{ font: "700 13px var(--body)", color: C.ink }}>
                {n.title}
              </div>
              {n.body && (
                <div
                  style={{
                    font: "400 12px/1.4 var(--body)",
                    color: C.mute,
                    marginTop: 2,
                  }}
                >
                  {n.body}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 3,
                }}
              >
                <span style={{ font: "600 11px var(--body)", color: C.mute }}>
                  {timeAgo(n.created_at)}
                </span>
                <span
                  style={{
                    font: "700 11px var(--body)",
                    color: C.skyDk,
                  }}
                >
                  Open →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopBar({
  me,
  tab,
  setTab,
  onLogo,
  onProfile,
  onExit,
  sport,
  onOpenNotification,
}) {
  const [open, setOpen] = useState(false);
  const visible =
    me?.role === "PLAYER" || me?.role === "CLUB_ADMIN"
      ? TABS.slice(0, 5)
      : TABS;
  return (
    <div
      style={{
        background: `linear-gradient(180deg, ${C.indigo} 0%, #2A2046 100%)`,
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: `3px solid ${sport ? THEME(sport).accent : C.lime}`,
      }}
    >
      <div
        className="rr-topbar-inner"
        style={{
          maxWidth: 1060,
          margin: "0 auto",
          padding: "0 22px",
          height: 84,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={onLogo}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Logo size={46} onDark />
        </button>
        <nav
          className="rr-topnav"
          style={{
            display: "flex",
            gap: 2,
            background: "#ffffff14",
            padding: 4,
            borderRadius: 99,
            flexWrap: "wrap",
          }}
        >
          {visible.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                font: "700 13px var(--body)",
                padding: "8px 14px",
                borderRadius: 99,
                cursor: "pointer",
                border: "none",
                background: tab === k ? C.lime : "transparent",
                color: tab === k ? C.indigo : C.muteOnDark,
              }}
            >
              {l}
            </button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <NotificationBell
            me={me}
            setTab={setTab}
            onOpenNotification={onOpenNotification}
          />
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setOpen(!open)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 99,
                border: "2px solid #ffffff33",
                background: me?.photo
                  ? `center/cover url(${me.photo})`
                  : C.coral,
                cursor: "pointer",
                font: "800 15px var(--body)",
                color: "#fff",
                overflow: "hidden",
              }}
            >
              {!me?.photo && (me?.name || "?")[0]}
            </button>
            {open && (
              <div
                onMouseLeave={() => setOpen(false)}
                style={{
                  position: "absolute",
                  right: 0,
                  top: 48,
                  width: 210,
                  background: "#fff",
                  borderRadius: 18,
                  border: `1px solid ${C.line}`,
                  boxShadow: "0 14px 40px rgba(0,0,0,.18)",
                  padding: 8,
                  zIndex: 100,
                }}
              >
                <div style={{ padding: "8px 10px 10px" }}>
                  <div style={{ font: "700 14px var(--body)", color: C.ink }}>
                    {me?.name}
                  </div>
                  <div style={{ font: "500 12px var(--body)", color: C.mute }}>
                    {me?.gbrId}
                  </div>
                </div>
                {[
                  ["👤 Account & profile", onProfile],
                  ["💳 Billing", onProfile],
                  ["🔒 Security", onProfile],
                ].map(([l, fn]) => (
                  <button
                    key={l}
                    onClick={() => {
                      fn();
                      setOpen(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      font: "600 14px var(--body)",
                      color: C.ink,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = C.butter2)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    {l}
                  </button>
                ))}
                <div
                  style={{ height: 1, background: C.line, margin: "6px 4px" }}
                />
                <button
                  onClick={onExit}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    font: "700 14px var(--body)",
                    color: C.coralDk,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#FFF3F1")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  ↩ Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
// Site-wide footer with contact link and copyright
function SiteFooter({ onContact, onLogo }) {
  return (
    <footer style={{ background: C.indigo, color: "#fff", marginTop: 40 }}>
      <div
        style={{
          maxWidth: 1060,
          margin: "0 auto",
          padding: "32px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <button
          onClick={onLogo}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Logo size={28} onDark />
        </button>
        <div style={{ display: "flex", gap: 22 }}>
          <button
            onClick={onContact}
            style={{
              color: C.lime,
              background: "none",
              border: "none",
              cursor: "pointer",
              font: "700 14px var(--body)",
            }}
          >
            Contact us
          </button>
          <span style={{ color: C.muteOnDark, font: "500 14px var(--body)" }}>
            Privacy · Terms
          </span>
        </div>
      </div>
      <div
        style={{
          borderTop: "1px solid #ffffff1a",
          padding: "12px 22px",
          textAlign: "center",
          font: "500 12px var(--body)",
          color: C.muteOnDark,
        }}
      >
        © {new Date().getFullYear()} RallyRank · Made in India 🇮🇳
      </div>
    </footer>
  );
}

// § LANDING ------------------------------------------------------------------
function Landing({ onSignup, onSignin, onContact, onLogo }) {
  return (
    <Shell>
      <div
        style={{
          background: C.indigo,
          color: "#fff",
          borderRadius: "0 0 40px 40px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.5,
            background: `radial-gradient(600px 300px at 85% -10%,${C.coral}55,transparent),radial-gradient(500px 280px at 5% 110%,${C.lime}33,transparent)`,
          }}
        />
        <div
          style={{
            maxWidth: 1060,
            margin: "0 auto",
            padding: "24px 22px",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              onClick={onLogo}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <Logo size={40} onDark />
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={onSignin}
                style={{
                  font: "700 15px var(--body)",
                  color: "#fff",
                  background: "#ffffff1f",
                  border: "none",
                  padding: "11px 20px",
                  borderRadius: 99,
                  cursor: "pointer",
                }}
              >
                Sign in
              </button>
              <Btn kind="lime" onClick={onSignup}>
                Sign up
              </Btn>
            </div>
          </div>
          <div style={{ padding: "60px 0 68px", maxWidth: 720 }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              <Pill color={C.lime} dark>
                🏸 BADMINTON
              </Pill>
              <Pill color={C.coral} dark>
                🥒 PICKLEBALL
              </Pill>
              <Pill color={C.gold} dark>
                🇮🇳 INDIA
              </Pill>
            </div>
            <h1
              style={{
                font: "700 clamp(40px,8vw,82px)/0.98 var(--display)",
                letterSpacing: "-0.03em",
                margin: "0 0 18px",
              }}
            >
              One rating that
              <br />
              follows you to
              <br />
              <span style={{ color: C.lime }}>every court.</span>
            </h1>
            <p
              style={{
                font: "400 18px/1.6 var(--body)",
                color: C.muteOnDark,
                maxWidth: 520,
                margin: "0 0 28px",
              }}
            >
              Calibrate in two minutes. Run tournaments, find partners, track
              every match — singles and doubles, badminton and pickleball, on
              one honest ladder.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Btn kind="lime" big onClick={onSignup}>
                Create your profile
              </Btn>
              <Btn kind="ghost" big onClick={onSignin}>
                <span style={{ color: "#fff" }}>I already have an account</span>
              </Btn>
            </div>
          </div>
        </div>
      </div>
      <div
        style={{ maxWidth: 1060, margin: "0 auto", padding: "40px 22px 60px" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 14,
          }}
        >
          {[
            [
              "🔍",
              "Transparent",
              "Every rating change is fully explained. The math is open.",
              C.sky,
            ],
            [
              "🏆",
              "Tournaments",
              "Run full mixer events with auto-matchmaking and score tracking.",
              C.lime,
            ],
            [
              "👥",
              "Find partners",
              "Discover players near your rating for doubles or a challenge.",
              C.coral,
            ],
            [
              "🤝",
              "For everyone",
              "RWA leagues to national tournaments — one ladder.",
              C.gold,
            ],
          ].map(([e, t, d, col]) => (
            <Card key={t}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: col + "22",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  marginBottom: 12,
                }}
              >
                {e}
              </div>
              <div
                style={{
                  font: "700 17px var(--display)",
                  color: C.ink,
                  marginBottom: 3,
                }}
              >
                {t}
              </div>
              <div style={{ font: "400 13px/1.5 var(--body)", color: C.mute }}>
                {d}
              </div>
            </Card>
          ))}
        </div>
        <Card style={{ marginTop: 14 }} color={C.butter2}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <Label>The RallyRank scale</Label>
            <span style={{ font: "500 13px var(--body)", color: C.mute }}>
              3000 → 8500, one continuous ladder
            </span>
          </div>
          <TierBar />
        </Card>
      </div>
      <SiteFooter onContact={onContact} onLogo={onLogo} />
    </Shell>
  );
}

// § AUTH ---------------------------------------------------------------------
// Authentication flow.
// Sign-up:  choose → email → password → onAuthed(true)  → onboarding questions
// Sign-in:  choose → email → password → onAuthed(false) → dashboard
// Phone:    UI placeholder — wire up Supabase Phone Auth in Supabase dashboard when ready
// Google:   one-tap via OAuth — set GOOGLE_CLIENT_ID to activate
function Auth({ mode, setMode, onAuthed, onBack, onLogo }) {
  // step: "choose" | "email" | "password" | "phone" | "linkSent"
  const [step, setStep] = useState("choose");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneDial, setPhoneDial] = useState("IN");
  const [pw, setPw] = useState("");
  const [pwVisible, setPwVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isSignup = mode === "signup";

  // Clear error whenever step changes
  useEffect(() => setError(null), [step]);

  // ── Google OAuth ──────────────────────────────────────────────────────────
  // Set GOOGLE_CLIENT_ID from console.cloud.google.com → Credentials → OAuth 2.0 Client ID
  // Add your hosted domain to "Authorized JavaScript origins" first.
  const handleGoogle = async () => {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  // ── Email magic link (sign-in) ────────────────────────────────────────────
  const handleMagicLink = async () => {
    if (!email.includes("@")) return;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) {
        setError(error.message);
        return;
      }
      setStep("linkSent");
    } catch (e) {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Password auth (sign-up or sign-in) ───────────────────────────────────
  const handlePassword = async () => {
    if (pw.length < 8) return;
    setLoading(true);
    setError(null);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pw,
        });

        console.log("SIGNUP DATA:", data);
        console.log("SIGNUP USER:", data?.user);
        console.log("SIGNUP SESSION:", data?.session);
        console.log("SIGNUP ERROR:", error);

        if (error) {
          setError(error.message);
          return;
        }

        if (!data?.session?.user) {
          setError(
            "Signup worked, but no active session was created. Please sign in."
          );
          return;
        }

        onAuthed(true);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password: pw,
        });

        if (error) {
          setError(error.message);
          return;
        }

        const { data: player, error: playerError } = await supabase
          .from("players")
          .select("*, ratings(*)")
          .eq("auth_id", data.user.id)
          .single();

        console.log("PLAYER FROM DB:", player);
        console.log("PLAYER RATINGS:", player?.ratings);

        if (playerError || !player) {
          onAuthed(true); // send to onboarding/profile setup
          return;
        }

        const { data: statsData } = await supabase
          .from("player_rating_stats")
          .select("*");

        const appPlayer = attachRatingsToPlayer(
          player,
          player.ratings || [],
          (statsData || []).filter((s) => s.player_id === player.id)
        );

        onAuthed(false, {
          ...appPlayer,
          sports: appPlayer.sports?.length ? appPlayer.sports : ["badminton"],
        }); // send real player
      }
    } catch (e) {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Phone OTP (placeholder — enable in Supabase Auth settings first) ──────
  const handlePhoneSend = async () => {
    const fullPhone = `+${dialFor(phoneDial)}${phone.replace(/\s/g, "")}`;
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
      if (error) {
        setError(error.message);
        return;
      }
      setStep("phoneOTP");
    } catch {
      setError("Could not send OTP. Check your number and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Shared layout wrapper ─────────────────────────────────────────────────
  return (
    <Shell>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: `radial-gradient(700px 360px at 50% -5%, ${C.butter2}, ${C.butter})`,
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* Logo — always visible, tappable to go home */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <button
              onClick={onLogo}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <Logo size={44} />
            </button>
          </div>

          <Card pad={32}>
            {/* ── STEP: choose ─────────────────────────────────────────── */}
            {step === "choose" && (
              <>
                {/* Sign up / Sign in toggle */}
                <div
                  style={{
                    display: "flex",
                    background: C.butter2,
                    borderRadius: 99,
                    padding: 4,
                    marginBottom: 26,
                    gap: 4,
                  }}
                >
                  {[
                    ["signup", "Create account"],
                    ["signin", "Sign in"],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => {
                        setMode(k);
                        setError(null);
                      }}
                      style={{
                        flex: 1,
                        font: "800 14px var(--body)",
                        padding: "11px",
                        borderRadius: 99,
                        border: "none",
                        cursor: "pointer",
                        background: mode === k ? "#fff" : "transparent",
                        color: mode === k ? C.ink : C.mute,
                        boxShadow:
                          mode === k ? "0 2px 8px rgba(0,0,0,.09)" : "none",
                        transition: "all .15s ease",
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <h2
                  style={{
                    font: "700 24px var(--display)",
                    margin: "0 0 6px",
                    color: C.ink,
                  }}
                >
                  {isSignup ? "Welcome to RallyRank 🏸" : "Welcome back"}
                </h2>
                <p
                  style={{
                    font: "400 14px/1.55 var(--body)",
                    color: C.mute,
                    margin: "0 0 24px",
                  }}
                >
                  {isSignup
                    ? "Create your account to get your rating and find players near you."
                    : "Sign in to your RallyRank account."}
                </p>

                {/* Google — primary CTA */}
                <button
                  onClick={handleGoogle}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    padding: "14px",
                    borderRadius: 13,
                    cursor: "pointer",
                    font: "700 15px var(--body)",
                    color: C.ink,
                    background: "#fff",
                    border: `2px solid ${C.line}`,
                    boxShadow: "0 2px 8px rgba(0,0,0,.06)",
                    marginBottom: 12,
                    transition: "box-shadow .12s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.boxShadow =
                      "0 4px 16px rgba(0,0,0,.12)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.boxShadow =
                      "0 2px 8px rgba(0,0,0,.06)")
                  }
                >
                  <GoogleG /> Continue with Google
                </button>

                {/* Divider */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    margin: "18px 0",
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: C.line }} />
                  <span style={{ font: "600 12px var(--body)", color: C.mute }}>
                    OR
                  </span>
                  <div style={{ flex: 1, height: 1, background: C.line }} />
                </div>

                {/* Email option */}
                <button
                  onClick={() => setStep("email")}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    borderRadius: 13,
                    cursor: "pointer",
                    font: "600 15px var(--body)",
                    color: C.ink,
                    background: C.butter,
                    border: `2px solid ${C.line}`,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ fontSize: 18 }}>✉️</span> Continue with email
                  </span>
                  <span style={{ color: C.mute, fontSize: 18 }}>›</span>
                </button>

                {/* Phone option (UI ready; wire up Supabase Phone Auth when ready) */}
                <button
                  onClick={() => setStep("phone")}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    borderRadius: 13,
                    cursor: "pointer",
                    font: "600 15px var(--body)",
                    color: C.ink,
                    background: C.butter,
                    border: `2px solid ${C.line}`,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ fontSize: 18 }}>📱</span> Continue with phone
                  </span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        font: "600 11px var(--body)",
                        color: C.mute,
                        background: C.butter2,
                        padding: "3px 8px",
                        borderRadius: 99,
                      }}
                    >
                      Soon
                    </span>
                    <span style={{ color: C.mute, fontSize: 18 }}>›</span>
                  </span>
                </button>
              </>
            )}

            {/* ── STEP: email ──────────────────────────────────────────── */}
            {step === "email" && (
              <>
                <button
                  onClick={() => setStep("choose")}
                  style={{
                    font: "600 14px var(--body)",
                    color: C.mute,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    marginBottom: 20,
                    padding: 0,
                  }}
                >
                  ← Back
                </button>
                <h2
                  style={{
                    font: "700 24px var(--display)",
                    margin: "0 0 6px",
                    color: C.ink,
                  }}
                >
                  {isSignup ? "Your email address" : "Sign in with email"}
                </h2>
                <p
                  style={{
                    font: "400 14px/1.55 var(--body)",
                    color: C.mute,
                    margin: "0 0 20px",
                  }}
                >
                  {isSignup
                    ? "We'll use this for your account and to send match notifications."
                    : "Enter your email and we'll take you to your password."}
                </p>
                <Field label="Email address">
                  <input
                    autoFocus
                    value={email}
                    type="email"
                    placeholder="you@example.com"
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      email.includes("@") &&
                      setStep("password")
                    }
                    style={inp}
                  />
                </Field>
                {error && <ErrorMsg>{error}</ErrorMsg>}
                <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
                  <Btn
                    kind="primary"
                    full
                    onClick={() => {
                      if (email.includes("@")) setStep("password");
                    }}
                    disabled={!email.includes("@")}
                  >
                    Continue →
                  </Btn>
                  {/* Magic link option for sign-in */}
                  {!isSignup && (
                    <button
                      onClick={handleMagicLink}
                      disabled={loading || !email.includes("@")}
                      style={{
                        font: "600 14px var(--body)",
                        color: C.skyDk,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        opacity: !email.includes("@") ? 0.4 : 1,
                      }}
                    >
                      {loading ? "Sending…" : "Send me a magic link instead"}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ── STEP: password ───────────────────────────────────────── */}
            {step === "password" && (
              <>
                <button
                  onClick={() => setStep("email")}
                  style={{
                    font: "600 14px var(--body)",
                    color: C.mute,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    marginBottom: 20,
                    padding: 0,
                  }}
                >
                  ← Back
                </button>
                <h2
                  style={{
                    font: "700 24px var(--display)",
                    margin: "0 0 6px",
                    color: C.ink,
                  }}
                >
                  {isSignup ? "Set a password" : "Enter your password"}
                </h2>
                <p
                  style={{
                    font: "400 14px/1.55 var(--body)",
                    color: C.mute,
                    margin: "0 0 20px",
                  }}
                >
                  {isSignup ? (
                    <>
                      Signing up as <b style={{ color: C.ink }}>{email}</b>. At
                      least 8 characters.
                    </>
                  ) : (
                    <>
                      Signing in as <b style={{ color: C.ink }}>{email}</b>.
                    </>
                  )}
                </p>
                <Field label="Password">
                  <div style={{ position: "relative" }}>
                    <input
                      autoFocus
                      value={pw}
                      type={pwVisible ? "text" : "password"}
                      placeholder="••••••••"
                      onChange={(e) => setPw(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && pw.length >= 8 && handlePassword()
                      }
                      style={{ ...inp, paddingRight: 46 }}
                    />
                    {/* Show/hide password toggle */}
                    <button
                      onClick={() => setPwVisible(!pwVisible)}
                      style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        font: "500 13px var(--body)",
                        color: C.mute,
                      }}
                    >
                      {pwVisible ? "Hide" : "Show"}
                    </button>
                  </div>
                </Field>
                {/* Password strength indicator (sign-up only) */}
                {isSignup && pw.length > 0 && (
                  <div style={{ marginTop: -8, marginBottom: 14 }}>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      {[1, 2, 3, 4].map((n) => {
                        const strength =
                          pw.length >= 12 &&
                          /[A-Z]/.test(pw) &&
                          /[0-9]/.test(pw)
                            ? 4
                            : pw.length >= 10
                            ? 3
                            : pw.length >= 8
                            ? 2
                            : 1;
                        return (
                          <div
                            key={n}
                            style={{
                              flex: 1,
                              height: 4,
                              borderRadius: 99,
                              background:
                                n <= strength
                                  ? [C.red, C.gold, C.lime, C.limeDk][
                                      strength - 1
                                    ]
                                  : C.line,
                            }}
                          />
                        );
                      })}
                    </div>
                    <span
                      style={{ font: "500 12px var(--body)", color: C.mute }}
                    >
                      {pw.length < 8
                        ? "Too short"
                        : pw.length < 10
                        ? "Acceptable"
                        : pw.length >= 12 &&
                          /[A-Z]/.test(pw) &&
                          /[0-9]/.test(pw)
                        ? "Strong 💪"
                        : "Good"}
                    </span>
                  </div>
                )}
                {error && <ErrorMsg>{error}</ErrorMsg>}
                <Btn
                  kind="lime"
                  full
                  big
                  onClick={handlePassword}
                  disabled={pw.length < 8 || loading}
                >
                  {loading
                    ? "Please wait…"
                    : isSignup
                    ? "Create account & continue →"
                    : "Sign in →"}
                </Btn>
                {/* Forgot password for sign-in */}
                {!isSignup && (
                  <button
                    onClick={handleMagicLink}
                    disabled={loading}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "center",
                      marginTop: 14,
                      font: "600 13px var(--body)",
                      color: C.mute,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Forgot password? Send me a login link
                  </button>
                )}
              </>
            )}

            {/* ── STEP: phone ──────────────────────────────────────────── */}
            {step === "phone" && (
              <>
                <button
                  onClick={() => setStep("choose")}
                  style={{
                    font: "600 14px var(--body)",
                    color: C.mute,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    marginBottom: 20,
                    padding: 0,
                  }}
                >
                  ← Back
                </button>
                <h2
                  style={{
                    font: "700 24px var(--display)",
                    margin: "0 0 6px",
                    color: C.ink,
                  }}
                >
                  Phone sign-in
                </h2>
                <p
                  style={{
                    font: "400 14px/1.55 var(--body)",
                    color: C.mute,
                    margin: "0 0 20px",
                  }}
                >
                  We'll send a one-time code to your number. Enable Phone Auth
                  in your Supabase dashboard first.
                </p>
                <Field label="Phone number">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "150px 1fr",
                      gap: 10,
                    }}
                  >
                    <DialSelect
                      value={phoneDial}
                      onChange={(v) => setPhoneDial(v)}
                    />
                    <input
                      value={phone}
                      placeholder="98765 43210"
                      onChange={(e) => setPhone(e.target.value)}
                      style={inp}
                    />
                  </div>
                </Field>
                {error && <ErrorMsg>{error}</ErrorMsg>}
                <Btn
                  kind="primary"
                  full
                  onClick={handlePhoneSend}
                  disabled={phone.length < 7 || loading}
                >
                  {loading ? "Sending OTP…" : "Send OTP →"}
                </Btn>
              </>
            )}

            {/* ── STEP: phoneOTP ───────────────────────────────────────── */}
            {step === "phoneOTP" && (
              <>
                <button
                  onClick={() => setStep("phone")}
                  style={{
                    font: "600 14px var(--body)",
                    color: C.mute,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    marginBottom: 20,
                    padding: 0,
                  }}
                >
                  ← Back
                </button>
                <h2
                  style={{
                    font: "700 24px var(--display)",
                    margin: "0 0 6px",
                    color: C.ink,
                  }}
                >
                  Enter your OTP
                </h2>
                <p
                  style={{
                    font: "400 14px/1.55 var(--body)",
                    color: C.mute,
                    margin: "0 0 20px",
                  }}
                >
                  Check your messages for a 6-digit code from RallyRank.
                </p>
                <OTPInput
                  onComplete={async (otp) => {
                    setLoading(true);
                    setError(null);
                    const fullPhone = `+${dialFor(phoneDial)}${phone.replace(
                      /\s/g,
                      ""
                    )}`;
                    const { error } = await supabase.auth.verifyOtp({
                      phone: fullPhone,
                      token: otp,
                      type: "sms",
                    });
                    if (error) {
                      setError(error.message);
                      setLoading(false);
                      return;
                    }
                    onAuthed(isSignup);
                  }}
                />
                {error && <ErrorMsg>{error}</ErrorMsg>}
              </>
            )}

            {/* ── STEP: linkSent ───────────────────────────────────────── */}
            {step === "linkSent" && (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: 99,
                    background: C.lime + "2A",
                    display: "grid",
                    placeItems: "center",
                    margin: "0 auto 16px",
                    fontSize: 32,
                  }}
                >
                  ✉️
                </div>
                <h2
                  style={{ font: "700 22px var(--display)", margin: "0 0 8px" }}
                >
                  Check your inbox
                </h2>
                <p
                  style={{
                    font: "400 14px/1.6 var(--body)",
                    color: C.mute,
                    margin: "0 0 22px",
                  }}
                >
                  We sent a sign-in link to{" "}
                  <b style={{ color: C.ink }}>{email}</b>.<br />
                  Open it on this device.
                </p>
                <Btn kind="lime" full onClick={() => onAuthed(false)}>
                  I've clicked the link →
                </Btn>
                <button
                  onClick={() => setStep("email")}
                  style={{
                    marginTop: 14,
                    font: "600 13px var(--body)",
                    color: C.mute,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Use a different email
                </button>
              </div>
            )}
          </Card>

          {/* Back to home */}
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <button
              onClick={onBack}
              style={{
                font: "600 13px var(--body)",
                color: C.mute,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              ← Back to home
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// Inline error message component used inside Auth steps
function ErrorMsg({ children }) {
  return (
    <div
      style={{
        background: "#FFF3F1",
        border: `1px solid ${C.coralDk}`,
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 14,
        font: "600 13px var(--body)",
        color: C.coralDk,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      <span>⚠️</span>
      <span>{children}</span>
    </div>
  );
}

// 6-digit OTP input — auto-focuses, auto-advances between boxes, auto-submits on fill
function OTPInput({ onComplete }) {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const refs = Array.from({ length: 6 }, () => useRef(null));

  const handleKey = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs[i - 1].current.focus();
      return;
    }
    const val = e.key.replace(/[^0-9]/g, "");
    if (!val) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (i < 5) refs[i + 1].current.focus();
    if (next.every((d) => d) && next.join("").length === 6)
      onComplete(next.join(""));
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={refs[i]}
            value={d}
            maxLength={1}
            type="tel"
            onKeyDown={(e) => handleKey(i, e)}
            onChange={() => {}} // controlled via onKeyDown
            style={{
              width: 46,
              height: 54,
              borderRadius: 12,
              border: `2px solid ${d ? C.coral : C.line}`,
              font: "800 24px var(--display)",
              textAlign: "center",
              color: C.ink,
              outline: "none",
              background: d ? C.coral + "10" : "#fff",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Google "G" coloured SVG icon used in auth button
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

// § ONBOARDING ---------------------------------------------------------------
// Two-pane wizard: live rating rail on left, active question on right
function Onboarding({ onDone, onExit, onLogo, prefill }) {
  const [i, setI] = useState(0);
  const [d, setD] = useState({
    sport: "badminton",
    name: prefill?.name || "",
    country: "IN",
    city: "",
    gender: "",
    hand: "",
    dob: "",
    dial: "IN",
    phone: "",
    freqIdx: null,
    skill: Array(5).fill(null),
    tIdx: null,
    calIdx: null,
    photo: prefill?.photo || null,
  });
  const set = (patch) => setD((prev) => ({ ...prev, ...patch }));
  const seed = useMemo(() => computeSeed(d), [d]);
  const step = ONB_STEPS[i];
  const next = () => (i < ONB_STEPS.length - 1 ? setI(i + 1) : finish());
  const back = () => (i > 0 ? setI(i - 1) : onExit());

  // Builds the player object from onboarding data; only includes chosen sports
  function finish() {
    const s = seed.final,
      dbl = clampR(s + 60);
    const sports = d.sport === "both" ? ["badminton", "pickleball"] : [d.sport];
    const player = {
      id: null,
      name: d.name || "You",
      city: d.city || "—",
      country: d.country,
      handle:
        "@" +
        (d.name || "you")
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "_")
          .replace(/[^a-z_]/g, ""),
      role: "PLAYER",
      gbrId: "RR-" + Math.floor(10000 + Math.random() * 89999),
      photo: d.photo,
      gender: d.gender,
      hand: d.hand,
      dob: d.dob,
      phone: `+${dialFor(d.dial)} ${d.phone}`,
      email: "you@example.com",
      sports,
      currentStreak: 0,
      tournamentWins: 0,
    };
    // Only seed the sports the player chose; leave the other undefined
    if (sports.includes("badminton"))
      player.badminton = {
        singles: s,
        doubles: dbl,
        rd: 245,
        games: 0,
        opponents: 0,
        wins: 0,
        doublesWins: 0,
      };
    if (sports.includes("pickleball"))
      player.pickleball = {
        singles: s,
        doubles: clampR(dbl - 20),
        rd: 280,
        games: 0,
        opponents: 0,
        wins: 0,
        doublesWins: 0,
      };
    onDone(player);
  }

  const canNext = {
    sport: true,
    identity: !!d.name.trim(),
    contact: true,
    frequency: d.freqIdx != null,
    skill: d.skill.every((x) => x != null),
    tournament: d.tIdx != null,
    calibration: d.calIdx != null,
    result: true,
  }[step];

  // Step labels for the sidebar progress list
  const stepNames = {
    sport: "Sport",
    identity: "Profile",
    contact: "Contact",
    frequency: "Frequency",
    skill: "Self-assessment",
    tournament: "Experience",
    calibration: "Your level",
    result: "Rating",
  };

  return (
    <Shell>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          gridTemplateColumns: "minmax(0,340px) 1fr",
        }}
      >
        {/* Left rail: live rating display and step progress */}
        <aside
          style={{
            background: C.indigo,
            color: "#fff",
            padding: "28px 26px",
            position: "sticky",
            top: 0,
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.4,
              background: `radial-gradient(360px 220px at 110% 0%,${C.coral}44,transparent)`,
            }}
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
          >
            <button
              onClick={onLogo}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                alignSelf: "flex-start",
              }}
            >
              <Logo size={32} onDark />
            </button>
            <div style={{ marginTop: 30 }}>
              <Label color={C.lime}>Building your rating</Label>
              <div
                style={{
                  font: "700 60px/1 var(--display)",
                  color: "#fff",
                  margin: "8px 0 4px",
                  letterSpacing: "-0.03em",
                }}
              >
                {seed.final.toLocaleString()}
              </div>
              <Pill color={TIER(seed.final).color} dark>
                {TIER(seed.final).name} · provisional
              </Pill>
              <p
                style={{
                  font: "400 12px/1.6 var(--body)",
                  color: C.muteOnDark,
                  marginTop: 12,
                  maxWidth: 250,
                }}
              >
                This updates as you answer. Real games settle it in fast.
              </p>
            </div>
            <div style={{ marginTop: "auto", display: "grid", gap: 5 }}>
              {ONB_STEPS.map((s, idx) => {
                const done = idx < i,
                  active = idx === i;
                return (
                  <div
                    key={s}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "6px 0",
                      opacity: done || active ? 1 : 0.45,
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 99,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                        background: done
                          ? C.lime
                          : active
                          ? C.coral
                          : "#ffffff22",
                        color: done ? C.indigo : "#fff",
                        font: "800 10px var(--body)",
                      }}
                    >
                      {done ? "✓" : idx + 1}
                    </span>
                    <span
                      style={{
                        font: `${active ? 700 : 500} 13px var(--body)`,
                        color: active ? "#fff" : C.muteOnDark,
                      }}
                    >
                      {stepNames[s]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right: active onboarding step */}
        <main
          style={{
            padding: "clamp(24px,4vw,50px)",
            maxWidth: 660,
            width: "100%",
          }}
        >
          {step === "sport" && <ONB_SportStep d={d} set={set} />}
          {step === "identity" && <ONB_IdentityStep d={d} set={set} />}
          {step === "contact" && <ONB_ContactStep d={d} set={set} />}
          {step === "frequency" && <ONB_FreqStep d={d} set={set} />}
          {step === "skill" && <ONB_SkillStep d={d} set={set} />}
          {step === "tournament" && <ONB_TournamentStep d={d} set={set} />}
          {step === "calibration" && <ONB_CalibStep d={d} set={set} />}
          {step === "result" && <ONB_ResultStep d={d} seed={seed} />}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 28,
            }}
          >
            <Btn kind="plain" onClick={back}>
              ← Back
            </Btn>
            <Btn
              kind={step === "result" ? "lime" : "primary"}
              onClick={next}
              disabled={!canNext}
            >
              {step === "result"
                ? "Open my dashboard →"
                : step === "calibration"
                ? "Calibrate →"
                : "Continue →"}
            </Btn>
          </div>
        </main>
      </div>
    </Shell>
  );
}

// Reusable grid of tappable choice buttons used in multiple onboarding steps
const ChoiceGrid = ({ options, value, onPick, cols = 3 }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols},1fr)`,
      gap: 10,
    }}
  >
    {options.map((o) => {
      const val = Array.isArray(o) ? o[0] : o,
        label = Array.isArray(o) ? o[1] : o,
        on = value === val;
      return (
        <button
          key={val}
          onClick={() => onPick(val)}
          style={{
            padding: "16px 10px",
            borderRadius: 16,
            cursor: "pointer",
            font: "600 14px var(--body)",
            background: on ? C.coral + "14" : "#fff",
            color: C.ink,
            border: `2px solid ${on ? C.coral : C.line}`,
            transition: "all .12s ease",
          }}
        >
          {label}
        </button>
      );
    })}
  </div>
);
// Vertical list of choices with optional bonus pill, used for tournament/frequency steps
const RowChoice = ({ options, value, onPick }) => (
  <div style={{ display: "grid", gap: 8 }}>
    {options.map((o, idx) => {
      const label = Array.isArray(o) ? o[0] : o,
        bonus = Array.isArray(o) ? o[1] : null,
        on = value === idx;
      return (
        <button
          key={label}
          onClick={() => onPick(idx)}
          style={{
            width: "100%",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 16px",
            borderRadius: 14,
            cursor: "pointer",
            background: on ? C.coral + "14" : "#fff",
            border: `2px solid ${on ? C.coral : C.line}`,
          }}
        >
          <span style={{ font: "600 15px var(--body)", color: C.ink }}>
            {label}
          </span>
          {bonus > 0 && (
            <Pill color={C.coralDk} bg="#FFE9E6">
              +{bonus}
            </Pill>
          )}
        </button>
      );
    })}
  </div>
);

// Individual onboarding step components
function ONB_SportStep({ d, set }) {
  return (
    <div>
      <Label>Step 1 · Sport</Label>
      <H1>What do you play?</H1>
      <Sub>
        You get separate ratings for each sport you choose. Only the sports you
        select will appear on your profile.
      </Sub>
      <div style={{ marginTop: 22 }}>
        <ChoiceGrid
          cols={3}
          value={d.sport}
          onPick={(v) => set({ sport: v })}
          options={[
            ["badminton", "🏸 Badminton"],
            ["pickleball", "🥒 Pickleball"],
            ["both", "🏸🥒 Both"],
          ]}
        />
      </div>
    </div>
  );
}
function ONB_IdentityStep({ d, set }) {
  const handle = d.name
    ? "@" +
      d.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z_]/g, "")
    : "";
  return (
    <div>
      <Label color={C.sky}>Step 2 · Profile</Label>
      <H1>Basic profile.</H1>
      <Sub>Your public handle, location, and eligibility info.</Sub>
      <Card style={{ marginTop: 22 }}>
        <Field label="Full name">
          <input
            autoFocus
            value={d.name}
            placeholder="Your full name"
            onChange={(e) => set({ name: e.target.value })}
            style={inp}
          />
        </Field>
        {handle && (
          <div style={{ marginTop: -6, marginBottom: 12 }}>
            <Pill color={C.limeDk} bg="#F0FBD9">
              {handle} · available ✓
            </Pill>
          </div>
        )}
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <Field label="Country">
            <CountrySelect
              value={d.country}
              onChange={(v) => set({ country: v })}
            />
          </Field>
          <Field label="City">
            <input
              value={d.city}
              placeholder="e.g. Bengaluru"
              onChange={(e) => set({ city: e.target.value })}
              style={inp}
            />
          </Field>
        </div>
        <Field
          label="Date of birth"
          hint="Used for U15/U17/U19/Senior/Veteran categories. Private by default."
        >
          <input
            type="date"
            value={d.dob}
            onChange={(e) => set({ dob: e.target.value })}
            style={inp}
          />
        </Field>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <Field label="Gender">
            <select
              value={d.gender}
              onChange={(e) => set({ gender: e.target.value })}
              style={inp}
            >
              <option value="">Select</option>
              <option>Male</option>
              <option>Female</option>
              <option>Prefer not to say</option>
            </select>
          </Field>
          <Field label="Dominant hand">
            <select
              value={d.hand}
              onChange={(e) => set({ hand: e.target.value })}
              style={inp}
            >
              <option value="">Select</option>
              <option>Right</option>
              <option>Left</option>
              <option>Ambidextrous</option>
            </select>
          </Field>
        </div>
      </Card>
    </div>
  );
}
function ONB_ContactStep({ d, set }) {
  return (
    <div>
      <Label color={C.sky}>Step 3 · Contact</Label>
      <H1>How do partners reach you?</H1>
      <Sub>
        Organisers and doubles partners use this to coordinate matches. Never
        shown publicly.
      </Sub>
      <Card style={{ marginTop: 22 }}>
        <Field label="Phone number">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              gap: 10,
            }}
          >
            <DialSelect value={d.dial} onChange={(v) => set({ dial: v })} />
            <input
              value={d.phone}
              placeholder="98765 43210"
              onChange={(e) => set({ phone: e.target.value })}
              style={inp}
            />
          </div>
        </Field>
        <p
          style={{ font: "400 13px/1.5 var(--body)", color: C.mute, margin: 0 }}
        >
          Used only to coordinate matches. We never sell, share, or market to
          you.
        </p>
      </Card>
    </div>
  );
}
function ONB_FreqStep({ d, set }) {
  return (
    <div>
      <Label color={C.limeDk}>Step 4 · Frequency</Label>
      <H1>How often do you play?</H1>
      <Sub>A strong predictor of level — it nudges your starting estimate.</Sub>
      <div style={{ marginTop: 22 }}>
        <RowChoice
          options={FREQ_OPTIONS.map((f) => [f[0]])}
          value={d.freqIdx}
          onPick={(idx) => set({ freqIdx: idx })}
        />
      </div>
    </div>
  );
}
function ONB_SkillStep({ d, set }) {
  const [q, setQ] = useState(() => {
    const fi = d.skill.findIndex((x) => x == null);
    return fi === -1 ? 0 : fi;
  });
  const Q = SKILL_Q[q],
    val = d.skill[q];
  const pick = (n) => {
    const s = [...d.skill];
    s[q] = n;
    set({ skill: s });
    if (q < SKILL_Q.length - 1) setTimeout(() => setQ(q + 1), 180);
  };
  return (
    <div>
      <Label color={C.limeDk}>Step 5 · Self-assessment · {q + 1}/5</Label>
      <H1>How you play.</H1>
      <Sub>{Q.q} Be honest — early games recalibrate you fast.</Sub>
      <div style={{ display: "flex", gap: 5, margin: "16px 0 14px" }}>
        {SKILL_Q.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setQ(idx)}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 99,
              border: "none",
              cursor: "pointer",
              background:
                d.skill[idx] != null ? C.lime : idx === q ? C.coral : C.line,
            }}
          />
        ))}
      </div>
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              background: C.lime + "22",
              display: "grid",
              placeItems: "center",
              fontSize: 22,
            }}
          >
            {Q.icon}
          </span>
          <h2
            style={{ font: "700 22px var(--display)", color: C.ink, margin: 0 }}
          >
            {Q.title}
          </h2>
        </div>
        <div
          style={{
            background: C.butter2,
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          {Q.anchors.map(([n, t]) => (
            <div key={n} style={{ display: "flex", gap: 11, padding: "6px 0" }}>
              <span
                style={{
                  font: "800 12px var(--body)",
                  color: C.indigo,
                  background: "#fff",
                  borderRadius: 99,
                  padding: "5px 0",
                  minWidth: 32,
                  textAlign: "center",
                  height: "fit-content",
                }}
              >
                {n}
              </span>
              <span style={{ font: "400 14px/1.5 var(--body)", color: C.ink }}>
                {t}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(10,1fr)",
            gap: 5,
          }}
        >
          {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => {
            const on = val === n;
            return (
              <button
                key={n}
                onClick={() => pick(n)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 11,
                  cursor: "pointer",
                  font: "700 16px var(--display)",
                  background: on ? C.coral : "#fff",
                  color: on ? "#fff" : C.ink,
                  border: `2px solid ${on ? C.coral : C.line}`,
                  transition: "all .12s ease",
                  transform: on ? "translateY(-3px)" : "none",
                  boxShadow: on ? "0 6px 14px rgba(255,107,94,.35)" : "none",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
            font: "600 10px var(--body)",
            color: C.mute,
          }}
        >
          <span>Beginner</span>
          <span>Intermediate</span>
          <span>Advanced</span>
          <span>Elite</span>
        </div>
      </Card>
    </div>
  );
}
function ONB_TournamentStep({ d, set }) {
  return (
    <div>
      <Label color={C.limeDk}>Step 6 · Experience</Label>
      <H1>Highest level you've played.</H1>
      <Sub>Real competitive history gives a small head-start bonus.</Sub>
      <div style={{ marginTop: 22 }}>
        <RowChoice
          options={TOURNAMENT_OPTIONS}
          value={d.tIdx}
          onPick={(idx) => set({ tIdx: idx })}
        />
      </div>
    </div>
  );
}
function ONB_CalibStep({ d, set }) {
  const tiers = d.sport === "pickleball" ? PKL_TIERS : BMTN_TIERS;
  return (
    <div>
      <Label color={C.sky}>Step 7 · Your level</Label>
      <H1>Which best describes you?</H1>
      <Sub>
        A gut-check in {d.sport === "pickleball" ? "pickleball" : "badminton"}{" "}
        terms. We use it as a sanity-check only.
      </Sub>
      <div style={{ marginTop: 22 }}>
        <ChoiceGrid
          cols={2}
          value={tiers[d.calIdx]}
          onPick={(v) => set({ calIdx: tiers.indexOf(v) })}
          options={tiers}
        />
      </div>
    </div>
  );
}
function ONB_ClubStep({ d, set }) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const matches = PRESET_CLUBS.filter((c) =>
    c.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div>
      <Label color={C.limeDk}>Step 8 · Club</Label>
      <H1>Where do you usually play?</H1>
      <Sub>
        Optional — connects you to local games and mixers. Add a club that isn't
        listed.
      </Sub>
      <Card style={{ marginTop: 22 }}>
        <input
          value={query}
          placeholder="Search clubs…"
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inp, marginBottom: 10 }}
        />
        <div style={{ display: "grid", gap: 7 }}>
          {matches.map((c) => {
            const on = d.club === c;
            return (
              <button
                key={c}
                onClick={() => set({ club: c })}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 12,
                  cursor: "pointer",
                  font: "600 14px var(--body)",
                  color: C.ink,
                  background: on ? C.lime + "22" : "#fff",
                  border: `2px solid ${on ? C.limeDk : C.line}`,
                }}
              >
                🏟️ {c}
                {on && (
                  <span style={{ float: "right", color: C.limeDk }}>✓</span>
                )}
              </button>
            );
          })}
          {matches.length === 0 && (
            <p style={{ font: "400 13px var(--body)", color: C.mute }}>
              No results for "{query}".
            </p>
          )}
          {!adding ? (
            <button
              onClick={() => setAdding(true)}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 12,
                cursor: "pointer",
                font: "700 14px var(--body)",
                color: C.coralDk,
                background: "#FFF3F1",
                border: `2px dashed ${C.coral}`,
              }}
            >
              ＋ Add your club
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                autoFocus
                placeholder="Your club's name"
                onChange={(e) => set({ club: e.target.value })}
                style={inp}
              />
              <Btn kind="dark" onClick={() => setAdding(false)}>
                Add
              </Btn>
            </div>
          )}
        </div>
        {d.club && (
          <div style={{ marginTop: 10 }}>
            <Pill color={C.limeDk} bg="#F0FBD9">
              Selected: {d.club}
            </Pill>
          </div>
        )}
      </Card>
    </div>
  );
}
// Final onboarding step: shows the computed rating with a breakdown
function ONB_ResultStep({ d, seed }) {
  const tier = TIER(seed.final);
  const [n, setN] = useState(3000);
  useEffect(() => {
    let raf, start;
    const dur = 900;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(3000 + (seed.final - 3000) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seed.final]);
  return (
    <div>
      <Label>Reading your game…</Label>
      <H1>Your starting rating.</H1>
      <Sub>
        Provisional until you record 10 games against 4+ different opponents.
      </Sub>
      <Card
        style={{
          marginTop: 22,
          textAlign: "center",
          overflow: "hidden",
          position: "relative",
        }}
        pad={32}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.5,
            background: `radial-gradient(260px 140px at 50% 0%,${tier.color}22,transparent)`,
          }}
        />
        <div style={{ position: "relative" }}>
          <Label color={tier.color}>
            {d.sport === "pickleball" ? "Pickleball" : "Badminton"} · Singles
          </Label>
          <div
            style={{
              font: "700 82px/1 var(--display)",
              color: tier.color,
              margin: "8px 0",
              letterSpacing: "-0.04em",
            }}
          >
            {n.toLocaleString()}
          </div>
          <Pill color={tier.color} dark>
            {tier.name} · Provisional
          </Pill>
          <div
            style={{
              background: C.butter2,
              borderRadius: 14,
              padding: 16,
              marginTop: 22,
              textAlign: "left",
              font: "500 13px/1.9 var(--body)",
              color: C.ink,
            }}
          >
            {[
              ["Skill score", `${seed.skill.toFixed(2)} / 10`],
              ["Base rating", seed.base.toLocaleString()],
              [
                "Frequency adj",
                `${seed.freqAdj >= 0 ? "+" : ""}${seed.freqAdj}`,
              ],
              ["Tournament bonus", `+${seed.tBonus}`],
              [
                "Level check",
                `${seed.calNudge >= 0 ? "+" : ""}${seed.calNudge}`,
              ],
            ].map(([l, v]) => (
              <div
                key={l}
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <span style={{ color: C.mute }}>{l}</span>
                <b>{v}</b>
              </div>
            ))}
            <div
              style={{
                borderTop: `1px solid ${C.line}`,
                marginTop: 8,
                paddingTop: 8,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  font: "700 12px var(--body)",
                  letterSpacing: ".06em",
                  color: C.mute,
                }}
              >
                STARTING RATING
              </span>
              <b style={{ color: tier.color, fontSize: 17 }}>
                {seed.final.toLocaleString()}
              </b>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// EventBanner: appears on dashboard when a registered event is live or check-in is open
function EventBanner({ event, onOpen }) {
  const isLive = event.status === "Live";
  return (
    <div
      onClick={onOpen}
      style={{
        background: isLive ? C.coral : C.sky,
        color: "#fff",
        borderRadius: 16,
        padding: "14px 20px",
        marginBottom: 12,
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <div>
        <div
          style={{
            font: "800 13px var(--body)",
            letterSpacing: ".06em",
            opacity: 0.85,
          }}
        >
          {isLive ? "🔴 EVENT LIVE NOW" : "🚀 CHECK-IN OPEN"}
        </div>
        <div style={{ font: "700 18px var(--display)", marginTop: 2 }}>
          {event.name}
        </div>
        <div
          style={{ font: "500 13px var(--body)", opacity: 0.8, marginTop: 2 }}
        >
          {event.sport} · {event.format} · {fmtDT(event.date, event.time)}
        </div>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.25)",
          padding: "10px 18px",
          borderRadius: 99,
          font: "700 14px var(--body)",
        }}
      >
        {isLive ? "Enter event →" : "Check in →"}
      </div>
    </div>
  );
}

// AddSportInline: quick 5-question self-assessment to add a second sport to an existing profile
function AddSportInline({ sport, me, setMe }) {
  const [step, setStep] = useState("prompt"); // prompt | questions | done
  const [skill, setSkill] = useState(Array(5).fill(null));
  const [q, setQ] = useState(0);
  const [tIdx, setTIdx] = useState(null);

  const pick = (n) => {
    const s = [...skill];
    s[q] = n;
    setSkill(s);
    if (q < SKILL_Q.length - 1) setTimeout(() => setQ(q + 1), 180);
  };
  const finish = () => {
    const bonus = tIdx != null ? TOURNAMENT_OPTIONS[tIdx][1] : 0;
    const seed = computeSeed({
      sport,
      skill,
      freqIdx: 2,
      tIdx: tIdx ?? 0,
      calIdx: null,
    });
    const s = seed.final,
      d = clampR(s + 60);
    // Add the new sport to the player's profile without touching existing sport ratings
    setMe((prev) => ({
      ...prev,
      sports: [...(prev.sports || []), sport],
      [sport]: {
        singles: s,
        doubles: d,
        rd: 245,
        games: 0,
        opponents: 0,
        wins: 0,
        doublesWins: 0,
      },
    }));
    setStep("done");
  };

  if (step === "done")
    return (
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
        <div style={{ font: "700 18px var(--display)", color: C.ink }}>
          Added! Switch to {sport} in the toggle above.
        </div>
      </div>
    );

  if (step === "prompt")
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <Btn kind="lime" onClick={() => setStep("questions")}>
          Start {sport} self-assessment →
        </Btn>
        <p
          style={{ font: "400 12px/1.5 var(--body)", color: C.mute, margin: 0 }}
        >
          5 quick questions — takes about 60 seconds.
        </p>
      </div>
    );

  // Questions step
  if (q < SKILL_Q.length) {
    const Q = SKILL_Q[q],
      val = skill[q];
    return (
      <div style={{ textAlign: "left" }}>
        <div
          style={{
            font: "700 16px var(--display)",
            color: C.ink,
            marginBottom: 10,
          }}
        >
          {Q.icon} {Q.title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(10,1fr)",
            gap: 5,
            marginBottom: 8,
          }}
        >
          {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => {
            const on = val === n;
            return (
              <button
                key={n}
                onClick={() => pick(n)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 10,
                  cursor: "pointer",
                  font: "700 14px var(--display)",
                  background: on ? C.coral : "#fff",
                  color: on ? "#fff" : C.ink,
                  border: `2px solid ${on ? C.coral : C.line}`,
                  transform: on ? "translateY(-2px)" : "none",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div
          style={{
            font: "600 10px var(--body)",
            color: C.mute,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Beginner</span>
          <span>Intermediate</span>
          <span>Advanced</span>
          <span>Elite</span>
        </div>
      </div>
    );
  }

  // Tournament history step (after all skill questions answered)
  return (
    <div style={{ textAlign: "left" }}>
      <div
        style={{
          font: "700 16px var(--display)",
          color: C.ink,
          marginBottom: 10,
        }}
      >
        Highest level played?
      </div>
      <div style={{ display: "grid", gap: 7, marginBottom: 14 }}>
        {TOURNAMENT_OPTIONS.map(([label, bonus], i) => (
          <button
            key={label}
            onClick={() => setTIdx(i)}
            style={{
              textAlign: "left",
              padding: "11px 14px",
              borderRadius: 12,
              cursor: "pointer",
              font: "600 13px var(--body)",
              color: C.ink,
              background: tIdx === i ? C.coral + "14" : "#fff",
              border: `2px solid ${tIdx === i ? C.coral : C.line}`,
            }}
          >
            {label}
            {bonus > 0 && (
              <span
                style={{
                  float: "right",
                  font: "700 11px var(--body)",
                  color: C.coralDk,
                }}
              >
                +{bonus}
              </span>
            )}
          </button>
        ))}
      </div>
      <Btn kind="lime" full onClick={finish} disabled={tIdx == null}>
        Add {sport} to my profile →
      </Btn>
    </div>
  );
}

function RatingGraph({
  playerId,
  sport,
  format = "singles",
  currentRating,
  refreshKey,
}) {
  const [points, setPoints] = useState([]);
  const [selectedPoint, setSelectedPoint] = useState(null);

  useEffect(() => {
    async function load() {
      if (!playerId) return;

      const { data, error } = await supabase
        .from("rating_history")
        .select("rating, created_at")
        .eq("player_id", playerId)
        .eq("sport", sport)
        .eq("format", format)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Rating graph load failed:", error);
        return;
      }

      setPoints(data || []);
    }

    load();
  }, [playerId, sport, format, refreshKey]);

  // The authoritative current rating lives in the ratings table (what the
  // dashboard shows). rating_history is the trail of past values. If the last
  // history point doesn't match the live rating (e.g. after an admin adjust,
  // a reversal, or a recompute), append the live value so the graph's headline
  // and endpoint always agree with the rest of the page.
  const history = points || [];
  const liveRating = currentRating != null ? Number(currentRating) : null;
  let graphPoints;
  if (history.length === 0) {
    graphPoints = [
      {
        rating: liveRating ?? 4500,
        created_at: new Date().toISOString(),
      },
    ];
  } else {
    const lastHist = Number(history[history.length - 1].rating);
    if (liveRating != null && lastHist !== liveRating) {
      graphPoints = [
        ...history,
        { rating: liveRating, created_at: new Date().toISOString() },
      ];
    } else {
      graphPoints = history;
    }
  }

  const ratings = graphPoints.map((p) => Number(p.rating));
  const min = Math.min(...ratings) - 50;
  const max = Math.max(...ratings) + 50;

  const width = 520;
  const height = 200;
  const pad = 34;

  const xy = graphPoints.map((p, i) => {
    const x =
      graphPoints.length === 1
        ? width / 2
        : pad + (i * (width - pad * 2)) / (graphPoints.length - 1);

    const y =
      height -
      pad -
      ((Number(p.rating) - min) / Math.max(1, max - min)) * (height - pad * 2);

    return {
      x,
      y,
      rating: p.rating,
      date: p.created_at,
      sport,
      format,
    };
  });

  const path = xy
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const latest = ratings[ratings.length - 1];
  const first = ratings[0];
  const delta = latest - first;

  return (
    <Card style={{ marginTop: 14 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <div>
          <Label>Rating over time</Label>
          <div
            style={{
              font: "700 24px var(--display)",
              color: C.ink,
              marginTop: 8,
            }}
          >
            {latest}
          </div>
        </div>

        <div
          style={{
            font: "800 14px var(--body)",
            color: delta >= 0 ? C.green : C.red,
          }}
        >
          {delta >= 0 ? "+" : ""}
          {delta}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", marginTop: 12 }}
      >
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke={C.line}
        />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke={C.line} />

        <text
          x="12"
          y={height / 2}
          textAnchor="middle"
          fill={C.mute}
          fontSize="11"
          transform={`rotate(-90 12 ${height / 2})`}
        >
          Rating
        </text>

        <text
          x={pad}
          y={height - 6}
          textAnchor="start"
          fill={C.mute}
          fontSize="10"
        >
          First Rating
        </text>

        <text
          x={width - pad}
          y={height - 6}
          textAnchor="end"
          fill={C.mute}
          fontSize="10"
        >
          Latest Rating
        </text>

        <path
          d={path}
          fill="none"
          stroke={C.limeDk}
          strokeWidth="4"
          strokeLinecap="round"
        />

        {xy.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={selectedPoint === p ? "8" : "6"}
            fill={C.limeDk}
            style={{ cursor: "pointer" }}
            onClick={() => setSelectedPoint(p)}
          />
        ))}
      </svg>

      {selectedPoint && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 14,
            background: C.butter,
            border: `1px solid ${C.line}`,
            font: "600 13px var(--body)",
            color: C.ink,
          }}
        >
          <div>
            Rating: <b>{selectedPoint.rating}</b>
          </div>
          <div style={{ color: C.mute, marginTop: 4 }}>
            Date:{" "}
            {selectedPoint.date
              ? new Date(selectedPoint.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Unknown"}
          </div>
          <div style={{ color: C.mute, marginTop: 4 }}>
            {selectedPoint.sport} · {selectedPoint.format}
          </div>
        </div>
      )}

      <div
        style={{ marginTop: 8, font: "500 12px var(--body)", color: C.mute }}
      >
        X-axis: date of rating update · Y-axis: player rating
      </div>
    </Card>
  );
}
function MatchHistory({ playerId, defaultSport = "badminton", onOpenPlayer }) {
  const [openEventId, setOpenEventId] = useState(null);

  return (
    <EventGroupedMatchHistory
      playerId={playerId}
      defaultSport={defaultSport}
      openEventId={openEventId}
      setOpenEventId={setOpenEventId}
      onOpenPlayer={onOpenPlayer}
    />
  );
}

function EventGroupedMatchHistory({
  playerId,
  defaultSport = "badminton",
  openEventId,
  setOpenEventId,
  onOpenPlayer,
}) {
  const [historySport, setHistorySport] = useState(defaultSport);
  const [format, setFormat] = useState("singles");
  const [eventGroups, setEventGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [allMatchPlayers, setAllMatchPlayers] = useState([]);

  useEffect(() => {
    async function load() {
      if (!playerId) return;

      setLoading(true);

      const { data, error } = await supabase
        .from("match_players")
        .select(
          `
          *,
          matches (
            id,
            event_id,
            sport,
            format,
            team1_score,
            team2_score,
            winner,
            played_at,
            events (
              name,
              type
            )
          )
        `
        )
        .eq("player_id", playerId);

      if (error) {
        console.error("Grouped history load failed:", error);
        setEventGroups([]);
        setLoading(false);
        return;
      }

      const filtered = (data || [])
        .filter(
          (r) =>
            String(r.matches?.sport).toLowerCase() ===
              historySport.toLowerCase() &&
            String(r.matches?.format).toLowerCase() === format
        )
        .sort(
          (a, b) =>
            new Date(b.matches?.played_at || 0) -
            new Date(a.matches?.played_at || 0)
        );

      const matchIds = filtered.map((r) => r.match_id);

      if (matchIds.length > 0) {
        const { data: allPlayersForMatches, error: allPlayersError } =
          await supabase
            .from("match_players")
            .select(
              `
      *,
      players (
        id,
        name
      )
    `
            )
            .in("match_id", matchIds);

        if (allPlayersError) {
          console.error("All match players load failed:", allPlayersError);
          setAllMatchPlayers([]);
        } else {
          setAllMatchPlayers(allPlayersForMatches || []);
        }
      } else {
        setAllMatchPlayers([]);
      }

      const grouped = {};

      for (const row of filtered) {
        const eventId = row.matches?.event_id || "challenge";

        if (!grouped[eventId]) {
          grouped[eventId] = {
            eventId,
            eventName:
              row.matches?.events?.name ||
              (eventId === "challenge" ? "Challenge match" : "Event / Mixer"),
            eventType: row.matches?.events?.type || "Event",
            playedAt: row.matches?.played_at,
            matches: [],
            wins: 0,
            losses: 0,
            delta: 0,
          };
        }

        grouped[eventId].matches.push(row);

        const myTeam = Number(row.team);
        const winner = Number(row.matches?.winner);

        if (myTeam === winner) {
          grouped[eventId].wins = Number(grouped[eventId].wins || 0) + 1;
        } else {
          grouped[eventId].losses = Number(grouped[eventId].losses || 0) + 1;
        }

        grouped[eventId].delta =
          Number(grouped[eventId].delta || 0) + Number(row.rating_delta ?? 0);
      }

      setEventGroups(Object.values(grouped));
      setLoading(false);
    }

    load();
  }, [playerId, historySport, format]);

  return (
    <Card style={{ marginTop: 14 }}>
      <Label>Match history</Label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {[
          ["badminton", "🏸 Badminton"],
          ["pickleball", "🥒 Pickleball"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setHistorySport(key)}
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 99,
              padding: "8px 13px",
              cursor: "pointer",
              background: historySport === key ? C.indigo : "#fff",
              color: historySport === key ? "#fff" : C.mute,
              font: "800 12px var(--body)",
            }}
          >
            {label}
          </button>
        ))}

        {["singles", "doubles"].map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 99,
              padding: "8px 13px",
              cursor: "pointer",
              background: format === f ? C.coral : "#fff",
              color: format === f ? "#fff" : C.mute,
              font: "800 12px var(--body)",
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && (
        <div
          style={{ marginTop: 14, font: "500 13px var(--body)", color: C.mute }}
        >
          Loading history...
        </div>
      )}

      {!loading && eventGroups.length === 0 && (
        <div
          style={{ marginTop: 14, font: "500 13px var(--body)", color: C.mute }}
        >
          No {format} history yet.
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {eventGroups.map((g) => {
          const open = openEventId === g.eventId;

          return (
            <div
              key={g.eventId}
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 16,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setOpenEventId(open ? null : g.eventId)}
                style={{
                  width: "100%",
                  border: "none",
                  background: C.butter,
                  padding: 14,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ font: "800 14px var(--body)", color: C.ink }}>
                    {g.eventName}
                  </div>
                  <div style={{ font: "500 12px var(--body)", color: C.mute }}>
                    {g.matches.length} match{g.matches.length === 1 ? "" : "es"}{" "}
                    {Number(g.wins || 0)}W {Number(g.losses || 0)}L
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      font: "800 16px var(--body)",
                      color: g.delta >= 0 ? C.green : C.red,
                    }}
                  >
                    {Number(g.delta || 0) >= 0 ? "+" : ""}
                    {Number(g.delta || 0)}
                  </div>
                  <div style={{ font: "600 11px var(--body)", color: C.mute }}>
                    {open ? "Hide" : "View"}
                  </div>
                </div>
              </button>

              {open && (
                <div style={{ padding: 12, display: "grid", gap: 8 }}>
                  {g.matches.map((r) => {
                    const m = r.matches;
                    const myScore =
                      r.team === 1 ? m.team1_score : m.team2_score;
                    const oppScore =
                      r.team === 1 ? m.team2_score : m.team1_score;

                    const matchPlayers = allMatchPlayers.filter(
                      (mp) => mp.match_id === r.match_id
                    );

                    const myTeam = matchPlayers.filter(
                      (mp) => mp.team === r.team
                    );
                    const oppTeam = matchPlayers.filter(
                      (mp) => mp.team !== r.team
                    );

                    const myNames =
                      myTeam
                        .map((mp) => mp.players?.name)
                        .filter(Boolean)
                        .join(" & ") || "Player";

                    const oppNames =
                      oppTeam
                        .map((mp) => mp.players?.name)
                        .filter(Boolean)
                        .join(" & ") || "Opponent";

                    const opponentNames =
                      r.opponents
                        ?.map((o) => o.players?.name)
                        .filter(Boolean)
                        .join(" & ") || "Opponent";

                    return (
                      <div
                        key={r.id}
                        style={{
                          border: `1px solid ${C.line}`,
                          borderRadius: 12,
                          padding: 10,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              font: "700 13px var(--body)",
                              color: C.ink,
                              marginBottom: 2,
                            }}
                          >
                            {myNames} vs {oppNames}
                          </div>

                          <div
                            style={{
                              font: "800 13px var(--body)",
                              color: r.won ? C.green : C.red,
                            }}
                          >
                            {r.won ? "Win" : "Loss"}
                          </div>
                          <div
                            style={{
                              font: "500 12px var(--body)",
                              color: C.mute,
                            }}
                          >
                            {new Date(m.played_at).toLocaleDateString()}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              font: "800 15px var(--display)",
                              color: C.ink,
                            }}
                          >
                            {myScore} - {oppScore}
                          </div>
                          <div
                            style={{
                              font: "700 12px var(--body)",
                              color: r.rating_delta >= 0 ? C.green : C.red,
                            }}
                          >
                            {r.rating_delta >= 0 ? "+" : ""}
                            {r.rating_delta}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MatchHistoryOld({ playerId, defaultSport = "badminton" }) {
  const [historySport, setHistorySport] = useState(defaultSport || "badminton");

  const [format, setFormat] = useState("singles");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!playerId) return;

      setLoading(true);

      const { data: mine, error } = await supabase
        .from("match_players")
        .select(
          `
          *,
          matches (
            id,
            event_id,
            sport,
            format,
            team1_score,
            team2_score,
            winner,
            played_at,
            events (
              name,
              type
            )
          )
        `
        )
        .eq("player_id", playerId);

      if (error) {
        console.error("Match history load failed:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      const filtered = (mine || [])
        .filter(
          (r) =>
            String(r.matches?.sport).toLowerCase() === historySport &&
            String(r.matches?.format).toLowerCase() === format
        )
        .sort(
          (a, b) =>
            new Date(b.matches?.played_at || 0) -
            new Date(a.matches?.played_at || 0)
        );

      console.log("FIRST MATCH ROW", filtered[0]);

      const matchIds = filtered.map((r) => r.match_id);

      if (matchIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: allPlayers, error: playersError } = await supabase
        .from("match_players")
        .select(
          `
          *,
          players (
            id,
            name
          )
        `
        )
        .in("match_id", matchIds);

      if (playersError) {
        console.error("Opponent load failed:", playersError);
      }

      const enriched = filtered.map((myRow) => {
        const matchPlayers = (allPlayers || []).filter(
          (p) => p.match_id === myRow.match_id
        );

        const opponents = matchPlayers.filter(
          (p) => p.player_id !== playerId && p.team !== myRow.team
        );

        return {
          ...myRow,
          opponents,
        };
      });

      setRows(enriched);
      setLoading(false);
    }

    load();
  }, [playerId, historySport, format]);

  return (
    <Card style={{ marginTop: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <Label>Match history</Label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["badminton", "🏸 Badminton"],
            ["pickleball", "🥒 Pickleball"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setHistorySport(key)}
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 99,
                padding: "8px 13px",
                cursor: "pointer",
                background: historySport === key ? C.indigo : "#fff",
                color: historySport === key ? "#fff" : C.mute,
                font: "800 12px var(--body)",
              }}
            >
              {label}
            </button>
          ))}

          {["singles", "doubles"].map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 99,
                padding: "8px 13px",
                cursor: "pointer",
                background: format === f ? C.coral : "#fff",
                color: format === f ? "#fff" : C.mute,
                font: "800 12px var(--body)",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ font: "500 13px var(--body)", color: C.mute }}>
          Loading matches...
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ font: "500 13px var(--body)", color: C.mute }}>
          No {format} match history yet.
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => {
          const m = r.matches;

          const matchPlayers = allMatchPlayers.filter(
            (mp) => mp.match_id === r.match_id
          );

          const myTeam = matchPlayers.filter((mp) => mp.team === r.team);
          const oppTeam = matchPlayers.filter((mp) => mp.team !== r.team);

          const myNames =
            myTeam
              .map((mp) => mp.players?.name)
              .filter(Boolean)
              .join(" & ") || "Player";

          const oppNames =
            oppTeam
              .map((mp) => mp.players?.name)
              .filter(Boolean)
              .join(" & ") || "Opponent";

          const myScore = r.team === 1 ? m.team1_score : m.team2_score;
          const oppScore = r.team === 1 ? m.team2_score : m.team1_score;
          const won = r.won;
          const delta = r.rating_delta || 0;
          const opponentNames =
            r.opponents
              ?.map((o) => o.players?.name)
              .filter(Boolean)
              .join(", ") || "Unknown opponent";

          return (
            <div
              key={r.id}
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 16,
                padding: 14,
                background: won ? C.lime + "18" : "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ font: "800 14px var(--body)", color: C.ink }}>
                    <span>
                      <PlayerLink
                        playerId={myTeam[0]?.player_id}
                        name={myNames}
                        onOpenPlayer={onOpenPlayer}
                      />{" "}
                      vs{" "}
                      <PlayerLink
                        playerId={oppTeam[0]?.player_id}
                        name={oppNames}
                        onOpenPlayer={onOpenPlayer}
                      />
                    </span>
                  </div>
                  <div style={{ font: "500 12px var(--body)", color: C.mute }}>
                    Event · {new Date(m.played_at).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div
                    style={{ font: "800 18px var(--display)", color: C.ink }}
                  >
                    {myScore} - {oppScore}
                  </div>
                  <div
                    style={{
                      font: "800 13px var(--body)",
                      color: delta >= 0 ? C.green : C.red,
                    }}
                  >
                    {delta >= 0 ? "+" : ""}
                    {delta}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 8,
                  font: "700 12px var(--body)",
                  color: won ? C.green : C.red,
                }}
              >
                {won ? "Win" : "Loss"} · {r.rating_before} → {r.rating_after}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PlayerProfilePage({ playerId, me, players, onOpenPlayer, onBack }) {
  const player =
    playerId === me?.id ? me : players.find((p) => p.id === playerId);

  const [sport, setSport] = useState(player?.sports?.[0] || "badminton");
  const [format, setFormat] = useState("singles");
  const [profileTab, setProfileTab] = useState("overview");
  useEffect(() => {
    setProfileTab("overview");
  }, [playerId]);

  if (!player) {
    return (
      <Card>
        <Btn kind="plain" onClick={onBack}>
          ← Back
        </Btn>
        <p>Player not found.</p>
      </Card>
    );
  }

  const dd = player[sport];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Btn kind="plain" onClick={onBack}>
        ← Back
      </Btn>

      <Card color={C.indigo}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                color: "#fff",
                font: "800 32px var(--display)",
              }}
            >
              {player.name}
            </div>

            <div
              style={{
                color: C.muteOnDark,
                marginTop: 4,
              }}
            >
              @{player.handle} · {flagForCountry(player.country)}{" "}
              {player.city || "—"}
            </div>
            {(() => {
              const psd = player[sport] || {};
              const pVerified = isVerified(psd.games || 0, psd.opponents || 0);
              return (
                <div style={{ marginTop: 8 }}>
                  <Pill color={pVerified ? C.lime : C.gold} dark>
                    {pVerified ? "VERIFIED ✓" : "PROVISIONAL"} ·{" "}
                    {sport === "badminton" ? "🏸" : "🥒"}
                  </Pill>
                </div>
              );
            })()}
          </div>

          <SportToggle
            sport={sport}
            setSport={setSport}
            sports={player.sports}
          />

          <div style={{ marginTop: 8 }}>
            <Btn kind="sky" onClick={() => shareRatingCard(player, sport)}>
              📲 Share card
            </Btn>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {["singles", "doubles"].map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                style={{
                  border: "none",
                  borderRadius: 99,
                  padding: "9px 14px",
                  cursor: "pointer",
                  background: format === f ? C.lime : "#ffffff22",
                  color: format === f ? C.indigo : "#fff",
                  font: "800 13px var(--body)",
                  textTransform: "capitalize",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["overview", "Overview"],
          ["history", "History"],
          ["h2h", "Head-to-Head"],
          ["partners", "Partners"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setProfileTab(key)}
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 99,
              padding: "9px 14px",
              cursor: "pointer",
              background: profileTab === key ? C.indigo : "#fff",
              color: profileTab === key ? "#fff" : C.mute,
              font: "800 13px var(--body)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {profileTab === "overview" && (
        <>
          <FormatToggle format={format} setFormat={setFormat} />
          <Card>
            <Label>Current Rating</Label>

            <div
              style={{
                font: "800 44px var(--display)",
                color: C.indigo,
                marginTop: 8,
              }}
            >
              {dd?.[format] || 4500}
            </div>
          </Card>

          <RecentForm playerId={player.id} sport={sport} format={format} />
          <RecentActivityFeed
            playerId={player.id}
            isMe={player.id === me?.id}
            players={players}
            onOpenPlayer={onOpenPlayer}
          />
        </>
      )}

      {profileTab === "history" && (
        <MatchHistory
          playerId={player.id}
          defaultSport={sport}
          onOpenPlayer={onOpenPlayer}
        />
      )}

      {profileTab === "h2h" && (
        <HeadToHead
          playerId={player.id}
          sport={sport}
          format={format}
          onOpenPlayer={onOpenPlayer}
        />
      )}

      {profileTab === "partners" && (
        <>
          {format === "doubles" ? (
            <BestPartners
              playerId={player.id}
              sport={sport}
              format={format}
              onOpenPlayer={onOpenPlayer}
            />
          ) : (
            <Card>
              <Label>Partners</Label>
              <div
                style={{
                  marginTop: 12,
                  font: "500 13px var(--body)",
                  color: C.mute,
                }}
              >
                Partner stats are available for doubles only.
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function RecentForm({ playerId, sport, format }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function load() {
      if (!playerId) return;

      const { data, error } = await supabase
        .from("match_players")
        .select(
          `
          won,
          rating_delta,
          matches (
            sport,
            format,
            played_at
          )
        `
        )
        .eq("player_id", playerId);

      if (error) {
        console.error("Recent form load failed:", error);
        return;
      }

      const filtered = (data || [])
        .filter(
          (r) =>
            String(r.matches?.sport).toLowerCase() === sport &&
            String(r.matches?.format).toLowerCase() === format
        )
        .sort(
          (a, b) =>
            new Date(b.matches?.played_at || 0) -
            new Date(a.matches?.played_at || 0)
        )
        .slice(0, 10);

      setRows(filtered);
    }

    load();
  }, [playerId, sport, format]);

  return (
    <Card>
      <Label>Recent form</Label>

      {rows.length === 0 && (
        <div
          style={{ marginTop: 12, font: "500 13px var(--body)", color: C.mute }}
        >
          No recent matches.
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div
            style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}
          >
            {rows.map((r, i) => (
              <div
                key={i}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 99,
                  display: "grid",
                  placeItems: "center",
                  background: r.won ? C.lime : "#FFE4E1",
                  color: r.won ? C.indigo : C.red,
                  font: "900 13px var(--body)",
                }}
              >
                {r.won ? "W" : "L"}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
            }}
          >
            <div>
              <div style={{ font: "800 18px var(--display)", color: C.ink }}>
                {rows.filter((r) => r.won).length}-
                {rows.filter((r) => !r.won).length}
              </div>
              <div style={{ font: "600 11px var(--body)", color: C.mute }}>
                Last {rows.length}
              </div>
            </div>

            <div>
              <div style={{ font: "800 18px var(--display)", color: C.ink }}>
                {rows.reduce(
                  (sum, r) => sum + Number(r.rating_delta || 0),
                  0
                ) >= 0
                  ? "+"
                  : ""}
                {rows.reduce((sum, r) => sum + Number(r.rating_delta || 0), 0)}
              </div>
              <div style={{ font: "600 11px var(--body)", color: C.mute }}>
                Rating change
              </div>
            </div>

            <div>
              <div style={{ font: "800 18px var(--display)", color: C.ink }}>
                {(() => {
                  let streak = 0;
                  const first = rows[0]?.won;

                  for (const r of rows) {
                    if (r.won === first) streak++;
                    else break;
                  }

                  return `${first ? "W" : "L"}${streak}`;
                })()}
              </div>
              <div style={{ font: "600 11px var(--body)", color: C.mute }}>
                Current streak
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function HeadToHead({ playerId, sport, format, onOpenPlayer }) {
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    async function load() {
      if (!playerId) return;

      const { data: mine, error } = await supabase
        .from("match_players")
        .select(
          `
          *,
          matches (
            id,
            sport,
            format,
            team1_score,
            team2_score,
            winner,
            played_at
          )
        `
        )
        .eq("player_id", playerId);

      if (error) {
        console.error("Head-to-head load failed:", error);
        return;
      }

      const filtered = (mine || []).filter(
        (r) =>
          String(r.matches?.sport).toLowerCase() === sport &&
          String(r.matches?.format).toLowerCase() === format
      );

      const matchIds = filtered.map((r) => r.match_id);

      if (matchIds.length === 0) {
        setRows([]);
        return;
      }

      const { data: allPlayers } = await supabase
        .from("match_players")
        .select(
          `
          *,
          players (
            id,
            name
          )
        `
        )
        .in("match_id", matchIds);

      const h2h = {};

      for (const myRow of filtered) {
        const matchPlayers = (allPlayers || []).filter(
          (p) => p.match_id === myRow.match_id
        );

        const opponents = matchPlayers.filter(
          (p) => p.player_id !== playerId && p.team !== myRow.team
        );

        for (const opp of opponents) {
          const id = opp.player_id;
          const name = opp.players?.name || "Unknown opponent";

          if (!h2h[id]) {
            h2h[id] = {
              id,
              name,
              matches: 0,
              wins: 0,
              losses: 0,
              matchesList: [],
            };
          }

          h2h[id].matches += 1;

          if (myRow.won) h2h[id].wins += 1;
          else h2h[id].losses += 1;

          h2h[id].matchesList.push({
            won: myRow.won,
            team: myRow.team,
            team1Score: myRow.matches?.team1_score,
            team2Score: myRow.matches?.team2_score,
            playedAt: myRow.matches?.played_at,
            ratingDelta: myRow.rating_delta || 0,
          });
        }
      }

      setRows(
        Object.values(h2h).sort(
          (a, b) => b.matches - a.matches || b.wins - a.wins
        )
      );
    }

    load();
  }, [playerId, sport, format]);

  return (
    <Card style={{ marginTop: 14 }}>
      <Label>Head-to-head</Label>
      {rows.length > 0 &&
        (() => {
          const totW = rows.reduce((s, r) => s + r.wins, 0);
          const totL = rows.reduce((s, r) => s + r.losses, 0);
          return (
            <div
              style={{
                font: "600 13px var(--body)",
                color: C.mute,
                marginTop: 6,
              }}
            >
              {rows.length} opponent{rows.length === 1 ? "" : "s"} ·{" "}
              <span style={{ color: C.limeDk, fontWeight: 800 }}>{totW}W</span>
              {" – "}
              <span style={{ color: C.coralDk, fontWeight: 800 }}>
                {totL}L
              </span>{" "}
              overall
            </div>
          );
        })()}

      {rows.length === 0 && (
        <div
          style={{ marginTop: 12, font: "500 13px var(--body)", color: C.mute }}
        >
          No head-to-head records yet.
        </div>
      )}

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {openId === r.id && (
              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                {r.matchesList.map((m, i) => {
                  const myScore = m.team === 1 ? m.team1Score : m.team2Score;
                  const oppScore = m.team === 1 ? m.team2Score : m.team1Score;

                  return (
                    <div
                      key={i}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        paddingTop: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          font: "700 12px var(--body)",
                          color: m.won ? C.green : C.red,
                        }}
                      >
                        {m.won ? "W" : "L"} · {myScore}-{oppScore}
                      </div>

                      <div
                        style={{ font: "600 12px var(--body)", color: C.mute }}
                      >
                        {new Date(m.playedAt).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              <div style={{ font: "800 14px var(--body)", color: C.ink }}>
                <PlayerLink
                  playerId={r.id}
                  name={`vs ${r.name}`}
                  onOpenPlayer={onOpenPlayer}
                />
              </div>
              <div style={{ font: "500 12px var(--body)", color: C.mute }}>
                {r.matches} match{r.matches === 1 ? "" : "es"}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ font: "900 16px var(--display)", color: C.ink }}>
                {r.wins}W - {r.losses}L
              </div>
              <div style={{ font: "600 11px var(--body)", color: C.mute }}>
                {Math.round((r.wins / r.matches) * 100)}% win rate
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BestPartners({ playerId, sport, format, onOpenPlayer }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function load() {
      if (!playerId) return;

      const { data: mine } = await supabase
        .from("match_players")
        .select(
          `
          *,
          matches (
            id,
            sport,
            format
          )
        `
        )
        .eq("player_id", playerId);

      const filtered = (mine || []).filter(
        (r) =>
          String(r.matches?.sport).toLowerCase() === sport &&
          String(r.matches?.format).toLowerCase() === format
      );

      const matchIds = filtered.map((r) => r.match_id);

      if (!matchIds.length) {
        setRows([]);
        return;
      }

      const { data: allPlayers } = await supabase
        .from("match_players")
        .select(
          `
          *,
          players (
            id,
            name
          )
        `
        )
        .in("match_id", matchIds);

      const partners = {};

      for (const myRow of filtered) {
        const sameTeam = (allPlayers || []).filter(
          (p) =>
            p.match_id === myRow.match_id &&
            p.team === myRow.team &&
            p.player_id !== playerId
        );

        for (const p of sameTeam) {
          const id = p.player_id;
          const name = p.players?.name || "Unknown";

          if (!partners[id]) {
            partners[id] = {
              id,
              name,
              matches: 0,
              wins: 0,
              losses: 0,
            };
          }

          partners[id].matches += 1;

          if (myRow.won) partners[id].wins += 1;
          else partners[id].losses += 1;
        }
      }

      setRows(
        Object.values(partners).sort(
          (a, b) =>
            b.wins / Math.max(1, b.matches) - a.wins / Math.max(1, a.matches)
        )
      );
    }

    load();
  }, [playerId, sport, format]);

  return (
    <Card style={{ marginTop: 14 }}>
      <Label>Best Partners</Label>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              background: "#fff",
            }}
          >
            <div>
              <div style={{ font: "800 14px var(--body)" }}>
                <PlayerLink
                  playerId={r.id}
                  name={r.name}
                  onOpenPlayer={onOpenPlayer}
                />
              </div>
              <div style={{ font: "500 12px var(--body)", color: C.mute }}>
                {r.matches} matches
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ font: "800 14px var(--body)" }}>
                {r.wins}W - {r.losses}L
              </div>
              <div style={{ color: C.limeDk }}>
                {Math.round((r.wins / r.matches) * 100)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
function FormatToggle({ format, setFormat }) {
  return (
    <Card style={{ marginBottom: 14 }} pad={10}>
      <div style={{ display: "flex", gap: 8 }}>
        {["singles", "doubles"].map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            style={{
              border: "none",
              borderRadius: 99,
              padding: "9px 14px",
              cursor: "pointer",
              background: format === f ? C.indigo : "transparent",
              color: format === f ? "#fff" : C.mute,
              font: "800 13px var(--body)",
              textTransform: "capitalize",
            }}
          >
            {f}
          </button>
        ))}
      </div>
    </Card>
  );
}

function PlayerLink({ playerId, name, onOpenPlayer, style }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (playerId) onOpenPlayer?.(playerId);
      }}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: playerId ? "pointer" : "default",
        font: "800 14px var(--body)",
        color: C.indigo,
        textAlign: "left",
        ...style,
      }}
    >
      {name || "Unknown player"}
    </button>
  );
}

// § RECENT ACTIVITY FEED -----------------------------------------------------
// Compact, glanceable list of a player's latest matches across BOTH sports.
// "You beat Priya 21–15 · +18" — gives the dashboard a reason to revisit.
const RecentActivityFeed = React.memo(function RecentActivityFeed({
  playerId,
  isMe,
  players,
  onOpenPlayer,
  refreshKey,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("match_players")
      .select(
        `*, matches ( id, sport, format, team1_score, team2_score, winner, played_at )`
      )
      .eq("player_id", playerId);
    if (error) {
      setItems([]);
      setLoading(false);
      return;
    }
    const mine = (data || [])
      .filter((r) => r.matches)
      .sort(
        (a, b) =>
          new Date(b.matches?.played_at || 0) -
          new Date(a.matches?.played_at || 0)
      )
      .slice(0, 20);

    const matchIds = mine.map((r) => r.match_id);
    let others = [];
    if (matchIds.length) {
      const { data: op } = await supabase
        .from("match_players")
        .select(`match_id, player_id, team, players ( id, name )`)
        .in("match_id", matchIds);
      others = op || [];
    }

    const nameOf = (id) =>
      players.find((p) => p.id === id)?.name ||
      others.find((o) => o.player_id === id)?.players?.name ||
      "Unknown";

    const built = mine.map((r) => {
      const opp = others.filter(
        (o) => o.match_id === r.match_id && o.team !== r.team
      );
      const oppNames = opp.map((o) => o.players?.name || nameOf(o.player_id));
      const myScore =
        r.team === 1 ? r.matches.team1_score : r.matches.team2_score;
      const oppScore =
        r.team === 1 ? r.matches.team2_score : r.matches.team1_score;
      return {
        id: r.match_id,
        won: r.won,
        sport: r.matches.sport,
        oppNames,
        oppIds: opp.map((o) => o.player_id),
        myScore,
        oppScore,
        delta: r.rating_delta || 0,
        playedAt: r.matches.played_at,
      };
    });
    setItems(built);
    setLoading(false);
  }, [playerId, players]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading)
    return (
      <Card style={{ marginBottom: 14 }}>
        <Label color={C.skyDk}>Recent activity</Label>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 14,
                border: `1px solid ${C.line}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <Skeleton h={13} w="60%" />
                <Skeleton h={10} w="40%" style={{ marginTop: 6 }} />
              </div>
              <Skeleton h={18} w={34} r={6} />
            </div>
          ))}
        </div>
      </Card>
    );
  if (!items.length) {
    if (!isMe) return null;
    return (
      <Card style={{ marginBottom: 14 }}>
        <Label color={C.skyDk}>Recent activity</Label>
        <div style={{ textAlign: "center", padding: "18px 8px 6px" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🏸</div>
          <div style={{ font: "700 15px var(--body)", color: C.ink }}>
            No matches yet
          </div>
          <p
            style={{
              font: "400 13px/1.5 var(--body)",
              color: C.mute,
              margin: "6px auto 0",
              maxWidth: 240,
            }}
          >
            Log your first game to start building your rating and climbing the
            ladder.
          </p>
        </div>
      </Card>
    );
  }

  const subject = isMe ? "You" : "They";
  const VISIBLE = 5;
  const hasMore = items.length > VISIBLE;

  return (
    <Card style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Label color={C.skyDk}>Recent activity</Label>
        {hasMore && (
          <span style={{ font: "600 11px var(--body)", color: C.mute }}>
            scroll for more ↓
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gap: 8,
          marginTop: 12,
          // show ~5 rows, then scroll the rest within the card
          maxHeight: hasMore ? 5 * 60 : "none",
          overflowY: hasMore ? "auto" : "visible",
          paddingRight: hasMore ? 4 : 0,
        }}
      >
        {items.map((m, i) => (
          <div
            key={`${m.id}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 14,
              background: m.won
                ? "linear-gradient(135deg,#fff,#F0FBD9)"
                : "linear-gradient(135deg,#fff,#FFE9E6)",
              border: `1px solid ${C.line}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "700 13px var(--body)", color: C.ink }}>
                <span style={{ color: m.won ? C.limeDk : C.coralDk }}>
                  {subject} {m.won ? "beat" : "lost to"}
                </span>{" "}
                {m.oppNames.map((n, j) => (
                  <span key={j}>
                    {j > 0 && " & "}
                    {onOpenPlayer && m.oppIds[j] ? (
                      <button
                        onClick={() => onOpenPlayer(m.oppIds[j])}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "700 13px var(--body)",
                          color: C.indigo,
                          cursor: "pointer",
                        }}
                      >
                        {n}
                      </button>
                    ) : (
                      n
                    )}
                  </span>
                ))}
              </div>
              <div style={{ font: "500 11px var(--body)", color: C.mute }}>
                {m.sport === "badminton" ? "🏸" : "🥒"} {m.myScore}–{m.oppScore}
                {m.playedAt
                  ? ` · ${new Date(m.playedAt).toLocaleDateString()}`
                  : ""}
              </div>
            </div>
            <span
              style={{
                font: "800 13px var(--display)",
                color:
                  m.delta > 0 ? C.limeDk : m.delta < 0 ? C.coralDk : C.mute,
                whiteSpace: "nowrap",
              }}
            >
              {m.delta > 0 ? "+" : ""}
              {m.delta}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
});

// § PROFILE ------------------------------------------------------------------
// Player profile: ratings, reliability, badges, sports summary, road to Verified
// § SHAREABLE RATING CARD ----------------------------------------------------
// Builds a branded PNG of the player's rating and shares (mobile) or downloads
// (desktop). Pure SVG → canvas → PNG, so it needs no libraries and works offline.
function buildRatingCardSVG({
  name,
  handle,
  rating,
  tierName,
  sport,
  city,
  verified,
}) {
  const isP = String(sport).toLowerCase() === "pickleball";
  const accent = isP ? "#FF6B5E" : "#A6E22E";
  const accentDk = isP ? "#E8503F" : "#6FA00A";
  // Emoji do not rasterize reliably inside canvas-drawn SVG on mobile (they
  // come out as tofu boxes), so the card text stays emoji-free.
  const sportLabel = isP ? "Pickleball" : "Badminton";
  const initial = (name || "?").trim()[0]?.toUpperCase() || "?";
  const safe = (s) =>
    String(s ?? "").replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
    );

  // 1080x1080 — ideal for Instagram / WhatsApp status.
  // NOTE: width/height AND viewBox are all required for iOS Safari to give the
  // <img> a non-zero naturalWidth when this SVG is rasterized onto a canvas.
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#241B3A"/>
      <stop offset="1" stop-color="#3A2D5C"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="16%" r="60%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#glow)"/>
  <rect x="0" y="1060" width="1080" height="20" fill="${accent}"/>

  <!-- brand -->
  <g transform="translate(72,84)">
    <rect x="0" y="0" width="64" height="64" rx="18" fill="#2A2046" stroke="${accent}" stroke-width="2"/>
    <g transform="translate(32,32)">
      <g transform="rotate(-32)"><ellipse cx="0" cy="-12" rx="9" ry="12" fill="none" stroke="${accent}" stroke-width="3.5"/><line x1="0" y1="-1" x2="0" y2="20" stroke="${accent}" stroke-width="3.5" stroke-linecap="round"/></g>
      <g transform="rotate(32)"><rect x="-9" y="-24" width="18" height="22" rx="8" fill="#FF6B5E"/><rect x="-3" y="-4" width="6" height="24" rx="3" fill="#FF6B5E"/></g>
    </g>
    <text x="84" y="44" font-family="Verdana, sans-serif" font-weight="700" font-size="38" fill="#FFF8EC">Rally<tspan fill="${accent}">Rank</tspan></text>
  </g>

  <!-- avatar initial -->
  <circle cx="540" cy="340" r="92" fill="${accent}"/>
  <text x="540" y="372" text-anchor="middle" font-family="Verdana, sans-serif" font-weight="800" font-size="92" fill="#241B3A">${safe(
    initial
  )}</text>

  <!-- name + handle -->
  <text x="540" y="500" text-anchor="middle" font-family="Verdana, sans-serif" font-weight="800" font-size="58" fill="#FFF8EC">${safe(
    name
  )}</text>
  <text x="540" y="548" text-anchor="middle" font-family="Verdana, sans-serif" font-size="30" fill="#B6A9D6">${safe(
    handle
  )}${city ? " · " + safe(city) : ""}</text>

  <!-- big rating -->
  <text x="540" y="760" text-anchor="middle" font-family="Verdana, sans-serif" font-weight="800" font-size="200" fill="${accent}">${safe(
    Number(rating || 4500).toLocaleString()
  )}</text>
  <text x="540" y="690" text-anchor="middle" font-family="Verdana, sans-serif" font-weight="700" font-size="30" fill="#B6A9D6" letter-spacing="6">${sportLabel.toUpperCase()} RATING</text>

  <!-- tier + status pills -->
  <g transform="translate(540,840)">
    <rect x="-220" y="0" width="200" height="64" rx="32" fill="#2A2046" stroke="${accentDk}" stroke-width="2"/>
    <text x="-120" y="42" text-anchor="middle" font-family="Verdana, sans-serif" font-weight="700" font-size="30" fill="${accent}">${safe(
    tierName
  )}</text>
    <rect x="20" y="0" width="200" height="64" rx="32" fill="${
      verified ? accent : "#2A2046"
    }" stroke="${verified ? accent : "#FFC24B"}" stroke-width="2"/>
    <text x="120" y="42" text-anchor="middle" font-family="Verdana, sans-serif" font-weight="700" font-size="28" fill="${
      verified ? "#241B3A" : "#FFC24B"
    }">${verified ? "VERIFIED" : "PROVISIONAL"}</text>
  </g>

  <text x="540" y="1000" text-anchor="middle" font-family="Verdana, sans-serif" font-size="26" fill="#8A7FA6">rallyrank.pro · track your game</text>
</svg>`.trim();
}

async function shareRatingCard(player, sport) {
  try {
    const dd = player[sport] || {};
    // Show the player's stronger format — it's the one worth flexing.
    const rating = Math.max(dd.singles || 0, dd.doubles || 0) || 4500;
    const t = TIER(rating);
    const verified = isVerified(dd.games || 0, dd.opponents || 0);
    // Flag emoji don't rasterize reliably on mobile canvas, so keep it text-only.
    const cityLine = player.city || "";
    const svg = buildRatingCardSVG({
      name: player.name,
      handle: player.handle
        ? `@${String(player.handle).replace(/^@/, "")}`
        : "",
      rating,
      tierName: t.name,
      sport,
      city: cityLine,
      verified,
    });

    // SVG → PNG via canvas.
    // iOS Safari is finicky here, so we: (1) encode the SVG as a data URL
    // (blob: URLs can fail to load into <img> on iOS), (2) prefer img.decode()
    // over onload (onload can fire before the SVG has intrinsic size on iOS),
    // (3) draw with EXPLICIT width/height rather than trusting naturalWidth
    // (which is often 0 for SVG on mobile), and (4) paint an opaque background
    // first so a failed/partial draw never yields a transparent or black PNG.
    const SIZE = 1080;
    const svgDataUrl =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

    const blob = await new Promise(async (resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      // Same-origin data URL, but setting this avoids tainting edge cases.
      img.crossOrigin = "anonymous";

      const render = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          // Opaque base layer — guarantees no transparent/black output.
          ctx.fillStyle = "#241B3A";
          ctx.fillRect(0, 0, SIZE, SIZE);
          // Explicit dest size so it works even when naturalWidth is 0.
          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
            "image/png"
          );
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => reject(new Error("render failed"));

      try {
        img.src = svgDataUrl;
        // decode() resolves only once the image is actually ready to paint.
        if (typeof img.decode === "function") {
          await img.decode();
          render();
        } else {
          img.onload = render;
        }
      } catch {
        // decode() can reject on some engines even when onload would succeed.
        img.onload = render;
      }
    });

    const file = new File([blob], "rallyrank-card.png", { type: "image/png" });

    // Native share on mobile if available (and can share files)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "My RallyRank",
        text: `My ${sport} rating on RallyRank — rallyrank.pro`,
      });
      return;
    }
    // Otherwise download it
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rallyrank-card.png";
    a.click();
    URL.revokeObjectURL(url);
    toast("Card downloaded — share it anywhere!", "success");
  } catch (e) {
    toast("Couldn't create the card, try again", "error");
  }
}

function Profile({
  me,
  setMe,
  sport,
  setSport,
  onEdit,
  events,
  players,
  clubs,
  reloadPlayers,
  onOpenEvent,
  onOpenPlayer,
}) {
  if (!me) return null;
  const dd = me[sport];
  const accent = sport === "badminton" ? C.limeDk : C.coralDk;
  const verified = isVerified(dd?.games || 0, dd?.opponents || 0);
  const rel = Math.min(
    100,
    Math.round(((dd?.games || 0) / 10) * 60 + ((dd?.opponents || 0) / 4) * 40)
  );
  const badges = computeBadges(me);
  const [profileTab, setProfileTab] = useState("overview");
  const [ratingRefreshKey, setRatingRefreshKey] = useState(0);
  const [statsFormat, setStatsFormat] = useState("singles");
  const [favCount, setFavCount] = useState(0);

  // home club + favorite count for the profile summary
  const homeClub = (clubs || []).find((c) => c.id === me.home_club_id);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!me?.id || me.id === "me") return;
      const { count } = await supabase
        .from("player_favorite_clubs")
        .select("club_id", { count: "exact", head: true })
        .eq("player_id", me.id);
      if (active) setFavCount(count || 0);
    })();
    return () => {
      active = false;
    };
  }, [me?.id]);

  // Profile completion checklist — drives onboarding engagement.
  const totalGames = (me.badminton?.games || 0) + (me.pickleball?.games || 0);
  const completion = [
    ["Name", !!me.name],
    ["City", !!me.city],
    ["Sport", !!(me.sports && me.sports.length)],
    ["Rating", !!(dd?.singles || dd?.doubles)],
    ["Profile photo", !!me.photo],
    ["Home club", !!me.home_club_id],
    ["First match", totalGames > 0],
  ];
  const completedCount = completion.filter(([, done]) => done).length;
  const completionPct = Math.round((completedCount / completion.length) * 100);

  // Events this player is registered for that are Live or check-in open
  const myActiveEvents = (events || []).filter((e) => {
    const isRegistered = e.registeredIds?.includes(me.id);
    if (!isRegistered) return false;

    if (e.finalized || e.status === "Completed" || e.status === "Cancelled") {
      return false;
    }

    if (!e.date) return false;

    const start = new Date(`${e.date}T${e.time || "00:00"}`).getTime();
    const durationMs =
      Number(e.duration_minutes || e.durationMinutes || 120) * 60000;
    const end = start + durationMs;
    const now = Date.now();

    const checkInWindowOpen = start - now <= 3600000 && now <= end;

    return (
      (e.status === "Live" || e.checkInOpen || checkInWindowOpen) && now <= end
    );
  });

  // If the player doesn't have this sport yet — show option to add & calibrate
  if (!dd)
    return (
      <div>
        {/* Active event banners still show even when sport is missing */}
        {myActiveEvents.map((e) => (
          <EventBanner
            key={e.id}
            event={e}
            onOpen={() => onOpenEvent?.(e.id)}
          />
        ))}
        <Card style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {sport === "pickleball" ? "🥒" : "🏸"}
          </div>
          <h2 style={{ font: "700 22px var(--display)", margin: "0 0 8px" }}>
            No {sport} rating yet
          </h2>
          <p
            style={{
              font: "400 14px/1.6 var(--body)",
              color: C.mute,
              margin: "0 0 20px",
              maxWidth: 340,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            You haven't added {sport} to your profile. You can add it any time —
            answer a quick self-assessment and you'll get a provisional starting
            rating.
          </p>
          <AddSportInline sport={sport} me={me} setMe={setMe} />
        </Card>
      </div>
    );

  return (
    <div>
      {/* Show live/check-in event banners at top of profile dashboard */}
      {myActiveEvents.map((e) => (
        <EventBanner key={e.id} event={e} onOpen={() => onOpenEvent?.(e.id)} />
      ))}
      {/* Identity banner */}{" "}
      <Card
        color={C.indigo}
        style={{ marginBottom: 14, position: "relative", overflow: "hidden" }}
        pad={26}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.6,
            background: `radial-gradient(400px 200px at 100% 0%,${accent}40,transparent)`,
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: 18,
                overflow: "hidden",
                background: me.photo
                  ? `center/cover url(${me.photo})`
                  : C.coral,
                display: "grid",
                placeItems: "center",
                font: "800 26px var(--display)",
                color: "#fff",
              }}
            >
              {!me.photo && me.name[0]}
            </div>
            <div>
              <h1
                style={{
                  font: "700 28px var(--display)",
                  color: "#fff",
                  margin: 0,
                }}
              >
                {me.name}
              </h1>
              <div
                style={{
                  font: "500 13px var(--body)",
                  color: C.muteOnDark,
                  marginTop: 2,
                }}
              >
                {me.handle} · {flagForCountry(me.country)} {me.city} ·{" "}
                {me.gbrId}
              </div>
              {(homeClub || favCount > 0) && (
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    gap: 14,
                    flexWrap: "wrap",
                    font: "600 13px var(--body)",
                    color: C.muteOnDark,
                  }}
                >
                  {homeClub && <span>🏠 {homeClub.name}</span>}
                  {favCount > 0 && (
                    <span>
                      ⭐ {favCount} favorite club{favCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              )}
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 7,
                  flexWrap: "wrap",
                }}
              >
                {(() => {
                  const [l, c] = ROLE_META[me.role] || ROLE_META.PLAYER;
                  return <Pill color={c}>{l}</Pill>;
                })()}
                <Pill color={verified ? C.lime : C.gold} dark>
                  {verified ? "VERIFIED ✓" : "PROVISIONAL"}
                </Pill>
                {me.club && (
                  <Pill color="#fff" bg="#ffffff22">
                    🏟️ {me.club}
                  </Pill>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <SportToggle sport={sport} setSport={setSport} sports={me.sports} />
            <Btn kind="sky" onClick={() => shareRatingCard(me, sport)}>
              📲 Share card
            </Btn>
            <Btn kind="lime" onClick={onEdit}>
              Edit profile
            </Btn>
          </div>
        </div>
      </Card>
      <Card style={{ marginBottom: 14 }} pad={10}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["overview", "Overview"],
            ["history", "History"],
            ["h2h", "Head-to-Head"],
            ["partners", "Partners"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setProfileTab(key)}
              style={{
                border: "none",
                borderRadius: 99,
                padding: "10px 18px",
                cursor: "pointer",
                background: profileTab === key ? C.indigo : "transparent",
                color: profileTab === key ? "#fff" : C.mute,
                font: "800 13px var(--body)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>
      {profileTab === "overview" && (
        <>
          {/* Profile completion — drives engagement; hides at 100% */}
          {completionPct < 100 && (
            <Card style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <Label color={accent}>Profile</Label>
                <span
                  style={{ font: "800 16px var(--display)", color: accent }}
                >
                  {completionPct}% complete
                </span>
              </div>
              <div
                style={{
                  height: 9,
                  background: C.butter2,
                  borderRadius: 99,
                  overflow: "hidden",
                  margin: "10px 0 14px",
                }}
              >
                <div
                  style={{
                    width: `${completionPct}%`,
                    height: "100%",
                    background: accent,
                    borderRadius: 99,
                    transition: "width .4s",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {completion.map(([label, done]) => (
                  <span
                    key={label}
                    style={{
                      font: "600 12px var(--body)",
                      color: done ? C.limeDk : C.mute,
                      background: done ? "#F0FBD9" : C.butter2,
                      padding: "5px 11px",
                      borderRadius: 99,
                    }}
                  >
                    {done ? "✓" : "○"} {label}
                  </span>
                ))}
              </div>
            </Card>
          )}
          {/* Badges row */}
          {badges.length > 0 && (
            <Card style={{ marginBottom: 14 }} color={C.butter2}>
              <Label color={C.mute}>Badges</Label>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                {badges.map((id) => {
                  const b = BADGE_DEFS.find((x) => x.id === id);
                  return b ? (
                    <div
                      key={id}
                      title={b.desc}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 12px",
                        background: "#fff",
                        borderRadius: 99,
                        border: `1px solid ${C.line}`,
                        cursor: "help",
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{b.emoji}</span>
                      <span
                        style={{ font: "700 12px var(--body)", color: C.ink }}
                      >
                        {b.label}
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            </Card>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 14,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 14 }}>
              {/* Header naming the currently selected sport, so the center
                  cards are never ambiguous against the secondary sport card. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{ font: "800 18px var(--display)", color: accent }}
                >
                  {sport === "badminton" ? "🏸 Badminton" : "🥒 Pickleball"}
                </span>
                <span style={{ font: "500 12px var(--body)", color: C.mute }}>
                  · your current sport
                </span>
              </div>
              {/* Singles + Doubles rating cards for the selected sport */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                {[
                  ["Singles", dd?.singles],
                  ["Doubles", dd?.doubles],
                ].map(([lab, val]) => {
                  const t = TIER(val || 4500);
                  const noGames = (dd?.games || 0) === 0;
                  return (
                    <Card
                      key={lab}
                      color={C.cream}
                      style={{ textAlign: "center" }}
                    >
                      <Label color={accent}>{lab}</Label>
                      <div
                        style={{
                          font: "700 40px var(--display)",
                          color: noGames ? C.mute : t.color,
                          margin: "6px 0",
                        }}
                      >
                        {(val || 4500).toLocaleString()}
                      </div>
                      {noGames ? (
                        <Pill color={C.mute} bg={C.butter2}>
                          Provisional
                        </Pill>
                      ) : (
                        <Pill color={t.color} bg={t.bg}>
                          {t.name}
                        </Pill>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* If the player has the OTHER sport too, show it compactly here
                  instead of a separate profile card lower down. */}
              {me.sports?.length > 1 &&
                (() => {
                  const other =
                    sport === "badminton" ? "pickleball" : "badminton";
                  const od = me[other];
                  if (!od) return null;
                  const otherLabel =
                    other === "badminton" ? "🏸 Badminton" : "🥒 Pickleball";
                  const otherAccent =
                    other === "badminton" ? C.limeDk : C.coralDk;
                })()}

              <RatingGraph
                playerId={me.id}
                sport={sport}
                format={statsFormat}
                currentRating={dd?.[statsFormat]}
                refreshKey={ratingRefreshKey}
              />
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {/* Reliability arc */}
              <Card style={{ textAlign: "center" }}>
                <ReliabilityArc pct={rel} accent={accent} />
                <p
                  style={{
                    font: "400 13px/1.55 var(--body)",
                    color: C.mute,
                    marginTop: 8,
                  }}
                >
                  {dd.games === 0
                    ? "Provisional. Record games to lock your rating in."
                    : `${dd.games} games · ${dd.opponents} opponents.`}
                </p>
              </Card>
              {/* Road to Verified — only until the player is verified */}
              {!verified ? (
                <Card>
                  <Label color={accent}>Road to Verified</Label>
                  <div style={{ marginTop: 12 }}>
                    {[
                      ["Games recorded", dd.games || 0, 10],
                      ["Different opponents", dd.opponents || 0, 4],
                    ].map(([l, cur, max]) => (
                      <div key={l} style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              font: "600 13px var(--body)",
                              color: C.ink,
                            }}
                          >
                            {l}
                          </span>
                          <span
                            style={{
                              font: "700 12px var(--body)",
                              color: C.mute,
                            }}
                          >
                            {Math.min(cur, max)}/{max}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 7,
                            background: C.butter2,
                            borderRadius: 99,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, (cur / max) * 100)}%`,
                              height: "100%",
                              background: accent,
                              borderRadius: 99,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    <p
                      style={{
                        font: "400 12px/1.5 var(--body)",
                        color: C.mute,
                      }}
                    >
                      10 games against 4+ different opponents → Verified ✓
                    </p>
                  </div>
                </Card>
              ) : (
                <Card style={{ textAlign: "center" }} color="#F0FBD9">
                  <div style={{ fontSize: 30, marginBottom: 6 }}>🎯</div>
                  <div
                    style={{
                      font: "800 16px var(--display)",
                      color: C.limeDk,
                    }}
                  >
                    Verified player
                  </div>
                  <p
                    style={{
                      font: "400 12px/1.5 var(--body)",
                      color: C.mute,
                      marginTop: 4,
                    }}
                  >
                    {dd.games} games · {dd.opponents} opponents. Your rating is
                    locked in.
                  </p>
                </Card>
              )}
              <RecentActivityFeed
                playerId={me.id}
                isMe={true}
                players={players}
                onOpenPlayer={onOpenPlayer}
                refreshKey={ratingRefreshKey}
              />
            </div>
          </div>
        </>
      )}
      {profileTab === "history" && (
        <MatchHistory
          playerId={me.id}
          defaultSport={sport}
          onOpenPlayer={onOpenPlayer}
        />
      )}
      {profileTab === "h2h" && (
        <>
          <FormatToggle format={statsFormat} setFormat={setStatsFormat} />
          <HeadToHead
            playerId={me.id}
            sport={sport}
            format={statsFormat}
            onOpenPlayer={onOpenPlayer}
          />
        </>
      )}
      {profileTab === "partners" && (
        <>
          <FormatToggle format={statsFormat} setFormat={setStatsFormat} />

          {statsFormat === "doubles" ? (
            <BestPartners
              playerId={me.id}
              sport={sport}
              format={statsFormat}
              onOpenPlayer={onOpenPlayer}
            />
          ) : (
            <Card>
              <Label>Partners</Label>
              <div
                style={{
                  marginTop: 12,
                  font: "500 13px var(--body)",
                  color: C.mute,
                }}
              >
                Partner stats are available for doubles only.
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
// § LADDERS ------------------------------------------------------------------
// Ranked leaderboard sortable by sport and format
function Ladders({ players, sport, setSport, onOpenPlayer }) {
  const [fmt, setFmt] = useState("singles");

  const ranked = useMemo(
    () =>
      [...players]
        .filter((p) => p && p[sport] && !p.banned && !p.merged_into)
        .sort((a, b) => b[sport][fmt] - a[sport][fmt]),
    [players, sport, fmt]
  );

  const medal = ["🥇", "🥈", "🥉"];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div>
          <Label>Live ladder · India</Label>
          <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 0" }}>
            Rankings
          </h1>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <SportToggle
            sport={sport}
            setSport={setSport}
            sports={["badminton", "pickleball"]}
          />

          <div
            style={{
              display: "inline-flex",
              background: "#fff",
              borderRadius: 99,
              padding: 4,
              gap: 4,
              border: `1px solid ${C.line}`,
            }}
          >
            {["singles", "doubles"].map((f) => (
              <button
                key={f}
                onClick={() => setFmt(f)}
                style={{
                  font: "700 14px var(--body)",
                  padding: "9px 15px",
                  borderRadius: 99,
                  cursor: "pointer",
                  border: "none",
                  textTransform: "capitalize",
                  background: fmt === f ? C.indigo : "transparent",
                  color: fmt === f ? "#fff" : C.mute,
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 9 }}>
        {ranked.length === 0 && (
          <Card style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
            <div style={{ font: "700 16px var(--body)", color: C.ink }}>
              No ranked players yet
            </div>
            <p
              style={{
                font: "400 13px/1.5 var(--body)",
                color: C.mute,
                margin: "6px auto 0",
                maxWidth: 280,
              }}
            >
              Once players log {sport} {fmt} games, the ladder fills up here. Be
              the first to play and claim the top spot.
            </p>
          </Card>
        )}
        {ranked.map((p, i) => {
          const r = p[sport][fmt];
          const t = TIER(r);
          const isMe = p.id === "me";
          const veri = isVerified(p[sport].games || 0, p[sport].opponents || 0);
          const reliability = Math.min(
            100,
            Math.round(
              ((p[sport]?.games || 0) / 10) * 60 +
                ((p[sport]?.opponents || 0) / 4) * 40
            )
          );

          return (
            <Card
              key={p.id}
              pad={0}
              style={{
                border: isMe ? `2px solid ${C.coral}` : `1px solid ${C.line}`,
                background:
                  i === 0
                    ? "linear-gradient(135deg, #FFF7CC, #fff)"
                    : i < 3
                    ? "linear-gradient(135deg, #FFF8EC, #fff)"
                    : "rgba(255,255,255,.78)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "42px 1fr auto auto 84px",
                  alignItems: "center",
                  gap: 13,
                  padding: "14px 18px",
                }}
              >
                <span
                  style={{
                    font: "800 17px var(--display)",
                    color: i < 3 ? C.ink : C.mute,
                  }}
                >
                  {medal[i] || i + 1}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AvatarBubble name={p.name} photo={p.photo} size={42} />

                  <div>
                    <div style={{ font: "800 14px var(--body)", color: C.ink }}>
                      <PlayerLink
                        playerId={p.id}
                        name={p.name}
                        onOpenPlayer={onOpenPlayer}
                      />

                      {isMe && (
                        <span
                          style={{
                            color: C.coralDk,
                            marginLeft: 7,
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        font: "600 11px var(--body)",
                        color: C.mute,
                        marginTop: 3,
                      }}
                    >
                      {flagForCountry(p.country)} {p.city || "Unknown city"} ·{" "}
                      {reliability}% reliable
                    </div>
                  </div>
                </div>

                <Pill
                  color={veri ? C.limeDk : C.gold}
                  bg={veri ? "#F0FBD9" : "#FFF3D6"}
                >
                  {veri ? "✓ Verified" : "Prov"}
                </Pill>

                <Pill color={t.color} bg={t.bg}>
                  {t.name}
                </Pill>

                <span
                  style={{
                    font: "800 20px var(--display)",
                    color: C.ink,
                    textAlign: "right",
                  }}
                >
                  {r.toLocaleString()}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Generates a short, human-friendly join/claim code.
function makeClubCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Owner-only panel on a club page: the invite link/QR, plus a "hand-off" claim
// link you generate when you pre-create a club and want to transfer it to the
// real owner. Collapsible so it doesn't clutter the page.
function ClubOwnerTools({ club, me, reloadClubs }) {
  const [open, setOpen] = useState(true);
  const [claimCode, setClaimCode] = useState(club.claim_code || null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const ensureClaimLink = async () => {
    // If a code already exists, reuse it; otherwise mint one and (best-effort)
    // mark the club unclaimed so the recipient can take ownership.
    setGenerating(true);
    try {
      let code = claimCode;
      if (!code) {
        code = makeClubCode();
        const { error } = await supabase
          .from("clubs")
          .update({ claim_code: code, claimed: false })
          .eq("id", club.id);
        if (
          error &&
          !/column .* does not exist|schema cache/i.test(error.message)
        )
          throw error;
        setClaimCode(code);
        await reloadClubs?.();
      }
      const link = clubClaimLink(club.id, code);
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        toast(`Claim link:\n${link}`, "info");
      }
    } catch (e) {
      toast("Couldn't create claim link: " + e.message, "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Label color={C.limeDk}>Owner tools — grow your club</Label>
        <span style={{ color: C.mute, font: "700 13px var(--body)" }}>
          {open ? "▲" : "▼"}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 16 }}>
          <SoftPanel style={{ marginBottom: 14 }}>
            <ClubInvitePanel clubId={club.id} clubName={club.name} />
          </SoftPanel>

          <div
            style={{
              borderTop: `1px solid ${C.line}`,
              paddingTop: 14,
            }}
          >
            <div
              style={{
                font: "700 13px var(--body)",
                color: C.ink,
                marginBottom: 4,
              }}
            >
              Hand this club to its owner
            </div>
            <p
              style={{
                font: "400 12px/1.6 var(--body)",
                color: C.mute,
                margin: "0 0 10px",
              }}
            >
              Pre-created this club for a venue you're onboarding? Generate a
              one-time claim link and send it to them — when they open it and
              sign in, ownership transfers to their account.
            </p>
            <Btn kind="ghost" onClick={ensureClaimLink} disabled={generating}>
              {generating
                ? "Working…"
                : copied
                ? "Claim link copied ✓"
                : claimCode
                ? "📋 Copy claim link"
                : "🔗 Generate claim link"}
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

// § CLUB ONBOARDING WIZARD ---------------------------------------------------
// A guided setup for a club owner: (1) identity, (2) invite link + QR — the
// headline payoff, (3) default session settings, (4) create the first event.
// Designed for the sales motion: an owner you've pitched finishes this with a
// shareable QR they can drop into their existing WhatsApp group immediately.
//
// Schema note: persists name/city/sport/description/emoji/admin_id (existing)
// plus default_format, default_sport, home_courts, claim_code, claimed (new —
// see the migration in the accompanying notes). Writes degrade gracefully: if
// a new column is missing, the insert is retried without the optional fields.
function ClubOnboarding({ me, existingClub, onDone, onCancel, reloadClubs }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [club, setClub] = useState(existingClub || null);
  const [f, setF] = useState({
    name: existingClub?.name || "",
    city: existingClub?.city || "",
    sport: existingClub?.sport || "Both",
    description: existingClub?.description || "",
    emoji: existingClub?.emoji || "🏸",
    default_format: existingClub?.default_format || "Doubles",
    default_sport:
      existingClub?.default_sport ||
      (existingClub?.sport === "Pickleball" ? "Pickleball" : "Badminton"),
    home_courts: existingClub?.home_courts || 4,
  });

  const EMOJI_CHOICES = [
    "🏸",
    "🥒",
    "🟣",
    "🔥",
    "⚡",
    "🏆",
    "🎯",
    "🦅",
    "🐉",
    "🌟",
  ];
  const steps = [
    "Identity",
    "Invite members",
    "Session defaults",
    "First event",
  ];

  // Create (or update) the club row. Returns the club object or null.
  const persistClub = async () => {
    const baseRow = {
      name: f.name.trim(),
      city: f.city || null,
      sport: f.sport,
      description: f.description || null,
      emoji: f.emoji || "🟣",
      admin_id: me.id,
    };
    const optional = {
      default_format: f.default_format,
      default_sport: f.default_sport,
      home_courts: Number(f.home_courts) || 4,
      claim_code: makeClubCode(),
      claimed: true, // self-serve creator owns it immediately
    };

    // Try full insert/update; if a new column doesn't exist yet, retry lean.
    const attempt = async (row) => {
      if (club?.id) {
        return supabase
          .from("clubs")
          .update(row)
          .eq("id", club.id)
          .select()
          .single();
      }
      return supabase.from("clubs").insert(row).select().single();
    };

    let { data, error } = await attempt({ ...baseRow, ...optional });
    if (
      error &&
      /column .* does not exist|unknown column|schema cache/i.test(
        error.message
      )
    ) {
      ({ data, error } = await attempt(baseRow)); // graceful fallback
    }
    if (error) {
      toast("Could not save club: " + error.message, "error");
      return null;
    }
    // Creator auto-joins as a member (ignore duplicate).
    await supabase
      .from("club_members")
      .insert({ club_id: data.id, player_id: me.id });
    return data;
  };

  const next = async () => {
    if (step === 0) {
      if (!f.name.trim()) {
        toast("Give your club a name first.", "error");
        return;
      }
      setBusy(true);
      const saved = await persistClub();
      setBusy(false);
      if (!saved) return;
      setClub(saved);
      await reloadClubs?.();
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      // Save the chosen defaults (best-effort; non-fatal if columns missing).
      setBusy(true);
      try {
        await supabase
          .from("clubs")
          .update({
            default_format: f.default_format,
            default_sport: f.default_sport,
            home_courts: Number(f.home_courts) || 4,
          })
          .eq("id", club.id);
      } catch {
        /* optional columns may not exist yet */
      }
      setBusy(false);
      await reloadClubs?.();
      setStep(3);
    }
  };

  const back = () => (step > 0 ? setStep(step - 1) : onCancel?.());

  const Stepper = () => (
    <div
      style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}
    >
      {steps.map((s, i) => (
        <div
          key={s}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            font: "700 12px var(--body)",
            color: i === step ? C.ink : i < step ? C.limeDk : C.mute,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 99,
              display: "grid",
              placeItems: "center",
              background: i < step ? C.lime : i === step ? C.ink : C.line,
              color: i === step ? "#fff" : i < step ? C.indigo : C.mute,
              font: "800 11px var(--body)",
            }}
          >
            {i < step ? "✓" : i + 1}
          </span>
          {s}
          {i < steps.length - 1 && (
            <span style={{ color: C.line, marginLeft: 2 }}>—</span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Card style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <Label color={C.limeDk}>
          {existingClub ? "Set up your club" : "New club"}
        </Label>
        <button
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.mute,
            font: "600 13px var(--body)",
          }}
        >
          Close
        </button>
      </div>
      <h2 style={{ font: "700 24px var(--display)", margin: "0 0 16px" }}>
        {steps[step]}
      </h2>
      <Stepper />

      {/* STEP 0 — IDENTITY */}
      {step === 0 && (
        <div>
          <Field label="Club name">
            <input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="e.g. Smashers Badminton Club"
              style={inp}
            />
          </Field>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="City">
              <input
                value={f.city}
                onChange={(e) => setF({ ...f, city: e.target.value })}
                placeholder="City"
                style={inp}
              />
            </Field>
            <Field label="Sport">
              <select
                value={f.sport}
                onChange={(e) => setF({ ...f, sport: e.target.value })}
                style={inp}
              >
                <option>Both</option>
                <option>Badminton</option>
                <option>Pickleball</option>
              </select>
            </Field>
          </div>
          <Field label="Club logo">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {EMOJI_CHOICES.map((em) => (
                <button
                  key={em}
                  onClick={() => setF({ ...f, emoji: em })}
                  style={{
                    fontSize: 22,
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    cursor: "pointer",
                    background: f.emoji === em ? C.lime : "#fff",
                    border: `2px solid ${f.emoji === em ? C.limeDk : C.line}`,
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Short description"
            hint="Optional — shown on your club page."
          >
            <textarea
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              rows={2}
              placeholder="Who you are, where you play, when you meet…"
              style={{ ...inp, resize: "vertical" }}
            />
          </Field>
        </div>
      )}

      {/* STEP 1 — INVITE (headline payoff) */}
      {step === 1 && club && (
        <div>
          <p
            style={{
              font: "400 14px/1.6 var(--body)",
              color: C.mute,
              margin: "0 0 16px",
            }}
          >
            This is the important bit. Share this link or QR with your existing
            members so they join <strong>{club.name}</strong> and start getting
            rated. A club fills up the moment you drop this in your group chat.
          </p>
          <SoftPanel>
            <ClubInvitePanel clubId={club.id} clubName={club.name} />
          </SoftPanel>
        </div>
      )}

      {/* STEP 2 — DEFAULTS */}
      {step === 2 && (
        <div>
          <p
            style={{
              font: "400 14px/1.6 var(--body)",
              color: C.mute,
              margin: "0 0 16px",
            }}
          >
            Set sensible defaults so creating each session takes seconds.
          </p>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Default sport">
              <select
                value={f.default_sport}
                onChange={(e) => setF({ ...f, default_sport: e.target.value })}
                style={inp}
              >
                <option>Badminton</option>
                <option>Pickleball</option>
              </select>
            </Field>
            <Field label="Default format">
              <select
                value={f.default_format}
                onChange={(e) => setF({ ...f, default_format: e.target.value })}
                style={inp}
              >
                <option>Doubles</option>
                <option>Singles</option>
              </select>
            </Field>
          </div>
          <Field label="Home courts" hint="How many courts you usually have.">
            <input
              type="number"
              min={1}
              max={20}
              value={f.home_courts}
              onChange={(e) => setF({ ...f, home_courts: e.target.value })}
              style={inp}
            />
          </Field>
        </div>
      )}

      {/* STEP 3 — FIRST EVENT */}
      {step === 3 && club && (
        <div>
          <div
            style={{
              textAlign: "center",
              padding: "8px 0 18px",
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
            <h3 style={{ font: "700 22px var(--display)", margin: "0 0 6px" }}>
              {club.name} is ready!
            </h3>
            <p
              style={{
                font: "400 14px/1.6 var(--body)",
                color: C.mute,
                maxWidth: 420,
                margin: "0 auto",
              }}
            >
              Clubs that run their first session in week one are the ones that
              stick. Create yours now — your defaults are already filled in.
            </p>
          </div>
          <SoftPanel style={{ marginBottom: 14 }}>
            <ClubInvitePanel clubId={club.id} clubName={club.name} />
          </SoftPanel>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn
              kind="lime"
              big
              onClick={() =>
                onDone?.({
                  club,
                  createEvent: true,
                  defaults: {
                    sport: f.default_sport,
                    format: f.default_format,
                    courts: Number(f.home_courts) || 4,
                  },
                })
              }
            >
              ➕ Create first session
            </Btn>
            <Btn
              kind="ghost"
              big
              onClick={() => onDone?.({ club, createEvent: false })}
            >
              I'll do it later
            </Btn>
          </div>
        </div>
      )}

      {/* NAV */}
      {step < 3 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 22,
          }}
        >
          <Btn kind="ghost" onClick={back} disabled={busy}>
            {step === 0 ? "Cancel" : "← Back"}
          </Btn>
          <Btn kind="primary" onClick={next} disabled={busy}>
            {busy
              ? "Saving…"
              : step === 1
              ? "Next — set defaults →"
              : step === 0
              ? "Create & continue →"
              : "Next →"}
          </Btn>
        </div>
      )}
    </Card>
  );
}

// § CLUBS --------------------------------------------------------------------
// Transfers ownership of a club to a player, validating a claim code. Used by
// the pre-created "claim your club" flow when you hand a club to an owner.
// Requires clubs.claim_code and clubs.claimed columns (see migration notes).
async function claimClubOwnership(clubId, code, playerId) {
  const { data: club, error } = await supabase
    .from("clubs")
    .select("id, admin_id, claim_code, claimed")
    .eq("id", clubId)
    .single();
  if (error || !club)
    return { ok: false, message: "That club link is no longer valid." };
  if (club.claimed)
    return { ok: false, message: "This club has already been claimed." };
  if (club.claim_code && String(club.claim_code) !== String(code))
    return { ok: false, message: "Invalid claim code for this club." };

  const { error: upErr } = await supabase
    .from("clubs")
    .update({ admin_id: playerId, claimed: true })
    .eq("id", clubId);
  if (upErr)
    return { ok: false, message: "Couldn't claim club: " + upErr.message };

  // Owner auto-joins as a member too (ignore duplicate).
  await supabase
    .from("club_members")
    .insert({ club_id: clubId, player_id: playerId });
  return { ok: true };
}

// Club list with search, join, admin dashboard, and host event button
function Clubs({
  me,
  clubs,
  setClubs,
  players,
  events,
  setMe,
  reloadPlayers,
  reloadClubs,
  goToEvents,
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(null); // club being viewed
  const [favorites, setFavorites] = useState([]); // club ids
  const [homeClubId, setHomeClubId] = useState(me?.home_club_id || null);
  const [f, setF] = useState({
    name: "",
    city: "",
    sport: "Both",
    description: "",
  });
  const canAdd = ["OWNER", "ORGANIZER", "CLUB_ADMIN"].includes(me.role);

  // load this player's favorite clubs
  useEffect(() => {
    let active = true;
    (async () => {
      if (!me?.id || me.id === "me") return;
      const { data } = await supabase
        .from("player_favorite_clubs")
        .select("club_id")
        .eq("player_id", me.id);
      if (active) setFavorites((data || []).map((r) => r.club_id));
    })();
    return () => {
      active = false;
    };
  }, [me?.id]);

  const setHomeClub = async (clubId) => {
    const next = homeClubId === clubId ? null : clubId;
    setHomeClubId(next);
    await supabase
      .from("players")
      .update({ home_club_id: next })
      .eq("id", me.id);
    setMe?.((prev) => (prev ? { ...prev, home_club_id: next } : prev));
    await reloadPlayers?.();
  };

  const toggleFavorite = async (clubId) => {
    if (favorites.includes(clubId)) {
      setFavorites((prev) => prev.filter((x) => x !== clubId));
      await supabase
        .from("player_favorite_clubs")
        .delete()
        .eq("player_id", me.id)
        .eq("club_id", clubId);
    } else {
      setFavorites((prev) => [...prev, clubId]);
      await supabase
        .from("player_favorite_clubs")
        .insert({ player_id: me.id, club_id: clubId });
    }
    await reloadClubs?.();
  };

  const filtered = clubs.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase())
  );
  const addClub = async () => {
    if (!f.name.trim()) return;
    const { data, error } = await supabase
      .from("clubs")
      .insert({
        name: f.name.trim(),
        city: f.city || null,
        sport: f.sport,
        description: f.description || null,
        emoji: "🟣",
        admin_id: me.id,
      })
      .select()
      .single();
    if (error) {
      alert("Could not create club: " + error.message);
      return;
    }
    // creator auto-joins
    await supabase
      .from("club_members")
      .insert({ club_id: data.id, player_id: me.id });
    setF({ name: "", city: "", sport: "Both", description: "" });
    setAdding(false);
    await reloadClubs?.();
  };

  const joinClub = async (id) => {
    if (clubs.find((c) => c.id === id)?.joined?.includes(me.id)) return;
    const { error } = await supabase
      .from("club_members")
      .insert({ club_id: id, player_id: me.id });
    if (error) {
      alert("Could not join club: " + error.message);
      return;
    }
    await reloadClubs?.();
  };

  if (selected) {
    const club = clubs.find((c) => c.id === selected);
    const members = players.filter((p) => club.joined?.includes(p.id));
    // Real stats from data
    const verifiedCount = members.filter((p) => {
      const b = p.badminton || {};
      const k = p.pickleball || {};
      return (
        isVerified(b.games || 0, b.opponents || 0) ||
        isVerified(k.games || 0, k.opponents || 0)
      );
    }).length;
    const clubEvents = (events || []).filter(
      (e) => !e.deleted_at && (e.clubId === club.id || e.club_id === club.id)
    );
    const upcomingEvents = clubEvents.filter(
      (e) =>
        e.status === "Upcoming" || e.status === "Open" || e.status === "Live"
    );
    // Top players by best rating across sports
    const topPlayers = [...members]
      .map((p) => ({
        p,
        best: Math.max(
          p.badminton?.singles || 0,
          p.badminton?.doubles || 0,
          p.pickleball?.singles || 0,
          p.pickleball?.doubles || 0
        ),
      }))
      .sort((a, b) => b.best - a.best)
      .slice(0, 5);
    // Recent activity: most recently played members
    const recentActivity = [...members]
      .map((p) => {
        const lp = Math.max(
          p.badminton?.lastPlayed
            ? new Date(p.badminton.lastPlayed).getTime()
            : 0,
          p.pickleball?.lastPlayed
            ? new Date(p.pickleball.lastPlayed).getTime()
            : 0
        );
        return { p, lp };
      })
      .filter((x) => x.lp > 0)
      .sort((a, b) => b.lp - a.lp)
      .slice(0, 5);

    const isHome = homeClubId === club.id;
    const isFav = favorites.includes(club.id);

    const StatBox = ({ label, value, color }) => (
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: "14px 12px",
          textAlign: "center",
          border: `1px solid ${C.line}`,
        }}
      >
        <div style={{ font: "800 26px var(--display)", color: color || C.ink }}>
          {value}
        </div>
        <div
          style={{
            font: "700 11px var(--body)",
            letterSpacing: ".05em",
            color: C.mute,
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          {label}
        </div>
      </div>
    );

    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          style={{
            font: "600 14px var(--body)",
            color: C.mute,
            background: "none",
            border: "none",
            cursor: "pointer",
            marginBottom: 14,
          }}
        >
          ← All clubs
        </button>
        <Card color={C.indigo} style={{ marginBottom: 14 }} pad={24}>
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 32, marginBottom: 6 }}>
                  {club.emoji}
                </div>
                <h1
                  style={{
                    font: "700 28px var(--display)",
                    color: "#fff",
                    margin: 0,
                  }}
                >
                  {club.name}
                  {isHome && (
                    <span style={{ fontSize: 18, marginLeft: 8 }}>🏠</span>
                  )}
                </h1>
                <div
                  style={{
                    font: "500 13px var(--body)",
                    color: C.muteOnDark,
                    marginTop: 3,
                  }}
                >
                  {flagForCountry(club.country)} {club.city} · {club.sport}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!club.joined?.includes(me.id) ? (
                  <Btn kind="lime" onClick={() => joinClub(club.id)}>
                    Join club
                  </Btn>
                ) : (
                  <Pill color={C.lime} dark>
                    Joined ✓
                  </Pill>
                )}
              </div>
            </div>

            {/* Home / Favorite controls */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => setHomeClub(club.id)}
                style={{
                  font: "700 13px var(--body)",
                  padding: "9px 14px",
                  borderRadius: 99,
                  border: "none",
                  cursor: "pointer",
                  background: isHome ? C.lime : "#ffffff22",
                  color: isHome ? C.indigo : "#fff",
                }}
              >
                🏠 {isHome ? "Home club" : "Set as home club"}
              </button>
              <button
                onClick={() => toggleFavorite(club.id)}
                style={{
                  font: "700 13px var(--body)",
                  padding: "9px 14px",
                  borderRadius: 99,
                  border: "none",
                  cursor: "pointer",
                  background: isFav ? C.gold : "#ffffff22",
                  color: isFav ? C.indigo : "#fff",
                }}
              >
                {isFav ? "⭐ Favorited" : "⭐ Add to favorites"}
              </button>
            </div>

            {club.description && (
              <p
                style={{
                  font: "400 14px var(--body)",
                  color: C.muteOnDark,
                  margin: "14px 0 0",
                }}
              >
                {club.description}
              </p>
            )}
          </div>
        </Card>

        {/* Owner tools: invite link/QR (always useful) + a hand-off claim link
            you can send when pre-creating a club for someone you've pitched. */}
        {club.adminId === me.id && (
          <ClubOwnerTools club={club} me={me} reloadClubs={reloadClubs} />
        )}

        {/* Real stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <StatBox label="Members" value={members.length} color={C.limeDk} />
          <StatBox label="Verified" value={verifiedCount} color={C.skyDk} />
          <StatBox label="Events" value={clubEvents.length} color={C.coralDk} />
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
        >
          {/* Top players */}
          <Card>
            <Label color={C.limeDk}>Top players</Label>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {topPlayers.length === 0 && (
                <p style={{ font: "400 13px var(--body)", color: C.mute }}>
                  No members yet.
                </p>
              )}
              {topPlayers.map(({ p, best }, i) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ font: "600 14px var(--body)", color: C.ink }}>
                    <span style={{ color: C.mute, marginRight: 6 }}>
                      {i + 1}.
                    </span>
                    {p.name}
                  </div>
                  <span
                    style={{ font: "800 13px var(--display)", color: C.ink }}
                  >
                    {best ? best.toLocaleString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent activity */}
          <Card>
            <Label color={C.skyDk}>Recent activity</Label>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {recentActivity.length === 0 && (
                <p style={{ font: "400 13px var(--body)", color: C.mute }}>
                  No recent matches.
                </p>
              )}
              {recentActivity.map(({ p, lp }) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ font: "600 14px var(--body)", color: C.ink }}>
                    {p.name}
                  </div>
                  <span style={{ font: "500 12px var(--body)", color: C.mute }}>
                    {new Date(lp).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Upcoming events */}
        <Card style={{ marginTop: 14 }}>
          <Label color={C.coralDk}>Upcoming events</Label>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {upcomingEvents.length === 0 && (
              <p style={{ font: "400 13px var(--body)", color: C.mute }}>
                No upcoming events for this club.
              </p>
            )}
            {upcomingEvents.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: `1px solid ${C.line}`,
                }}
              >
                <div style={{ font: "600 14px var(--body)", color: C.ink }}>
                  {e.name}
                </div>
                <span style={{ font: "500 12px var(--body)", color: C.mute }}>
                  {fmtDT(e.date, e.time)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <Label color={C.limeDk}>Community</Label>
          <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 0" }}>
            Clubs
          </h1>
        </div>
        {canAdd && (
          <Btn kind="lime" onClick={() => setAdding(!adding)}>
            {adding ? "Cancel" : "+ New club"}
          </Btn>
        )}
      </div>
      {adding && (
        <ClubOnboarding
          me={me}
          onCancel={() => setAdding(false)}
          reloadClubs={reloadClubs}
          onDone={async ({ club, createEvent }) => {
            setAdding(false);
            await reloadClubs?.();
            if (createEvent) {
              // Hand off to the Events tab to create the first session.
              goToEvents?.();
            } else {
              // Drop them onto the new club's page so the invite tools are handy.
              setSelected(club.id);
            }
          }}
        />
      )}
      <input
        value={search}
        placeholder="Search clubs by name or city…"
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...inp, marginBottom: 14 }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))",
          gap: 14,
        }}
      >
        {filtered.map((c) => {
          const joined = c.joined?.includes(me.id);
          return (
            <Card
              key={c.id}
              style={{ cursor: "pointer" }}
              onClick={() => setSelected(c.id)}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 26 }}>{c.emoji}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {homeClubId === c.id && (
                    <span title="Home club" style={{ fontSize: 16 }}>
                      🏠
                    </span>
                  )}
                  {favorites.includes(c.id) && (
                    <span title="Favorite" style={{ fontSize: 16 }}>
                      ⭐
                    </span>
                  )}
                  <Pill
                    color={c.sport === "Pickleball" ? C.coralDk : C.limeDk}
                    bg={c.sport === "Pickleball" ? "#FFE9E6" : "#F0FBD9"}
                  >
                    {c.sport}
                  </Pill>
                </div>
              </div>
              <div style={{ font: "700 18px var(--display)", color: C.ink }}>
                {c.name}
              </div>
              <div
                style={{
                  font: "500 12px var(--body)",
                  color: C.mute,
                  margin: "4px 0 14px",
                }}
              >
                {flagForCountry(c.country)} {c.city} · {c.members} members · ⭐{" "}
                {c.favorites || 0}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn
                  kind="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(c.id);
                  }}
                >
                  View
                </Btn>
                {!joined && (
                  <Btn
                    kind="dark"
                    onClick={(e) => {
                      e.stopPropagation();
                      joinClub(c.id);
                    }}
                  >
                    Join
                  </Btn>
                )}
                {joined && (
                  <Pill color={C.limeDk} bg="#F0FBD9">
                    Joined ✓
                  </Pill>
                )}
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <p style={{ font: "400 14px var(--body)", color: C.mute }}>
            No clubs found.
          </p>
        )}
      </div>
    </div>
  );
}

// § PLAYER DISCOVERY ---------------------------------------------------------
// Find players near your rating, send match requests or partner requests
function PlayerDiscovery({
  me,
  setMe,
  players,
  sport,
  setSport,
  reloadPlayers,
  onLogMatch,
}) {
  const [fmt, setFmt] = useState("singles");
  const [range, setRange] = useState(400); // ±rating window
  const [intent, setIntent] = useState("challenge"); // challenge | partner | mixer
  const [sent, setSent] = useState(new Set()); // IDs challenged this session
  const [savingAvail, setSavingAvail] = useState(false);
  const myRating = me?.[sport]?.[fmt] || 5000;

  // Am I currently marked available? (expiry in the future)
  const myAvailUntil = me?.available_until
    ? new Date(me.available_until).getTime()
    : 0;
  const iAmAvailable = myAvailUntil > Date.now();

  // Toggle my availability. On = available for 7 days; off = clears it.
  const toggleAvailable = async () => {
    setSavingAvail(true);
    const next = iAmAvailable
      ? null
      : new Date(Date.now() + 7 * 86400000).toISOString();
    const { error } = await supabase
      .from("players")
      .update({ available_until: next })
      .eq("id", me.id);
    if (error) {
      alert("Could not update availability: " + error.message);
    } else {
      setMe?.((prev) => (prev ? { ...prev, available_until: next } : prev));
      await reloadPlayers?.();
    }

    setSavingAvail(false);
  };

  const nearby = useMemo(
    () =>
      players
        .filter(
          (p) =>
            p.id !== me?.id &&
            !p.banned &&
            !p.merged_into &&
            p[sport] &&
            Math.abs((p[sport][fmt] || 4500) - myRating) <= range
        )
        .sort(
          (a, b) =>
            Math.abs((a[sport][fmt] || 4500) - myRating) -
            Math.abs((b[sport][fmt] || 4500) - myRating)
        ),
    [players, sport, fmt, myRating, range]
  );

  // Players who've raised their hand ("looking for a game") near my level.
  const availablePlayers = useMemo(() => {
    const now = Date.now();
    return players
      .filter(
        (p) =>
          p.id !== me?.id &&
          !p.banned &&
          !p.merged_into &&
          p[sport] &&
          p.available_until &&
          new Date(p.available_until).getTime() > now &&
          Math.abs((p[sport][fmt] || 4500) - myRating) <= range
      )
      .sort(
        (a, b) =>
          Math.abs((a[sport][fmt] || 4500) - myRating) -
          Math.abs((b[sport][fmt] || 4500) - myRating)
      )
      .slice(0, 3);
  }, [players, sport, fmt, myRating, range, me?.id]);

  const challenge = async (id) => {
    const ok = await sendMatchRequest({
      me,
      toPlayerId: id,
      sport,
      format: fmt,
      intent,
    });
    if (ok) {
      setSent((prev) => new Set([...prev, id]));
      // For a direct "challenge to a game", take the user straight to the
      // Log a match panel under Events, prefilled with this opponent.
      if (intent === "challenge") onLogMatch?.(id);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div>
          <Label>Find players</Label>
          <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 0" }}>
            Discover
          </h1>
        </div>
        <SportToggle
          sport={sport}
          setSport={setSport}
          sports={["badminton", "pickleball"]}
        />
      </div>

      {/* Incoming/outgoing challenge requests. Accepting a challenge jumps to
          the Log a match panel under Events with that opponent prefilled. */}
      <ChallengeInbox
        me={me}
        players={players}
        onPlayChallenge={(opponentId) => onLogMatch?.(opponentId)}
      />

      {/* "Looking for a game" availability toggle */}
      <Card style={{ marginBottom: 14 }} color={C.butter2}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ font: "800 15px var(--display)", color: C.ink }}>
              {iAmAvailable ? "🟢 You're looking for a game" : "Want a game?"}
            </div>
            <div
              style={{
                font: "500 12px var(--body)",
                color: C.mute,
                marginTop: 2,
              }}
            >
              {iAmAvailable
                ? `Other players can find you until ${new Date(
                    myAvailUntil
                  ).toLocaleDateString(undefined, {
                    weekday: "long",
                  })}. Re-up anytime.`
                : "Flag yourself as available and players near your level can challenge you. Auto-expires in a week."}
            </div>
          </div>
          <Btn
            kind={iAmAvailable ? "ghost" : "lime"}
            onClick={toggleAvailable}
            disabled={savingAvail}
          >
            {savingAvail
              ? "Saving…"
              : iAmAvailable
              ? "Turn off"
              : "I'm available"}
          </Btn>
        </div>
      </Card>

      {/* Matchmaking prompt: players near my level who are available now */}
      {availablePlayers.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <Label color={C.limeDk}>🎯 Ready to play near your level</Label>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {availablePlayers.map((p) => {
              const r = p[sport]?.[fmt] || 4500;
              const diff = Math.abs(r - myRating);
              const evenly = diff <= 120;
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 16,
                    background: "linear-gradient(135deg, #fff, #F0FBD9)",
                    border: `1px solid ${C.line}`,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 14px var(--body)", color: C.ink }}>
                      {p.name}{" "}
                      <span
                        style={{
                          font: "700 12px var(--body)",
                          color: C.mute,
                        }}
                      >
                        · {r.toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        font: "500 12px var(--body)",
                        color: evenly ? C.limeDk : C.mute,
                      }}
                    >
                      {evenly ? "Evenly matched" : `${diff} pts apart`} ·{" "}
                      {flagForCountry(p.country)} {p.city || "—"}
                    </div>
                  </div>
                  <Btn
                    kind="lime"
                    onClick={() => challenge(p.id)}
                    disabled={sent.has(p.id)}
                  >
                    {sent.has(p.id) ? "Sent ✓" : "Challenge"}
                  </Btn>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Your current rating summary */}
      <Card color={C.indigo} style={{ marginBottom: 14 }} pad={20}>
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <Label color={C.lime}>Your rating</Label>
              <div
                style={{
                  font: "700 44px/1 var(--display)",
                  color: "#fff",
                  letterSpacing: "-0.02em",
                }}
              >
                {myRating.toLocaleString()}
              </div>
              <div
                style={{
                  font: "500 13px var(--body)",
                  color: C.muteOnDark,
                  marginTop: 3,
                }}
              >
                {me?.name} · {flagForCountry(me?.country)} {me?.city} ·{" "}
                {sport === "badminton" ? "🏸" : "🥒"} {fmt}
              </div>
            </div>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {["challenge", "partner", "mixer"].map((k) => (
                <button
                  key={k}
                  onClick={() => setIntent(k)}
                  style={{
                    font: "700 13px var(--body)",
                    padding: "9px 16px",
                    borderRadius: 99,
                    cursor: "pointer",
                    border: "none",
                    background: intent === k ? C.lime : "#ffffff22",
                    color: intent === k ? C.indigo : "#fff",
                    textTransform: "capitalize",
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ font: "600 13px var(--body)", color: C.mute }}>
          Rating range ±{range}
        </span>
        {[200, 400, 600, 1000].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              font: "700 12px var(--body)",
              padding: "7px 14px",
              borderRadius: 99,
              cursor: "pointer",
              border: `2px solid ${range === r ? C.coral : C.line}`,
              background: range === r ? C.coral + "14" : "#fff",
              color: C.ink,
            }}
          >
            ±{r}
          </button>
        ))}
        <div
          style={{
            display: "inline-flex",
            background: "#fff",
            borderRadius: 99,
            padding: 3,
            gap: 3,
            border: `1px solid ${C.line}`,
          }}
        >
          {["singles", "doubles"].map((f) => (
            <button
              key={f}
              onClick={() => setFmt(f)}
              style={{
                font: "700 12px var(--body)",
                padding: "7px 13px",
                borderRadius: 99,
                cursor: "pointer",
                border: "none",
                textTransform: "capitalize",
                background: fmt === f ? C.indigo : "transparent",
                color: fmt === f ? "#fff" : C.mute,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {/* Player cards */}
      {nearby.length === 0 && (
        <Card style={{ textAlign: "center", padding: 36 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏸</div>
          <p style={{ font: "400 14px/1.6 var(--body)", color: C.mute }}>
            No players found within ±{range} of your rating. Try widening the
            range.
          </p>
        </Card>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
          gap: 12,
        }}
      >
        {nearby.map((p) => {
          const r = p[sport][fmt] || 4500,
            t = TIER(r),
            diff = r - myRating,
            quality = matchQuality(myRating, r, 200, p[sport].rd || 200);
          return (
            <Card key={p.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    background: t.color,
                    display: "grid",
                    placeItems: "center",
                    font: "800 18px var(--display)",
                    color: "#fff",
                  }}
                >
                  {p.name[0]}
                </div>
                <Pill color={t.color} bg={t.bg}>
                  {t.name}
                </Pill>
              </div>
              <div style={{ font: "700 17px var(--body)", color: C.ink }}>
                {p.name}
              </div>
              <div
                style={{
                  font: "500 12px var(--body)",
                  color: C.mute,
                  margin: "3px 0 10px",
                }}
              >
                {flagForCountry(p.country)} {p.city}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div>
                  <div
                    style={{ font: "800 24px var(--display)", color: C.ink }}
                  >
                    {r.toLocaleString()}
                  </div>
                  <div
                    style={{
                      font: "600 11px var(--body)",
                      color: diff > 0 ? C.coralDk : C.limeDk,
                    }}
                  >
                    {diff > 0
                      ? `+${diff} above you`
                      : `${Math.abs(diff)} below you`}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{ font: "700 18px var(--display)", color: C.ink }}
                  >
                    {quality}%
                  </div>
                  <div style={{ font: "600 10px var(--body)", color: C.mute }}>
                    match quality
                  </div>
                </div>
              </div>
              {/* Win probability for a match between current user and this player */}
              <div
                style={{
                  background: C.butter2,
                  borderRadius: 10,
                  padding: "8px 12px",
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  font: "600 12px var(--body)",
                }}
              >
                <span>You win probability</span>
                <b
                  style={{
                    color: winPct(myRating, r) >= 50 ? C.limeDk : C.coralDk,
                  }}
                >
                  {winPct(myRating, r)}%
                </b>
              </div>
              {sent.has(p.id) ? (
                <Pill color={C.limeDk} bg="#F0FBD9">
                  Request sent ✓
                </Pill>
              ) : (
                <Btn
                  kind={
                    intent === "partner"
                      ? "lime"
                      : intent === "mixer"
                      ? "sky"
                      : "primary"
                  }
                  full
                  onClick={async () => {
                    if (p.id === me.id) return;
                    await challenge(p.id);
                  }}
                >
                  {intent === "challenge"
                    ? "Challenge to a game"
                    : intent === "partner"
                    ? "Ask to partner"
                    : "Invite to mixer"}
                </Btn>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// § EVENTS LIST + CREATION ---------------------------------------------------
// Event list with browse, register, and host-event creation wizard
function EventsList({
  me,
  events,
  setEvents,
  players,
  reloadPlayers,
  reloadEvents,
  onOpen,
  logMatchOpponent,
  clearLogMatchOpponent,
  openLogPanelSignal,
}) {
  const [creating, setCreating] = useState(false);
  const [loggingMatch, setLoggingMatch] = useState(false);
  // If Discover sent us here with an opponent, open the log panel automatically.
  useEffect(() => {
    if (logMatchOpponent) setLoggingMatch(true);
  }, [logMatchOpponent]);
  // A match notification can also request the panel be opened (no opponent).
  useEffect(() => {
    if (openLogPanelSignal) setLoggingMatch(true);
  }, [openLogPanelSignal]);
  const canHost = true;
  const statusColor = {
    Live: C.coralDk,
    Open: C.limeDk,
    Upcoming: C.mute,
    Completed: "#B06BFF",
    Cancelled: C.red,
  };

  if (creating)
    return (
      <EventCreation
        me={me}
        players={players}
        onDone={async (ev) => {
          const { data, error } = await supabase
            .from("events")
            .insert({
              name: ev.name,
              sport: ev.sport,
              format: ev.format,
              type: ev.type,
              status: ev.status || "Open",
              date: ev.date,
              time: ev.time,
              venue: ev.venue || ev.club,
              courts: ev.courts,
              max_players: ev.maxPlayers,
              rounds: ev.rounds,
              description: ev.description,
            })
            .select()
            .single();
          console.log("EVENT INSERT DATA:", data);
          console.log("EVENT INSERT ERROR:", error);

          if (error) {
            console.error("Failed to create event:", error);
            alert(error.message);
            return;
          }

          const playerId = me.id === "me" ? null : me.id;

          if (!playerId) {
            alert("Please log out and sign in again before registering.");
            return;
          }

          await supabase.from("event_registrations").upsert({
            event_id: data.id,
            player_id: playerId,
          });

          setEvents((prev) => [
            {
              ...data,
              maxPlayers: data.max_players,
              registeredIds: [playerId],
              entrants: 1,
            },
            ...prev,
          ]);
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      />
    );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <Label>Play</Label>
          <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 0" }}>
            Events
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn
            kind={loggingMatch ? "ghost" : "lime"}
            onClick={() => {
              setLoggingMatch((v) => {
                const next = !v;
                if (!next) clearLogMatchOpponent?.();
                return next;
              });
            }}
          >
            {loggingMatch ? "Close" : "🏸 Log a match"}
          </Btn>
          {canHost && (
            <Btn kind="lime" onClick={() => setCreating(true)}>
              + Host event
            </Btn>
          )}
        </div>
      </div>

      {loggingMatch && (
        <div style={{ marginBottom: 18 }}>
          <LogCasualMatch
            me={me}
            players={players}
            sport={
              me?.sports?.[0] === "pickleball" ? "pickleball" : "badminton"
            }
            prefillOpponent={logMatchOpponent || ""}
            reloadPlayers={reloadPlayers}
            onLogged={() => {
              clearLogMatchOpponent?.();
            }}
          />
          <CasualMatchInbox
            me={me}
            players={players}
            reloadPlayers={reloadPlayers}
          />
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))",
          gap: 14,
        }}
      >
        {events
          .filter((e) => !e.deleted_at)
          .map((e) => {
            const reg = e.registeredIds?.includes(me.id);
            return (
              <Card
                key={e.id}
                style={{
                  borderTop: `4px solid ${
                    e.type === "Mixer" ? C.coral : C.lime
                  }`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Pill
                    color={e.type === "Mixer" ? C.coralDk : C.limeDk}
                    bg={e.type === "Mixer" ? "#FFE9E6" : "#F0FBD9"}
                  >
                    {e.type}
                  </Pill>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      font: "700 12px var(--body)",
                      color: statusColor[e.status] || C.mute,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 99,
                        background: statusColor[e.status] || C.mute,
                      }}
                    />
                    {e.status}
                  </span>
                </div>
                <div
                  style={{
                    font: "700 17px var(--display)",
                    color: C.ink,
                    lineHeight: 1.15,
                  }}
                >
                  {e.name}
                </div>
                <div
                  style={{
                    font: "500 12px var(--body)",
                    color: C.mute,
                    margin: "5px 0 10px",
                  }}
                >
                  {e.sport} · {e.format} · {fmtDT(e.date, e.time)} · {e.courts}{" "}
                  courts
                </div>
                <div
                  style={{
                    height: 7,
                    background: C.butter2,
                    borderRadius: 99,
                    overflow: "hidden",
                    marginBottom: 5,
                  }}
                >
                  <div
                    style={{
                      width: `${
                        ((e.registeredIds?.length || 0) / e.maxPlayers) * 100
                      }%`,
                      height: "100%",
                      background: e.type === "Mixer" ? C.coral : C.lime,
                    }}
                  />
                </div>
                <div
                  style={{
                    font: "600 11px var(--body)",
                    color: C.mute,
                    marginBottom: 12,
                  }}
                >
                  {e.registeredIds?.length || 0}/{e.maxPlayers} registered
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn
                    kind={e.status === "Live" ? "primary" : "dark"}
                    onClick={() => onOpen(e.id)}
                  >
                    {e.status === "Live"
                      ? "Enter →"
                      : e.status === "Completed"
                      ? "Results →"
                      : "View →"}
                  </Btn>
                  {e.status === "Open" && !reg && (
                    <Btn
                      kind="lime"
                      onClick={async () => {
                        const playerId = me.id === "me" ? null : me.id;

                        if (!playerId) {
                          alert(
                            "Please log out and sign in again before registering."
                          );
                          return;
                        }

                        const { error } = await supabase
                          .from("event_registrations")
                          .upsert({
                            event_id: e.id,
                            player_id: playerId,
                          });

                        if (error) {
                          alert(error.message);
                          return;
                        }

                        setEvents((prev) =>
                          prev.map((x) =>
                            x.id === e.id
                              ? {
                                  ...x,
                                  registeredIds: [
                                    ...(x.registeredIds || []),
                                    playerId,
                                  ],
                                }
                              : x
                          )
                        );
                      }}
                    >
                      Register
                    </Btn>
                  )}
                  {reg && e.status === "Open" && (
                    <Pill color={C.limeDk} bg="#F0FBD9">
                      Registered ✓
                    </Pill>
                  )}
                </div>
              </Card>
            );
          })}
        {events.length === 0 && (
          <p style={{ font: "400 14px var(--body)", color: C.mute }}>
            No events yet. Host one!
          </p>
        )}
      </div>
    </div>
  );
}

// § EVENT CREATION -----------------------------------------------------------
// Multi-step wizard for creating a tournament or mixer event
function EventCreation({ me, players, onDone, onCancel }) {
  const [step, setStep] = useState(0); // 0=details 1=organizers 2=review
  const [f, setF] = useState({
    name: "",
    sport: "Badminton",
    format: "Doubles",
    type: "Mixer",
    date: "",
    time: "18:00",
    club: "",
    courts: 2,
    maxPlayers: 16,
    rounds: 4,
    pickleTarget: 11,
    extraOrganizers: [],
    description: "",
  });
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const [orgSearch, setOrgSearch] = useState("");
  const orgMatches = players.filter(
    (p) =>
      p.id !== "me" && p.name.toLowerCase().includes(orgSearch.toLowerCase())
  );

  const finish = () => {
    const ev = {
      id: crypto.randomUUID(),
      inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      ...f,
      status: "Open",
      entrants: 1,
      checkInOpen: false,
      finalized: false,
      registeredIds: [],
      organizers: [],
      rounds_data: [],
      createdAt: Date.now(),
    };

    onDone(ev);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div>
          <Label>New event</Label>
          <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 0" }}>
            Host an event
          </h1>
        </div>
        <Btn kind="plain" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {["Details", "Organizers", "Review"].map((s, i) => (
          <div
            key={s}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 99,
                display: "grid",
                placeItems: "center",
                background:
                  step === i ? C.coral : i < step ? C.lime : C.butter2,
                color: step === i ? "#fff" : i < step ? C.indigo : C.mute,
                font: "800 12px var(--body)",
              }}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span
              style={{
                font: `${step === i ? 700 : 500} 13px var(--body)`,
                color: step === i ? C.ink : C.mute,
              }}
            >
              {s}
            </span>
            {i < 2 && <span style={{ color: C.line }}>→</span>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
          >
            <Field label="Event name" style={{ gridColumn: "1/-1" }}>
              <input
                value={f.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Friday Night Mixer"
                style={inp}
              />
            </Field>
            <Field label="Sport">
              <select
                value={f.sport}
                onChange={(e) => set({ sport: e.target.value })}
                style={inp}
              >
                <option>Badminton</option>
                <option>Pickleball</option>
              </select>
            </Field>
            <Field label="Format">
              <select
                value={f.format}
                onChange={(e) => set({ format: e.target.value })}
                style={inp}
              >
                <option>Doubles</option>
                <option>Singles</option>
              </select>
            </Field>
            <Field label="Event type">
              <select
                value={f.type}
                onChange={(e) => set({ type: e.target.value })}
                style={inp}
              >
                <option>Mixer</option>
                <option>Tournament</option>
              </select>
            </Field>
            <Field label="Club / venue">
              <input
                value={f.club}
                onChange={(e) => set({ club: e.target.value })}
                placeholder="Club or court name"
                style={inp}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={f.date}
                onChange={(e) => set({ date: e.target.value })}
                style={inp}
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                value={f.time}
                onChange={(e) => set({ time: e.target.value })}
                style={inp}
              />
            </Field>
            <Field label="Max players">
              <input
                type="number"
                min="4"
                max="128"
                step="4"
                value={f.maxPlayers}
                onChange={(e) =>
                  set({ maxPlayers: parseInt(e.target.value) || 16 })
                }
                style={inp}
              />
            </Field>
            <Field label="Number of courts">
              <input
                type="number"
                min="1"
                max="20"
                value={f.courts}
                onChange={(e) => set({ courts: parseInt(e.target.value) || 1 })}
                style={inp}
              />
            </Field>
            <Field label="Rounds">
              <input
                type="number"
                min="1"
                max="20"
                value={f.rounds}
                onChange={(e) => set({ rounds: parseInt(e.target.value) || 4 })}
                style={inp}
              />
            </Field>
            {f.sport === "Pickleball" && (
              <Field label="Points per game">
                <select
                  value={f.pickleTarget}
                  onChange={(e) =>
                    set({ pickleTarget: parseInt(e.target.value) })
                  }
                  style={inp}
                >
                  <option value={11}>11 points (standard)</option>
                  <option value={15}>15 points</option>
                  <option value={21}>21 points</option>
                </select>
              </Field>
            )}
            <Field
              label="Description (optional)"
              style={{ gridColumn: "1/-1" }}
            >
              <textarea
                value={f.description}
                onChange={(e) => set({ description: e.target.value })}
                rows={2}
                style={{ ...inp, resize: "vertical" }}
              />
            </Field>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 16,
            }}
          >
            <Btn kind="plain" onClick={onCancel}>
              Cancel
            </Btn>
            <Btn
              kind="primary"
              onClick={() => setStep(1)}
              disabled={!f.name.trim() || !f.date}
            >
              Next: Organizers →
            </Btn>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <Label>Extra organizers</Label>
          <Sub>
            Add players who can manage this event alongside you. They can enter
            scores and add players manually.
          </Sub>
          <input
            value={orgSearch}
            onChange={(e) => setOrgSearch(e.target.value)}
            placeholder="Search players to add as organizer…"
            style={{ ...inp, marginTop: 14, marginBottom: 10 }}
          />
          <div style={{ display: "grid", gap: 8 }}>
            {orgMatches.slice(0, 6).map((p) => {
              const added = f.extraOrganizers.includes(p.id);
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "11px 14px",
                    borderRadius: 13,
                    background: "#fff",
                    border: `1px solid ${C.line}`,
                  }}
                >
                  <div style={{ font: "700 14px var(--body)", color: C.ink }}>
                    {p.name}{" "}
                    <span
                      style={{ font: "500 12px var(--body)", color: C.mute }}
                    >
                      · {p.city}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      set({
                        extraOrganizers: added
                          ? f.extraOrganizers.filter((id) => id !== p.id)
                          : [...f.extraOrganizers, p.id],
                      })
                    }
                    style={{
                      font: "700 12px var(--body)",
                      color: added ? C.coralDk : C.limeDk,
                      background: added ? "#FFF3F1" : "#F0FBD9",
                      border: "none",
                      padding: "7px 14px",
                      borderRadius: 99,
                      cursor: "pointer",
                    }}
                  >
                    {added ? "Remove" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
          {f.extraOrganizers.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Label color={C.mute}>Added:</Label>
              <div
                style={{
                  display: "flex",
                  gap: 7,
                  flexWrap: "wrap",
                  marginTop: 6,
                }}
              >
                {f.extraOrganizers.map((id) => {
                  const p = players.find((x) => x.id === id);
                  return p ? (
                    <Pill key={id} color={C.limeDk} bg="#F0FBD9">
                      {p.name}
                    </Pill>
                  ) : null;
                })}
              </div>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 18,
            }}
          >
            <Btn kind="plain" onClick={() => setStep(0)}>
              ← Back
            </Btn>
            <Btn kind="primary" onClick={() => setStep(2)}>
              Review →
            </Btn>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <Label>Review your event</Label>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {[
              ["Name", f.name],
              ["Sport & format", `${f.sport} · ${f.format}`],
              ["Type", f.type],
              ["Date & time", fmtDT(f.date, f.time)],
              ["Club / venue", f.club || "TBD"],
              ["Max players", f.maxPlayers],
              ["Courts", f.courts],
              ["Rounds", f.rounds],
              f.sport === "Pickleball"
                ? ["Points per game", f.pickleTarget]
                : null,
              f.extraOrganizers.length > 0
                ? [
                    "Extra organizers",
                    f.extraOrganizers
                      .map((id) => players.find((p) => p.id === id)?.name || id)
                      .join(", "),
                  ]
                : null,
            ]
              .filter(Boolean)
              .map(([l, v]) => (
                <div
                  key={l}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "9px 0",
                    borderBottom: `1px solid ${C.line}`,
                  }}
                >
                  <span style={{ font: "600 13px var(--body)", color: C.mute }}>
                    {l}
                  </span>
                  <span style={{ font: "700 14px var(--body)", color: C.ink }}>
                    {v}
                  </span>
                </div>
              ))}
          </div>
          <p
            style={{
              font: "400 13px/1.5 var(--body)",
              color: C.mute,
              marginTop: 12,
            }}
          >
            ✅ Check-in opens automatically 1 hour before your event.
            Registration closes 5 minutes before start.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 18,
            }}
          >
            <Btn kind="plain" onClick={() => setStep(1)}>
              ← Back
            </Btn>
            <Btn kind="lime" onClick={finish}>
              Create event →
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

function ratingOf(player, sport, format) {
  const sportKey =
    String(sport).toLowerCase() === "pickleball" ? "pickleball" : "badminton";

  const formatKey =
    String(format).toLowerCase() === "singles" ? "singles" : "doubles";

  return player?.[sportKey]?.[formatKey] || 4500;
}

function computeRatingDelta(team1Rating, team2Rating, team1Won, scoreDiff) {
  const expected = eloExpected(team1Rating, team2Rating);
  const k = K_BASE * movMult(scoreDiff, team1Rating - team2Rating);

  return Math.round(k * ((team1Won ? 1 : 0) - expected));
}

// ── Feature 4: provisional players swing harder so they calibrate fast ──────
// reliability (games/opponents) maps to a K multiplier ~2.5x (brand new) down
// to 1x (verified).
function kFactorFor(playerStats) {
  const games = playerStats?.games || 0;
  const opponents = playerStats?.opponents || 0;
  const verified = games >= 10 && opponents >= 4;
  if (verified) return K_BASE;
  const progress = Math.min(1, (games / 10) * 0.6 + (opponents / 4) * 0.4);
  return Math.round(K_BASE * (2.5 - 1.5 * progress));
}

/* ── OPTIMIZED RATING ENGINE ────────────────────────────────────────────────
   Improvements over the old single-K Elo:
   1. RD-aware confidence: a player's own rating deviation (rd) scales how much
      THEY move; uncertain players move more, settled players move less. This is
      a lightweight Glicko-style idea without the full periodization.
   2. Opponent-confidence damping: beating a player whose rating is itself
      uncertain should move you less (their rating is noisy).
   3. Smarter margin-of-victory: uses a normalized margin (per the game's target
      score) and damps MOV on expected wins so blowouts vs weak players don't
      over-reward — while genuine upsets get a bonus.
   4. RD shrink: every rated game reduces a player's rd toward RD_MIN so the
      system grows more confident over time; the decay path re-inflates it.
   All deltas remain symmetric per match so the ladder stays zero-sum-ish.
   ──────────────────────────────────────────────────────────────────────────── */

// Normalized margin 0..1 from a final score given the game's nominal target.
function normalizedMargin(scoreA, scoreB, target = 21) {
  const diff = Math.abs((scoreA ?? 0) - (scoreB ?? 0));
  // a 2-point win ≈ 0.1, a target-point blowout ≈ 1.0
  return Math.max(0, Math.min(1, diff / Math.max(6, target)));
}

// MOV multiplier — GENTLE cap so blowouts move only modestly more than close
// wins. Margin band is ~1.0 (a 1-point nailbiter) up to ~1.3 (a blowout): a
// 21–10 win counts ~1.3× a 21–19 win, not 2×. Upset bonus is also damped so a
// big result still matters without letting score-padding inflate ratings.
function movMultiplier(margin, expectedForWinner) {
  // base 1.0..1.3 from margin (gentle: blowout ≈ 1.3× a close win)
  const base = 1.0 + margin * 0.3;
  // mild upset adjustment: underdog win nudges up, heavy-favorite win nudges
  // down, but kept tight so it never dominates the margin signal.
  const upset = 1 + (0.5 - expectedForWinner) * 0.3; // ~1.15 upset … ~0.85 expected
  return Math.max(0.7, Math.min(1.5, base * upset));
}

// rd → confidence multiplier for the player's OWN movement (0.6..1.6).
function selfConfidenceMult(rd) {
  const r = Math.max(RD_MIN, Math.min(RD_MAX, rd || 250));
  // high rd (uncertain) → move more; low rd (settled) → move less
  return 0.6 + ((r - RD_MIN) / (RD_MAX - RD_MIN)) * 1.0;
}

// rd → how much we trust the OPPONENT's rating (0.7..1.0). Beating a noisy
// opponent moves you a bit less.
function oppTrustMult(oppRd) {
  const r = Math.max(RD_MIN, Math.min(RD_MAX, oppRd || 250));
  return 1 - ((r - RD_MIN) / (RD_MAX - RD_MIN)) * 0.3;
}

// New rd after playing (shrinks toward RD_MIN as you accumulate games).
function shrinkRd(rd) {
  const r = rd || 250;
  return Math.max(RD_MIN, Math.round(r * 0.97));
}

// How much a match's source is trusted. Event matches are organizer-validated,
// so they move ratings fully; casual matches move slightly less, and a
// disputed/contested one least. Applied to the rating CHANGE only — never to
// verification progress (a game is a game for the games/opponents count).
const MATCH_TRUST = {
  event: 1.0,
  casual: 0.8, // confirmed casual
  disputed: 0.6, // auto-applied or under dispute
};
function trustFor(source) {
  return MATCH_TRUST[source] ?? 0.8;
}

// Core per-player delta. selfStats/oppStats carry { rd, games, opponents }.
// `trust` scales the magnitude by match source (see MATCH_TRUST). Note we keep
// SKILL (rating) and RELIABILITY (rd) separate: this returns the skill change;
// rd is updated elsewhere via shrinkRd. A new player can sit at a high rating
// while still being unreliable (high rd) until they play verified matches.
function ratingDelta({
  myRating,
  oppRating,
  iWon,
  scoreA,
  scoreB,
  target = 21,
  selfStats = {},
  oppStats = {},
  trust = 1.0,
}) {
  const expectedMe = eloExpected(myRating, oppRating);
  const expectedForWinner = iWon ? expectedMe : 1 - expectedMe;
  const margin = normalizedMargin(scoreA, scoreB, target);

  const K =
    kFactorFor(selfStats) *
    selfConfidenceMult(selfStats.rd) *
    oppTrustMult(oppStats.rd) *
    movMultiplier(margin, expectedForWinner) *
    trust;

  return Math.round(K * ((iWon ? 1 : 0) - expectedMe));
}

// One-sided delta using a per-player K factor. KEPT for backward compatibility
// (event finalize calls this); now routes through the optimized engine with
// neutral stats so behavior is at least as good as before.
function computeMatchDeltaWithK(rA, rB, aWon, scoreDiff, kA) {
  const eA = eloExpected(rA, rB);
  // approximate target from the score spread; default 21
  const K = kA * movMultiplier(Math.min(1, scoreDiff / 21), aWon ? eA : 1 - eA);
  return Math.round(K * ((aWon ? 1 : 0) - eA));
}

// ── Feature 4: inactivity rating decay ──────────────────────────────────────
const DECAY_BASELINE = 4500;
const DECAY_PER_MONTH = 8;
const DECAY_GRACE_DAYS = 45;
const DECAY_MAX = 120;

function decayedRating(rating, lastPlayedISO) {
  if (!lastPlayedISO) return { rating, decayed: 0 };
  const days = (Date.now() - new Date(lastPlayedISO).getTime()) / 86400000;
  if (days <= DECAY_GRACE_DAYS) return { rating, decayed: 0 };
  const months = (days - DECAY_GRACE_DAYS) / 30;
  const pull = Math.min(DECAY_MAX, Math.round(months * DECAY_PER_MONTH));
  const dir = rating > DECAY_BASELINE ? -1 : rating < DECAY_BASELINE ? 1 : 0;
  const newRating = clampR(rating + dir * pull);
  return { rating: newRating, decayed: rating - newRating };
}

// Applies decay to any stale ratings and writes the changed rows back.
// Safe to call once on load; only updates rows that actually moved.
async function applyInactivityDecay() {
  const { data: rows, error } = await supabase
    .from("ratings")
    .select("player_id, sport, format, rating, last_played");
  if (error || !rows) return;

  const updates = [];
  for (const r of rows) {
    const { rating, decayed } = decayedRating(r.rating, r.last_played);
    if (decayed !== 0) {
      updates.push({
        player_id: r.player_id,
        sport: r.sport,
        format: r.format,
        rating,
      });
    }
  }
  if (updates.length) {
    await supabase
      .from("ratings")
      .upsert(updates, { onConflict: "player_id,sport,format" });
  }
}

// ── Notifications: write one row per recipient ──────────────────────────────
async function notify(recipients, { actor, type, title, body, link, payload }) {
  const ids = (Array.isArray(recipients) ? recipients : [recipients]).filter(
    (r) => r && r !== "me" && r !== actor
  );
  if (!ids.length) return;
  const rows = ids.map((recipient) => ({
    recipient,
    actor: actor || null,
    type,
    title,
    body: body || null,
    link: link || null,
    payload: payload || null,
  }));
  await supabase.from("notifications").insert(rows);
}

function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter(Boolean))];
}

function getEventParticipantIds(event) {
  const ids = [];

  for (const round of event.rounds_data || []) {
    for (const game of round.games || []) {
      for (const p of game.team1 || []) {
        if (p?.id) ids.push(p.id);
      }

      for (const p of game.team2 || []) {
        if (p?.id) ids.push(p.id);
      }
    }
  }

  return uniqueIds(ids);
}

function getCasualMatchParticipantIds(match) {
  return uniqueIds([...(match.team_a_ids || []), ...(match.team_b_ids || [])]);
}

// ── Casual match (1v1 or 2v2): applies ratings IMMEDIATELY ──────────────────
// Logger finalizes the score; ratings move now. Other players can dispute,
// which flags for review and can reverse via reverseCasualMatch.
// Uses the optimized engine: team-average rating, RD-weighted partner split for
// doubles, MOV + upset weighting, and RD shrink.
async function applyCasualMatch(match, players) {
  const sport = String(match.sport).toLowerCase();
  const format = String(match.format).toLowerCase();
  const target = sport === "pickleball" ? match.pickle_target || 11 : 21;
  const byId = {};
  for (const p of players) byId[p.id] = p;

  const teamA = match.team_a_ids || [];
  const teamB = match.team_b_ids || [];
  if (!teamA.length || !teamB.length) {
    return { ok: false, message: "Match is missing players." };
  }

  const ratingFor = (id) => getRating(byId[id], sport, format);
  const statsFor = (id) => byId[id]?.[sport] || {};

  const rA = teamA.reduce((s, id) => s + ratingFor(id), 0) / teamA.length;
  const rB = teamB.reduce((s, id) => s + ratingFor(id), 0) / teamB.length;
  const aWon = match.winner === "a";
  const scoreA = match.score_a ?? 0;
  const scoreB = match.score_b ?? 0;

  const matchId =
    crypto?.randomUUID?.() ||
    `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const matchRows = [
    {
      id: matchId,
      event_id: null,
      sport,
      format,
      round_number: null,
      court: null,
      team1_score: scoreA,
      team2_score: scoreB,
      winner: aWon ? 1 : 2,
      played_at: new Date().toISOString(),
    },
  ];

  const matchPlayerRows = [];
  const historyRows = [];
  const ratingUpserts = {};
  const rdUpserts = {};
  const statBump = {};
  const snapshot = {}; // player_id -> { before, after } for dispute reversal

  // Compute the team's raw delta (as if a single averaged player), then split
  // it across partners weighted by their RD (more uncertain partner moves more).
  const applyTeam = (ids, teamRating, oppRating, won, oppIds, oppAvgRd) => {
    // team-level delta magnitude using averaged stats
    const teamStats = {
      rd: ids.reduce((s, id) => s + (statsFor(id).rd || 250), 0) / ids.length,
      games:
        ids.reduce((s, id) => s + (statsFor(id).games || 0), 0) / ids.length,
      opponents:
        ids.reduce((s, id) => s + (statsFor(id).opponents || 0), 0) /
        ids.length,
    };
    const teamDelta = ratingDelta({
      myRating: teamRating,
      oppRating,
      iWon: won,
      scoreA,
      scoreB,
      target,
      selfStats: teamStats,
      oppStats: { rd: oppAvgRd },
      // confirmed casual matches move ratings slightly less than events
      trust: trustFor(match.trust || "casual"),
    });

    // RD weights for the split (singles: trivially 1)
    const totalRd = ids.reduce((s, id) => s + (statsFor(id).rd || 250), 0);
    for (const id of ids) {
      const before = ratingFor(id);
      const myRd = statsFor(id).rd || 250;
      const share = ids.length === 1 ? 1 : (myRd / totalRd) * ids.length;
      const delta = Math.round(teamDelta * share);
      const after = clampR(before + delta);

      ratingUpserts[id] = after;
      rdUpserts[id] = shrinkRd(myRd);
      snapshot[id] = {
        before,
        after,
        won,
        rdBefore: myRd,
        rdAfter: shrinkRd(myRd),
      };

      if (!statBump[id]) statBump[id] = { games: 0, wins: 0, opps: new Set() };
      statBump[id].games += 1;
      if (won) statBump[id].wins += 1;
      oppIds.forEach((o) => statBump[id].opps.add(o));

      matchPlayerRows.push({
        match_id: matchId,
        player_id: id,
        team: teamRating === rA ? 1 : 2,
        won,
        rating_before: before,
        rating_after: after,
        rating_delta: after - before,
      });
      historyRows.push({
        player_id: id,
        sport,
        format,
        rating: after,
        match_id: matchId,
      });
    }
  };

  const rdAvg = (ids) =>
    ids.reduce((s, id) => s + (statsFor(id).rd || 250), 0) / ids.length;

  applyTeam(teamA, rA, rB, aWon, teamB, rdAvg(teamB));
  applyTeam(teamB, rB, rA, !aWon, teamA, rdAvg(teamA));

  const { error: mErr } = await supabase.from("matches").insert(matchRows);
  if (mErr) return { ok: false, message: mErr.message };
  await supabase.from("match_players").insert(matchPlayerRows);
  await supabase.from("rating_history").insert(historyRows);

  // Recompute games/wins/opponents from ground truth so the counts are exact
  // and symmetric with reversal (distinct opponents can't be a simple +1).
  const ratingRows = [];
  for (const [player_id, rating] of Object.entries(ratingUpserts)) {
    const stats = await recomputePlayerStats(player_id, sport, format);
    const cur = statsFor(player_id);
    ratingRows.push({
      player_id,
      sport,
      format,
      rating,
      rd: rdUpserts[player_id],
      games: stats ? stats.games : (cur.games || 0) + 1,
      wins: stats
        ? stats.wins
        : (cur.wins || 0) + (statBump[player_id]?.wins || 0),
      opponents: stats
        ? stats.opponents
        : (cur.opponents || 0) + (statBump[player_id]?.opps.size || 0),
      last_played: new Date().toISOString(),
    });
  }
  const { error: ratingErr } = await supabase
    .from("ratings")
    .upsert(ratingRows, { onConflict: "player_id,sport,format" });

  if (ratingErr) {
    console.error("Rating update failed:", ratingErr);
    // Roll back the rows we just inserted so the match isn't half-applied
    // (otherwise it would still show in the graph / recent activity).
    await supabase.from("rating_history").delete().eq("match_id", matchId);
    await supabase.from("match_players").delete().eq("match_id", matchId);
    await supabase.from("matches").delete().eq("id", matchId);
    return { ok: false, message: ratingErr.message };
  }

  return { ok: true, matchId, snapshot };
}

// Recompute a player's true games / wins / distinct-opponent count for a given
// sport+format by counting their remaining match_players rows. This is the
// ground-truth way to keep stats correct on BOTH add and reverse — distinct
// opponents in particular can't be done with ±1 since you may face the same
// person more than once. Returns { games, wins, opponents } or null on error.
async function recomputePlayerStats(playerId, sport, format) {
  // all match rows for this player...
  const { data: myRows, error } = await supabase
    .from("match_players")
    .select("match_id, won, team")
    .eq("player_id", playerId);
  if (error) return null;
  if (!myRows || !myRows.length) {
    return { games: 0, wins: 0, opponents: 0 };
  }

  const matchIds = myRows.map((r) => r.match_id);
  // restrict to matches of this sport+format
  const { data: matches } = await supabase
    .from("matches")
    .select("id, sport, format")
    .in("id", matchIds);
  const keep = new Set(
    (matches || [])
      .filter(
        (m) =>
          String(m.sport).toLowerCase() === sport &&
          String(m.format || "singles").toLowerCase() === format
      )
      .map((m) => m.id)
  );

  const mine = myRows.filter((r) => keep.has(r.match_id));
  const games = mine.length;
  const wins = mine.filter((r) => r.won).length;

  // distinct opponents: pull everyone in those matches on the OTHER team
  let opponents = 0;
  if (mine.length) {
    const { data: allInMatches } = await supabase
      .from("match_players")
      .select("match_id, player_id, team")
      .in(
        "match_id",
        mine.map((r) => r.match_id)
      );
    const myTeamByMatch = {};
    for (const r of mine) myTeamByMatch[r.match_id] = r.team;
    const oppSet = new Set();
    for (const r of allInMatches || []) {
      if (r.player_id === playerId) continue;
      if (r.team !== myTeamByMatch[r.match_id]) oppSet.add(r.player_id);
    }
    opponents = oppSet.size;
  }

  return { games, wins, opponents };
}

async function reverseRatedMatch(
  matchId,
  players,
  sport,
  format,
  snapshot = null
) {
  if (!matchId) return { ok: false, message: "No match id to reverse." };

  // Read the per-player rows for THIS match. Each carries the exact rating_delta
  // and win flag that were applied, so we can reverse precisely even if the
  // player has played more games since (deltas compose linearly).
  const { data: matchPlayers, error: mpReadErr } = await supabase
    .from("match_players")
    .select("*")
    .eq("match_id", matchId);

  if (mpReadErr) return { ok: false, message: mpReadErr.message };

  // Capture the rating restore per player first (uses delta subtraction), but
  // DON'T write games/wins/opponents yet — we delete rows then recompute those
  // from ground truth so the counts are exactly right.
  const affected = []; // { player_id, restoredRating }
  if (matchPlayers && matchPlayers.length) {
    for (const mp of matchPlayers) {
      const player = players.find((p) => p.id === mp.player_id);
      const current = player?.[sport] || {};
      const curRating = current[format] ?? current.singles ?? mp.rating_after;
      const delta =
        mp.rating_delta != null
          ? mp.rating_delta
          : (mp.rating_after || 0) - (mp.rating_before || 0);
      affected.push({
        player_id: mp.player_id,
        restoredRating: clampR((curRating ?? mp.rating_after) - delta),
      });
    }
  } else if (snapshot && Object.keys(snapshot).length > 0) {
    for (const [player_id, v] of Object.entries(snapshot)) {
      affected.push({ player_id, restoredRating: v.before });
    }
  } else {
    return { ok: false, message: "Nothing to reverse for this match." };
  }

  // Delete the match's derived rows FIRST so the recompute reflects the removal.
  const { error: histErr } = await supabase
    .from("rating_history")
    .delete()
    .eq("match_id", matchId);
  if (histErr) return { ok: false, message: histErr.message };

  const { error: mpErr } = await supabase
    .from("match_players")
    .delete()
    .eq("match_id", matchId);
  if (mpErr) return { ok: false, message: mpErr.message };

  const { error: matchErr } = await supabase
    .from("matches")
    .delete()
    .eq("id", matchId);
  if (matchErr) return { ok: false, message: matchErr.message };

  // Now write each player's restored rating + freshly recomputed counts.
  for (const a of affected) {
    const stats = await recomputePlayerStats(a.player_id, sport, format);
    const row = {
      player_id: a.player_id,
      sport,
      format,
      rating: a.restoredRating,
      last_played: new Date().toISOString(),
    };
    if (stats) {
      row.games = stats.games;
      row.wins = stats.wins;
    }
    const { error: ratingErr } = await supabase
      .from("ratings")
      .upsert(row, { onConflict: "player_id,sport,format" });
    if (ratingErr) return { ok: false, message: ratingErr.message };
  }

  return { ok: true };
}

async function refreshAfterRatingChange({
  reloadPlayers,
  reloadEvents,
  load,
  onLogged,
}) {
  await reloadPlayers?.();
  await reloadEvents?.();
  await load?.();
  await onLogged?.();
}

// ── Reverse an applied casual match (on a sustained dispute) ────────────────
// Restores each player's pre-match rating from the snapshot and decrements
// the stat bumps. Best-effort; leaves the matches row for the audit trail but
// rolls ratings back.
async function reverseCasualMatch(casualMatch, players) {
  const matchId = casualMatch.applied_match_id || casualMatch.match_id;
  const sport = String(casualMatch.sport).toLowerCase();
  const format = String(casualMatch.format || "singles").toLowerCase();
  if (!matchId) {
    return { ok: false, message: "No applied match to reverse." };
  }
  return reverseRatedMatch(
    matchId,
    players,
    sport,
    format,
    casualMatch.rating_snapshot
  );
}

// ── Feature 3: persisted challenge / partner / mixer request ────────────────
async function sendMatchRequest({ me, toPlayerId, sport, format, intent }) {
  if (!me?.id || me.id === "me") {
    alert("Please sign in again before sending requests.");
    return false;
  }
  const { error } = await supabase.from("match_requests").upsert(
    {
      from_player: me.id,
      to_player: toPlayerId,
      sport,
      format,
      intent,
      status: "pending",
    },
    { onConflict: "from_player,to_player,intent" }
  );
  if (error) {
    alert("Could not send request: " + error.message);
    return false;
  }
  await notify(toPlayerId, {
    actor: me.id,
    type: "challenge",
    title:
      intent === "partner"
        ? `${me.name} wants to partner`
        : intent === "mixer"
        ? `${me.name} invited you to a mixer`
        : `${me.name} challenged you`,
    body: `${sport} · ${format}`,
    link: "discover",
  });
  return true;
}

// ── Discover hub: log a casual game (1v1 or 2v2), applies ratings immediately ─
// The logger picks all players and the score, then finalizes. Ratings move now.
// Other players can dispute afterward (see CasualMatchInbox).
function LogCasualMatch({
  me,
  players,
  sport: sportProp,
  prefillOpponent,
  onLogged,
  reloadPlayers,
}) {
  // The logger chooses the sport explicitly (defaulting to the prop) so a game
  // is always recorded under the sport the user actually picked.
  const sportOptions = me?.sports?.length
    ? me.sports
    : ["badminton", "pickleball"];
  const [sport, setSport] = useState(
    sportProp && sportOptions.includes(sportProp) ? sportProp : sportOptions[0]
  );
  const [mode, setMode] = useState("singles"); // singles | doubles
  const [partnerId, setPartnerId] = useState("");
  const [opp1Id, setOpp1Id] = useState(prefillOpponent || "");
  const [opp2Id, setOpp2Id] = useState("");
  const [myScore, setMyScore] = useState("");
  const [oppScore, setOppScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (prefillOpponent) {
      setOpp1Id(prefillOpponent);
      setMode("singles");
    }
  }, [prefillOpponent]);

  const others = players.filter((p) => p.id !== me?.id && p.id !== "me");
  const pickList = (excludeIds) =>
    others.filter((p) => !excludeIds.includes(p.id));

  const reset = () => {
    setPartnerId("");
    setOpp1Id("");
    setOpp2Id("");
    setMyScore("");
    setOppScore("");
  };

  const submit = async () => {
    setError(null);
    if (!me?.id || me.id === "me") {
      setError("Please sign in again before logging a match.");
      return;
    }

    const teamA = mode === "doubles" ? [me.id, partnerId] : [me.id];
    const teamB = mode === "doubles" ? [opp1Id, opp2Id] : [opp1Id];

    if (teamA.some((x) => !x) || teamB.some((x) => !x)) {
      return setError("Pick all players.");
    }
    const everyone = [...teamA, ...teamB];
    if (new Set(everyone).size !== everyone.length) {
      return setError("A player can't appear twice.");
    }

    const a = parseInt(myScore),
      b = parseInt(oppScore);
    const isBadminton = sport === "badminton";
    const result = isBadminton
      ? validateBadmintonScore(a, b)
      : validatePickleballScore(a, b, 11);
    if (!result.valid) return setError(result.error);

    setBusy(true);

    // Create a PENDING match. Ratings do NOT move yet — at least one of the
    // named opponents must accept first, so nobody can inflate their rating by
    // logging bogus games against people who never played.
    const winner = a > b ? "a" : "b";
    const { data: cm, error: insErr } = await supabase
      .from("casual_matches")
      .insert({
        sport,
        format: mode,
        submitted_by: me.id,
        opponent_id: teamB[0],
        team_a_ids: teamA,
        team_b_ids: teamB,
        score_a: a,
        score_b: b,
        winner,
        status: "pending",
        applied: false,
        applied_match_id: null,
        rating_snapshot: null,
      })
      .select()
      .single();

    if (insErr) {
      setBusy(false);
      return setError(insErr.message);
    }

    // Notify the opponents that they need to accept before ratings apply.
    const oppIds = teamB.filter((id) => id && id !== me.id);
    await notify(oppIds, {
      actor: me.id,
      type: "match_pending",
      title: `${me.name} logged a ${mode} match with you`,
      body: `${sport} · ${a}-${b}. Accept to confirm — ratings apply once you do.`,
      link: "discover",
      payload: { casual_match_id: cm.id },
    });

    await onLogged?.();

    setBusy(false);
    setDone(true);
    reset();
  };

  if (done)
    return (
      <Card style={{ marginBottom: 14 }}>
        <Label color={C.gold}>Match sent — waiting for confirmation ⏳</Label>
        <p
          style={{
            font: "400 13px/1.5 var(--body)",
            color: C.mute,
            margin: "8px 0 0",
          }}
        >
          Your opponent needs to accept this result before ratings update. This
          keeps bogus games from affecting anyone's rating.
        </p>
        <div style={{ marginTop: 12 }}>
          <Btn kind="ghost" onClick={() => setDone(false)}>
            Log another
          </Btn>
        </div>
      </Card>
    );

  const PlayerPicker = ({ label, value, setValue, exclude }) => (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={inp}
      >
        <option value="">Select…</option>
        {pickList(exclude).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <Card style={{ marginBottom: 14 }}>
      <Label color={C.coralDk}>Log a casual game</Label>
      <p
        style={{
          font: "400 13px/1.5 var(--body)",
          color: C.mute,
          margin: "8px 0 14px",
        }}
      >
        Record a {sport} game you played outside an event. You enter the score
        and ratings update right away; other players can dispute if needed.
      </p>

      {/* sport toggle — pick which sport this game counts toward */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            font: "800 11px var(--body)",
            letterSpacing: ".06em",
            color: C.mute,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Sport
        </div>
        <div
          style={{
            display: "inline-flex",
            background: C.butter2,
            borderRadius: 99,
            padding: 4,
            gap: 4,
          }}
        >
          {[
            ["badminton", "🏸 Badminton"],
            ["pickleball", "🥒 Pickleball"],
          ]
            .filter(([k]) => sportOptions.includes(k))
            .map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSport(k)}
                style={{
                  font: "700 13px var(--body)",
                  padding: "8px 14px",
                  borderRadius: 99,
                  cursor: "pointer",
                  border: "none",
                  background: sport === k ? "#fff" : "transparent",
                  color: sport === k ? C.ink : C.mute,
                  boxShadow: sport === k ? "0 2px 8px rgba(0,0,0,.08)" : "none",
                }}
              >
                {l}
              </button>
            ))}
        </div>
      </div>

      {/* singles / doubles toggle */}
      <div
        style={{
          display: "inline-flex",
          background: C.butter2,
          borderRadius: 99,
          padding: 4,
          gap: 4,
          marginBottom: 14,
        }}
      >
        {[
          ["singles", "1v1 Singles"],
          ["doubles", "2v2 Doubles"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            style={{
              font: "700 13px var(--body)",
              padding: "8px 14px",
              borderRadius: 99,
              cursor: "pointer",
              border: "none",
              background: mode === k ? "#fff" : "transparent",
              color: mode === k ? C.ink : C.mute,
              boxShadow: mode === k ? "0 2px 8px rgba(0,0,0,.08)" : "none",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          alignItems: "start",
        }}
      >
        {/* Your side */}
        <div
          style={{
            background: C.butter,
            borderRadius: 14,
            padding: 12,
            border: `1px solid ${C.line}`,
          }}
        >
          <div
            style={{
              font: "800 12px var(--body)",
              color: C.limeDk,
              marginBottom: 8,
            }}
          >
            YOUR SIDE
          </div>
          <div
            style={{
              font: "600 13px var(--body)",
              color: C.ink,
              marginBottom: 8,
            }}
          >
            {me?.name} (you)
          </div>
          {mode === "doubles" && (
            <PlayerPicker
              label="Partner"
              value={partnerId}
              setValue={setPartnerId}
              exclude={[opp1Id, opp2Id]}
            />
          )}
        </div>

        {/* Opponent side */}
        <div
          style={{
            background: C.butter,
            borderRadius: 14,
            padding: 12,
            border: `1px solid ${C.line}`,
          }}
        >
          <div
            style={{
              font: "800 12px var(--body)",
              color: C.coralDk,
              marginBottom: 8,
            }}
          >
            OPPONENTS
          </div>
          <PlayerPicker
            label={mode === "doubles" ? "Opponent 1" : "Opponent"}
            value={opp1Id}
            setValue={setOpp1Id}
            exclude={[partnerId, opp2Id]}
          />
          {mode === "doubles" && (
            <PlayerPicker
              label="Opponent 2"
              value={opp2Id}
              setValue={setOpp2Id}
              exclude={[partnerId, opp1Id]}
            />
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginTop: 10,
        }}
      >
        <Field label="Your score">
          <input
            value={myScore}
            onChange={(e) => setMyScore(e.target.value)}
            type="number"
            min="0"
            max="30"
            style={inp}
          />
        </Field>
        <Field label="Their score">
          <input
            value={oppScore}
            onChange={(e) => setOppScore(e.target.value)}
            type="number"
            min="0"
            max="30"
            style={inp}
          />
        </Field>
      </div>

      {error && (
        <div
          style={{
            font: "600 12px var(--body)",
            color: C.red,
            marginBottom: 10,
          }}
        >
          ⚠️ {error}
        </div>
      )}
      <Btn kind="lime" full onClick={submit} disabled={busy}>
        {busy ? "Saving…" : "Finalize result — update ratings →"}
      </Btn>
    </Card>
  );
}

// ── Casual matches involving me: confirm-by-default, with dispute option ────
// Since ratings apply immediately, this is where the OTHER players can raise a
// dispute. The logger sees the status of their logged games here too.
function CasualMatchInbox({ me, players, reloadPlayers, onRatingsChanged }) {
  const [mine, setMine] = useState([]);
  const [disputes, setDisputes] = useState({}); // casual_match_id -> dispute row
  const [busyId, setBusyId] = useState(null);
  const [disputingId, setDisputingId] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!me?.id || me.id === "me") return;
    // matches where I'm on either side: pending (awaiting accept), applied, disputed
    const { data } = await supabase
      .from("casual_matches")
      .select("*")
      .in("status", ["pending", "applied", "disputed"])
      .order("created_at", { ascending: false })
      .limit(50);
    const involvingMe = (data || []).filter(
      (m) =>
        (m.team_a_ids || []).includes(me.id) ||
        (m.team_b_ids || []).includes(me.id)
    );
    setMine(involvingMe);

    // load open disputes for these
    const ids = involvingMe.map((m) => m.id);
    if (ids.length) {
      const { data: ds } = await supabase
        .from("match_disputes")
        .select("*")
        .in("casual_match_id", ids);
      const map = {};
      for (const d of ds || []) map[d.casual_match_id] = d;
      setDisputes(map);
    }
  }, [me?.id]);

  // Accept a pending match → NOW apply ratings. Only an opponent (not the
  // logger) can accept, so at least one named opponent confirms the game.
  const acceptMatch = async (m) => {
    setBusyId(m.id);

    const res = await applyCasualMatch({ ...m, pickle_target: 11 }, players);

    if (!res.ok) {
      alert("Could not apply match: " + res.message);
      setBusyId(null);
      return;
    }

    const { error } = await supabase
      .from("casual_matches")
      .update({
        status: "applied",
        applied: true,
        applied_match_id: res.matchId,
        rating_snapshot: res.snapshot,
        accepted_by: me.id,
      })
      .eq("id", m.id);

    if (error) {
      alert("Could not accept match: " + error.message);
      setBusyId(null);
      return;
    }

    await notify(
      [...(m.team_a_ids || []), ...(m.team_b_ids || [])].filter(
        (id) => id !== me.id
      ),
      {
        actor: me.id,
        type: "match_accepted",
        title: `${me.name} accepted the match`,
        body: `${m.sport} · ${m.score_a}-${m.score_b}. Ratings updated.`,
        link: "discover",
      }
    );

    setBusyId(null);
    await refreshAfterRatingChange({ reloadPlayers, load });
    onRatingsChanged?.();
  };

  const declineMatch = async (m) => {
    setBusyId(m.id);

    const { data: row, error: readErr } = await supabase
      .from("casual_matches")
      .select("*")
      .eq("id", m.id)
      .single();

    if (readErr || !row) {
      alert("Could not load match: " + (readErr?.message || "Not found"));
      setBusyId(null);
      return;
    }

    const appliedMatchId = row.applied_match_id || row.match_id;

    if (appliedMatchId) {
      const res = await reverseCasualMatch(row, players);

      if (!res.ok) {
        alert("Could not reverse rating: " + res.message);
        setBusyId(null);
        return;
      }
    }

    const { error: updateErr } = await supabase
      .from("casual_matches")
      .update({
        status: "declined",
        applied: false,
        // keep applied_match_id for audit; reverseRatedMatch deletes the real match rows
      })
      .eq("id", row.id);

    if (updateErr) {
      alert("Could not decline match: " + updateErr.message);
      setBusyId(null);
      return;
    }

    await notify(row.submitted_by, {
      actor: me.id,
      type: "match_declined",
      title: `${me.name} declined the match`,
      body: `${row.sport} · ${row.score_a}-${row.score_b}`,
      link: "discover",
    });

    setBusyId(null);
    await refreshAfterRatingChange({ reloadPlayers, load });
    onRatingsChanged?.();
  };

  useFocusRefresh(load, 45000);

  const nameOf = (id) =>
    players.find((p) => p.id === id)?.name || "Unknown player";

  const raiseDispute = async (m) => {
    if (!reason.trim()) return;
    setBusyId(m.id);
    await supabase.from("match_disputes").insert({
      casual_match_id: m.id,
      raised_by: me.id,
      reason: reason.trim(),
      status: "open",
    });
    await supabase
      .from("casual_matches")
      .update({ status: "disputed" })
      .eq("id", m.id);
    // notify everyone else on the match
    await notify([...(m.team_a_ids || []), ...(m.team_b_ids || [])], {
      actor: me.id,
      type: "disputed",
      title: `${me.name} disputed a result`,
      body: reason.trim(),
      link: "discover",
      payload: { casual_match_id: m.id },
    });
    setReason("");
    setDisputingId(null);
    setBusyId(null);
    await load();
  };

  // Either side can resolve: keep the result (close dispute) or reverse it.
  const resolve = async (m, keep) => {
    const d = disputes[m.id];
    setBusyId(m.id);
    if (!keep) {
      const matchId = m.applied_match_id || m.match_id;

      if (matchId) {
        const res = await reverseRatedMatch(
          matchId,
          players,
          String(m.sport).toLowerCase(),
          String(m.format || "singles").toLowerCase(),
          m.rating_snapshot
        );

        if (!res.ok) {
          alert("Could not reverse match: " + res.message);
          setBusyId(null);
          return;
        }
      }
    }
    await supabase
      .from("casual_matches")
      .update({
        status: keep ? "resolved_kept" : "resolved_reversed",
        applied: keep,
      })
      .eq("id", m.id);
    if (d) {
      await supabase
        .from("match_disputes")
        .update({
          status: keep ? "resolved_kept" : "resolved_reversed",
          resolved_by: me.id,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", d.id);
    }
    await notify([...(m.team_a_ids || []), ...(m.team_b_ids || [])], {
      actor: me.id,
      type: "dispute_resolved",
      title: keep
        ? "Dispute resolved — result kept"
        : "Dispute resolved — result reversed",
      body: `${m.sport} ${m.score_a}–${m.score_b}`,
      link: "discover",
    });
    setBusyId(null);

    await refreshAfterRatingChange({
      reloadPlayers,
      load,
    });

    onRatingsChanged?.();
  };

  if (!mine.length) return null;

  return (
    <Card style={{ marginBottom: 14 }} color={C.butter2}>
      <Label color={C.coralDk}>Your matches</Label>
      <p
        style={{
          font: "400 12px/1.5 var(--body)",
          color: C.mute,
          margin: "6px 0 0",
        }}
      >
        Pending matches need an opponent to accept before ratings move. Applied
        ones can be disputed if a score is wrong.
      </p>

      {mine.map((m) => {
        const iAmLogger = m.submitted_by === me.id;
        const teamA = m.team_a_ids || [];
        const teamB = m.team_b_ids || [];
        const aWon = m.winner === "a";
        const d = disputes[m.id];
        const isDisputed = m.status === "disputed";
        const isPending = m.status === "pending";
        // I can accept if I'm an opponent (on team B or A but not the logger)
        const iCanAccept =
          isPending &&
          !iAmLogger &&
          ([...teamA, ...teamB] || []).includes(me.id);

        return (
          <div
            key={m.id}
            style={{
              background: isDisputed
                ? "linear-gradient(135deg, #fff, #FFE9E6)"
                : isPending
                ? "linear-gradient(135deg, #fff, #FFF3DC)"
                : "linear-gradient(135deg, #fff, #FFF8EC)",
              border: `1px solid ${
                isDisputed ? C.coralDk : isPending ? C.gold : C.line
              }`,
              borderRadius: 20,
              padding: 16,
              boxShadow: "0 10px 24px rgba(36,27,58,.06)",
              marginTop: 10,
            }}
          >
            <div style={{ font: "700 14px var(--body)", color: C.ink }}>
              {teamA.map(nameOf).join(" & ")}{" "}
              <span style={{ color: C.mute }}>vs</span>{" "}
              {teamB.map(nameOf).join(" & ")}
            </div>
            <div
              style={{
                font: "500 13px var(--body)",
                color: C.mute,
                margin: "4px 0 8px",
              }}
            >
              {m.sport} · {m.score_a}–{m.score_b} ·{" "}
              {aWon
                ? teamA.map(nameOf).join(" & ")
                : teamB.map(nameOf).join(" & ")}{" "}
              won
              {iAmLogger && (
                <span style={{ color: C.limeDk }}> · you logged this</span>
              )}
            </div>

            {/* Pending: opponent accepts (applies ratings) or declines */}
            {isPending && (
              <div
                style={{
                  background: "#FFF8EC",
                  border: `1px solid ${C.gold}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  marginBottom: 4,
                }}
              >
                {iCanAccept ? (
                  <>
                    <div
                      style={{
                        font: "700 12px var(--body)",
                        color: C.ink,
                        marginBottom: 8,
                      }}
                    >
                      Did you play this match? Accept to apply ratings.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn
                        kind="lime"
                        onClick={() => acceptMatch(m)}
                        disabled={busyId === m.id}
                      >
                        {busyId === m.id
                          ? "Applying…"
                          : "Accept — apply ratings"}
                      </Btn>
                      <Btn
                        kind="ghost"
                        onClick={() => declineMatch(m)}
                        disabled={busyId === m.id}
                      >
                        Decline
                      </Btn>
                    </div>
                  </>
                ) : (
                  <div style={{ font: "600 12px var(--body)", color: C.mute }}>
                    ⏳ Waiting for an opponent to accept before ratings apply.
                  </div>
                )}
              </div>
            )}

            {isDisputed && (
              <div
                style={{
                  background: "#FFF3F1",
                  border: `1px solid ${C.coralDk}`,
                  borderRadius: 10,
                  padding: "8px 12px",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    font: "700 12px var(--body)",
                    color: C.coralDk,
                  }}
                >
                  Disputed{d?.raised_by ? ` by ${nameOf(d.raised_by)}` : ""}
                </div>
                {d?.reason && (
                  <div
                    style={{
                      font: "500 12px var(--body)",
                      color: C.ink,
                      marginTop: 3,
                    }}
                  >
                    “{d.reason}”
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Btn
                    kind="ghost"
                    onClick={() => resolve(m, true)}
                    disabled={busyId === m.id}
                  >
                    Keep result
                  </Btn>
                  <Btn
                    kind="red"
                    onClick={() => resolve(m, false)}
                    disabled={busyId === m.id}
                  >
                    Reverse it
                  </Btn>
                </div>
              </div>
            )}

            {!isDisputed && !isPending && disputingId === m.id && (
              <div style={{ marginBottom: 8 }}>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="What's wrong with this result?"
                  style={{ ...inp, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Btn
                    kind="red"
                    onClick={() => raiseDispute(m)}
                    disabled={busyId === m.id || !reason.trim()}
                  >
                    Submit dispute
                  </Btn>
                  <Btn
                    kind="plain"
                    onClick={() => {
                      setDisputingId(null);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Btn>
                </div>
              </div>
            )}

            {!isDisputed && !isPending && disputingId !== m.id && (
              <button
                onClick={() => {
                  setDisputingId(m.id);
                  setReason("");
                }}
                style={{
                  font: "700 12px var(--body)",
                  color: C.coralDk,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                ⚠️ Raise a dispute
              </button>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// ── Challenge / partner / mixer requests (persisted) ────────────────────────
// Accepting a "challenge" calls onPlayChallenge(opponentId, sport) so the
// Discover logger can prefill that opponent.
function ChallengeInbox({ me, players, onPlayChallenge }) {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);

  const load = useCallback(async () => {
    if (!me?.id || me.id === "me") return;
    const { data } = await supabase
      .from("match_requests")
      .select("*")
      .eq("status", "pending")
      .or(`to_player.eq.${me.id},from_player.eq.${me.id}`)
      .order("created_at", { ascending: false });
    setIncoming((data || []).filter((r) => r.to_player === me.id));
    setOutgoing((data || []).filter((r) => r.from_player === me.id));
  }, [me?.id]);

  useFocusRefresh(load, 45000);

  const nameOf = (id) =>
    players.find((p) => p.id === id)?.name || "Unknown player";

  const setStatus = async (r, status) => {
    await supabase.from("match_requests").update({ status }).eq("id", r.id);
    await notify(r.from_player, {
      actor: me.id,
      type: "challenge",
      title:
        status === "accepted"
          ? `${me.name} accepted your ${r.intent}`
          : `${me.name} declined your ${r.intent}`,
      body: `${r.sport} · ${r.format}`,
      link: "discover",
    });
    await load();
    if (status === "accepted" && r.intent === "challenge") {
      onPlayChallenge?.(r.from_player, r.sport);
    }
  };

  if (!incoming.length && !outgoing.length) return null;

  const verb = (intent) =>
    intent === "partner"
      ? "wants to partner"
      : intent === "mixer"
      ? "invited you to a mixer"
      : "challenged you";

  return (
    <Card style={{ marginBottom: 14 }}>
      <Label color={C.sky}>Requests</Label>

      {incoming.map((r) => (
        <div
          key={r.id}
          style={{
            background: "#fff",
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: 12,
            marginTop: 10,
          }}
        >
          <div style={{ font: "700 14px var(--body)", color: C.ink }}>
            {nameOf(r.from_player)} {verb(r.intent)}
          </div>
          <div
            style={{
              font: "500 12px var(--body)",
              color: C.mute,
              margin: "3px 0 10px",
            }}
          >
            {r.sport} · {r.format}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn kind="lime" onClick={() => setStatus(r, "accepted")}>
              Accept
            </Btn>
            <Btn kind="ghost" onClick={() => setStatus(r, "declined")}>
              Decline
            </Btn>
          </div>
        </div>
      ))}

      {outgoing.map((r) => (
        <div
          key={r.id}
          style={{
            background: "#fff",
            border: `1px dashed ${C.line}`,
            borderRadius: 14,
            padding: 12,
            marginTop: 10,
          }}
        >
          <div style={{ font: "600 13px var(--body)", color: C.mute }}>
            Sent to {nameOf(r.to_player)} — {r.intent}, awaiting reply…
          </div>
        </div>
      ))}
    </Card>
  );
}

async function finalizeEventRatings(event, players) {
  if (event.finalized) {
    return { written: 0, message: "Event already finalized." };
  }

  const sport = String(event.sport).toLowerCase();
  const format = String(event.format).toLowerCase();

  const byId = {};
  for (const p of players) byId[p.id] = p;

  const liveRating = {};
  const ensureLive = (id) => {
    if (liveRating[id] == null) {
      liveRating[id] = ratingOf(byId[id], sport, format);
    }
    return liveRating[id];
  };

  const matchRows = [];
  const matchPlayerRows = [];
  const historyRows = [];
  const ratingUpdates = {};
  const ratingStats = {};

  for (const round of event.rounds_data || []) {
    for (const game of round.games || []) {
      if (!game.score || game.skipped) continue;

      const team1 = game.team1 || [];
      const team2 = game.team2 || [];

      if (!team1.length || !team2.length) continue;

      const team1Rating =
        team1.reduce((sum, p) => sum + ensureLive(p.id), 0) / team1.length;

      const team2Rating =
        team2.reduce((sum, p) => sum + ensureLive(p.id), 0) / team2.length;

      const a = Number(game.score.a);
      const b = Number(game.score.b);
      const team1Won = game.score.winner === 1;
      const scoreDiff = Math.abs(a - b);

      const delta = computeRatingDelta(
        team1Rating,
        team2Rating,
        team1Won,
        scoreDiff
      );

      const matchId =
        crypto?.randomUUID?.() ||
        `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      matchRows.push({
        id: matchId,
        event_id: event.id,
        sport,
        format,
        round_number: round.number ?? null,
        court: game.court ?? null,
        team1_score: a,
        team2_score: b,
        winner: team1Won ? 1 : 2,
      });

      const applyPlayer = (p, teamNo, won, sign) => {
        const before = ensureLive(p.id);
        // Per-player K so provisional players swing harder (feature 4).
        const myK = kFactorFor(byId[p.id]?.[sport]);
        const myDelta = computeMatchDeltaWithK(
          teamNo === 1 ? team1Rating : team2Rating,
          teamNo === 1 ? team2Rating : team1Rating,
          won,
          scoreDiff,
          myK
        );
        const after = clampR(before + myDelta);

        liveRating[p.id] = after;
        ratingUpdates[p.id] = after;

        if (!ratingStats[p.id]) {
          ratingStats[p.id] = {
            games: 0,
            wins: 0,
            opponents: new Set(),
          };
        }

        ratingStats[p.id].games += 1;

        if (won) {
          ratingStats[p.id].wins += 1;
        }

        matchPlayerRows.push({
          match_id: matchId,
          player_id: p.id,
          team: teamNo,
          won,
          rating_before: before,
          rating_after: after,
          rating_delta: after - before,
        });

        historyRows.push({
          player_id: p.id,
          sport,
          format,
          rating: after,
          match_id: matchId,
        });
      };

      team1.forEach((p) => applyPlayer(p, 1, team1Won, +1));
      team2.forEach((p) => applyPlayer(p, 2, !team1Won, -1));
      team1.forEach((p) => {
        team2.forEach((opp) => {
          ratingStats[p.id].opponents.add(opp.id);
        });
      });

      team2.forEach((p) => {
        team1.forEach((opp) => {
          ratingStats[p.id].opponents.add(opp.id);
        });
      });
    }
  }

  if (!matchRows.length) {
    return { written: 0, message: "No scored matches to finalize." };
  }

  const { error: mErr } = await supabase.from("matches").insert(matchRows);
  if (mErr) return { written: 0, error: mErr };

  const { error: mpErr } = await supabase
    .from("match_players")
    .insert(matchPlayerRows);
  if (mpErr) return { written: 0, error: mpErr };

  const { error: hErr } = await supabase
    .from("rating_history")
    .insert(historyRows);
  if (hErr) return { written: 0, error: hErr };
  const ratingRows = Object.entries(ratingUpdates).map(
    ([player_id, rating]) => {
      const sportKey = sport === "pickleball" ? "pickleball" : "badminton";
      const current = players.find((p) => p.id === player_id)?.[sportKey] || {};

      return {
        player_id,
        sport,
        format,
        rating,
        games: (current.games || 0) + (ratingStats[player_id]?.games || 0),
        wins: (current.wins || 0) + (ratingStats[player_id]?.wins || 0),
        last_played: new Date().toISOString(),
      };
    }
  );

  const { error: rErr } = await supabase.from("ratings").upsert(ratingRows, {
    onConflict: "player_id,sport,format",
  });

  if (rErr) return { written: 0, error: rErr };

  return {
    written: matchRows.length,
    players: ratingUpdates,
  };
}

// § EVENT DETAIL -------------------------------------------------------------
// Single event view: lobby (check-in), running (round manager, scoring), results
function EventDetail({
  event,
  me,
  players,
  events,
  setEvents,
  onBack,
  reloadPlayers,
  onOpenPlayer,
}) {
  const [localEvent, setLocalEvent] = useState(event);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLocalEvent(event);
  }, [event]);

  // Persist local changes back to the global events list immediately
  const save = useCallback(
    async (updated) => {
      setLocalEvent(updated);
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

      const { error } = await supabase
        .from("events")
        .update({
          status: updated.status,
          finalized: updated.finalized || false,
          rounds_data: updated.rounds_data || [],
          check_in_open: updated.checkInOpen || false,
        })
        .eq("id", updated.id);

      if (error) {
        console.error("Event save failed:", error);
        alert("Event save failed: " + error.message);
      }
    },
    [setEvents]
  );

  // Organizer = explicitly listed, or site owner, or event creator ("me" is always owner in demo)
  const isOrganizer =
    me?.role === "OWNER" ||
    me?.role === "ORGANIZER" ||
    localEvent.organizers?.includes(me.id) ||
    localEvent.createdBy === me.id;
  // Check-in window: 1hr before start, closes 5min before
  const eventMs = localEvent.date
    ? new Date(`${localEvent.date}T${localEvent.time || "00:00"}`).getTime()
    : 0;
  const msUntil = eventMs - Date.now();
  const checkInOpen =
    localEvent.checkInOpen ||
    (eventMs > 0 && msUntil <= 3600000 && msUntil > 300000);
  const regOpen = eventMs === 0 || msUntil > 300000;

  // Handle delete with inline confirmation instead of window.confirm (blocked in iframes)
  const handleDelete = async () => {
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", localEvent.id);

    if (error) {
      alert("Delete failed: " + error.message);
      return;
    }

    setEvents((prev) => prev.filter((e) => e.id !== localEvent.id));
    onBack();
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          font: "600 14px var(--body)",
          color: C.mute,
          background: "none",
          border: "none",
          cursor: "pointer",
          marginBottom: 14,
        }}
      >
        ← All events
      </button>

      {/* Event header card */}
      <Card
        color={C.indigo}
        style={{ marginBottom: 14, overflow: "hidden", position: "relative" }}
        pad={24}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.4,
            background: `radial-gradient(400px 200px at 100% 0%,${C.coral}44,transparent)`,
          }}
        />
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <Pill
                  color={localEvent.type === "Mixer" ? C.coral : C.lime}
                  dark
                >
                  {localEvent.type}
                </Pill>
                <Pill color={C.gold} dark>
                  {localEvent.status}
                </Pill>
                {checkInOpen && (
                  <Pill color={C.sky} dark>
                    🚀 Check-in open
                  </Pill>
                )}
              </div>
              <h1
                style={{
                  font: "700 26px var(--display)",
                  color: "#fff",
                  margin: 0,
                }}
              >
                {localEvent.name}
              </h1>
              <div
                style={{
                  font: "500 13px var(--body)",
                  color: C.muteOnDark,
                  marginTop: 4,
                }}
              >
                {localEvent.sport} · {localEvent.format} ·{" "}
                {fmtDT(localEvent.date, localEvent.time)} · {localEvent.courts}{" "}
                courts · {localEvent.rounds} rounds
              </div>
            </div>
            {/* Share link copies event ID to clipboard */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                kind="lime"
                onClick={() => {
                  const link = `${window.location.origin}?join=${localEvent.id}`;
                  try {
                    navigator.clipboard.writeText(link);
                  } catch {}
                  alert(`Share this link:\n${link}`);
                }}
              >
                📋 Share link
              </Btn>
            </div>
          </div>
          {/* QR code — scan to join event */}
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                font: "600 11px var(--body)",
                color: C.muteOnDark,
                marginBottom: 6,
              }}
            >
              SCAN TO JOIN
            </div>
            <EventQR eventId={localEvent.id} />
          </div>
        </div>
      </Card>
      <Card style={{ marginBottom: 14 }}>
        <Label>Registered Players</Label>

        <div
          style={{ font: "600 13px var(--body)", color: C.mute, marginTop: 6 }}
        >
          {(localEvent.registeredIds || []).length}/{localEvent.maxPlayers}{" "}
          registered
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {(localEvent.registeredIds || []).map((id) => {
            const p =
              players.find((x) => x.id === id) || (me.id === id ? me : null);

            return (
              <div
                key={id}
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  background: "#fff",
                  font: "600 14px var(--body)",
                  color: C.ink,
                }}
              >
                {p?.name || "Unknown Player"}
                {p?.city && (
                  <span style={{ color: C.mute, fontWeight: 500 }}>
                    {" "}
                    · {p.city}
                  </span>
                )}
              </div>
            );
          })}

          {(localEvent.registeredIds || []).length === 0 && (
            <div style={{ font: "500 13px var(--body)", color: C.mute }}>
              No players registered yet.
            </div>
          )}
        </div>
      </Card>

      {/* Lobby view for open (pre-start) events */}
      {localEvent.status === "Open" && (
        <EventLobby
          event={localEvent}
          me={me}
          players={players}
          isOrganizer={isOrganizer}
          checkInOpen={checkInOpen}
          regOpen={regOpen}
          onSave={save}
        />
      )}

      {/* Round manager shows for Live events, or for organizer on Open events after they click Start */}
      {localEvent.status === "Live" && (
        <EventRunning
          event={localEvent}
          me={me}
          players={players}
          isOrganizer={isOrganizer}
          onSave={save}
        />
      )}

      {/* Results view for completed/finalized events */}
      {(localEvent.status === "Completed" || localEvent.finalized) && (
        <EventResults event={localEvent} me={me} players={players} />
      )}

      {/* Organizer control panel */}
      {isOrganizer && (
        <Card style={{ marginTop: 14 }} color={C.butter2}>
          <Label>Organizer controls</Label>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            {localEvent.status === "Open" && (
              <Btn
                kind="primary"
                onClick={() =>
                  save({ ...localEvent, status: "Live", checkInOpen: true })
                }
              >
                ▶ Start event (go Live)
              </Btn>
            )}
            {localEvent.status === "Live" && (
              <Btn
                kind="lime"
                onClick={() =>
                  save({ ...localEvent, status: "Completed", finalized: false })
                }
              >
                ⏹ End event
              </Btn>
            )}
            {localEvent.status === "Completed" && !localEvent.finalized && (
              <Btn
                kind="lime"
                onClick={async () => {
                  console.log("LOCAL EVENT BEFORE FINALIZE", localEvent);
                  console.log("ROUNDS BEFORE FINALIZE", localEvent.rounds_data);

                  const latestEvent =
                    events.find((e) => e.id === localEvent.id) || localEvent;

                  const res = await finalizeEventRatings(latestEvent, players);

                  if (res.error) {
                    alert("Finalize failed: " + res.error.message);
                    return;
                  }

                  save({
                    ...localEvent,
                    finalized: true,
                    finalizedAt: Date.now(),
                  });

                  if (res.written) {
                    const participantIds = getEventParticipantIds(latestEvent);

                    await notify(participantIds, {
                      actor: me.id,
                      type: "event_finalized",
                      title: `${localEvent.name} is finalized`,
                      body: "Ratings have been updated. View the results.",
                      link: `events:${localEvent.id}`,
                      payload: {
                        event_id: localEvent.id,
                      },
                    });
                  }

                  alert(
                    res.written
                      ? `Finalized. ${res.written} matches saved and ratings updated.`
                      : res.message || "Nothing to finalize."
                  );

                  await reloadPlayers?.();
                }}
              >
                ✅ Finalize & update ratings
              </Btn>
            )}
            {/* Delete with inline confirmation — avoids window.confirm which is blocked in sandboxes */}
            {!confirmDelete ? (
              <Btn kind="red" onClick={() => setConfirmDelete(true)}>
                🗑 Delete event
              </Btn>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  background: "#FFF3F1",
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: `1px solid ${C.coralDk}`,
                }}
              >
                <span
                  style={{ font: "600 13px var(--body)", color: C.coralDk }}
                >
                  Delete permanently?
                </span>
                <Btn kind="red" onClick={handleDelete}>
                  Yes, delete
                </Btn>
                <Btn kind="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Btn>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// Generates a simple visual QR-code-like grid from the event ID for sharing
function EventQR({ eventId }) {
  // Deterministic grid from the event ID string
  const cells = 9;
  const bits = eventId.split("").map((c) => c.charCodeAt(0));
  const grid = Array.from(
    { length: cells * cells },
    (_, i) => (bits[i % bits.length] >> i % 8) & 1
  );
  return (
    <div
      style={{
        display: "inline-grid",
        gridTemplateColumns: `repeat(${cells},8px)`,
        gap: 1,
        marginTop: 14,
        background: "#fff",
        padding: 6,
        borderRadius: 8,
      }}
    >
      {grid.map((on, i) => (
        <div
          key={i}
          style={{
            width: 8,
            height: 8,
            background: on ? C.indigo : "#fff",
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

// § JOIN LINKS + REAL QR -----------------------------------------------------
// Build the absolute deep-link a club's join QR/link points to. Opening it
// (even on a fresh phone) is caught by the deep-link handler in <App/>, which
// remembers the target and auto-joins the user once they sign in / sign up.
function clubJoinLink(clubId) {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://rallyrank.pro";
  return `${origin}?joinClub=${encodeURIComponent(clubId)}`;
}
function clubClaimLink(clubId, code) {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://rallyrank.pro";
  return `${origin}?claimClub=${encodeURIComponent(
    clubId
  )}&code=${encodeURIComponent(code || "")}`;
}

// Renders a REAL, scannable QR code onto a canvas.
// Strategy (per product decision): prefer the proven 'qrcode' npm package if
// it's installed; otherwise fall back to the bundled offline encoder. Either
// way the output is a crisp black-on-white canvas suitable for printing.
function ClubQR({ value, size = 200, quiet = 4 }) {
  const canvasRef = useRef(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // 1) Try the real library first (dynamic import so a missing package
      //    never breaks the build — it just falls through to our encoder).
      try {
        const lib = await import(/* @vite-ignore */ "qrcode");
        if (cancelled) return;
        const toCanvas = lib.toCanvas || lib.default?.toCanvas;
        if (toCanvas) {
          await toCanvas(canvas, value, {
            width: size,
            margin: quiet,
            errorCorrectionLevel: "M",
            color: { dark: "#241B3A", light: "#FFFFFF" },
          });
          return;
        }
      } catch {
        // package not installed / not resolvable — use fallback below
      }

      // 2) Offline fallback encoder.
      try {
        const matrix = generateQRFallback(value, "M");
        if (cancelled) return;
        const n = matrix.length;
        const total = n + quiet * 2;
        const scale = Math.max(1, Math.floor(size / total));
        const px = total * scale;
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = "#241B3A";
        for (let r = 0; r < n; r++)
          for (let c = 0; c < n; c++)
            if (matrix[r][c])
              ctx.fillRect(
                (c + quiet) * scale,
                (r + quiet) * scale,
                scale,
                scale
              );
      } catch (e) {
        if (!cancelled) setErr(true);
      }
    };
    draw();
    return () => {
      cancelled = true;
    };
  }, [value, size, quiet]);

  if (err)
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "grid",
          placeItems: "center",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${C.line}`,
          font: "500 12px var(--body)",
          color: C.mute,
          textAlign: "center",
          padding: 12,
        }}
      >
        Couldn't render QR — use the link instead.
      </div>
    );

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        background: "#fff",
        borderRadius: 12,
        padding: 8,
        boxSizing: "content-box",
        border: `1px solid ${C.line}`,
      }}
    />
  );
}

// A reusable "share this club" panel: copyable link + scannable QR. This is the
// headline payoff of club onboarding — drop the link in a WhatsApp group, or
// show/print the QR at the venue, and members flow in.
function ClubInvitePanel({ clubId, clubName, onDark }) {
  const link = clubJoinLink(clubId);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked; surface the link so they can copy manually.
      toast(`Share this link:\n${link}`, "info");
    }
  };
  const share = async () => {
    const text = `Join ${clubName || "our club"} on RallyRank`;
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url: link });
        return;
      }
    } catch {
      /* user cancelled or unsupported */
    }
    copy();
  };
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <ClubQR value={link} size={180} />
      <div style={{ flex: "1 1 240px", minWidth: 220 }}>
        <div
          style={{
            font: "700 13px var(--body)",
            color: onDark ? "#fff" : C.ink,
            marginBottom: 6,
          }}
        >
          Invite link
        </div>
        <div
          style={{
            font: "500 13px var(--body)",
            color: onDark ? C.muteOnDark : C.mute,
            background: onDark ? "rgba(255,255,255,.08)" : "#fff",
            border: `1px solid ${onDark ? "rgba(255,255,255,.18)" : C.line}`,
            borderRadius: 12,
            padding: "10px 12px",
            wordBreak: "break-all",
            marginBottom: 10,
          }}
        >
          {link}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn kind="lime" onClick={share}>
            📲 Share
          </Btn>
          <Btn kind="ghost" onClick={copy}>
            {copied ? "Copied ✓" : "📋 Copy link"}
          </Btn>
        </div>
        <p
          style={{
            font: "400 12px/1.5 var(--body)",
            color: onDark ? C.muteOnDark : C.mute,
            marginTop: 10,
          }}
        >
          Drop the link in your club's WhatsApp/Telegram group, or show this QR
          at the venue — members scan to join instantly.
        </p>
      </div>
    </div>
  );
}

// § EVENT LOBBY --------------------------------------------------------------
// Shows registration list, check-in status, share link; organizer can add players manually
function EventLobby({
  event,
  me,
  players,
  isOrganizer,
  checkInOpen,
  regOpen,
  onSave,
}) {
  const [addSearch, setAddSearch] = useState("");
  const registered = players.filter((p) => event.registeredIds?.includes(p.id));
  const addPlayer = (id) => {
    if (!event.registeredIds?.includes(id))
      onSave({ ...event, registeredIds: [...(event.registeredIds || []), id] });
  };
  const removePlayer = (id) =>
    onSave({
      ...event,
      registeredIds: event.registeredIds.filter((x) => x !== id),
    });
  const searchMatches = players.filter(
    (p) =>
      !event.registeredIds?.includes(p.id) &&
      p.name.toLowerCase().includes(addSearch.toLowerCase())
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Card>
        <Label>
          Registered players ({registered.length}/{event.maxPlayers})
        </Label>
        <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
          {registered.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ font: "600 14px var(--body)", color: C.ink }}>
                {p.name}{" "}
                <span style={{ font: "500 11px var(--body)", color: C.mute }}>
                  ·{" "}
                  {p[event.sport.toLowerCase()]?.singles?.toLocaleString() ||
                    "—"}
                </span>
              </div>
              {isOrganizer && (
                <button
                  onClick={() => removePlayer(p.id)}
                  style={{
                    font: "700 11px var(--body)",
                    color: C.red,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {registered.length === 0 && (
            <p style={{ font: "400 13px var(--body)", color: C.mute }}>
              No players yet.
            </p>
          )}
        </div>
      </Card>
      <Card>
        {checkInOpen ? (
          <>
            <Label color={C.limeDk}>✅ Check-in is open!</Label>
            <p
              style={{
                font: "400 13px/1.5 var(--body)",
                color: C.mute,
                marginTop: 8,
              }}
            >
              The event starts in less than 1 hour. Players can check in now.
            </p>
            {!event.registeredIds?.includes(me.id) && regOpen && (
              <Btn
                kind="lime"
                full
                onClick={() => {
                  const playerId = me.id === "me" ? null : me.id;

                  if (!playerId) {
                    alert(
                      "Please log out and sign in again before registering."
                    );
                    return;
                  }

                  onSave({
                    ...event,
                    registeredIds: [...(event.registeredIds || []), playerId],
                  });
                }}
              >
                Register & check in
              </Btn>
            )}
          </>
        ) : (
          <>
            <Label color={C.mute}>Check-in opens 1 hour before start</Label>
            <p
              style={{
                font: "400 13px/1.5 var(--body)",
                color: C.mute,
                marginTop: 8,
              }}
            >
              {event.date
                ? `Starts ${fmtDT(event.date, event.time)}.`
                : "Date TBD."}
            </p>
          </>
        )}
        {isOrganizer && (
          <div style={{ marginTop: 14 }}>
            <Label color={C.limeDk}>Add player manually</Label>
            <input
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="Search by name…"
              style={{ ...inp, marginTop: 8, marginBottom: 8 }}
            />
            {searchMatches.slice(0, 4).map((p) => (
              <button
                key={p.id}
                onClick={() => addPlayer(p.id)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 11,
                  border: `1px solid ${C.line}`,
                  background: "#fff",
                  cursor: "pointer",
                  marginBottom: 6,
                }}
              >
                <span style={{ font: "600 14px var(--body)", color: C.ink }}>
                  {p.name}
                </span>
                <span style={{ font: "700 12px var(--body)", color: C.limeDk }}>
                  + Add
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// § EVENT RUNNING ------------------------------------------------------------
// Round manager: generate matchups, enter scores, rest tracking, add/delete rounds
function EventRunning({ event, me, players, isOrganizer, onSave }) {
  const [rounds, setRounds] = useState(event.rounds_data || []);
  useEffect(() => {
    setRounds(event.rounds_data || []);
  }, [event.rounds_data]);

  const [activeRound, setActiveRound] = useState(null);
  const [restOverrides, setRestOverrides] = useState(new Set()); // players organizer forced into extra round

  // Saves updated rounds to the event
  const saveRounds = useCallback(
    (updated) => {
      setRounds(updated);
      onSave({ ...event, rounds_data: updated });
    },
    [event, onSave]
  );

  const registeredPlayers = players.filter((p) =>
    event.registeredIds?.includes(p.id)
  );

  // Adds a new auto-generated round based on current rest state and player ratings for this sport
  const addRound = () => {
    const requiredRest = new Set(
      Object.entries(playCounts)
        .filter(([id, count]) => count >= 2 && !restOverrides.has(id))
        .map(([id]) => id)
    );

    const { games, restingThisRound } = generateRound({
      players: registeredPlayers,
      courts: event.courts,
      restIds: requiredRest,
      format: event.format,
      sport: event.sport,
      previousRounds: rounds,
    });
    const newRound = {
      id: `r${Date.now()}`,
      number: rounds.length + 1,
      games,
      restingIds: restingThisRound,
      locked: false,
    };
    const updated = [...rounds, newRound];
    saveRounds(updated);
    setActiveRound(newRound.id);
  };

  // Regenerates the pairings for a specific round, respecting rest rules from prior rounds
  const regenRound = (roundId) => {
    const idx = rounds.findIndex((r) => r.id === roundId);

    const priorPlayCounts = (() => {
      const counts = {};

      for (const round of rounds.slice(0, idx) || []) {
        const playedIds = new Set(
          (round.games || []).flatMap((g) =>
            [...(g.team1 || []), ...(g.team2 || [])].map((p) => p.id)
          )
        );

        for (const id of Object.keys(counts)) {
          counts[id] = playedIds.has(id) ? counts[id] + 1 : 0;
        }

        for (const id of playedIds) {
          if (!counts[id]) counts[id] = 1;
        }
      }

      return counts;
    })();

    const requiredRest = new Set(
      Object.entries(priorPlayCounts)
        .filter(([id, count]) => count >= 2 && !restOverrides.has(id))
        .map(([id]) => id)
    );
    const { games, restingThisRound } = generateRound({
      players: registeredPlayers,
      courts: event.courts,
      restIds: requiredRest,
      format: event.format,
      sport: event.sport,
      previousRounds: rounds.slice(0, idx),
    });

    const updated = rounds.map((r) =>
      r.id === roundId ? { ...r, games, restingIds: restingThisRound } : r
    );

    saveRounds(updated);
  };

  // Removes the last round (only if not locked/scored)
  const deleteLastRound = () => {
    if (rounds.length === 0) return;
    const last = rounds[rounds.length - 1];
    if (last.games.some((g) => g.score)) {
      alert("Cannot delete a round with scores entered.");
      return;
    }
    saveRounds(rounds.slice(0, -1));
  };

  // Clears scores from an incomplete round
  const clearRound = (roundId) => {
    const updated = rounds.map((r) =>
      r.id === roundId
        ? {
            ...r,
            games: r.games.map((g) => ({
              ...g,
              score: null,
              validated: false,
            })),
          }
        : r
    );
    saveRounds(updated);
  };

  // Updates a single game's score within a round
  const updateScore = (roundId, gameId, score) => {
    const updated = rounds.map((r) =>
      r.id === roundId
        ? {
            ...r,
            games: r.games.map((g) =>
              g.id === gameId ? { ...g, score, validated: true } : g
            ),
          }
        : r
    );
    saveRounds(updated);
  };

  // Swaps two players between games in the same round
  const swapPlayers = (roundId) => {
    alert(
      "To swap players: delete this round and regenerate. Use the override button to force a player into the next round."
    );
  };

  const playCounts = (() => {
    const counts = {};

    for (const round of rounds || []) {
      const playedIds = new Set(
        (round.games || []).flatMap((g) =>
          [...(g.team1 || []), ...(g.team2 || [])].map((p) => p.id)
        )
      );

      for (const id of Object.keys(counts)) {
        counts[id] = playedIds.has(id) ? counts[id] + 1 : 0;
      }

      for (const id of playedIds) {
        if (!counts[id]) counts[id] = 1;
      }
    }

    return counts;
  })();

  const updateGamePlayer = (roundId, gameId, teamNo, slotIndex, playerId) => {
    const player = registeredPlayers.find(
      (p) => String(p.id) === String(playerId)
    );

    const updated = rounds.map((r) =>
      r.id !== roundId
        ? r
        : {
            ...r,
            games: r.games.map((g) => {
              if (g.id !== gameId) return g;

              const key = teamNo === 1 ? "team1" : "team2";
              const team = [...(g[key] || [])];

              team[slotIndex] = player;

              return {
                ...g,
                [key]: team,
                score: null,
                validated: false,
              };
            }),
          }
    );

    saveRounds(updated);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Label>
          Round manager — {rounds.length}/{event.rounds} rounds
        </Label>
        <div style={{ display: "flex", gap: 8 }}>
          {isOrganizer && rounds.length < event.rounds && (
            <Btn kind="lime" onClick={addRound}>
              + Generate round {rounds.length + 1}
            </Btn>
          )}
          {isOrganizer && rounds.length > 0 && (
            <Btn kind="ghost" onClick={deleteLastRound}>
              Delete last round
            </Btn>
          )}
        </div>
      </div>

      {/* Rest tracker */}
      {registeredPlayers.length > 0 && (
        <Card color={C.butter2} style={{ marginBottom: 14 }} pad={16}>
          <Label color={C.mute}>Player status</Label>
          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}
          >
            {registeredPlayers.map((p) => {
              const count = playCounts[p.id] || 0;
              const mustRest = count >= 2 && !restOverrides.has(p.id);
              const resting = mustRest;
              return (
                <div
                  key={p.id}
                  title={mustRest ? "Must rest this round" : ""}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 99,
                    font: "600 12px var(--body)",
                    background: resting
                      ? "#FFF3F1"
                      : count >= 2
                      ? "#FFF3D6"
                      : "#F0FBD9",
                    color: resting ? C.red : count >= 2 ? C.coralDk : C.limeDk,
                    border: `1px solid ${
                      resting ? C.coralDk : count >= 2 ? C.gold : C.limeDk
                    }`,
                    cursor: isOrganizer && mustRest ? "pointer" : "default",
                  }}
                  onClick={() =>
                    isOrganizer &&
                    mustRest &&
                    setRestOverrides((prev) => {
                      const n = new Set(prev);
                      n.add(p.id);
                      return n;
                    })
                  }
                >
                  {p.name.split(" ")[0]}{" "}
                  {resting ? "💤" : count >= 2 ? "⚠️" : "✓"}
                  {isOrganizer && mustRest && (
                    <span style={{ fontSize: 10, marginLeft: 4 }}>
                      tap to override
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p
            style={{
              font: "400 11px/1.5 var(--body)",
              color: C.mute,
              marginTop: 8,
            }}
          >
            Green = available · Orange = 2 rounds played (rest next) · Red =
            must rest · Tap player to give them a 3rd round (organizer only)
          </p>
        </Card>
      )}

      {rounds.length === 0 && (
        <Card style={{ textAlign: "center", padding: 36 }}>
          <p style={{ font: "400 14px var(--body)", color: C.mute }}>
            No rounds generated yet. Click "+ Generate round 1" to start.
          </p>
        </Card>
      )}

      {/* Round panels */}
      {rounds.map((round) => (
        <Card key={round.id} style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <div style={{ font: "700 18px var(--display)", color: C.ink }}>
              Round {round.number}
            </div>
            {isOrganizer && (
              <div style={{ display: "flex", gap: 8 }}>
                <Btn kind="ghost" onClick={() => regenRound(round.id)}>
                  Regenerate
                </Btn>
                <Btn kind="plain" onClick={() => clearRound(round.id)}>
                  Clear scores
                </Btn>
              </div>
            )}
          </div>
          {/* Rest list for this round */}
          {round.restingIds?.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <span style={{ font: "600 12px var(--body)", color: C.mute }}>
                Resting this round:
              </span>
              {round.restingIds.map((id) => {
                const p = registeredPlayers.find((x) => x.id === id);
                return p ? (
                  <Pill key={id} color={C.mute}>
                    {p.name.split(" ")[0]} 💤
                  </Pill>
                ) : null;
              })}
            </div>
          )}
          {/* Game cards */}
          <div style={{ display: "grid", gap: 10 }}>
            {round.games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                roundId={round.id}
                event={event}
                isOrganizer={isOrganizer}
                registeredPlayers={registeredPlayers}
                updateGamePlayer={updateGamePlayer}
                onScore={(score) => updateScore(round.id, game.id, score)}
                onSwap={() => swapPlayers(round.id)}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PlayerSelect({ value, players, onChange, disabled }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...inp,
        padding: "8px 10px",
        font: "700 13px var(--body)",
      }}
    >
      <option value="">Select player</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

// Single game card: shows teams, odds, score entry with validation
function GameCard({
  game,
  roundId,
  event,
  isOrganizer,
  registeredPlayers,
  updateGamePlayer,
  onScore,
  onSwap,
}) {
  const [sa, setSa] = useState(game.score?.a?.toString() || "");
  const [sb, setSb] = useState(game.score?.b?.toString() || "");
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(!game.score);
  const isBadminton = event.sport === "Badminton";
  const oddA = game.odds?.[0] || 50,
    oddB = 100 - oddA;

  // Validates score against sport rules before accepting
  const submit = () => {
    const a = parseInt(sa),
      b = parseInt(sb);
    const result = isBadminton
      ? validateBadmintonScore(a, b)
      : validatePickleballScore(a, b, event.pickleTarget || 11);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    setError(null);
    onScore({ a, b, winner: a > b ? 1 : 2, submittedAt: Date.now() });
    setEditing(false);
  };

  const names = (team) => team.map((p) => p.name.split(" ")[0]).join(" & ");

  return (
    <div
      style={{
        background: C.butter,
        borderRadius: 16,
        padding: 16,
        border: `1px solid ${C.line}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Pill color={C.mute}>Court {game.court}</Pill>
        {game.score && (
          <Pill color={C.limeDk} bg="#F0FBD9">
            Scored ✓
          </Pill>
        )}
      </div>
      {/* Teams with odds */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            border: `1px solid ${C.line}`,
          }}
        >
          <PlayerSelect
            value={game.team1?.[0]?.id || ""}
            players={registeredPlayers}
            disabled={!isOrganizer}
            onChange={(id) => updateGamePlayer(roundId, game.id, 1, 0, id)}
          />
          <div style={{ font: "800 20px var(--display)", color: C.sky }}>
            {oddA}%
          </div>
          <div style={{ font: "500 10px var(--body)", color: C.mute }}>
            win probability
          </div>
        </div>
        <div
          style={{
            font: "700 16px var(--display)",
            color: C.mute,
            textAlign: "center",
          }}
        >
          VS
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            border: `1px solid ${C.line}`,
            textAlign: "right",
          }}
        >
          <PlayerSelect
            value={game.team2?.[0]?.id || ""}
            players={registeredPlayers}
            disabled={!isOrganizer}
            onChange={(id) => updateGamePlayer(roundId, game.id, 2, 0, id)}
          />
          <div style={{ font: "800 20px var(--display)", color: C.coral }}>
            {oddB}%
          </div>
          <div style={{ font: "500 10px var(--body)", color: C.mute }}>
            win probability
          </div>
        </div>
      </div>
      {/* Score display if already entered */}
      {game.score && !editing && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              font: "800 28px var(--display)",
              color: game.score.winner === 1 ? C.limeDk : C.mute,
            }}
          >
            {game.score.a}
          </span>
          <span style={{ font: "700 18px var(--display)", color: C.mute }}>
            –
          </span>
          <span
            style={{
              font: "800 28px var(--display)",
              color: game.score.winner === 2 ? C.limeDk : C.mute,
            }}
          >
            {game.score.b}
          </span>
        </div>
      )}
      {/* Score entry / edit */}
      {(editing || isOrganizer) && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              gap: 8,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <input
              value={sa}
              onChange={(e) => setSa(e.target.value)}
              placeholder="Team 1 score"
              type="number"
              min="0"
              max="30"
              style={inp}
            />
            <span
              style={{
                font: "700 14px var(--body)",
                color: C.mute,
                textAlign: "center",
              }}
            >
              –
            </span>
            <input
              value={sb}
              onChange={(e) => setSb(e.target.value)}
              placeholder="Team 2 score"
              type="number"
              min="0"
              max="30"
              style={inp}
            />
          </div>
          {error && (
            <div
              style={{
                font: "600 12px var(--body)",
                color: C.red,
                marginBottom: 8,
              }}
            >
              ⚠️ {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn kind="lime" full onClick={submit}>
              Save score
            </Btn>
            {game.score && (
              <Btn kind="plain" onClick={() => setEditing(false)}>
                Cancel
              </Btn>
            )}
          </div>
          <p
            style={{
              font: "400 11px/1.5 var(--body)",
              color: C.mute,
              marginTop: 6,
            }}
          >
            {isBadminton
              ? "Badminton: win to 21 (win by 2, max 30)."
              : `Pickleball: win to ${event.pickleTarget || 11} (win by 2).`}
          </p>
        </div>
      )}
      {!editing && !game.score && (
        <Btn kind="primary" full onClick={() => setEditing(true)}>
          Enter score
        </Btn>
      )}
      {game.score && !editing && isOrganizer && (
        <button
          onClick={() => setEditing(true)}
          style={{
            font: "600 12px var(--body)",
            color: C.skyDk,
            background: "none",
            border: "none",
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          Edit score
        </button>
      )}
    </div>
  );
}

async function loadEventResults(eventId) {
  const { data, error } = await supabase
    .from("matches")
    .select(
      `
      *,
      match_players (
        *,
        players (
          id,
          name
        )
      )
    `
    )
    .eq("event_id", eventId)
    .order("round_number", { ascending: true })
    .order("court", { ascending: true });

  if (error) {
    console.error("Load event results failed:", error);
    return [];
  }

  return data || [];
}

// § EVENT RESULTS ------------------------------------------------------------
// Post-event results dashboard: rankings, top performers, correction window
function EventResults({ event, me, players, onOpenPlayer }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function run() {
      if (!event?.id || !event.finalized) return;

      setLoading(true);
      const data = await loadEventResults(event.id);
      setResults(data);
      setLoading(false);
    }

    run();
  }, [event?.id, event?.finalized]);

  const registeredPlayers = players.filter((p) =>
    event.registeredIds?.includes(p.id)
  );

  const stats = useMemo(() => {
    const s = {};

    for (const p of registeredPlayers) {
      s[p.id] = {
        id: p.id,
        name: p.name,
        wins: 0,
        games: 0,
        points: 0,
        ratingDelta: 0,
      };
    }

    for (const match of results || []) {
      const mps = match.match_players || [];

      for (const mp of mps) {
        const id = mp.player_id;

        if (!s[id]) {
          s[id] = {
            id,
            name: mp.players?.name || "Unknown player",
            wins: 0,
            games: 0,
            points: 0,
            ratingDelta: 0,
          };
        }

        s[id].games += 1;
        s[id].wins += mp.won ? 1 : 0;
        s[id].ratingDelta += mp.rating_delta || 0;
        s[id].points += mp.team === 1 ? match.team1_score : match.team2_score;
      }
    }

    return Object.values(s).sort(
      (a, b) =>
        b.wins - a.wins || b.ratingDelta - a.ratingDelta || b.points - a.points
    );
  }, [results, registeredPlayers]);

  const mostGames = [...stats].sort((a, b) => b.games - a.games)[0];
  const topScorer = [...stats].sort((a, b) => b.points - a.points)[0];
  const strongest = stats[0];

  const correctionDue = event.finalizedAt
    ? new Date(event.finalizedAt + 14 * 86400000).toLocaleDateString("en-IN")
    : "14 days from finalization";

  return (
    <div>
      {event.finalized && (
        <Card
          color={C.indigo}
          style={{ marginBottom: 14, textAlign: "center" }}
          pad={22}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <div style={{ font: "700 22px var(--display)", color: "#fff" }}>
            Event finalized!
          </div>
          <p
            style={{
              font: "400 13px/1.5 var(--body)",
              color: C.muteOnDark,
              marginTop: 4,
            }}
          >
            Ratings have been updated. Score corrections are open until{" "}
            {correctionDue}.
          </p>
        </Card>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {[
          ["🏆 Most wins", strongest?.name, "Top performer"],
          ["🎮 Most games", mostGames?.name, "Highest games played"],
          ["🎯 Top scorer", topScorer?.name, "Most points scored"],
        ].map(([e, n, d]) => (
          <Card key={d} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>
              {e.split(" ")[0]}
            </div>
            <div style={{ font: "700 16px var(--display)", color: C.ink }}>
              {n || "—"}
            </div>
            <div style={{ font: "500 11px var(--body)", color: C.mute }}>
              {d}
            </div>
          </Card>
        ))}
      </div>

      <Card pad={0}>
        <div
          style={{
            padding: "12px 18px 10px",
            font: "700 13px var(--body)",
            color: C.mute,
            borderBottom: `1px solid ${C.line}`,
            display: "grid",
            gridTemplateColumns: "40px 1fr 80px 80px 90px 90px",
          }}
        >
          <span>#</span>
          <span>Player</span>
          <span style={{ textAlign: "center" }}>Wins</span>
          <span style={{ textAlign: "center" }}>Games</span>
          <span style={{ textAlign: "right" }}>Points</span>
          <span style={{ textAlign: "right" }}>Rating</span>
        </div>

        {stats.map((p, i) => (
          <div
            key={p.id}
            style={{
              padding: "12px 18px",
              borderBottom:
                i < stats.length - 1 ? `1px solid ${C.line}` : "none",
              display: "grid",
              gridTemplateColumns: "40px 1fr 80px 80px 90px 90px",
              alignItems: "center",
              background:
                i === 0 ? "#FFFDE7" : i < 3 ? C.butter2 : "transparent",
            }}
          >
            <span
              style={{
                font: "800 16px var(--display)",
                color: ["🥇", "🥈", "🥉"][i] ? C.ink : C.mute,
              }}
            >
              {["🥇", "🥈", "🥉"][i] || i + 1}
            </span>
            <span style={{ font: "700 14px var(--body)", color: C.ink }}>
              {p.name}
            </span>
            <span
              style={{
                font: "800 16px var(--display)",
                color: C.limeDk,
                textAlign: "center",
              }}
            >
              {p.wins}
            </span>
            <span
              style={{
                font: "700 14px var(--body)",
                color: C.mute,
                textAlign: "center",
              }}
            >
              {p.games}
            </span>
            <span
              style={{
                font: "700 14px var(--body)",
                color: C.mute,
                textAlign: "right",
              }}
            >
              {p.points}
            </span>
            <span
              style={{
                font: "800 14px var(--body)",
                color: p.ratingDelta >= 0 ? C.green : C.red,
                textAlign: "right",
              }}
            >
              {p.ratingDelta >= 0 ? "+" : ""}
              {p.ratingDelta}
            </span>
          </div>
        ))}

        {loading && (
          <div style={{ padding: 24, color: C.mute, textAlign: "center" }}>
            Loading results...
          </div>
        )}

        {!loading && stats.length === 0 && (
          <div
            style={{
              padding: "24px 18px",
              font: "400 14px var(--body)",
              color: C.mute,
              textAlign: "center",
            }}
          >
            No finalized results found.
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Label>Match history</Label>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {results.map((m) => {
            const team1 = (m.match_players || []).filter((p) => p.team === 1);
            const team2 = (m.match_players || []).filter((p) => p.team === 2);

            const raiseEventDispute = async (match) => {
              const reason = prompt("What is wrong with this match?");
              if (!reason) return;

              const participantIds = (match.match_players || [])
                .map((mp) => mp.player_id)
                .filter(Boolean);

              const { error } = await supabase.from("match_disputes").insert({
                casual_match_id: null,
                match_id: match.id,
                raised_by: me.id,
                reason,
                status: "open",
              });

              if (error) {
                alert("Could not raise dispute: " + error.message);
                return;
              }

              await notify(participantIds, {
                actor: me.id,
                type: "disputed",
                title: "Match disputed",
                body: reason,
                link: `events:${event.id}`,
                payload: {
                  match_id: match.id,
                  event_id: event.id,
                },
              });

              alert("Dispute raised.");
            };

            return (
              <div
                key={m.id}
                style={{
                  border: `1px solid ${C.line}`,
                  borderRadius: 22,
                  padding: 16,
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,.96), rgba(255,248,236,.92))",
                  boxShadow: "0 12px 28px rgba(36,27,58,.07)",
                }}
              >
                <div style={{ font: "800 13px var(--body)", color: C.mute }}>
                  Round {m.round_number || "-"} · Match {m.court || "-"}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    gap: 12,
                    alignItems: "center",
                    marginTop: 10,
                  }}
                >
                  <ResultTeam
                    players={team1}
                    winner={m.winner === 1}
                    onOpenPlayer={onOpenPlayer}
                  />

                  <div style={{ gridColumn: "1 / -1", marginTop: 12 }}>
                    <Btn kind="ghost" onClick={() => raiseEventDispute(m)}>
                      ⚠️ Raise a dispute
                    </Btn>
                  </div>

                  <div
                    style={{
                      font: "800 24px var(--display)",
                      color: C.ink,
                      textAlign: "center",
                    }}
                  >
                    {m.team1_score} - {m.team2_score}
                  </div>

                  <ResultTeam
                    players={team2}
                    winner={m.winner === 2}
                    onOpenPlayer={onOpenPlayer}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card style={{ marginTop: 14 }} color={C.butter2}>
        <Label color={C.mute}>Score corrections</Label>
        <p
          style={{
            font: "400 13px/1.5 var(--body)",
            color: C.mute,
            marginTop: 8,
          }}
        >
          Players have 14 days from finalization to request a score or game
          correction. Submit corrections via the Contact form referencing your
          event ID: <b>{event.id}</b>.
        </p>
      </Card>
    </div>
  );
}

function ResultTeam({ players, winner, onOpenPlayer }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 18,
        background: winner
          ? `linear-gradient(135deg, ${C.lime}30, #fff)`
          : "rgba(255,255,255,.72)",
        border: `1px solid ${winner ? C.lime : C.line}`,
        boxShadow: winner ? "0 10px 22px rgba(111,160,10,.10)" : "none",
      }}
    >
      <div
        style={{
          font: "800 11px var(--body)",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: winner ? C.green : C.mute,
          marginBottom: 8,
        }}
      >
        {winner ? "Winner" : "Team"}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {players.map((p) => (
          <div key={p.id}>
            <button
              onClick={() => p.player_id && onOpenPlayer?.(p.player_id)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: p.player_id ? "pointer" : "default",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AvatarBubble name={p.players?.name || "?"} size={34} />
                <div>
                  <div
                    style={{
                      font: "800 14px var(--body)",
                      color: C.indigo,
                    }}
                  >
                    <PlayerLink
                      playerId={p.player_id}
                      name={p.players?.name || "Unknown player"}
                      onOpenPlayer={onOpenPlayer}
                    />
                  </div>
                  <div
                    style={{
                      font: "600 12px var(--body)",
                      color: C.mute,
                      marginTop: 2,
                    }}
                  >
                    {p.rating_before} → {p.rating_after}{" "}
                    <span
                      style={{
                        color: p.rating_delta >= 0 ? C.green : C.red,
                        fontWeight: 800,
                      }}
                    >
                      ({p.rating_delta >= 0 ? "+" : ""}
                      {p.rating_delta})
                    </span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// § ACCOUNT ------------------------------------------------------------------
// Profile settings: photo upload, personal info, billing placeholder, security
function Account({ me, setMe, onLogout }) {
  const [section, setSection] = useState("personal");
  const fileRef = useRef(null);
  // Handles profile photo upload from local file
  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMe({ ...me, photo: reader.result });
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <Label color="#B06BFF">Account</Label>
      <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 18px" }}>
        Settings
      </h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "210px 1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <Card pad={10}>
          {[
            ["personal", "👤 Personal info"],
            ["billing", "💳 Billing"],
            ["security", "🔒 Sign-in & security"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSection(k)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "11px 13px",
                borderRadius: 11,
                border: "none",
                cursor: "pointer",
                font: "600 14px var(--body)",
                marginBottom: 4,
                background: section === k ? C.butter2 : "transparent",
                color: C.ink,
              }}
            >
              {l}
            </button>
          ))}
          <div style={{ height: 1, background: C.line, margin: "6px 8px" }} />
          <button
            onClick={onLogout}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "11px 13px",
              borderRadius: 11,
              border: "none",
              cursor: "pointer",
              font: "700 14px var(--body)",
              color: C.coralDk,
              background: "transparent",
            }}
          >
            ↩ Log out
          </button>
        </Card>
        <div>
          {section === "personal" && (
            <Card>
              <Label color={C.limeDk}>Profile photo</Label>
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  margin: "12px 0 20px",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    overflow: "hidden",
                    background: me.photo
                      ? `center/cover url(${me.photo})`
                      : C.coral,
                    display: "grid",
                    placeItems: "center",
                    font: "800 28px var(--display)",
                    color: "#fff",
                  }}
                >
                  {!me.photo && me.name[0]}
                </div>
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={onPhoto}
                    style={{ display: "none" }}
                  />
                  <Btn kind="ghost" onClick={() => fileRef.current?.click()}>
                    Upload photo
                  </Btn>
                  {me.photo && (
                    <button
                      onClick={() => setMe({ ...me, photo: null })}
                      style={{
                        marginLeft: 10,
                        font: "600 12px var(--body)",
                        color: C.mute,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div
                style={{ height: 1, background: C.line, margin: "0 0 18px" }}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <Field label="Name">
                  <input
                    value={me.name}
                    onChange={(e) => setMe({ ...me, name: e.target.value })}
                    style={inp}
                  />
                </Field>
                <Field label="Email">
                  <input
                    value={me.email || ""}
                    onChange={(e) => setMe({ ...me, email: e.target.value })}
                    type="email"
                    style={inp}
                  />
                </Field>
                <Field label="Country">
                  <CountrySelect
                    value={me.country || "IN"}
                    onChange={(v) => setMe({ ...me, country: v })}
                  />
                </Field>
                <Field label="City">
                  <input
                    value={me.city}
                    onChange={(e) => setMe({ ...me, city: e.target.value })}
                    style={inp}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={me.phone || ""}
                    onChange={(e) => setMe({ ...me, phone: e.target.value })}
                    style={inp}
                  />
                </Field>
                <Field label="Home club">
                  <input
                    value={me.club || ""}
                    onChange={(e) => setMe({ ...me, club: e.target.value })}
                    style={inp}
                  />
                </Field>
              </div>
              <Btn kind="lime" onClick={() => {}}>
                Save changes
              </Btn>
            </Card>
          )}
          {section === "billing" && (
            <div style={{ display: "grid", gap: 14 }}>
              <Card>
                <Label color={C.sky}>Current plan</Label>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 14,
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div>
                    <div
                      style={{ font: "700 22px var(--display)", color: C.ink }}
                    >
                      RallyRank Free
                    </div>
                    <div
                      style={{ font: "400 13px var(--body)", color: C.mute }}
                    >
                      Profile, ratings, ladders, event registration.
                    </div>
                  </div>
                  <Btn kind="primary" onClick={() => {}}>
                    Upgrade to Pro
                  </Btn>
                </div>
              </Card>
              <Card>
                <Label color={C.limeDk}>Payment method</Label>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 12,
                  }}
                >
                  <span style={{ font: "500 14px var(--body)", color: C.mute }}>
                    No payment method on file.
                  </span>
                  <Btn kind="ghost" onClick={() => {}}>
                    Add card / UPI
                  </Btn>
                </div>
              </Card>
              <Card>
                <Label color={C.mute}>Invoices</Label>
                <p
                  style={{
                    font: "400 13px var(--body)",
                    color: C.mute,
                    marginTop: 10,
                  }}
                >
                  No invoices yet.
                </p>
              </Card>
            </div>
          )}
          {section === "security" && (
            <Card>
              <Label color={C.coralDk}>Sign-in & security</Label>
              <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                {[
                  [
                    "Google",
                    "Linked for one-tap sign-in",
                    "Connected ✓",
                    C.limeDk,
                  ],
                  ["Password", "Backup sign-in method", null, null],
                  [
                    "Email links",
                    `One-time links to ${me.email || "your email"}`,
                    "On",
                    C.sky,
                  ],
                ].map(([t, d, s, sc]) => (
                  <div
                    key={t}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: `1px solid ${C.line}`,
                    }}
                  >
                    <div>
                      <div
                        style={{ font: "700 14px var(--body)", color: C.ink }}
                      >
                        {t}
                      </div>
                      <div
                        style={{ font: "400 12px var(--body)", color: C.mute }}
                      >
                        {d}
                      </div>
                    </div>
                    {s ? (
                      <Pill color={sc} bg={sc + "1A"}>
                        {s}
                      </Pill>
                    ) : (
                      <Btn kind="ghost" onClick={() => {}}>
                        Change password
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// § ADMIN --------------------------------------------------------------------
// Role management for Owner/Organizer to assign/change player roles
// § ADMIN --------------------------------------------------------------------
// Owner toolkit: promote/demote, adjust rating, merge accounts, delete/restore
// events, ban/unban. Every action writes to Supabase and updates the UI.
function Admin({
  me,
  players,
  setPlayers,
  events,
  setEvents,
  reloadPlayers,
  reloadEvents,
}) {
  const isOwner = me.role === "OWNER";
  const [busy, setBusy] = useState(null); // freeform "busy key" to disable buttons
  const [tab, setTab] = useState("members"); // members | events | merge
  const [adjustingId, setAdjustingId] = useState(null);
  const [adjSport, setAdjSport] = useState("badminton");
  const [adjFormat, setAdjFormat] = useState("singles");
  const [adjValue, setAdjValue] = useState("");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banningId, setBanningId] = useState(null);

  const ROLES = ["OWNER", "ORGANIZER", "CLUB_ADMIN", "PLAYER"];
  const roleRank = (r) => ROLES.indexOf(r);

  // ── role change (promote/demote) ──────────────────────────────────────────
  const setRole = async (p, role) => {
    setBusy(`role-${p.id}`);
    const { error } = await supabase
      .from("players")
      .update({ role })
      .eq("id", p.id);
    if (error) {
      alert("Role update failed: " + error.message);
    } else {
      setPlayers((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, role } : x))
      );
      await notify(p.id, {
        actor: me.id,
        type: "role_changed",
        title: `Your role is now ${ROLE_META[role]?.[0] || role}`,
        link: "profile",
      });
    }
    setBusy(null);
  };

  const promote = (p) => {
    const idx = roleRank(p.role);
    if (idx <= 0) return; // already OWNER
    setRole(p, ROLES[idx - 1]);
  };
  const demote = (p) => {
    const idx = roleRank(p.role);
    if (idx < 0 || idx >= ROLES.length - 1) return; // already PLAYER
    setRole(p, ROLES[idx + 1]);
  };

  // ── adjust rating ─────────────────────────────────────────────────────────
  const saveAdjust = async (p) => {
    const val = parseInt(adjValue);
    if (isNaN(val) || val < 3000 || val > 8500) {
      alert("Rating must be between 3000 and 8500.");
      return;
    }
    setBusy(`adj-${p.id}`);
    const { error } = await supabase.from("ratings").upsert(
      {
        player_id: p.id,
        sport: adjSport,
        format: adjFormat,
        rating: val,
      },
      { onConflict: "player_id,sport,format" }
    );
    // log to rating_history so the change is visible on their graph
    await supabase.from("rating_history").insert({
      player_id: p.id,
      sport: adjSport,
      format: adjFormat,
      rating: val,
      match_id: null,
    });
    if (error) {
      alert("Rating adjust failed: " + error.message);
    } else {
      await notify(p.id, {
        actor: me.id,
        type: "rating_adjusted",
        title: "An admin adjusted your rating",
        body: `${adjSport} ${adjFormat} → ${val}`,
        link: "profile",
      });
      setAdjustingId(null);
      setAdjValue("");
      await reloadPlayers?.();
    }
    setBusy(null);
  };

  // ── ban / unban ───────────────────────────────────────────────────────────
  const setBan = async (p, banned, reason) => {
    setBusy(`ban-${p.id}`);
    const { error } = await supabase
      .from("players")
      .update({ banned, ban_reason: banned ? reason || null : null })
      .eq("id", p.id);
    if (error) {
      alert("Ban update failed: " + error.message);
    } else {
      setPlayers((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? { ...x, banned, ban_reason: banned ? reason : null }
            : x
        )
      );
      setBanningId(null);
      setBanReason("");
    }
    setBusy(null);
  };

  // ── merge accounts ────────────────────────────────────────────────────────
  // Reassigns the "from" player's match_players, ratings_history, registrations,
  // and casual matches to the "into" player, then marks the "from" as merged.
  const mergeAccounts = async () => {
    if (!mergeFrom || !mergeInto || mergeFrom === mergeInto) {
      alert("Pick two different accounts.");
      return;
    }
    const fromP = players.find((p) => p.id === mergeFrom);
    const intoP = players.find((p) => p.id === mergeInto);
    if (
      !window.confirm(
        `Merge "${fromP?.name}" into "${intoP?.name}"? All match history moves to ${intoP?.name} and "${fromP?.name}" is retired. This cannot be undone.`
      )
    )
      return;

    setBusy("merge");
    // repoint child rows; ignore individual errors but surface the first
    let firstErr = null;
    const repoint = async (table, col) => {
      const { error } = await supabase
        .from(table)
        .update({ [col]: mergeInto })
        .eq(col, mergeFrom);
      if (error && !firstErr) firstErr = error;
    };
    await repoint("match_players", "player_id");
    await repoint("rating_history", "player_id");
    await repoint("event_registrations", "player_id");
    await repoint("casual_matches", "submitted_by");
    await repoint("casual_matches", "opponent_id");

    // mark the from-account as merged (kept for the audit trail)
    const { error: mErr } = await supabase
      .from("players")
      .update({ merged_into: mergeInto, banned: true, ban_reason: "merged" })
      .eq("id", mergeFrom);
    if (mErr && !firstErr) firstErr = mErr;

    setBusy(null);
    if (firstErr) {
      alert("Merge hit an error: " + firstErr.message);
    } else {
      setMergeFrom("");
      setMergeInto("");
      alert("Accounts merged.");
    }
    await reloadPlayers?.();
  };

  // ── Data integrity: reverse declined matches still affecting ratings ───────
  const cleanupDeclined = async () => {
    setBusy("cleanup");
    const { data: declined, error } = await supabase
      .from("casual_matches")
      .select("*")
      .in("status", ["declined", "cancelled", "reversed"]);
    if (error) {
      alert("Could not load declined matches: " + error.message);
      setBusy(null);
      return;
    }
    let fixed = 0;
    for (const cm of declined || []) {
      const mid = cm.applied_match_id || cm.match_id;
      if (!mid) continue;
      const { data: rows } = await supabase
        .from("match_players")
        .select("match_id")
        .eq("match_id", mid)
        .limit(1);
      if (rows && rows.length) {
        const res = await reverseRatedMatch(
          mid,
          players,
          String(cm.sport).toLowerCase(),
          String(cm.format || "singles").toLowerCase(),
          cm.rating_snapshot
        );
        if (res.ok) fixed += 1;
      }
    }
    setBusy(null);
    alert(
      fixed
        ? `Cleaned up ${fixed} declined match${
            fixed === 1 ? "" : "es"
          }. Ratings and history rebuilt.`
        : "No declined matches needed cleanup."
    );
    await reloadPlayers?.();
  };

  // ── Data integrity: rebuild games/wins/opponents for everyone ──────────────
  const rebuildAllStats = async () => {
    setBusy("rebuild");
    for (const p of players) {
      if (p.banned || p.merged_into) continue;
      for (const sport of ["badminton", "pickleball"]) {
        for (const format of ["singles", "doubles"]) {
          const stats = await recomputePlayerStats(p.id, sport, format);
          if (!stats) continue;
          await supabase
            .from("ratings")
            .update({
              games: stats.games,
              wins: stats.wins,
              opponents: stats.opponents,
            })
            .eq("player_id", p.id)
            .eq("sport", sport)
            .eq("format", format);
        }
      }
    }
    setBusy(null);
    alert(`Rebuilt stats across ${players.length} players.`);
    await reloadPlayers?.();
  };

  // ── delete / restore event (soft delete) ──────────────────────────────────
  const setEventDeleted = async (ev, deleted) => {
    setBusy(`evt-${ev.id}`);

    // If deleting/cancelling an event, reverse all rated matches first.
    if (deleted) {
      const { data: eventMatches, error: matchLoadErr } = await supabase
        .from("matches")
        .select("id, sport, format")
        .eq("event_id", ev.id);

      if (matchLoadErr) {
        alert("Could not load event matches: " + matchLoadErr.message);
        setBusy(null);
        return;
      }

      for (const m of eventMatches || []) {
        const res = await reverseRatedMatch(
          m.id,
          players,
          String(m.sport || ev.sport).toLowerCase(),
          String(m.format || ev.format || "singles").toLowerCase()
        );

        if (!res.ok) {
          alert("Could not reverse event match: " + res.message);
          setBusy(null);
          return;
        }
      }
    }

    const deletedAt = deleted ? new Date().toISOString() : null;

    const { error } = await supabase
      .from("events")
      .update({ deleted_at: deletedAt })
      .eq("id", ev.id);

    if (error) {
      alert("Event update failed: " + error.message);
    } else {
      setEvents((prev) =>
        prev.map((e) => (e.id === ev.id ? { ...e, deleted_at: deletedAt } : e))
      );
    }

    setBusy(null);

    await reloadPlayers?.();
    await reloadEvents?.();
  };

  if (!isOwner) {
    return (
      <div>
        <Label color="#B06BFF">Access control</Label>
        <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 6px" }}>
          Members & roles
        </h1>
        <Sub>
          You can verify results and run events. Only the owner manages roles,
          ratings, and accounts.
        </Sub>
        <Card style={{ marginTop: 20 }} pad={0}>
          {players.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 140px",
                alignItems: "center",
                gap: 12,
                padding: "13px 18px",
                borderTop: i ? `1px solid ${C.line}` : "none",
              }}
            >
              <div style={{ font: "700 13px var(--body)", color: C.ink }}>
                {p.name}
              </div>
              <span style={{ font: "800 15px var(--display)", color: C.ink }}>
                {(p.badminton?.singles || 0).toLocaleString()}
              </span>
              <Pill color={ROLE_META[p.role]?.[1] || C.mute}>
                {ROLE_META[p.role]?.[0] || p.role}
              </Pill>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const liveEvents = (events || []).filter((e) => !e.deleted_at);
  const deletedEvents = (events || []).filter((e) => e.deleted_at);

  return (
    <div>
      <Label color="#B06BFF">Owner console</Label>
      <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 6px" }}>
        Administration
      </h1>
      <Sub>
        Full control over members, ratings, accounts, and events. Every action
        is saved to the database immediately.
      </Sub>

      {/* tab switch */}
      <div
        style={{
          display: "inline-flex",
          background: C.butter2,
          borderRadius: 99,
          padding: 4,
          gap: 4,
          margin: "18px 0",
        }}
      >
        {[
          ["members", "Members"],
          ["events", "Events"],
          ["merge", "Merge accounts"],
          ["data", "Data integrity"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              font: "700 13px var(--body)",
              padding: "9px 16px",
              borderRadius: 99,
              cursor: "pointer",
              border: "none",
              background: tab === k ? "#fff" : "transparent",
              color: tab === k ? C.ink : C.mute,
              boxShadow: tab === k ? "0 2px 8px rgba(0,0,0,.08)" : "none",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── MEMBERS ─────────────────────────────────────────────────────── */}
      {tab === "members" && (
        <Card pad={0}>
          {players.map((p, i) => {
            const r = p.badminton?.singles || 0;
            const isMe = p.id === me.id;
            return (
              <div
                key={p.id}
                style={{
                  padding: "13px 18px",
                  borderTop: i ? `1px solid ${C.line}` : "none",
                  background: p.banned ? "#FFF3F1" : "transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: C.indigo,
                      display: "grid",
                      placeItems: "center",
                      font: "800 13px var(--display)",
                      color: "#fff",
                    }}
                  >
                    {p.name?.[0] || "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ font: "700 13px var(--body)", color: C.ink }}>
                      {p.name}{" "}
                      {p.banned && (
                        <span style={{ color: C.red, fontSize: 11 }}>
                          · BANNED
                        </span>
                      )}
                      {p.merged_into && (
                        <span style={{ color: C.mute, fontSize: 11 }}>
                          · merged
                        </span>
                      )}
                    </div>
                    <div
                      style={{ font: "500 11px var(--body)", color: C.mute }}
                    >
                      {flagForCountry(p.country)} {p.city || "—"} ·{" "}
                      {r.toLocaleString()}
                    </div>
                  </div>
                  <Pill color={ROLE_META[p.role]?.[1] || C.mute}>
                    {ROLE_META[p.role]?.[0] || p.role}
                  </Pill>
                </div>

                {/* action row */}
                {!isMe && (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    <Btn
                      kind="ghost"
                      onClick={() => promote(p)}
                      disabled={
                        busy === `role-${p.id}` || roleRank(p.role) <= 0
                      }
                    >
                      ⬆ Promote
                    </Btn>
                    <Btn
                      kind="ghost"
                      onClick={() => demote(p)}
                      disabled={
                        busy === `role-${p.id}` ||
                        roleRank(p.role) >= ROLES.length - 1
                      }
                    >
                      ⬇ Demote
                    </Btn>
                    <Btn
                      kind="ghost"
                      onClick={() => {
                        setAdjustingId(adjustingId === p.id ? null : p.id);
                        setAdjValue(String(p.badminton?.singles || 4500));
                      }}
                    >
                      ✎ Adjust rating
                    </Btn>
                    {p.banned ? (
                      <Btn
                        kind="lime"
                        onClick={() => setBan(p, false)}
                        disabled={busy === `ban-${p.id}`}
                      >
                        Unban
                      </Btn>
                    ) : (
                      <Btn
                        kind="red"
                        onClick={() =>
                          setBanningId(banningId === p.id ? null : p.id)
                        }
                      >
                        Ban
                      </Btn>
                    )}
                  </div>
                )}

                {/* adjust rating panel */}
                {adjustingId === p.id && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 12,
                      background: C.butter,
                      border: `1px solid ${C.line}`,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <select
                      value={adjSport}
                      onChange={(e) => setAdjSport(e.target.value)}
                      style={{ ...inp, width: "auto", padding: "9px 11px" }}
                    >
                      <option value="badminton">Badminton</option>
                      <option value="pickleball">Pickleball</option>
                    </select>
                    <select
                      value={adjFormat}
                      onChange={(e) => setAdjFormat(e.target.value)}
                      style={{ ...inp, width: "auto", padding: "9px 11px" }}
                    >
                      <option value="singles">Singles</option>
                      <option value="doubles">Doubles</option>
                    </select>
                    <input
                      type="number"
                      min="3000"
                      max="8500"
                      value={adjValue}
                      onChange={(e) => setAdjValue(e.target.value)}
                      style={{ ...inp, width: 110, padding: "9px 11px" }}
                    />
                    <Btn
                      kind="lime"
                      onClick={() => saveAdjust(p)}
                      disabled={busy === `adj-${p.id}`}
                    >
                      Save
                    </Btn>
                    <Btn kind="plain" onClick={() => setAdjustingId(null)}>
                      Cancel
                    </Btn>
                  </div>
                )}

                {/* ban reason panel */}
                {banningId === p.id && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 12,
                      background: "#FFF3F1",
                      border: `1px solid ${C.coralDk}`,
                    }}
                  >
                    <input
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="Reason for ban (optional)"
                      style={{ ...inp, marginBottom: 8 }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn
                        kind="red"
                        onClick={() => setBan(p, true, banReason)}
                        disabled={busy === `ban-${p.id}`}
                      >
                        Confirm ban
                      </Btn>
                      <Btn kind="plain" onClick={() => setBanningId(null)}>
                        Cancel
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* ── EVENTS (delete / restore) ───────────────────────────────────── */}
      {tab === "events" && (
        <div style={{ display: "grid", gap: 14 }}>
          <Card pad={0}>
            <div
              style={{
                padding: "12px 18px",
                font: "800 12px var(--body)",
                letterSpacing: ".06em",
                color: C.mute,
                textTransform: "uppercase",
                borderBottom: `1px solid ${C.line}`,
              }}
            >
              Active events ({liveEvents.length})
            </div>
            {liveEvents.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 18px",
                  borderTop: `1px solid ${C.line}`,
                }}
              >
                <div>
                  <div style={{ font: "700 14px var(--body)", color: C.ink }}>
                    {ev.name}
                  </div>
                  <div style={{ font: "500 12px var(--body)", color: C.mute }}>
                    {ev.sport} · {ev.status} · {fmtDT(ev.date, ev.time)}
                  </div>
                </div>
                <Btn
                  kind="red"
                  onClick={() => setEventDeleted(ev, true)}
                  disabled={busy === `evt-${ev.id}`}
                >
                  🗑 Delete
                </Btn>
              </div>
            ))}
            {liveEvents.length === 0 && (
              <div
                style={{
                  padding: 18,
                  font: "400 13px var(--body)",
                  color: C.mute,
                }}
              >
                No active events.
              </div>
            )}
          </Card>

          {deletedEvents.length > 0 && (
            <Card pad={0} color={C.butter2}>
              <div
                style={{
                  padding: "12px 18px",
                  font: "800 12px var(--body)",
                  letterSpacing: ".06em",
                  color: C.mute,
                  textTransform: "uppercase",
                  borderBottom: `1px solid ${C.line}`,
                }}
              >
                Deleted events ({deletedEvents.length})
              </div>
              {deletedEvents.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 18px",
                    borderTop: `1px solid ${C.line}`,
                  }}
                >
                  <div>
                    <div style={{ font: "700 14px var(--body)", color: C.ink }}>
                      {ev.name}
                    </div>
                    <div
                      style={{ font: "500 12px var(--body)", color: C.mute }}
                    >
                      deleted {fmtDT(ev.deleted_at?.slice(0, 10), "")}
                    </div>
                  </div>
                  <Btn
                    kind="lime"
                    onClick={() => setEventDeleted(ev, false)}
                    disabled={busy === `evt-${ev.id}`}
                  >
                    ♻ Restore
                  </Btn>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ── MERGE ACCOUNTS ──────────────────────────────────────────────── */}
      {tab === "merge" && (
        <Card>
          <Label color={C.coralDk}>Merge duplicate accounts</Label>
          <p
            style={{
              font: "400 13px/1.5 var(--body)",
              color: C.mute,
              margin: "8px 0 16px",
            }}
          >
            Moves all match history, ratings history, and registrations from one
            account into another, then retires the duplicate. Use when the same
            person signed up twice. This cannot be undone.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <Field label="Merge FROM (retired)">
              <select
                value={mergeFrom}
                onChange={(e) => setMergeFrom(e.target.value)}
                style={inp}
              >
                <option value="">Select duplicate…</option>
                {players
                  .filter((p) => !p.merged_into)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.city || "—"})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Merge INTO (kept)">
              <select
                value={mergeInto}
                onChange={(e) => setMergeInto(e.target.value)}
                style={inp}
              >
                <option value="">Select keeper…</option>
                {players
                  .filter((p) => !p.merged_into && p.id !== mergeFrom)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.city || "—"})
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Btn
            kind="primary"
            onClick={mergeAccounts}
            disabled={busy === "merge" || !mergeFrom || !mergeInto}
          >
            {busy === "merge" ? "Merging…" : "Merge accounts"}
          </Btn>
        </Card>
      )}

      {tab === "data" && (
        <div style={{ display: "grid", gap: 14 }}>
          <Card>
            <Label color={C.coralDk}>Clean up declined matches</Label>
            <p
              style={{
                font: "400 13px/1.5 var(--body)",
                color: C.mute,
                margin: "8px 0 14px",
              }}
            >
              Finds matches an opponent declined that still affect ratings or
              show in history, and fully reverses each — restoring ratings and
              removing the match from history and recent activity. Runs across
              all players at once.
            </p>
            <Btn
              kind="red"
              onClick={cleanupDeclined}
              disabled={busy === "cleanup"}
            >
              {busy === "cleanup" ? "Cleaning…" : "Clean up declined matches"}
            </Btn>
          </Card>

          <Card>
            <Label color={C.skyDk}>Rebuild ratings & stats</Label>
            <p
              style={{
                font: "400 13px/1.5 var(--body)",
                color: C.mute,
                margin: "8px 0 14px",
              }}
            >
              Recomputes every player's games, wins, and distinct-opponent
              counts directly from the real match data, so the numbers always
              match reality. Run after cleaning up if any count looks off.
            </p>
            <Btn
              kind="dark"
              onClick={rebuildAllStats}
              disabled={busy === "rebuild"}
            >
              {busy === "rebuild" ? "Rebuilding…" : "Rebuild all stats"}
            </Btn>
          </Card>
        </div>
      )}
    </div>
  );
}

// § CONTACT ------------------------------------------------------------------
// Shared contact form component: CONTACT_ENDPOINT connects it to your email
const CONTACT_ENDPOINT = ""; // Paste Formspree URL or /api/contact endpoint here
function ContactForm({ me }) {
  const [f, setF] = useState({
    name: me?.name || "",
    email: me?.email || "",
    message: "",
  });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid =
    f.name.trim() && f.email.includes("@") && f.message.trim().length > 4;
  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      if (CONTACT_ENDPOINT)
        await fetch(CONTACT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...f, source: "RallyRank" }),
        });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 99,
            background: C.lime + "2A",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 12px",
            fontSize: 28,
          }}
        >
          ✅
        </div>
        <h3 style={{ font: "700 20px var(--display)", margin: "0 0 6px" }}>
          Message sent
        </h3>
        <p style={{ font: "400 13px/1.6 var(--body)", color: C.mute }}>
          Thanks {f.name.split(" ")[0]}, we'll reply to {f.email} soon.
        </p>
      </div>
    );
  return (
    <div>
      <Field label="Your name">
        <input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="Full name"
          style={inp}
        />
      </Field>
      <Field label="Email">
        <input
          value={f.email}
          type="email"
          onChange={(e) => setF({ ...f, email: e.target.value })}
          placeholder="you@example.com"
          style={inp}
        />
      </Field>
      <Field label="Message">
        <textarea
          value={f.message}
          onChange={(e) => setF({ ...f, message: e.target.value })}
          rows={5}
          placeholder="Feedback, bugs, partnerships…"
          style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
      <Btn kind="primary" full big onClick={submit} disabled={!valid || busy}>
        {busy ? "Sending…" : "Send message"}
      </Btn>
      {!CONTACT_ENDPOINT && (
        <p
          style={{
            font: "400 11px/1.5 var(--body)",
            color: C.mute,
            marginTop: 10,
            textAlign: "center",
          }}
        >
          Set CONTACT_ENDPOINT to route submissions to your email.
        </p>
      )}
    </div>
  );
}
// Full-page contact for signed-out users
function ContactUs({ me, onBack, onLogo }) {
  return (
    <Shell>
      <div style={{ background: C.indigo }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "20px 22px" }}>
          <button
            onClick={onLogo}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <Logo size={36} onDark />
          </button>
        </div>
      </div>
      <div
        style={{ maxWidth: 540, margin: "0 auto", padding: "40px 22px 80px" }}
      >
        <Label>Contact</Label>
        <H1>Get in touch.</H1>
        <Sub>
          Questions, feedback, partnerships, or a problem with your rating.
        </Sub>
        <Card style={{ marginTop: 22 }}>
          <ContactForm me={me} />
        </Card>
        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button
            onClick={onBack}
            style={{
              font: "600 14px var(--body)",
              color: C.mute,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
        </div>
      </div>
    </Shell>
  );
}
// In-app contact tab panel
function ContactPanel({ me }) {
  return (
    <div>
      <Label>Support</Label>
      <h1 style={{ font: "700 34px var(--display)", margin: "4px 0 6px" }}>
        Contact us
      </h1>
      <Sub>Questions, feedback, or a correction — we'll reply by email.</Sub>
      <div style={{ maxWidth: 540, marginTop: 20 }}>
        <Card>
          <ContactForm me={me} />
        </Card>
      </div>
    </div>
  );
}
