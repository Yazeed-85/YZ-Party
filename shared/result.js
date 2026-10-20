// صيغة النتيجة الموحدة التي تُرجعها كل لعبة عند انتهائها.
//   { outcome: "win" | "draw" | "coop-win" | "coop-lose", ranking: [uid, ...], details: {} }
//   win       الفائز هو ranking[0]، والثاني يأخذ نقطة فقط لو كان اللاعبون 3 أو أكثر
//   draw      كل اللاعبين يتعادلون
//   coop-win  كل اللاعبين يفوزون معاً (مثل الكلمة المشتركة)
//   coop-lose كل اللاعبين يخسرون معاً
import { ref, runTransaction, update, remove } from "./firebase.js";
import { roomRef, gameRef } from "./room.js";

export const POINTS = { win: 3, second: 1, draw: 1, coop: 3 };
const OUTCOMES = ["win", "draw", "coop-win", "coop-lose"];

export function makeResult(outcome, ranking = [], details = {}) {
  if (!OUTCOMES.includes(outcome)) throw new Error("نتيجة غير معروفة: " + outcome);
  if (outcome === "win" && !ranking.length) throw new Error("نتيجة الفوز تحتاج ترتيباً");
  return { outcome, ranking, details };
}

export function pointsFor(result, uids) {
  const pts = Object.fromEntries(uids.map(u => [u, 0]));
  const { outcome, ranking } = result;
  if (outcome === "win") {
    pts[ranking[0]] = POINTS.win;
    if (uids.length > 2 && ranking[1]) pts[ranking[1]] = POINTS.second;
  } else if (outcome === "draw") uids.forEach(u => (pts[u] = POINTS.draw));
  else if (outcome === "coop-win") uids.forEach(u => (pts[u] = POINTS.coop + (result.details?.bonus || 0)));
  return pts;
}

// تستدعيها اللعبة عند النهاية من كل الأجهزة، والمضيف وحده هو من يكتب النقاط وينهي الجولة
export async function finishGame(ctx, result) {
  if (!ctx.isHost) return null;
  const pts = pointsFor(result, Object.keys(ctx.players));
  await runTransaction(roomRef(ctx.code, "party/scores"), cur => {
    const s = cur || {};
    for (const [u, p] of Object.entries(pts)) s[u] = (s[u] || 0) + p;
    return s;
  });
  await remove(gameRef(ctx.code));
  await update(roomRef(ctx.code, "meta"), { status: "lobby", game: null, pick: null, lastResult: result });
  return pts;
}
