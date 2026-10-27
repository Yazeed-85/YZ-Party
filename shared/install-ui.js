// للهواتف فقط: زر أعلى اليمين يشرح «إضافة اللعبة للشاشة الرئيسية». يظهر كإعلان قصير أول مرة فقط ثم يطير إلى مكان الزر ويبقى خافتاً.
// أندرويد/كروم: زر «تثبيت» حقيقي بضغطة واحدة. آيفون/سفاري: أبل تمنع التثبيت البرمجي، فنعرض فيديو/صورة متحركة تضعها في media/add-to-home.mp4 أو .gif مع الخطوات.
import { sfx } from "./ui.js";

const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const G = () => window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches;
const SEEN = "yz_a2hs", ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 8v6M9.5 11.5 12 14l2.5-2.5"/></svg>';
const MEDIA = ["media/add-to-home.mp4", "media/add-to-home.webm", "media/add-to-home.gif", "media/add-to-home.png"];
const rd = k => { try { return localStorage.getItem(k); } catch { return null; } }, wr = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ممنوع */ } };

async function findMedia() {
  for (const u of MEDIA) { try { const r = await fetch(u, { method: "HEAD", cache: "no-store" }); if (r.ok && !/html/.test(r.headers.get("content-type") || "")) return u; } catch { /* التالي */ } }
  return null;
}

export function initInstall() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const phone = matchMedia("(pointer:coarse)").matches && Math.min(screen.width, screen.height) < 900;
  if (standalone || !phone) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null, card = null;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; });
  addEventListener("appinstalled", () => btn.remove());
  const btn = el("button", "fab inst"); btn.id = "inst"; btn.innerHTML = ICON; btn.setAttribute("aria-label", "كيف أجعل اللعبة تبدو تطبيقاً على الشاشة الرئيسية؟");
  if (rd(SEEN)) btn.classList.add("dim");
  document.body.append(btn);

  async function open() {
    if (card) return; sfx.click();
    const o = el("div", "ovl"), c = el("div", "glass inst-card"); card = o;
    c.append(el("h2", "", "كيف أجعل اللعبة تبدو تطبيقاً على الشاشة الرئيسية؟"));
    const mediaBox = el("div", "inst-media"); mediaBox.hidden = true; c.append(mediaBox);
    const steps = el("ol", "inst-steps"), add = t => { const li = el("li"); li.innerHTML = t; steps.append(li); };
    if (ios) { add("اضغط <b>⋯</b> (الثلاث نقاط) في أسفل Safari"); add("اختر <b>مشاركة</b>"); add("اضغط <b>عرض المزيد</b>"); add("اختر <b>إضافة إلى الشاشة الرئيسية</b>"); add("اضغط <b>إضافة</b>"); }
    else { add("اضغط <b>⋮</b> أعلى المتصفح"); add("اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>"); add("اضغط <b>تثبيت</b>"); }
    c.append(steps);
    if (deferred) {
      const ins = el("button", "btn primary", "تثبيت التطبيق الآن");
      ins.onclick = async () => { try { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome === "accepted") { dismiss(); btn.remove(); } } catch { /* لا بأس */ } };
      c.append(ins);
    }
    const no = el("button", "btn ghost", "تجاهل"); no.onclick = dismiss; c.append(no);
    o.append(c); document.body.append(o);
    if (G()) { gsap.from(o, { opacity: 0, duration: .25 }); gsap.from(c, { scale: .8, y: 30, opacity: 0, duration: .5, ease: "back.out(1.8)" }); }
    findMedia().then(u => {
      if (!u || !card) return;
      const m = /\.(mp4|webm)$/.test(u) ? Object.assign(el("video"), { src: u, autoplay: true, muted: true, loop: true, playsInline: true }) : Object.assign(el("img"), { src: u, alt: "" });
      if (m.tagName === "VIDEO") { m.muted = true; m.setAttribute("playsinline", ""); }
      mediaBox.append(m); mediaBox.hidden = false;
    });
  }
  function dismiss() {
    const o = card; if (!o) return; card = null; wr(SEEN, "1");
    const c = o.firstChild, done = () => { o.remove(); btn.classList.add("dim"); if (G()) gsap.fromTo(btn, { scale: 1.35 }, { scale: 1, duration: .5, ease: "elastic.out(1,.5)" }); };
    if (!G()) return done();
    const a = c.getBoundingClientRect(), b = btn.getBoundingClientRect();    // يتقلّص ويطير إلى الأيقونة في أعلى اليمين
    gsap.to(c, { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2), scale: .06, opacity: 0, duration: .65, ease: "power3.in" });
    gsap.to(o, { opacity: 0, duration: .3, delay: .4, onComplete: done });
  }
  btn.onclick = open;
  if (!rd(SEEN)) setTimeout(() => { if (!card) open(); }, 1500);      // إعلان قصير أول مرة فقط
}
