// نظام المستوى والخبرة (XP): المستوى 0 → 1000. الحساب والشارات (SVG) والعلامة بجانب الاسم.
//   xp(L) = 4L + 0.05L²  (تراكمي)  → فوز واحد في أي لعبة ≈ مستوى 34 فأكثر، وبعده يبطؤ التقدم تدريجياً حتى 1000 (= 54000 خبرة)
import { db, ref, get } from "./firebase.js";

export const MAXL = 1000, MAXXP = 54000;
export const xpAt = L => Math.round(4 * L + 0.05 * L * L);
export function levelOf(xp) {
  xp = Math.max(0, +xp || 0); let L = Math.min(MAXL, Math.floor((Math.sqrt(16 + 0.2 * xp) - 4) / 0.1));
  while (L < MAXL && xpAt(L + 1) <= xp) L++; while (L > 0 && xpAt(L) > xp) L--; return L;
}
export function prog(xp) { const L = levelOf(xp), lo = xpAt(L), hi = L < MAXL ? xpAt(L + 1) : lo; return { level: L, cur: xp - lo, need: hi - lo, pct: hi > lo ? Math.min(100, (xp - lo) / (hi - lo) * 100) : 100 }; }

// الخبرة: وزن اللعبة × (مشاركة + مكافأة النتيجة). الألعاب التي تفتقر لحدث وسطي تعتمد على النتيجة، ويمكن لأي لعبة إضافة خبرة حدثية عبر details.xp = { uid: رقم } في makeResult
export const WEIGHT = { xo: 1, connect4: 1.2, reversi: 1.4, "dots-boxes": 1.3, counter: 1.4, "hot-cold": 1.5, "shared-word": 1.6, "my-balance": 1.7, "truth-lie": 1.8, "reverse-echo": 1.8, codenames: 2, "liars-bar": 2.2 };
export function xpGain(game, r, o = {}) {
  let x = 40;
  if (r === "win") x += 160; else if (r === "draw") x += 60; else if (r === "coop-win") x += 140 + 20 * (o.bonus || 0);
  else if (r === "coop-lose") x = 20; else if (o.rank === 1 && o.n > 2) x += 60;       // المركز الثاني (3 لاعبين فأكثر)
  return Math.round(x * (WEIGHT[game] || 1.2) + Math.min(400, Math.max(0, o.extra || 0)));
}

export const COL = ["#ffffff", "#4fd1c5", "#60a5fa", "#34d399", "#fbbf24", "#fb923c", "#f472b6", "#a855f7"];
export const tierOf = L => (L >= 1000 ? 7 : L >= 800 ? 6 : L >= 500 ? 5 : L >= 300 ? 4 : L >= 100 ? 3 : L >= 50 ? 2 : L >= 1 ? 1 : 0);
export const MSG = { week: ["🏆", "أنت لاعب الأسبوع!"], top: ["👑", "أنت الأول في التصنيف!"], rise: ["🚀", "تقدّمت في التصنيف، استمر!"], thanks: ["🎉", "شكراً لنشاطك معنا!"], mvp: ["⭐", "أفضل لاعب في المباراة (MVP)!"], custom: ["💌", "رسالة من الإدارة"] };
export const gs = () => (window.gsap ? Promise.resolve(window.gsap) : new Promise(r => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"; s.onload = () => r(window.gsap); s.onerror = () => r(null); document.head.append(s); }));

let uid = 0;
export function badgeSVG(t) {
  if (t < 2) return "";
  const id = "lg" + ++uid, c = COL[t], n = 3 + t, R = 10, r = t >= 6 ? 4.5 : 6, pts = [];
  for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n - Math.PI / 2, d = i % 2 ? r : R; pts.push((12 + d * Math.cos(a)).toFixed(1) + "," + (12 + d * Math.sin(a)).toFixed(1)); }
  const rays = t >= 6 ? `<g class="rays" stroke="${c}" stroke-width="1.2" stroke-linecap="round">${Array.from({ length: 16 }, (_, i) => `<line x1="12" y1="${t === 7 ? -3 : -1}" x2="12" y2="0.8" transform="rotate(${i * 22.5} 12 12)"/>`).join("")}</g>` : "";
  return `<svg viewBox="-4 -4 32 32" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>${rays}<circle cx="12" cy="12" r="11" fill="none" stroke="${c}" stroke-opacity=".5"/><polygon points="${pts.join(" ")}" fill="url(#${id})" stroke="${c}" stroke-width=".6"/><circle cx="12" cy="12" r="${t >= 5 ? 3 : 2}" fill="${t === 7 ? "#fff" : c}"/></svg>`;
}

export function inject() {
  if (document.getElementById("lv-css")) return; const s = document.createElement("style"); s.id = "lv-css";
  s.textContent = `.lv{display:inline-flex;align-items:center;gap:3px;vertical-align:middle;margin-inline-start:6px;font:700 .72rem 'Reem Kufi',sans-serif;color:var(--c);line-height:1}
.lv b{padding:2px 8px;border-radius:999px;border:1px solid var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);box-shadow:0 0 calc(var(--g)*1px) color-mix(in srgb,var(--c) 70%,transparent);text-shadow:0 0 calc(var(--g)*.6px) var(--c)}
.lv svg{width:1.9em;height:1.9em;overflow:visible;filter:drop-shadow(0 0 calc(var(--g)*.4px) var(--c))}.lv .rays{transform-box:fill-box;transform-origin:center;animation:lvs 14s linear infinite}
.lv.t0 b{background:none;border-color:rgba(255,255,255,.55);box-shadow:none;text-shadow:none}
.lv.t7{position:relative;isolation:isolate;gap:3px;margin-inline:9px 8px}
.lv.t7 svg{width:1.9em;height:1.9em;animation:none;filter:drop-shadow(0 0 2px #c084fc)}
.lv.t7 b{padding:0;border:0;background:none;box-shadow:none;font:800 1.18em/1 'Reem Kufi',sans-serif;letter-spacing:.03em;color:#c4a1ff;background:linear-gradient(180deg,#f3e8ff 0%,#c084fc 50%,#8b5cf6 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-shadow:none;filter:drop-shadow(0 1px 0 #1e0b3a) drop-shadow(0 0 1.5px #1e0b3a)}
.lv.t7::before,.lv.t7::after{content:"";position:absolute;z-index:-1;pointer-events:none;will-change:transform,opacity}
.lv.t7::before{inset:-4px -10px -5px;border-radius:50%;background:radial-gradient(ellipse at 50% 62%,rgba(168,85,247,.85) 0,rgba(124,58,237,.55) 38%,rgba(76,29,149,.22) 62%,transparent 78%);filter:blur(5px);animation:lvf1 1.4s ease-in-out infinite alternate}
.lv.t7::after{left:8%;right:8%;bottom:-6px;height:70%;border-radius:50% 50% 40% 40%;background:radial-gradient(ellipse at 50% 100%,#c084fc 0,#7c3aed 38%,rgba(46,16,101,.0) 74%);filter:blur(4px);transform-origin:50% 100%;animation:lvf2 .85s ease-in-out infinite alternate}
@keyframes lvf1{0%{opacity:.65;transform:scale(.94,.9)}50%{opacity:.95;transform:scale(1.04,1.02)}100%{opacity:.75;transform:scale(1.0,.96)}}
@keyframes lvf2{0%{opacity:.55;transform:scaleY(.7) scaleX(.92)}40%{opacity:1;transform:scaleY(1.2) scaleX(1.05)}100%{opacity:.7;transform:scaleY(.85) scaleX(.98)}}
.lv.big{font-size:1.15rem}@keyframes lvs{to{transform:rotate(360deg)}}@keyframes lvn{0%{text-shadow:0 0 3px #7c3aed,0 0 7px #7c3aed,0 0 12px #5b21b6,0 0 18px #3b0764}30%{text-shadow:0 0 4px #a855f7,0 0 10px #8b5cf6,0 0 18px #6d28d9,0 0 28px #4c1d95}60%{text-shadow:0 0 3px #8b5cf6,0 0 8px #7c3aed,0 0 14px #5b21b6,0 0 22px #2e1065}100%{text-shadow:0 0 5px #c084fc,0 0 12px #a855f7,0 0 22px #7c3aed,0 0 34px #4c1d95}}@keyframes lvp{from{filter:drop-shadow(0 0 4px #a855f7) brightness(1)}to{filter:drop-shadow(0 0 14px #e879f9) brightness(1.25)}}
.ntf{position:fixed;top:max(14px,env(safe-area-inset-top));left:0;right:0;margin-inline:auto;z-index:9999;width:min(380px,92vw);padding:16px 18px;border-radius:22px;background:rgba(18,22,42,.96);border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 50px rgba(0,0,0,.5);text-align:center;direction:rtl;color:#eceef8;font-family:'Cairo',sans-serif;overflow:hidden}
.ntf .ln+.ln{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)}.ntf .ic{font-size:2.4rem;line-height:1.2}.ntf p{margin:4px 0 0;line-height:1.7}.ntf .xg{direction:ltr;unicode-bidi:isolate;font:700 1.7rem 'Reem Kufi',sans-serif;color:#ffb454}.ntf .xb{height:10px;border-radius:6px;background:rgba(255,255,255,.1);margin-top:10px;overflow:hidden}.ntf .xb i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4fd1c5,#a855f7);border-radius:6px}
.ntf .dot{position:absolute;left:50%;top:48px;width:7px;height:7px;border-radius:50%;pointer-events:none}`;
  document.head.append(s);
}
export function levelTag(L = 0, big = false) {
  inject(); L = Math.max(0, Math.min(MAXL, Math.floor(+L || 0))); const t = tierOf(L), e = document.createElement("span");
  e.className = "lv t" + t + (big ? " big" : ""); e.style.setProperty("--c", COL[t]); e.style.setProperty("--g", t ? Math.min(16, 2 + L / 6) : 0); e.title = "المستوى " + L;
  e.innerHTML = badgeSVG(t) + `<b>${L}</b>`; return e;
}
const cache = new Map();
// علامة مستوى لاعب بمعرّفه (تُملأ بعد قراءة الخبرة؛ تخزين مؤقت دقيقة)
export function levelTagFor(pid) {
  const s = document.createElement("span"); if (!pid) return s; const put = x => s.replaceChildren(levelTag(levelOf(x))), c = cache.get(pid);
  if (c && Date.now() - c.t < 6e4) { put(c.x); return s; }
  get(ref(db, `profiles/${pid}/stats/xp`)).then(v => { const x = v.val() || 0; cache.set(pid, { x, t: Date.now() }); put(x); }).catch(() => {});
  return s;
}
