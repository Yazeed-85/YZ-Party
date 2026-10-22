// الانسحاب أثناء اللعب: زر ✕ في شريط النقاط + اكتشاف انسحاب الخصم (مغادرة، إغلاق المضيف للغرفة، أو انقطاع طويل)
//   - من يبقى يرى «انسحب خصمك وأنت الفائز» ثم:
//       مضيف  ← تُسجَّل له النقاط ويعود إلى lobby غرفته
//       منضم  ← (المضيف انسحب فالغرفة أُغلقت) يعود إلى القائمة الرئيسية
//   - من ينسحب يعود إلى القائمة الرئيسية
import { onValue } from "./firebase.js";
import { roomRef, leaveRoom, goLobby } from "./room.js";
import { finishGame, makeResult } from "./result.js";
import { toast, sfx, setExitHandler, confirmDialog, showOverlay } from "./ui.js";

const GRACE_MS = 15000;   // انقطاع أقل من هذا (مثل تحديث الصفحة) لا يُعدّ انسحاباً
const SHOW_MS = 3600;     // مدة عرض رسالة الفوز قبل الانتقال

// opts.isOver(): هل انتهت اللعبة فعلاً؟  opts.onGone(): تنظيف خاص باللعبة (إيقاف صوت مثلاً)
// ترجع { busy() }: ألعابك تتجاهل إعادة التوجيه التلقائية للردهة ما دام busy() صحيحاً
export function initGameExit(ctx, opts = {}) {
  const isOver = opts.isOver || (() => false);
  const opp = Object.keys(ctx.players).find(k => k !== ctx.uid);
  const oppName = ctx.players[opp]?.name || "خصمك";
  let players = ctx.players, handled = false, leaving = false, grace = null;
  const home = () => { location.href = "../../index.html"; };
  const busy = () => handled || leaving;

  async function gone() {
    if (handled || leaving) return;
    clearTimeout(grace); grace = null;
    if (isOver()) {                                        // اللعبة منتهية: المضيف سيُنهيها بمؤقته المعتاد، والمنضم يعود للرئيسية
      if (ctx.isHost) return;
      handled = true; opts.onGone?.();
      toast("غادر المضيف الغرفة"); await leaveRoom(ctx.code).catch(() => {}); setTimeout(home, 1600); return;
    }
    handled = true; opts.onGone?.(); sfx.win();
    showOverlay({ icon: "🏳️", title: `انسحب ${oppName}`, sub: "أنت الفائز 🏆" });
    await new Promise(r => setTimeout(r, SHOW_MS));
    if (ctx.isHost) {
      const left = Object.fromEntries(Object.entries(players).filter(([k]) => k !== opp));
      await finishGame(ctx, makeResult("win", [ctx.uid], { forfeit: true }), left).catch(() => {});
      goLobby(ctx.code);                                   // lobby غرفتك
    } else {
      await leaveRoom(ctx.code).catch(() => {});
      home();                                              // المضيف غادر والغرفة أُغلقت
    }
  }

  async function leave() {
    if (handled || leaving) return;
    const ok = await confirmDialog(isOver() ? "مغادرة الغرفة؟" : "هل تريد الانسحاب؟ سيُعلَن خصمك فائزاً.", "انسحاب", "ابقَ");
    if (!ok) return;
    leaving = true; opts.onGone?.();
    try { await leaveRoom(ctx.code); } catch { /* نخرج على أي حال */ }
    home();
  }
  setExitHandler(leave);

  if (opp) {
    onValue(roomRef(ctx.code, "meta"), s => {
      const m = s.val();
      if (!m || m.status === "closed") { if (ctx.isHost) { if (!leaving) home(); } else gone(); }
    });
    onValue(roomRef(ctx.code, "players"), s => {
      const p = s.val();
      if (!p || !p[ctx.uid]) { if (!busy()) { handled = true; toast("أُخرجت من الغرفة", "error"); setTimeout(home, 1200); } return; }
      players = p;
      const o = p[opp];
      if (!o) return gone();
      if (o.connected === false) { grace ??= setTimeout(gone, GRACE_MS); }
      else { clearTimeout(grace); grace = null; }
    }, () => {});
  }
  return { busy };
}
