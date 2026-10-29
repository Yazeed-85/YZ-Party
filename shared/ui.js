// أدوات واجهة مشتركة: إشعارات، أصوات، انتقالات GSAP، شريط النقاط، حوار تأكيد، شاشة نتيجة
// ===== قفل التكبير: Safari على iOS يتجاهل user-scalable=no، فنمنع إيماءات القرص والتكبير صراحةً =====
// (النقر المزدوج السريع يمنعه touch-action في style.css، ولا نلغي touchend حتى لا تضيع نقرات الأزرار السريعة)
["gesturestart", "gesturechange", "gestureend"].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
document.addEventListener("wheel", e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });   // قرص لوحة اللمس على الكمبيوتر

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const anim = () => window.gsap && !reduce;
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

// إشعار علوي بأيقونة، يعلو كل النوافذ، وإشعار واحد في كل مرة (الجديد يدفع القديم)
const TICON = { ok: "✓", error: "!", info: "i" };
let curToast = null;
export function toast(msg, kind = "info") {
  const old = curToast; curToast = null;
  if (old) { window.gsap?.killTweensOf(old); anim() ? gsap.to(old, { y: -30, opacity: 0, scale: .9, duration: .18, onComplete: () => old.remove() }) : old.remove(); }
  const t = el("div", "toast " + kind), i = el("span", "ti", TICON[kind] || "i");
  t.append(i, el("span", "tt", msg)); document.body.append(t); curToast = t;
  if (anim()) {
    gsap.fromTo(t, { y: -70, opacity: 0, scale: .8 }, { y: 0, opacity: 1, scale: 1, duration: .6, ease: "elastic.out(1,.55)" });
    gsap.fromTo(i, { scale: 0, rotation: -120 }, { scale: 1, rotation: 0, duration: .5, delay: .12, ease: "back.out(3)" });
  }
  setTimeout(() => { if (curToast === t) curToast = null; anim() ? gsap.to(t, { y: -40, opacity: 0, scale: .9, duration: .3, ease: "power2.in", onComplete: () => t.remove() }) : t.remove(); }, 2600);
}

// لمسة مرئية (GSAP): ترتدّ الأزرار بعد الضغط. تعمل عند اكتمال النقرة (لا عند بدء الضغط) حتى لا يصغر الزر تحت المؤشر فتضيع النقرة عند حافته
export function initPress(sel = ".btn,.sbtn,.afr,.kick,.fab,.gcard,.pill") {
  if (!window.gsap || reduce) return;
  document.addEventListener("click", e => {
    const b = e.target.closest?.(sel); if (!b || b.disabled) return;
    gsap.fromTo(b, { scale: .86 }, { scale: 1, duration: .6, ease: "elastic.out(1.1,.4)", clearProps: "transform", overwrite: "auto" });
  }, true);
}

export function enterAnim(sel) {
  const e = document.querySelector(sel);
  if (!e || !anim()) return;
  gsap.fromTo(e.querySelectorAll(":scope > *"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .5, stagger: .07, ease: "power3.out", clearProps: "transform,opacity" });
}

// انتقال بين الشاشات: تخرج الحالية بنعومة ثم تدخل الجديدة
export function show(id) {
  const screens = [...document.querySelectorAll(".screen")], cur = screens.find(s => !s.hidden && s.id !== id);
  const swap = () => { screens.forEach(s => { s.hidden = s.id !== id; }); enterAnim("#" + id); };
  if (cur && anim()) gsap.to(cur, { opacity: 0, y: -14, scale: .98, duration: .2, ease: "power2.in", onComplete: () => { gsap.set(cur, { clearProps: "all" }); swap(); } });
  else swap();
}

// ===== الأصوات (مولَّدة بالكود، بلا ملفات) =====
let ac;
export const isMuted = () => localStorage.getItem("yz_mute") === "1";
export function toggleMute() { localStorage.setItem("yz_mute", isMuted() ? "0" : "1"); return isMuted(); }
function tone(f, d = .12, type = "sine", at = 0, v = .08) {
  if (isMuted()) return;
  ac ??= new (window.AudioContext || window.webkitAudioContext)();
  const o = ac.createOscillator(), g = ac.createGain(), s = ac.currentTime + at;
  o.type = type; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
  g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(.0001, s + d);
  o.start(s); o.stop(s + d);
}
export const sfx = {
  click: () => tone(520, .07, "triangle"),
  tick: () => tone(900, .04, "square", 0, .03),
  turn: () => { tone(660, .1); tone(880, .12, "sine", .1); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, "triangle", i * .1)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, .2, "sawtooth", i * .12, .05)),
  error: () => tone(200, .18, "square", 0, .05)
};

// ===== حوار تأكيد واحتفال =====
export function confirmDialog(text, okLabel = "تأكيد", cancelLabel = "إلغاء") {
  return new Promise(res => {
    const o = el("div", "ovl"), c = el("div", "ovl-card glass"), row = el("div", "ovl-row");
    const ok = el("button", "btn bad", okLabel), no = el("button", "btn ghost", cancelLabel);
    row.append(ok, no); c.append(el("div", "ovl-t", text), row); o.append(c); document.body.append(o);
    const done = v => { document.removeEventListener("keydown", key); const end = () => { o.remove(); res(v); };
      anim() ? gsap.to(o, { opacity: 0, duration: .18, onComplete: end }) : end(); };
    const key = e => { if (e.key === "Escape") done(false); };
    document.addEventListener("keydown", key);
    ok.onclick = () => done(true); no.onclick = () => done(false);
    if (anim()) { gsap.fromTo(o, { opacity: 0 }, { opacity: 1, duration: .2 }); gsap.fromTo(c, { scale: .7, y: 30, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .45, ease: "back.out(2)" }); }
    no.focus();
  });
}

export function showOverlay({ icon = "🏆", title = "", sub = "", confetti = true }) {
  const o = el("div", "ovl"), c = el("div", "ovl-card glass"), i = el("div", "ovl-ic", icon);
  c.append(i, el("div", "ovl-t", title), el("div", "ovl-s", sub)); o.append(c); document.body.append(o);
  if (anim()) {
    gsap.fromTo(o, { opacity: 0 }, { opacity: 1, duration: .3 });
    gsap.fromTo(c, { scale: .5, y: 40, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .7, ease: "elastic.out(1,.6)" });
    gsap.fromTo(i, { rotation: -220, scale: 0 }, { rotation: 0, scale: 1, duration: .85, ease: "back.out(2)", delay: .12 });
    if (confetti) for (let k = 0; k < 26; k++) {
      const p = el("i", "cf"), a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 190;
      p.style.background = ["#ffb454", "#4fd1c5", "#ff6b81", "#fff"][k % 4]; o.append(p);
      gsap.fromTo(p, { x: 0, y: 0, rotation: 0, opacity: 1, scale: 1 }, { x: Math.cos(a) * d, y: Math.sin(a) * d - 40, rotation: Math.random() * 540, opacity: 0, scale: .4, duration: 1.1 + Math.random() * .7, delay: .25, ease: "power2.out" });
    }
  }
  return () => o.remove();
}

// ===== شريط النقاط العلوي للألعاب: يملأ العنصر el، ويضيف زر الانسحاب إن سُجّل معالج له =====
let exitFn = null;
export const setExitHandler = f => { exitFn = f; };
export function scoreBar(e, players, scores = {}, myUid) {
  const items = Object.entries(players).map(([id, p]) => {
    const d = el("div", "sb" + (id === myUid ? " me" : ""));
    d.append(el("span", "", p.name), el("b", "", scores[id] || 0));
    return d;
  });
  if (exitFn) { const b = el("button", "sb-exit", "✕"); b.setAttribute("aria-label", "انسحاب"); b.onclick = () => { sfx.click(); exitFn(); }; items.push(b); }
  e.replaceChildren(...items);
}

// ===== نوافذ منبثقة من أيقونتها وتعود إليها (مشتركة بين الأصدقاء والتعليمات) =====
// o = الخلفية المعتمة، c = البطاقة، btn = الأيقونة التي تطير منها وإليها
const delta = (c, btn) => { const a = c.getBoundingClientRect(), b = btn.getBoundingClientRect(); return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) }; };
export function flyFrom(o, c, btn) {
  if (!anim() || !btn) return;
  const d = delta(c, btn);
  gsap.fromTo(o, { opacity: 0 }, { opacity: 1, duration: .3 });
  gsap.fromTo(c, { x: d.x, y: d.y, scale: .06, opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: .55, ease: "power3.out", clearProps: "transform,opacity" });
  gsap.fromTo(btn, { scale: 1 }, { scale: 1.25, duration: .2, yoyo: true, repeat: 1, ease: "power2.out", clearProps: "transform" });
}
export function flyTo(o, c, btn, done) {
  if (!anim() || !btn) return done();
  const d = delta(c, btn);
  gsap.to(c, { x: d.x, y: d.y, scale: .06, opacity: 0, duration: .55, ease: "power3.in" });
  gsap.to(o, { opacity: 0, duration: .3, delay: .3, onComplete: done });
}
// إغلاق بالنقر خارج البطاقة أو بزر Escape
export function dismissOutside(o, close) {
  o.addEventListener("pointerdown", e => { if (e.target === o) close(); });
  const k = e => { if (e.key === "Escape") { document.removeEventListener("keydown", k); close(); } };
  document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
}
