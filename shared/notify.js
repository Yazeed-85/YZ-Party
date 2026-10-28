// إشعارات اللاعب في الردهة: (1) رسائل الإدارة المخزّنة في inbox/{pid} (تظهر ثم تُحذف) (2) ظهور الخبرة والمستوى الجديد بحركة GSAP
// تُستورد من index.html فقط. لا تقرأ إلا مسار اللاعب نفسه.
import { db, ref, remove, onValue } from "./firebase.js";
import { identity } from "./identity.js";
import { levelOf, prog, levelTag, gs, MSG, COL, tierOf } from "./level.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
let chain = Promise.resolve(); const enqueue = f => (chain = chain.then(f).catch(e => console.warn("notify", e)));

async function show(build, ms) {
  const G = await gs(), c = el("div", "ntf"); c.setAttribute("role", "status"); document.body.append(c);
  let skip; const click = new Promise(r => (skip = r)); c.onclick = () => skip();
  if (G) G.fromTo(c, { y: -90, opacity: 0, scale: .9 }, { y: 0, opacity: 1, scale: 1, duration: .55, ease: "back.out(1.6)" });
  await build(c, G); await Promise.race([sleep(ms), click]);
  if (G) await G.to(c, { y: -70, opacity: 0, duration: .35, ease: "power2.in" }); c.remove();
}
function burst(c, G, col) {
  if (!G) return; for (let i = 0; i < 16; i++) { const d = el("i", "dot"); d.style.background = col; c.append(d); const a = i / 16 * Math.PI * 2, r = 70 + Math.random() * 50; G.to(d, { x: Math.cos(a) * r, y: Math.sin(a) * r, opacity: 0, scale: .3, duration: .9 + Math.random() * .4, ease: "power2.out", onComplete: () => d.remove() }); }
}
const msgCard = v => show((c, G) => { const [ic, t] = MSG[v.k] || MSG.custom; c.append(el("div", "ic", ic), el("p", "", v.m || t)); if (G) G.from(c.querySelector(".ic"), { scale: 0, rotate: -40, duration: .6, ease: "elastic.out(1,.5)", delay: .15 }); }, 6500);
const xpCard = (from, to) => show(async (c, G) => {
  const a = prog(from), b = prog(to), up = b.level > a.level, tag = el("div"), fill = el("i"), bar = el("div", "xb");
  tag.append(levelTag(a.level, true)); bar.append(fill); c.append(el("div", "xg", `+${to - from} XP`), tag, bar); fill.style.width = a.pct + "%";
  if (!G) { tag.replaceChildren(levelTag(b.level, true)); fill.style.width = b.pct + "%"; return; }
  const o = { v: a.level }, tl = G.timeline({ delay: .4 });
  tl.to(fill, { width: (up ? 100 : b.pct) + "%", duration: 1, ease: "power2.out" }, 0);
  if (up) {
    tl.to(o, { v: b.level, duration: 1.2, ease: "power1.out", onUpdate: () => tag.replaceChildren(levelTag(Math.round(o.v), true)) }, 0)
      .add(() => { burst(c, G, COL[tierOf(b.level)]); G.fromTo(tag, { scale: 1.5 }, { scale: 1, duration: .6, ease: "elastic.out(1,.45)" }); })
      .set(fill, { width: "0%" }).to(fill, { width: b.pct + "%", duration: .8, ease: "power2.out" });
  }
  await tl.then?.() ; 
}, 4200);

(async () => {
  const me = await identity(); if (!me.ok) return;
  const seenMsg = new Set(), key = "yz_xp_" + me.pid;
  onValue(ref(db, `inbox/${me.pid}`), s => Object.entries(s.val() || {}).forEach(([id, v]) => {
    if (seenMsg.has(id)) return; seenMsg.add(id);
    enqueue(async () => { await msgCard(v); await remove(ref(db, `inbox/${me.pid}/${id}`)).catch(() => {}); });   // تُحذف بعد عرضها فقط: إن أُغلقت الصفحة قبل ذلك تبقى مخزّنة
  }), () => {});
  onValue(ref(db, `profiles/${me.pid}/stats/mvp`), s => {
    const m = s.val() || 0, k = "yz_mvp_" + me.pid, seen = +(localStorage.getItem(k) || 0);
    if (m > seen) { localStorage.setItem(k, m); enqueue(() => msgCard({ k: "mvp" })); } else if (m < seen) localStorage.setItem(k, m);
  }, () => {});
  onValue(ref(db, `profiles/${me.pid}/stats/xp`), s => {
    const x = s.val() || 0, seen = +(localStorage.getItem(key) || 0);
    if (x > seen) { localStorage.setItem(key, x); enqueue(() => xpCard(seen, x)); } else if (x < seen) localStorage.setItem(key, x);
  }, () => {});
})();
