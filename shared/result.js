// صيغة النتيجة الموحدة التي تُرجعها كل لعبة عند انتهائها.
//   { outcome: "win" | "draw" | "coop-win" | "coop-lose", ranking: [uid, ...], details: {} }
//   win       الفائز هو ranking[0]، والثاني يأخذ نقطة فقط لو كان اللاعبون 3 أو أكثر
//   draw      كل اللاعبين يتعادلون
//   coop-win  كل اللاعبين يفوزون معاً (مثل الكلمة المشتركة)
//   coop-lose كل اللاعبين يخسرون معاً وتُخصم من كل واحد منهم نقطتان (لا تنزل النقاط عن الصفر)
//   team-win  فريق فائز: كل من في ranking ينال نقاط الفوز كاملة، والبقية صفر (مثل الكلمات المشفرة 2 ضد 2)
import { db, ref, runTransaction, update, remove } from "./firebase.js";
import { roomRef, gameRef } from "./room.js";
import { MAXXP } from "./level.js";
import { scoreGame } from "./xp-engine.js";
export { evBy } from "./xp-engine.js";

export const POINTS = { win: 3, second: 1, draw: 1, coop: 3, coopLose: 2 };
const OUTCOMES = ["win", "draw", "coop-win", "coop-lose", "team-win"];

export function makeResult(outcome, ranking = [], details = {}) {
  if (!OUTCOMES.includes(outcome)) throw new Error("نتيجة غير معروفة: " + outcome);
  if ((outcome === "win" || outcome === "team-win") && !ranking.length) throw new Error("نتيجة الفوز تحتاج ترتيباً");
  return { outcome, ranking, details };
}

export function pointsFor(result, uids) {
  const pts = Object.fromEntries(uids.map(u => [u, 0]));
  const { outcome, ranking } = result;
  if (outcome === "win") {
    pts[ranking[0]] = POINTS.win;
    if (uids.length > 2 && ranking[1]) pts[ranking[1]] = POINTS.second;
  } else if (outcome === "draw") uids.forEach(u => (pts[u] = POINTS.draw));
  else if (outcome === "team-win") ranking.forEach(u => { if (u in pts) pts[u] = POINTS.win; });
  else if (outcome === "coop-lose") uids.forEach(u => (pts[u] = -POINTS.coopLose));
  else if (outcome === "coop-win") uids.forEach(u => (pts[u] = POINTS.coop + (result.details?.bonus || 0)));
  return pts;
}

// سجل اللاعبين الدائم (بالمعرّف الثابت pid) + سجل الغرفة. لا يُعطّل إنهاء اللعبة إن فشل
async function record(ctx, result, players) {
  const g = ctx.meta?.game || "", t = Date.now(), uids = Object.keys(players), { outcome, ranking } = result;
  const resOf = u => outcome === "win" ? (u === ranking[0] ? "win" : "lose") : outcome === "team-win" ? (ranking.includes(u) ? "win" : "lose") : outcome;
  const pts = pointsFor(result, uids), win = outcome === "win" ? [ranking[0]] : outcome === "team-win" ? ranking : [];
  const SC = scoreGame(g, resOf, ranking, result.details, uids);
  const id = t.toString(36) + Math.random().toString(36).slice(2, 5), jobs = [];
  jobs.push(update(roomRef(ctx.code, "party/log"), { [id]: { g, t, o: outcome, w: win.map(u => players[u]?.name || "لاعب"), ...(SC.mvp ? { mvp: players[SC.mvp]?.name || "لاعب" } : {}) } }));
  for (const u of uids) {
    const me = players[u]; if (!me?.pid) continue;
    const r = resOf(u), gain = SC.gain[u] || 0, mvp = SC.mvp === u, withs = uids.filter(x => x !== u).map(x => (players[x].pid ? { p: players[x].pid, n: players[x].name } : { n: players[x].name }));
    jobs.push(update(ref(db, `history/${me.pid}`), { [id]: { g, t, r, pts: pts[u] || 0, n: me.name, w: withs, room: ctx.code, xp: gain, ...(mvp ? { mvp: true } : {}) } }));
    jobs.push(runTransaction(ref(db, `profiles/${me.pid}/stats`), cur => {
      const s = cur || {}, gs = { ...(s.g || {}) }, o = { ...(gs[g] || {}) };
      o.p = (o.p || 0) + 1; if (mvp) o.m = (o.m || 0) + 1; if (r === "win" || r === "coop-win") o.w = (o.w || 0) + 1; gs[g || "?"] = o;
      return { ...s, xp: Math.min(MAXXP, (s.xp || 0) + gain), mvp: (s.mvp || 0) + (mvp ? 1 : 0), games: (s.games || 0) + 1, wins: (s.wins || 0) + (r === "win" || r === "coop-win" ? 1 : 0), g: gs, last: t };
    }));
  }
  await Promise.allSettled(jobs);
}

// تستدعيها اللعبة عند النهاية من كل الأجهزة، والمضيف وحده هو من يكتب النقاط وينهي الجولة
// players اختياري: عند الانسحاب نمرّر اللاعبين الباقين فقط حتى لا تُنشأ نقاط لمن غادر
export async function finishGame(ctx, result, players = ctx.players) {
  if (!ctx.isHost) return null;
  const pts = pointsFor(result, Object.keys(players));
  await runTransaction(roomRef(ctx.code, "party/scores"), cur => {
    const s = cur || {};
    for (const [u, p] of Object.entries(pts)) s[u] = Math.max(0, (s[u] || 0) + p);
    return s;
  });
  await record(ctx, result, players).catch(() => {});
  await remove(gameRef(ctx.code));
  await update(roomRef(ctx.code, "meta"), { status: "lobby", game: null, pick: null, lastResult: result });
  return pts;
}
