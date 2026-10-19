// أدوات واجهة مشتركة: إشعارات، أصوات، انتقالات GSAP، شريط النقاط
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function toast(msg, kind = "info") {
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  document.body.append(t);
  window.gsap && !reduce ? gsap.fromTo(t, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: .3 }) : 0;
  setTimeout(() => t.remove(), 3200);
}

export function enterAnim(sel) {
  const el = document.querySelector(sel);
  if (!el || reduce || !window.gsap) return;
  gsap.fromTo(el.querySelectorAll(":scope > *"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .5, stagger: .07, ease: "power3.out" });
}

export function show(id) {
  document.querySelectorAll(".screen").forEach(s => { s.hidden = s.id !== id; });
  enterAnim("#" + id);
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

// شريط النقاط العلوي للألعاب: يملأ العنصر el
export function scoreBar(el, players, scores = {}, myUid) {
  el.replaceChildren(...Object.entries(players).map(([id, p]) => {
    const d = document.createElement("div");
    d.className = "sb" + (id === myUid ? " me" : "");
    const n = document.createElement("span"); n.textContent = p.name;
    const s = document.createElement("b"); s.textContent = scores[id] || 0;
    d.append(n, s);
    return d;
  }));
}
