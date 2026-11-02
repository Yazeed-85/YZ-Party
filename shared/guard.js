// الحظر: نوعان، والقواعد (firebase.rules.json) هي التي تمنع اللاعب المحظور من دخول الغرف أو الكتابة، وهذا الملف يُظهر له نافذة لا تُتجاوز.
//   bans/{pid} = { k: "auto"|"admin", u: ينتهي (وقت الخادم)، t: بدأ، w: الكلمة (للتلقائي)، rq: وقت طلب الرفع }
//   auto  ← يسجّله النظام تلقائياً عند استخدام كلمة ممنوعة (القائمة في لوحة التحكم ← الحظر)، ويُعرض كـ«حسابك تحت التحقق الأمني»
//   admin ← يضعه المالك من لوحة التحكم، ويُعرض كـ«تم حظرك»
// مدة الحظر أسبوع. وفي النافذة زر واحد «طلب رفع»، يصل المالك في لوحة التحكم فيرفعه.
import { db, ready, ref, get, set, update, onValue, serverTimestamp, serverNow } from "./firebase.js";
import { identity } from "./identity.js";
import { leaveRoom, getCode } from "./room.js";

export const WEEK = 7 * 864e5;
const G = () => window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches;
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

// ===== الكلمات الممنوعة =====
// التطبيع: يوحّد الألف والياء والتاء المربوطة ويحذف التشكيل والتطويل والمسافات والرموز، فلا تُتجاوز الكلمة بتفريق حروفها
const norm = s => String(s || "").toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
  .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^\p{L}\p{N}]+/gu, "");
let words = null, wordsAt = 0;
export async function loadWords() {
  if (words && Date.now() - wordsAt < 3e5) return words;
  try {
    await ready; const v = (await get(ref(db, "config/banwords/j"))).val() || "";
    words = [...new Set(v.split(/[\n,،]+/).map(norm).filter(w => w.length >= 2))]; wordsAt = Date.now();
  } catch { words = words || []; }
  return words;
}
// ترجع الكلمة الممنوعة الموجودة في النص أو null
export function badWord(text) { const t = norm(text); if (!t || !words) return null; return words.find(w => t.includes(w)) || null; }

// ===== حالة الحظر الحالية =====
let me = null, cur = null, overlay = null, tm = null, started = false;
export const banned = () => !!cur && cur.u > serverNow();

export async function autoBan(word) {
  me ??= await identity(); if (!me.ok || banned()) return;
  const u = serverNow() + WEEK;
  await set(ref(db, `bans/${me.pid}`), { k: "auto", u, t: serverTimestamp(), w: String(word).slice(0, 40) }).catch(() => {});
}
// تفحص نصاً قبل نشره: إن احتوى كلمة ممنوعة يُحظر صاحبه ويرجع true (والنص لا يُرسل)
export async function screen(text) {
  await loadWords(); const w = badWord(text); if (!w) return false;
  await autoBan(w); return true;
}

export async function initGuard() {
  if (started) return; started = true;
  me = await identity(); if (!me.ok) return;
  loadWords();
  onValue(ref(db, `bans/${me.pid}`), s => { cur = s.val(); paint(); }, () => {});
}

function paint() {
  clearTimeout(tm);
  if (!banned()) { overlay && hide(); return; }
  tm = setTimeout(paint, Math.min(2147e6, cur.u - serverNow() + 500));           // ينتهي وحده فتزول النافذة
  const auto = cur.k === "auto";
  if (!overlay) { show(); const code = getCode(); if (code) leaveRoom(code).catch(() => {}); }
  overlay.querySelector(".gd-t").textContent = auto ? "حسابك تحت التحقق الأمني" : "تم حظرك";
  overlay.querySelector(".gd-p").textContent = auto ? "رصد النظام استخداماً مخالفاً لقواعد اللعب. تُراجَع الحالة، ويُرفع التقييد تلقائياً بعد انتهاء المدة." : "قرّر مالك اللعبة حظر حسابك مؤقتاً.";
  const d = Math.max(1, Math.ceil((cur.u - serverNow()) / 864e5)); overlay.querySelector(".gd-d").textContent = `المتبقي نحو ${d} ${d === 1 ? "يوم" : d === 2 ? "يومان" : d <= 10 ? "أيام" : "يوماً"}`;
  const b = overlay.querySelector(".gd-b"), sent = !!cur.rq;
  b.disabled = sent; b.textContent = sent ? "أُرسل طلبك، بانتظار المراجعة ✓" : auto ? "طلب رفع التحقق فوراً" : "طلب رفع الحظر";
}
function show() {
  overlay = el("div", "gd-ovl"); overlay.setAttribute("role", "alertdialog");
  const c = el("div", "gd-card"), ic = el("div", "gd-i", "🛡️"), b = el("button", "gd-b");
  c.append(ic, el("h2", "gd-t"), el("p", "gd-p"), el("p", "gd-d"), b); overlay.append(c);
  b.onclick = async () => { b.disabled = true; try { await set(ref(db, `bans/${me.pid}/rq`), serverTimestamp()); } catch { b.disabled = false; } };
  const st = el("style"); st.id = "gd-css";
  st.textContent = `.gd-ovl{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(5,7,14,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);touch-action:none;overscroll-behavior:contain}
.gd-card{width:min(380px,100%);padding:26px 22px;border-radius:24px;text-align:center;background:linear-gradient(160deg,rgba(30,34,60,.96),rgba(14,17,32,.98));border:1px solid rgba(255,107,129,.45);box-shadow:0 24px 60px rgba(0,0,0,.6);color:#eceef8;font-family:'Cairo',sans-serif;direction:rtl}
.gd-i{font-size:2.8rem;line-height:1.2}.gd-t{margin:6px 0 8px;font:700 1.45rem 'Reem Kufi','Cairo',sans-serif}.gd-p{margin:0 0 6px;line-height:1.8;color:#c3c8dc;font-size:.95rem}.gd-d{margin:0 0 16px;color:#ffb454;font-size:.86rem}
.gd-b{width:100%;padding:13px;border-radius:16px;border:0;font:700 1rem 'Cairo',sans-serif;cursor:pointer;background:#ff6b81;color:#2a0710}.gd-b:disabled{background:rgba(255,255,255,.1);color:#9aa0b8;cursor:default}`;
  if (!document.getElementById("gd-css")) document.head.append(st);
  document.body.append(overlay);
  ["touchmove", "wheel"].forEach(t => overlay.addEventListener(t, e => e.preventDefault(), { passive: false }));
  if (G()) { gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: .3 }); gsap.fromTo(c, { scale: .8, y: 30, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: .6, ease: "back.out(1.8)" }); }
}
function hide() {
  const o = overlay; overlay = null; setTimeout(() => location.reload(), 450);        // رُفع الحظر: نبدأ الصفحة نظيفة
  G() ? gsap.to(o, { opacity: 0, duration: .3, onComplete: () => o.remove() }) : o.remove();
}
