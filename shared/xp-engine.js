// محرك الخبرة وأفضل لاعب (MVP): نظام مشترك واحد. كل لعبة تُسلّم أحداثها فقط في details.ev = { uid: { مفتاح: عدد } }
// وهو يحوّلها إلى خبرة ويختار الـMVP. صيغ الخبرة والسقوف وتخزين النتيجة كلها هنا في مكان واحد، فتبقى الألعاب متسقة.
import { xpGain, WEIGHT } from "./level.js";

// خبرة كل حدث (بعد ضربها في وزن اللعبة؟ لا: هي أرقام نهائية). المفاتيح تعرّفها كل لعبة عند إنهائها:
//  r جولات/نقاط مكسوبة · d قطع ريفيرسي · b مربعات · q أسئلة غير مستهلكة · a عميل صحيح · h تلميح ناجح للقائد
//  c كذّاب مكشوف · d(بار الكذّابين) دفاع ناجح عن الصدق · k إقصاء خصم · sv نجاة من الزناد
export const EV = {
  xo: { r: 30 }, "hot-cold": { r: 25 }, "reverse-echo": { r: 9 }, "truth-lie": { r: 22 },
  reversi: { d: 1 }, "dots-boxes": { b: 4 }, "my-balance": { q: 6 },
  codenames: { a: 25, h: 15 }, "liars-bar": { c: 40, d: 25, k: 35, sv: 20 },
};
export const MVP_BASE = 50;                       // مكافأة الـMVP × وزن اللعبة
export const evBy = (order, arr, key) => Object.fromEntries(order.map((u, i) => [u, { [key]: Math.max(0, +arr?.[i] || 0) }]));

export function scoreGame(game, r, ranking, details, uids) {
  const tbl = EV[game] || {}, ev = details?.ev || {}, perf = {}, e = {};
  for (const u of uids) {
    const o = ev[u] || {}; let x = 0;
    for (const [k, v] of Object.entries(tbl)) x += Math.min(100, Math.max(0, +o[k] || 0)) * v;
    e[u] = Math.min(300, Math.round(x));
    perf[u] = e[u] + (r(u) === "win" || r(u) === "coop-win" ? 100 : 0);
  }
  const coop = uids.every(u => String(r(u)).startsWith("coop")); let mvp = null, best = 0;
  if (!coop && uids.length > 1) for (const u of [...ranking, ...uids]) if (uids.includes(u) && perf[u] > best) { best = perf[u]; mvp = u; }   // التعادل في الأداء يُحسم لمن هو أعلى في الترتيب
  const gain = {};
  for (const u of uids) gain[u] = xpGain(game, r(u), { rank: ranking.indexOf(u), n: uids.length, bonus: details?.bonus || 0, extra: e[u] + (u === mvp ? Math.round(MVP_BASE * (WEIGHT[game] || 1.2)) : 0) + (details?.xp?.[u] || 0) });
  return { gain, mvp };
}
