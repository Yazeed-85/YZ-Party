// الانسحاب أثناء اللعب: زر ✕ في شريط النقاط + اكتشاف انسحاب الخصم (مغادرة، إغلاق المضيف للغرفة، أو انقطاع طويل)
//   - من يبقى يرى «انسحب خصمك وأنت الفائز» ثم:
//       مضيف  ← تُسجَّل له النقاط ويعود إلى lobby غرفته
//       منضم  ← (المضيف انسحب فالغرفة أُغلقت) يعود إلى القائمة الرئيسية
//   - من ينسحب يعود إلى القائمة الرئيسية
//   - انقطاع الاتصال وحده لا يُنهي اللعبة أبداً (الهاتف يعلّق الاتصال عند التوقف أو تبديل التطبيق): تظهر شارة «بانتظار عودته»،
//     وبعد دقيقة يظهر زر يدوي «اعتباره منسحباً». الانسحاب التلقائي فقط عند خروجه الصريح (زر ✕ أو إغلاق المضيف للغرفة)
import { onValue, get } from "./firebase.js";
import { roomRef, leaveRoom, goLobby } from "./room.js";
import { finishGame, makeResult } from "./result.js";
import { toast, sfx, setExitHandler, confirmDialog, showOverlay } from "./ui.js";

const SHOW_DROP_MS = 12000;   // بعد هذا الانقطاع تظهر شارة الانتظار
const CLAIM_MS = 60000;      // وبعد هذا يظهر زر الإعلان اليدوي عن الانسحاب
const MISS_MS = 3000;        // اختفاء اسم الخصم يجب أن يستمر هذه المدة (لتجاهل أي وميض عابر) قبل اعتباره خروجاً
const SHOW_MS = 3600;     // مدة عرض رسالة الفوز قبل الانتقال

// opts.isOver(): هل انتهت اللعبة فعلاً؟  opts.onGone(): تنظيف خاص باللعبة (إيقاف صوت مثلاً)
// ترجع { busy() }: ألعابك تتجاهل إعادة التوجيه التلقائية للردهة ما دام busy() صحيحاً
export function initGameExit(ctx, opts = {}) {
  const isOver = opts.isOver || (() => false);
  const opp = Object.keys(ctx.players).find(k => k !== ctx.uid);
  const oppName = ctx.players[opp]?.name || "خصمك";
  let players = ctx.players, handled = false, leaving = false, selfT = null, metaT = null, miss = null, dropT = null, claimT = null, bar = null;
  const home = () => { location.href = "../../index.html"; };
  const busy = () => handled || leaving;

  function endDrop() {
    clearTimeout(dropT); clearTimeout(claimT); dropT = claimT = null;
    if (bar) { const b = bar; bar = null; window.gsap ? gsap.to(b, { opacity: 0, y: -12, duration: .25, onComplete: () => b.remove() }) : b.remove(); }
  }
  function startDrop() {
    if (dropT || bar || handled || leaving) return;
    dropT = setTimeout(() => {
      dropT = null; bar = document.createElement("div"); bar.className = "dropbar";
      const t = document.createElement("span"); t.textContent = `انقطع اتصال ${oppName}… بانتظار عودته`; bar.append(t); document.body.append(bar);
      if (window.gsap) gsap.fromTo(bar, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: .4, ease: "back.out(2)" });
      claimT = setTimeout(() => {
        const b = document.createElement("button"); b.textContent = "اعتباره منسحباً";
        b.onclick = async () => { if (await confirmDialog(`اعتبار ${oppName} منسحباً وإنهاء اللعبة بفوزك؟`, "نعم، انسحب", "أنتظر")) gone(); };
        bar?.append(b);
      }, CLAIM_MS - SHOW_DROP_MS);
    }, SHOW_DROP_MS);
  }

  async function gone() {
    if (handled || leaving) return;
    clearTimeout(miss); miss = null; endDrop();
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
      if (m && m.status !== "closed") { clearTimeout(metaT); metaT = null; return; }
      const act = () => { if (ctx.isHost) { if (!leaving) home(); } else gone(); };
      if (m) return act();                                 // أُغلقت صراحةً
      metaT ??= setTimeout(async () => {                   // اختفاء مفاجئ: نتحقق بقراءة مباشرة قبل أي إجراء
        metaT = null; try { if (!(await get(roomRef(ctx.code, "meta"))).exists()) act(); } catch { /* نتجاهل */ }
      }, MISS_MS);
    });
    onValue(roomRef(ctx.code, "players"), s => {
      const p = s.val();
      if (!p || !p[ctx.uid]) {                             // لا نصدّق الاختفاء قبل التحقق منه بقراءة مباشرة
        selfT ??= setTimeout(async () => {
          selfT = null;
          try { if (!(await get(roomRef(ctx.code, `players/${ctx.uid}`))).exists() && !busy()) { handled = true; toast("أُخرجت من الغرفة", "error"); setTimeout(home, 1200); } } catch { /* نتجاهل */ }
        }, MISS_MS);
        return;
      }
      clearTimeout(selfT); selfT = null;
      players = p;
      const o = p[opp];
      if (!o) { miss ??= setTimeout(() => { miss = null; gone(); }, MISS_MS); return; }   // أُزيل فعلاً: خروج صريح
      clearTimeout(miss); miss = null;
      o.connected === false ? startDrop() : endDrop();
    }, () => {});
  }
  return { busy };
}

// ===== انسحاب جماعي (3 لاعبين فأكثر): من يغادر يُقصى ويكمل الباقون، وخروج المضيف (الحَكَم) يُنهي اللعبة للجميع =====
// opts.isOver(): هل انتهت اللعبة؟   opts.onGone(uid, name): خروج لاعب آخر (يتصرف المضيف وحده في لعبتك)
// opts.onHostGone(): المضيف أغلق الغرفة   opts.onLeave(): أنت تنسحب الآن
// ترجع { busy() }: ألعابك تتجاهل إعادة التوجيه التلقائية للردهة ما دام busy() صحيحاً
export function initGroupExit(ctx, opts = {}) {
  const isOver = opts.isOver || (() => false);
  const names = Object.fromEntries(Object.entries(ctx.players).map(([k, v]) => [k, v.name || "لاعب"]));
  let players = ctx.players, handled = false, leaving = false, selfT = null, metaT = null, bar = null;
  const miss = {}, dropT = {}, dropped = new Set(), seen = new Set(Object.keys(ctx.players));
  const home = () => { location.href = "../../index.html"; };
  const busy = () => handled || leaving;

  function refreshBar() {                                  // شارة واحدة لكل من انقطع اتصالهم
    const list = [...dropped].map(u => names[u] || "لاعب");
    if (!list.length) { if (bar) { const b = bar; bar = null; window.gsap ? gsap.to(b, { opacity: 0, y: -12, duration: .25, onComplete: () => b.remove() }) : b.remove(); } return; }
    if (!bar) {
      bar = document.createElement("div"); bar.className = "dropbar"; bar.append(document.createElement("span")); document.body.append(bar);
      if (window.gsap) gsap.fromTo(bar, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: .4, ease: "back.out(2)" });
    }
    bar.querySelector("span").textContent = `انقطع اتصال ${list.join("، ")}… بانتظار العودة`;
  }
  const startDrop = uid => { if (dropT[uid] || dropped.has(uid) || handled || leaving) return; dropT[uid] = setTimeout(() => { delete dropT[uid]; dropped.add(uid); refreshBar(); }, SHOW_DROP_MS); };
  const endDrop = uid => { clearTimeout(dropT[uid]); delete dropT[uid]; if (dropped.delete(uid)) refreshBar(); };

  async function hostGone() {
    if (handled || leaving) return;
    handled = true; opts.onHostGone?.();
    if (isOver()) toast("غادر المضيف الغرفة");
    else showOverlay({ icon: "🏳️", title: "غادر المضيف", sub: "انتهت اللعبة وأُغلقت الغرفة" });
    await new Promise(r => setTimeout(r, SHOW_MS));
    await leaveRoom(ctx.code).catch(() => {});
    home();
  }
  async function leave() {
    if (handled || leaving) return;
    const msg = isOver() ? "مغادرة الغرفة؟" : ctx.isHost ? "أنت المضيف: مغادرتك تُنهي اللعبة وتُغلق الغرفة للجميع. تخرج؟" : "هل تريد الانسحاب؟ ستخرج من اللعبة ولن تعود إليها.";
    if (!(await confirmDialog(msg, "انسحاب", "ابقَ"))) return;
    leaving = true; opts.onLeave?.();
    try { await leaveRoom(ctx.code); } catch { /* نخرج على أي حال */ }
    home();
  }
  setExitHandler(leave);

  onValue(roomRef(ctx.code, "meta"), s => {
    const m = s.val();
    if (m && m.status !== "closed") { clearTimeout(metaT); metaT = null; return; }
    const act = () => { if (ctx.isHost) { if (!leaving) home(); } else hostGone(); };
    if (m) return act();                                   // أُغلقت صراحةً
    metaT ??= setTimeout(async () => {                     // اختفاء مفاجئ: نتحقق بقراءة مباشرة قبل أي إجراء
      metaT = null; try { if (!(await get(roomRef(ctx.code, "meta"))).exists()) act(); } catch { /* نتجاهل */ }
    }, MISS_MS);
  });
  onValue(roomRef(ctx.code, "players"), s => {
    const p = s.val();
    if (!p || !p[ctx.uid]) {
      selfT ??= setTimeout(async () => {
        selfT = null;
        try { if (!(await get(roomRef(ctx.code, `players/${ctx.uid}`))).exists() && !busy()) { handled = true; toast("أُخرجت من الغرفة", "error"); setTimeout(home, 1200); } } catch { /* نتجاهل */ }
      }, MISS_MS);
      return;
    }
    clearTimeout(selfT); selfT = null; players = p;
    for (const [u, v] of Object.entries(p)) { names[u] = v.name || names[u] || "لاعب"; seen.add(u); }
    for (const u of [...seen]) {
      if (u === ctx.uid) continue;
      if (!p[u]) { miss[u] ??= setTimeout(() => { delete miss[u]; seen.delete(u); endDrop(u); opts.onGone?.(u, names[u]); }, MISS_MS); continue; }   // أُزيل فعلاً: خروج صريح
      clearTimeout(miss[u]); delete miss[u];
      p[u].connected === false ? startDrop(u) : endDrop(u);
    }
  }, () => {});
  return { busy };
}
