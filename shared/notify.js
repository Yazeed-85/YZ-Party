// إشعارات اللاعب في الردهة. بطاقة واحدة فقط في كل مرة، تجمع كل ما ينتظره:
//   ⭐ أفضل لاعب (MVP) · +XP مع شريط المستوى (وانفجار عند رفع المستوى) · رسائل الإدارة من inbox/{pid}
// كل ما يصل خلال ثانية واحدة (أو كان بانتظاره عند فتح الصفحة) يُدمج في بطاقة واحدة بدل بطاقات متتالية. ما يصل أثناء عرضها ينتظر ثم يُعرض في بطاقة واحدة أخرى.
// تُستورد من index.html فقط. لا تقرأ إلا مسار اللاعب نفسه.
import { db, ref, remove, onValue } from "./firebase.js";
import { identity } from "./identity.js";
import { levelOf, prog, levelTag, gs, MSG, COL, tierOf, inject } from "./level.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const COLLECT_MS = 900;                    // نمهل الأحداث المتقاربة لتُدمج في بطاقة واحدة
let pending = { mvp: 0, xp: null, msgs: new Map() }, timer = null, showing = false;

function burst(c, G, col) {
  if (!G) return; for (let i = 0; i < 16; i++) { const d = el("i", "dot"); d.style.background = col; c.append(d); const a = i / 16 * Math.PI * 2, r = 70 + Math.random() * 50; G.to(d, { x: Math.cos(a) * r, y: Math.sin(a) * r, opacity: 0, scale: .3, duration: .9 + Math.random() * .4, ease: "power2.out", onComplete: () => d.remove() }); }
}

// سطر الخبرة: شريط يمتلئ، وعند رفع المستوى يرتفع الرقم مع انفجار ثم يكمل الشريط
function xpLine(c, G, from, to) {
  const a = prog(from), b = prog(to), up = b.level > a.level, ln = el("div", "ln"), tag = el("div"), fill = el("i"), bar = el("div", "xb");
  tag.append(levelTag(a.level, true)); bar.append(fill); ln.append(el("div", "xg", `+${to - from} XP`), tag, bar); fill.style.width = a.pct + "%"; c.append(ln);
  if (!G) { tag.replaceChildren(levelTag(b.level, true)); fill.style.width = b.pct + "%"; return; }
  const o = { v: a.level }, tl = G.timeline({ delay: .5 });
  tl.to(fill, { width: (up ? 100 : b.pct) + "%", duration: 1, ease: "power2.out" }, 0);
  if (up) {
    tl.to(o, { v: b.level, duration: 1.2, ease: "power1.out", onUpdate: () => tag.replaceChildren(levelTag(Math.round(o.v), true)) }, 0)
      .add(() => { burst(c, G, COL[tierOf(b.level)]); G.fromTo(tag, { scale: 1.5 }, { scale: 1, duration: .6, ease: "elastic.out(1,.45)" }); })
      .set(fill, { width: "0%" }).to(fill, { width: b.pct + "%", duration: .8, ease: "power2.out" });
  }
}

async function flush() {
  if (showing) return;
  const p = pending; if (!p.mvp && !p.xp && !p.msgs.size) return;
  pending = { mvp: 0, xp: null, msgs: new Map() }; showing = true;
  try {
    inject();                                                    // تنسيق البطاقة لا يعتمد على رسم علامة مستوى قبلها (كان سبب ظهورها بلا تنسيق في القائمة الرئيسية)
    const G = await gs(), c = el("div", "ntf"), msgs = [...p.msgs];
    c.setAttribute("role", "status"); document.body.append(c);
    let skip; const click = new Promise(r => (skip = r)); c.onclick = () => skip();
    if (p.mvp) { const ln = el("div", "ln"); ln.append(el("div", "ic", MSG.mvp[0]), el("p", "", MSG.mvp[1])); c.append(ln); }
    if (p.xp) xpLine(c, G, p.xp.from, p.xp.to);
    for (const [, v] of msgs) { const [ic, t] = MSG[v.k] || MSG.custom, ln = el("div", "ln"); ln.append(el("div", "ic", ic), el("p", "", v.m || t)); c.append(ln); }
    if (G) {
      G.fromTo(c, { y: -90, opacity: 0, scale: .9 }, { y: 0, opacity: 1, scale: 1, duration: .55, ease: "back.out(1.6)" });
      c.querySelectorAll(".ic").forEach((e, i) => G.from(e, { scale: 0, rotate: -40, duration: .6, ease: "elastic.out(1,.5)", delay: .15 + i * .1 }));
    }
    const ms = Math.min(10000, 3600 + (p.mvp ? 1200 : 0) + (p.xp ? 2200 : 0) + msgs.length * 2400);
    await Promise.race([sleep(ms), click]);
    if (G) await G.to(c, { y: -70, opacity: 0, duration: .35, ease: "power2.in" });
    c.remove();
    for (const [id] of msgs) await remove(ref(db, `inbox/${me.pid}/${id}`)).catch(() => {});   // تُحذف بعد عرضها فقط: إن أُغلقت الصفحة قبل ذلك تبقى مخزّنة
  } catch (e) { console.warn("notify", e); }
  showing = false;
  if (pending.mvp || pending.xp || pending.msgs.size) schedule();
}
function schedule() { clearTimeout(timer); timer = setTimeout(flush, COLLECT_MS); }

let me;
(async () => {
  me = await identity(); if (!me.ok) return;
  const key = "yz_xp_" + me.pid, mk = "yz_mvp_" + me.pid, seenMsg = new Set();
  onValue(ref(db, `inbox/${me.pid}`), s => {
    let n = 0;
    for (const [id, v] of Object.entries(s.val() || {})) if (!seenMsg.has(id)) { seenMsg.add(id); pending.msgs.set(id, v); n++; }
    if (n) schedule();
  }, () => {});
  onValue(ref(db, `profiles/${me.pid}/stats/mvp`), s => {
    const m = s.val() || 0, seen = +(localStorage.getItem(mk) || 0);
    if (m > seen) { localStorage.setItem(mk, m); pending.mvp = 1; schedule(); } else if (m < seen) localStorage.setItem(mk, m);
  }, () => {});
  onValue(ref(db, `profiles/${me.pid}/stats/xp`), s => {
    const x = s.val() || 0, seen = +(localStorage.getItem(key) || 0);
    if (x > seen) { localStorage.setItem(key, x); pending.xp = { from: pending.xp ? pending.xp.from : seen, to: x }; schedule(); } else if (x < seen) localStorage.setItem(key, x);
  }, () => {});
})();
