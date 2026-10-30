// أيقونات مرسومة بالكود (SVG) وتتحرّك بـ GSAP: لا صور ولا رموز تعبيرية ولا مكتبات أيقونات.
// كل صانع (make*) يرجع { el, ...دوال } والعنصر el يُدرج في أي زر. الألوان تتبع color فتتغير بحسب الحالة.
const NS = "http://www.w3.org/2000/svg";
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const G = () => window.gsap && !RM;
let uid = 0;

function n(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  kids.forEach(c => c && e.append(c));
  return e;
}
function root(size, cls) {
  const s = n("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" });
  s.style.overflow = "visible"; s.style.display = "block"; if (cls) s.setAttribute("class", cls);
  return s;
}

// ===== أيقونات ثابتة الشكل (تُلوَّن بـ currentColor) =====
const PATHS = {
  close: ["M6 6l12 12M18 6L6 18"],
  chevron: ["M9 5.5l6.5 6.5L9 18.5"],
  expand: ["M14 4h6v6M20 4l-7.5 7.5M10 20H4v-6M4 20l7.5-7.5"],
  shrink: ["M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7"],
  leave: ["M10 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3", "M15 8l4 4-4 4M19 12H9.5"],
  down: ["M6 9.5l6 6 6-6"],
  plus: ["M12 5v14M5 12h14"],
  pin: ["M9 3.5h6M10 3.5v6L7 14h10l-3-4.5v-6", "M12 14v6.5"],
  user: ["M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4.5 20.5c.6-3.6 3.7-6 7.5-6s6.9 2.4 7.5 6"]
};
export function ic(name, size = 18) {
  const s = root(size);
  (PATHS[name] || []).forEach(d => s.append(n("path", { d })));
  return s;
}
// زر الإرسال: طائرة ورقية تشير لليسار (اتجاه القراءة العربي)
export function sendIcon(size = 20) {
  const s = root(size);
  s.append(n("path", { d: "M20.6 4.2L3.8 10.4a.8.8 0 0 0-.04 1.5l6.6 2.7 2.7 6.6a.8.8 0 0 0 1.5-.04z", fill: "currentColor", "stroke-width": 1.6, transform: "translate(24 0) scale(-1 1)" }));
  s.append(n("path", { d: "M10.4 14.6l9-8.6", "stroke-width": 1.6, transform: "translate(24 0) scale(-1 1)", stroke: "var(--yz-cut,#12172a)" }));
  return s;
}

// ===== المايك: مفتوح (أبيض) / مغلق (أحمر وعليه خط) / خارج القناة (رمادي) / يتصل =====
// level(v) يملأ كبسولة المايك من الأسفل بحسب شدة الصوت (0..1)، وring يُترك للزر المضيف
export const MIC_COLORS = { live: "#ffffff", muted: "#ff4d5e", off: "#8a90a8" };
export function makeMic(size = 22, state = "off") {
  const id = "mc" + ++uid, s = root(size, "yz-mic");
  const clip = n("clipPath", { id }, n("rect", { x: 9, y: 2.5, width: 6, height: 11.5, rx: 3 }));
  const body = n("rect", { x: 9, y: 2.5, width: 6, height: 11.5, rx: 3, fill: "currentColor", "fill-opacity": 0 });
  const lvl = n("rect", { x: 8, y: 2, width: 8, height: 13, fill: "#34d399", stroke: "none", "clip-path": `url(#${id})` });
  const holder = n("path", { d: "M5.6 11.4a6.4 6.4 0 0 0 12.8 0" });
  const stem = n("path", { d: "M12 17.8v3.4M8.6 21.2h6.8" });
  const cut = n("path", { d: "M4.2 3.6l15.6 17", stroke: "var(--yz-cut,#12172a)", "stroke-width": 5.2, "stroke-dasharray": 24, "stroke-dashoffset": 24 });
  const slash = n("path", { d: "M4.2 3.6l15.6 17", "stroke-width": 2.4, "stroke-dasharray": 24, "stroke-dashoffset": 24 });
  s.append(n("defs", {}, clip), body, lvl, holder, stem, cut, slash);
  lvl.style.transformBox = "fill-box"; lvl.style.transformOrigin = "50% 100%"; lvl.style.transform = "scaleY(0)";
  const api = { el: s, state: null };
  const paint = (st, anim) => {
    const col = MIC_COLORS[st], fillOp = st === "off" ? 0 : 1, sl = st === "muted" ? 0 : 24;
    if (anim && G()) {
      gsap.to(s, { color: col, duration: .28, ease: "power2.out", overwrite: "auto" });
      gsap.to(body, { attr: { "fill-opacity": fillOp }, duration: .25 });
      gsap.to([cut, slash], { attr: { "stroke-dashoffset": sl }, duration: st === "muted" ? .34 : .22, ease: st === "muted" ? "power3.out" : "power2.in" });
      if (st === "muted") gsap.fromTo(s, { rotation: -14, transformOrigin: "50% 60%" }, { rotation: 0, duration: .6, ease: "elastic.out(1,.35)" });
      if (st === "live") gsap.fromTo(s, { scale: .82, transformOrigin: "50% 50%" }, { scale: 1, duration: .5, ease: "back.out(3)" });
    } else {
      s.style.color = col; body.setAttribute("fill-opacity", fillOp);
      [cut, slash].forEach(p => p.setAttribute("stroke-dashoffset", sl));
    }
    if (st !== "live") api.level(0);
  };
  let setLvl = null;
  api.level = v => {
    v = Math.max(0, Math.min(1, v || 0));
    if (G()) { setLvl ??= gsap.quickTo(lvl, "scaleY", { duration: .09, ease: "none" }); setLvl(v); } else lvl.style.transform = `scaleY(${v})`;
  };
  api.set = (st, anim = true) => {
    if (st === api.state) return; const first = api.state === null; api.state = st;
    paint(st, anim && !first);
  };
  // «يتصل»: نبض خافت حتى تتغير الحالة
  api.pulse = on => { if (!G()) return; gsap.killTweensOf(s, "opacity"); if (on) gsap.to(s, { opacity: .35, duration: .55, yoyo: true, repeat: -1, ease: "sine.inOut" }); else gsap.to(s, { opacity: 1, duration: .2 }); };
  api.set(state, false);
  return api;
}

// ===== مكبّر الصوت (بديل رمز 🔊): موجتان تختفيان وتظهر علامة × عند الكتم =====
export function makeSpeaker(size = 20, muted = false) {
  const s = root(size, "yz-spk");
  const cone = n("path", { d: "M3.6 9.6h3L11.6 5.4a.6.6 0 0 1 1 .46v12.28a.6.6 0 0 1-1 .46L6.6 14.4h-3a.6.6 0 0 1-.6-.6v-3.6a.6.6 0 0 1 .6-.6z", fill: "currentColor", "stroke-width": 1.4 });
  const w1 = n("path", { d: "M15.4 9.4a3.8 3.8 0 0 1 0 5.2" }), w2 = n("path", { d: "M18.2 6.6a7.6 7.6 0 0 1 0 10.8" });
  const x1 = n("path", { d: "M15.6 9.6l5 4.8", "stroke-dasharray": 7, "stroke-dashoffset": 7 }), x2 = n("path", { d: "M20.6 9.6l-5 4.8", "stroke-dasharray": 7, "stroke-dashoffset": 7 });
  const waves = n("g", {}, w1, w2), cross = n("g", { stroke: "#ff6b81" }, x1, x2);
  s.append(cone, waves, cross);
  waves.style.transformBox = "fill-box"; waves.style.transformOrigin = "0% 50%";
  const api = { el: s, muted: null };
  api.set = (m, anim = true) => {
    if (m === api.muted) return; const first = api.muted === null; api.muted = m;
    if (anim && !first && G()) {
      if (m) {
        gsap.to(w2, { opacity: 0, x: -3, duration: .18 }); gsap.to(w1, { opacity: 0, x: -2, duration: .22, delay: .05 });
        gsap.to([x1, x2], { attr: { "stroke-dashoffset": 0 }, duration: .26, delay: .14, stagger: .08, ease: "power2.out" });
        gsap.fromTo(cone, { x: 0 }, { keyframes: { x: [0, -1.6, 1.2, -.6, 0] }, duration: .4 });
      } else {
        gsap.to([x1, x2], { attr: { "stroke-dashoffset": 7 }, duration: .14 });
        gsap.fromTo(w1, { opacity: 0, x: -2 }, { opacity: 1, x: 0, duration: .26, ease: "back.out(2)" });
        gsap.fromTo(w2, { opacity: 0, x: -3 }, { opacity: 1, x: 0, duration: .3, delay: .08, ease: "back.out(2)" });
      }
    } else {
      [w1, w2].forEach(w => { w.style.opacity = m ? 0 : 1; });
      [x1, x2].forEach(x => x.setAttribute("stroke-dashoffset", m ? 0 : 7));
    }
  };
  api.set(muted, false);
  return api;
}

// ===== فقاعة المحادثة: ثلاث نقاط تقفز عند وصول رسالة =====
export function makeChat(size = 22) {
  const s = root(size, "yz-chat");
  s.append(n("path", { d: "M6.2 3.8h11.6a3.7 3.7 0 0 1 3.7 3.7v6a3.7 3.7 0 0 1-3.7 3.7h-4.9l-4 3.3a.75.75 0 0 1-1.22-.58v-2.72H6.2a3.7 3.7 0 0 1-3.7-3.7v-6a3.7 3.7 0 0 1 3.7-3.7z", "stroke-width": 1.9 }));
  const dots = [8.2, 12, 15.8].map(cx => n("circle", { cx, cy: 10.5, r: 1.25, fill: "currentColor", stroke: "none" }));
  dots.forEach(d => { d.style.transformBox = "fill-box"; d.style.transformOrigin = "50% 50%"; });
  s.append(...dots);
  const bubble = s.firstChild; bubble.style.transformBox = "fill-box"; bubble.style.transformOrigin = "50% 100%";
  return {
    el: s,
    ping() {                                                   // رسالة جديدة: الفقاعة ترتدّ والنقاط تتموّج
      if (!G()) return;
      gsap.fromTo(bubble, { scale: .8 }, { scale: 1, duration: .7, ease: "elastic.out(1.1,.35)" });
      gsap.fromTo(dots, { y: 0 }, { keyframes: { y: [0, -2.6, 0] }, duration: .42, stagger: .09, ease: "power2.inOut" });
    }
  };
}

// ===== زر «التواصل»: فقاعة بداخلها موجة صوت تتحرك حين يتكلم أحد =====
export function makeComms(size = 22) {
  const s = root(size, "yz-comms");
  s.append(n("path", { d: "M6.2 3.8h11.6a3.7 3.7 0 0 1 3.7 3.7v6a3.7 3.7 0 0 1-3.7 3.7h-4.9l-4 3.3a.75.75 0 0 1-1.22-.58v-2.72H6.2a3.7 3.7 0 0 1-3.7-3.7v-6a3.7 3.7 0 0 1 3.7-3.7z", "stroke-width": 1.9 }));
  const bars = [[7.6, 9.2, 11.8], [10.2, 7.6, 13.4], [12.8, 8.6, 12.4], [15.4, 9.6, 11.4]].map(([x, a, b]) => n("path", { d: `M${x} ${a}V${b}`, "stroke-width": 1.9 }));
  bars.forEach(b => { b.style.transformBox = "fill-box"; b.style.transformOrigin = "50% 50%"; });
  s.append(...bars);
  let tl = null;
  return {
    el: s,
    active(on) {                                               // موجة حيّة ما دام أحد يتكلم
      if (!G()) return;
      if (on && !tl) tl = gsap.timeline({ repeat: -1 }).to(bars, { scaleY: () => .35 + Math.random() * 1.1, duration: .2, ease: "sine.inOut", stagger: { each: .05, repeat: 1, yoyo: true }, repeatRefresh: true });
      else if (!on && tl) { tl.kill(); tl = null; gsap.to(bars, { scaleY: 1, duration: .25 }); }
    }
  };
}
