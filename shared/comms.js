// نظام التواصل: محادثة نصية + قناة صوتية على طريقة Discord، داخل كل غرفة وكل لعبة.
//  • زر «التواصل» (fab): في الرئيسية بجانب الصوت والأصدقاء، ويقفز داخل الغرفة إلى بطاقة الكود مقابل زر الصوت.
//  • الشريط العلوي (dock): أيقونتا الدردشة والمايك مع اللاعب دائماً. في الألعاب يجلس في فراغ يحجزه scoreBar وسط الشريط فلا يغطي شيئاً.
//    الدردشة: لمسة تفتح نافذة كتابة صغيرة ولمسة تغلقها. المايك: لمسة = كتم/فتح، لمستان متتاليتان = تفتح القناة الصوتية (للمغادرة وغيرها).
//  • اللوحة الكاملة: قسمان (# المحادثة النصية في الأعلى، # المحادثة الصوتية في الأسفل). النقر على قسم يدخلك قناته.
// كل الحركة بـ GSAP، وكل الأيقونات مرسومة في icons.js. بيانات الغرفة: rooms/{code}/comms/{chat,voice,sig} (انظر firebase.rules.json).
import { ready, onValue, push, query, limitToLast, serverTimestamp, serverNow } from "./firebase.js";
import { roomRef } from "./room.js";
import { toast, sfx, flyFrom, flyTo, dismissOutside } from "./ui.js";
import { VoiceEngine, micError } from "./voice.js";
import { makeMic, makeChat, makeComms, makeSpeaker, ic, sendIcon } from "./icons.js";

// أنماط النظام (تُحمَّل مرة واحدة من أي صفحة تستخدمه)
{ const l = document.createElement("link"); l.rel = "stylesheet"; l.href = new URL("./comms.css", import.meta.url).href; document.head.append(l); }

const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const G = () => window.gsap && !RM;
const h = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const PAL = ["#4fd1c5", "#ffb454", "#ff6b81", "#a78bfa", "#60a5fa", "#a3e635", "#f472b6", "#fb923c"];
const hue = s => { let x = 0; for (const c of s || "") x = (x * 31 + c.charCodeAt(0)) >>> 0; return PAL[x % PAL.length]; };
const fmtTime = t => { try { return new Date(t).toLocaleTimeString("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const flagGet = () => { try { return JSON.parse(sessionStorage.getItem("yz_voice")); } catch { return null; } };
const flagSet = v => { try { v ? sessionStorage.setItem("yz_voice", JSON.stringify(v)) : sessionStorage.removeItem("yz_voice"); } catch { /* التخزين ممنوع */ } };
const esc = s => (window.CSS?.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, ""));

// لمسة ضغط موحّدة لكل أزرار النظام (GSAP)
let pressInit = false;
function initPress() {
  if (pressInit || !window.gsap || RM) return; pressInit = true;
  const SEL = ".cm-b,.cm-press";
  const up = e => { const b = e.target.closest?.(SEL); if (b && b._dn) { b._dn = false; gsap.to(b, { scale: 1, duration: .55, ease: "elastic.out(1.1,.4)", overwrite: "auto" }); } };
  document.addEventListener("pointerdown", e => { const b = e.target.closest?.(SEL); if (b && !b.disabled) { b._dn = true; gsap.to(b, { scale: .88, duration: .1, overwrite: "auto" }); } }, true);
  ["pointerup", "pointercancel", "pointerout"].forEach(t => document.addEventListener(t, up, true));
}

// يثبّت لوحة/نافذة على المنطقة المرئية فعلاً (الكيبورد على iOS يصغّر visualViewport ولا يصغّر الصفحة)
function fit(o) {
  const vv = window.visualViewport; if (!vv) return () => {};
  const f = () => { o.style.top = vv.offsetTop + "px"; o.style.height = vv.height + "px"; o.style.bottom = "auto"; };
  vv.addEventListener("resize", f); vv.addEventListener("scroll", f); f();
  return () => { vv.removeEventListener("resize", f); vv.removeEventListener("scroll", f); };
}

// الكيبورد ظاهر؟ (على iOS/أندرويد يصغّر visualViewport بينما يبقى innerHeight ثابتاً)
const kbOn = () => { const vv = window.visualViewport; return !!vv && innerHeight - vv.height > 120; };
let C = null;
export function initComms(opts = {}) { return (C ??= build(opts)); }

function build({ mode = "game" } = {}) {
  initPress();
  const S = { code: null, uid: null, players: {}, members: {}, peerSt: {}, speaking: new Set(), eng: null, subs: [], lastKey: "", unread: 0, quick: false, P: null, joinedOnce: false, firstMembers: true, noRules: false };
  const ready_ = () => !!S.code && !!S.eng;
  const myName = () => S.players[S.uid]?.name || localStorage.getItem("yz_name") || "أنا";
  const nameOf = u => S.players[u]?.name || S.members[u]?.n || "لاعب";
  const inVoice = () => !!S.eng?.on;
  const rulesHint = e => {
    const m = String(e?.code || e?.message || "");
    if (/permission/i.test(m) && !S.noRules) { S.noRules = true; toast("حدّث قواعد Firebase (ملف firebase.rules.json) لتعمل المحادثة", "error"); }
  };

  // ============================== الشريط العلوي ==============================
  const dock = h("div", "cm-dock"), pill = h("div", "cm-pill");
  dock.hidden = true;
  const bChat = h("button", "cm-b cm-bchat"); bChat.type = "button"; bChat.setAttribute("aria-label", "المحادثة النصية");
  const chatIc = makeChat(21), badgeD = h("span", "cm-badge"); badgeD.hidden = true; bChat.append(chatIc.el, badgeD);
  const bMic = h("button", "cm-b cm-bmic"); bMic.type = "button"; bMic.setAttribute("aria-label", "المايك");
  const micD = makeMic(21, "off"), ringD = h("span", "cm-ring"); bMic.append(ringD, micD.el);
  pill.append(bChat, h("i", "cm-sep"), bMic); dock.append(pill); document.body.append(dock);
  const probe = h("div"); probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none"; document.body.append(probe);
  let lx = -999, ly = -999;
  // الشريط يتبع «الفراغ» الذي يحجزه scoreBar في الألعاب، وإلا فهو أعلى منتصف الشاشة
  const follow = () => {
    if (dock.hidden) return;
    const w = dock.offsetWidth, hh = dock.offsetHeight, slot = document.querySelector(".yzc-slot"), r = slot?.getBoundingClientRect();
    let x, y;
    if (r && r.width > 0 && r.bottom > 0) { x = r.left + r.width / 2 - w / 2; y = r.top + r.height / 2 - hh / 2; }
    else { x = innerWidth / 2 - w / 2; y = probe.offsetHeight + 5; }
    if (Math.abs(x - lx) > .3 || Math.abs(y - ly) > .3) { lx = x; ly = y; dock.style.transform = `translate(${x}px,${y}px)`; }
  };
  window.gsap ? gsap.ticker.add(follow) : setInterval(follow, 100);

  let ringTw = null;
  function ringOn(ring, on) {
    if (!G()) { ring.style.opacity = on ? 1 : 0; return; }
    if (on && !ring._on) { ring._on = true; ring._tw?.kill(); ring._tw = gsap.timeline({ repeat: -1 }).fromTo(ring, { scale: .9, opacity: .95 }, { scale: 1.3, opacity: 0, duration: .8, ease: "power2.out" }); }
    else if (!on && ring._on) { ring._on = false; ring._tw?.kill(); gsap.to(ring, { opacity: 0, duration: .2 }); }
  }
  function paintUnread() {
    const n = S.unread, t = n > 9 ? "9+" : String(n);
    for (const b of [badgeD, fabBadge]) {
      if (!b) continue; const was = !b.hidden; b.hidden = n === 0; b.textContent = t;
      if (n && G()) gsap.fromTo(b, { scale: was ? 1.5 : 0 }, { scale: 1, duration: .5, ease: "back.out(3)" });
    }
    if (P_) { P_.unT.hidden = n === 0; P_.unT.textContent = t; }
  }
  let P_ = null;                                                 // اللوحة المفتوحة (إن وُجدت)

  // ============================== الفقاعات الودّية ==============================
  let bub = null;
  function hideBubble(quick) {
    const b = bub; bub = null; if (!b) return; clearTimeout(b._t);
    if (!G() || quick) return b.el.remove();
    gsap.to(b.el, { scale: .3, opacity: 0, y: -6, duration: .3, ease: "back.in(2)", onComplete: () => b.el.remove() });
  }
  function bubble({ icon, title, text, ms = 4200, onTap, anchor }) {
    hideBubble(true);
    const a = anchor || dock, el = h("button", "cm-bub cm-press"); el.type = "button";
    const ico = h("span", "cm-bi"); ico.append(icon || ic("chevron", 14));
    const tx = h("span", "cm-bt"); if (title) tx.append(h("b", "", title)); if (text) tx.append(h("span", "", text));
    el.append(ico, tx); document.body.append(el);
    const r = a.getBoundingClientRect(), w = el.offsetWidth, cx = r.left + r.width / 2;
    const left = Math.max(8, Math.min(innerWidth - w - 8, cx - w / 2));
    el.style.left = left + "px"; el.style.top = r.bottom + 8 + "px"; el.style.transformOrigin = `${cx - left}px -8px`;
    bub = { el, _t: setTimeout(() => hideBubble(), ms) };
    el.onclick = () => { hideBubble(true); onTap?.(); };
    if (G()) {
      gsap.fromTo(el, { scale: .2, opacity: 0, y: -10 }, { scale: 1, opacity: 1, y: 0, duration: .65, ease: "elastic.out(1,.5)" });
      gsap.fromTo(ico, { scale: 0, rotation: -80 }, { scale: 1, rotation: 0, duration: .5, delay: .12, ease: "back.out(3)" });
    }
  }

  // ============================== المحادثة النصية ==============================
  const chat = (() => {
    const root = h("div", "cm-chat"), list = h("div", "cm-msgs"), more = h("button", "cm-more cm-press", "رسائل جديدة"), form = h("form", "cm-comp"), inp = h("input", "cm-in"), send = h("button", "cm-send cm-b");
    const empty = h("div", "cm-empty"); empty.append(makeChat(30).el, h("span", "", "لا رسائل بعد. ابدأ المحادثة!"));
    inp.type = "text"; inp.maxLength = 300; inp.placeholder = "اكتب رسالة…"; inp.autocomplete = "off"; inp.enterKeyHint = "send"; inp.setAttribute("aria-label", "رسالة");
    send.type = "submit"; send.setAttribute("aria-label", "إرسال"); send.append(sendIcon(20));
    more.type = "button"; more.hidden = true; list.append(empty); form.append(inp, send); root.append(list, more, form);
    let prev = null, count = 0, lastSend = 0;
    // pin = أنا عند آخر المحادثة، وهو الوضع الدائم. لا نتركه إلا إذا سحب اللاعب القائمة بنفسه للأعلى (عجلة/لمس)،
    // وأحداث scroll التي نسببها نحن (تغيّر الحجم، الكيبورد، الحركات) لا تفكّ التثبيت أبداً.
    let pin = true, ut = -1e9;
    const near = () => list.scrollHeight - list.scrollTop - list.clientHeight < 70;
    const toEnd = () => { pin = true; list.scrollTop = list.scrollHeight; more.hidden = true; };
    const pinEnd = () => {                                     // نثبّت الأسفل عدة إطارات: القياس والحركات والكيبورد قد تغيّر الارتفاع بعد الفتح
      toEnd(); const t0 = performance.now();
      const tick = () => { if (!pin) return; list.scrollTop = list.scrollHeight; if (performance.now() - t0 < 600) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    };
    const touched = () => { ut = performance.now(); };
    for (const ev of ["wheel", "touchstart", "touchmove", "pointerdown"]) list.addEventListener(ev, touched, { passive: true });
    list.addEventListener("scroll", () => {
      if (performance.now() - ut < 1200) pin = near();         // اللاعب هو من يتمرّر: يحق له الصعود
      else if (near()) pin = true;                              // وبلوغه الأسفل يعيد التثبيت
      if (pin) more.hidden = true;
    }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(() => { if (pin && list.clientHeight) list.scrollTop = list.scrollHeight; }).observe(list);
    more.onclick = () => { toEnd(); };
    form.onsubmit = e => {
      e.preventDefault();
      const t = inp.value.replace(/\s+/g, " ").trim(); if (!t || !S.code) return;
      const now = Date.now(); if (now - lastSend < 600) return; lastSend = now;
      inp.value = "";
      push(roomRef(S.code, "comms/chat"), { u: S.uid, n: myName(), m: t.slice(0, 300), t: serverTimestamp() }).catch(rulesHint);
      sfx.click(); inp.focus({ preventScroll: true });
    };
    function add(k, d, live) {
      empty.hidden = true;
      const mine = d.u === S.uid, stick = pin || mine;
      const grp = prev && prev.u === d.u && (d.t || 0) - (prev.t || 0) < 60000;
      const row = h("div", "cm-msg" + (mine ? " me" : "") + (grp ? " grp" : ""));
      if (!mine && !grp) { const n = h("span", "cm-mn", d.n || "لاعب"); n.style.color = hue(d.u); row.append(n); }
      const b = h("div", "cm-mb"), tx = h("span", "cm-mt", d.m); tx.dir = "auto"; b.append(tx, h("time", "cm-tm", fmtTime(d.t)));
      row.append(b); list.append(row); prev = d; count++;
      while (count > 140) { list.querySelector(".cm-msg")?.remove(); count--; }
      if (stick) pinEnd(); else if (live) { more.hidden = false; if (G()) gsap.fromTo(more, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: .35, ease: "back.out(2)" }); }
      if (live && G()) gsap.from(b, { y: 16, scale: .9, opacity: 0, duration: .5, ease: "back.out(2)", transformOrigin: mine ? "100% 100%" : "0% 100%" });
    }
    const reset = () => { list.replaceChildren(empty); empty.hidden = false; prev = null; count = 0; more.hidden = true; pin = true; };
    return { root, add, toEnd: pinEnd, reset, input: inp, onBlur: f => inp.addEventListener("blur", f), focus: () => inp.focus({ preventScroll: true }), blur: () => inp.blur() };
  })();

  const lastRead = () => sessionStorage.getItem("yz_cr_" + S.code) || "";
  const chatVisible = () => S.quick || !!S.P;
  function markRead() { try { if (S.lastKey) sessionStorage.setItem("yz_cr_" + S.code, S.lastKey); } catch { /* التخزين ممنوع */ } S.unread = 0; paintUnread(); }
  let firstChat = true, lastPreview = [];
  function onChat(snap) {
    const v = snap.val() || {}, keys = Object.keys(v).sort(), live = !firstChat; firstChat = false;
    const lr = lastRead();
    for (const k of keys) {
      if (chat._seen.has(k)) continue; chat._seen.add(k);
      const d = v[k]; if (!d || typeof d.m !== "string") continue;
      chat.add(k, d, live);
      lastPreview.push({ k, ...d }); if (lastPreview.length > 2) lastPreview.shift();
      if (d.u === S.uid) { S.lastKey = k; markRead(); continue; }
      S.lastKey = k;
      if (chatVisible()) markRead();
      else if (k > lr) {
        S.unread++; paintUnread();
        if (live) {
          sfx.msg(); chatIc.ping();
          if (!document.hidden) bubble({ icon: makeChat(15).el, title: d.n || "لاعب", text: d.m.length > 46 ? d.m.slice(0, 46) + "…" : d.m, onTap: openQuick });
        }
      } else if (live) sfx.msg();
    }
    paintPreviews();
  }
  chat._seen = new Set();

  // ---- نافذة الكتابة السريعة (أيقونة الدردشة) ----
  const quick = h("div", "cm-quick"), qHead = h("div", "cm-qh"), qBody = h("div", "cm-qb"), pinB = h("button", "cm-b cm-ibtn cm-pinb");
  quick.hidden = true;
  { const t = h("div", "cm-qt"); t.append(h("span", "cm-hash", "#"), h("span", "", "المحادثة النصية"));
    const x = h("button", "cm-b cm-ibtn"); x.type = "button"; x.setAttribute("aria-label", "إغلاق"); x.append(ic("close", 16));
    x.onclick = () => closeQuick();
    pinB.type = "button"; pinB.append(ic("pin", 16)); pinB.hidden = true;
    pinB.onclick = () => { pinned = !pinned; lsSet("yz_cm_pin", pinned ? "1" : "0"); pinB.classList.toggle("on", pinned); pinB.setAttribute("aria-pressed", String(pinned)); sfx.click(); };
    pinB.setAttribute("aria-label", "تثبيت النافذة");
    qHead.append(t, pinB, x); quick.append(qHead, qBody); document.body.append(quick); }
  // سحب النافذة من إطارها العلوي (الكمبيوتر فقط) ويُحفظ المكان
  qHead.addEventListener("pointerdown", e => {
    if (!DESK.matches || e.button !== 0 || e.target.closest("button")) return;
    const sx = e.clientX, sy = e.clientY, ox = vLeft, oy = vTop; try { qHead.setPointerCapture(e.pointerId); } catch { /* غير مدعوم */ }
    qHead.classList.add("drag");
    const mv = ev => { vLeft = ox + ev.clientX - sx; vTop = oy + ev.clientY - sy; clampQuick(); stickQuick(); };
    const up = () => { qHead.removeEventListener("pointermove", mv); qHead.removeEventListener("pointerup", up); qHead.removeEventListener("pointercancel", up); qHead.classList.remove("drag"); lsSet("yz_cm_pos", JSON.stringify({ x: Math.round(vLeft), y: Math.round(vTop) })); };
    qHead.addEventListener("pointermove", mv); qHead.addEventListener("pointerup", up); qHead.addEventListener("pointercancel", up);
  });
  // النافذة السريعة. الهاتف: نافذة منبثقة في منتصف المساحة المرئية فوق الكيبورد، تُحسب مرة واحدة بعد استقرار الكيبورد ثم لا تتحرك أبداً.
  // الكمبيوتر: تحت الشريط، قابلة للسحب (يُحفظ مكانها yz_cm_pos) ومعها دبوس تثبيت (yz_cm_pin) يمنع إغلاقها بلمسة خارجية.
  const DESK = matchMedia("(hover:hover) and (pointer:fine)");
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* التخزين ممنوع */ } };
  let vTop = 0, vLeft = 0, unQ = null, tokQ = 0, pinned = lsGet("yz_cm_pin") === "1", armed = false;
  // على الهاتف: أي إغلاق للكيبورد (زر ✓ فوقه أو لمسة خارجية) يغلق النافذة معه
  chat.onBlur(() => { if (!S.quick || DESK.matches || !armed) return; setTimeout(() => { if (S.quick && armed && document.activeElement !== chat.input) closeQuick(); }, 80); });
  // المكان محفوظ بإحداثيات المنظر المرئي، ونضيف إزاحته (iOS يزيح المنظر مع الكيبورد) فيبقى مكانه على الشاشة ثابتاً
  function stickQuick() { const vv = window.visualViewport; quick.style.top = vTop + (vv?.offsetTop || 0) + "px"; quick.style.left = vLeft + (vv?.offsetLeft || 0) + "px"; }
  function clampQuick() {
    const vv = window.visualViewport, vw = vv?.width || innerWidth, vh = vv?.height || innerHeight, w = quick.offsetWidth, hh = quick.offsetHeight;
    vLeft = Math.max(6, Math.min(vw - w - 6, vLeft)); vTop = Math.max(6, Math.min(vh - hh - 6, vTop));
  }
  function placeQuick(provisional) {
    const vv = window.visualViewport, vw = vv?.width || innerWidth, vh = vv?.height || innerHeight;
    if (DESK.matches) {
      quick.style.width = ""; quick.style.height = ""; quick.style.maxHeight = Math.max(170, Math.min(320, innerHeight * .4)) + "px";
      let p = null; try { p = JSON.parse(lsGet("yz_cm_pos")); } catch { /* تالف */ }
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { vLeft = p.x; vTop = p.y; }
      else { vLeft = (innerWidth - quick.offsetWidth) / 2; vTop = Math.max(dock.getBoundingClientRect().bottom + 8, 8); }
      clampQuick();
    } else {
      // المساحة فوق الكيبورد: الحقيقية إن كان ظاهراً، وإلا نقدّرها (الكيبورد مع شريطه ≈ 43% من الشاشة) لنضع النافذة في مكانها النهائي من أول مرة
      const av = kbOn() ? vh : Math.round(vh * .57), w = Math.round(Math.min(vw * .88, 360)), H = Math.round(Math.min(Math.max(av - 24, 140), Math.max(170, Math.min(av * .72, 330))));
      quick.style.width = w + "px"; quick.style.maxHeight = "none"; quick.style.height = H + "px";
      vLeft = (vw - w) / 2; vTop = Math.max(8, Math.min(av - H - 8, Math.max(dock.getBoundingClientRect().bottom + 8, (av - H) / 2)));
    }
    stickQuick();
  }
  function openQuick() {
    if (S.quick || !ready_()) return;
    if (S.P) closePanel(true);
    hideBubble(true); S.quick = true; const tok = ++tokQ; qBody.append(chat.root); quick.hidden = false; markRead();
    bChat.classList.add("on"); pinB.hidden = !DESK.matches; pinB.classList.toggle("on", pinned);
    const vv = window.visualViewport, out = e => { if (DESK.matches && pinned) return; if (!quick.contains(e.target) && !dock.contains(e.target) && !e.target.closest?.(".cm-bub")) closeQuick(); };
    const onVV = () => { if (DESK.matches) clampQuick(); stickQuick(); };
    vv?.addEventListener("scroll", onVV); vv?.addEventListener("resize", onVV);
    setTimeout(() => document.addEventListener("pointerdown", out, true), 0);       // أي لمسة خارج المحادثة تغلقها
    unQ = () => { vv?.removeEventListener("scroll", onVV); vv?.removeEventListener("resize", onVV); document.removeEventListener("pointerdown", out, true); };
    sfx.click();
    if (DESK.matches) {
      placeQuick(); chat.toEnd();
      const r = bChat.getBoundingClientRect(), cx = r.left + r.width / 2 - quick.getBoundingClientRect().left;
      if (G()) gsap.fromTo(quick, { scale: .15, opacity: 0, y: -16, transformOrigin: `${cx}px 0px` }, { scale: 1, opacity: 1, y: 0, duration: .55, ease: "back.out(1.8)", onComplete: () => { chat.focus(); chat.toEnd(); } });
      else { chat.focus(); chat.toEnd(); }
      return;
    }
    // الهاتف: النافذة تظهر في مكانها النهائي بحركة واحدة، ثم يُركَّز الحقل بعد انتهائها فيخرج الكيبورد وهي ثابتة لا تتحرك
    placeQuick(); chat.toEnd();
    const focusIt = () => { if (tok !== tokQ) return; chat.focus(); chat.toEnd(); setTimeout(() => { if (tok === tokQ) armed = true; }, 600); };
    if (G()) gsap.fromTo(quick, { scale: .92, opacity: 0, y: 10, transformOrigin: "50% 50%" }, { scale: 1, opacity: 1, y: 0, duration: .3, ease: "power2.out", clearProps: "transform,opacity", onComplete: focusIt });
    else focusIt();
  }
  function closeQuick(instant) {
    if (!S.quick) return; S.quick = false; tokQ++; armed = false; chat.blur(); bChat.classList.remove("on"); unQ?.(); unQ = null;
    const done = () => { quick.hidden = true; quick.style.opacity = ""; window.gsap?.set(quick, { clearProps: "transform,opacity" }); };
    if (!G() || instant) return done();
    if (!DESK.matches) return void gsap.to(quick, { scale: .94, opacity: 0, duration: .2, ease: "power2.in", onComplete: done });
    const r = bChat.getBoundingClientRect(), cx = r.left + r.width / 2 - quick.getBoundingClientRect().left;
    gsap.to(quick, { scale: .15, opacity: 0, y: -16, transformOrigin: `${cx}px 0px`, duration: .32, ease: "power3.in", onComplete: done });
  }

  DESK.addEventListener?.("change", () => { pinB.hidden = !DESK.matches || !S.quick; });

  // ============================== القناة الصوتية ==============================
  function persist() { const E = S.eng; flagSet(E?.on ? { c: S.code, m: E.muted } : null); }
  const micState = () => (!inVoice() ? "off" : S.eng.muted ? "muted" : "live");
  function paintMic() {
    const st = micState(); micD.set(st);
    bMic.classList.toggle("live", st === "live"); bMic.classList.toggle("muted", st === "muted");
    bMic.setAttribute("aria-label", st === "off" ? "انضم للصوت" : st === "muted" ? "افتح المايك" : "اكتم المايك");
    const someone = Object.keys(S.members).some(u => u !== S.uid);
    bMic.classList.toggle("has", st === "off" && someone);        // نقطة تدعوك للانضمام: يوجد من هو في القناة
    fab?.classList.toggle("live", inVoice());
  }
  async function joinVoice(auto) {
    const E = S.eng; if (!E || E.on || E.joining) return;
    micD.pulse(true);
    try { await E.join({ muted: auto ? !!flagGet()?.m : false, auto }); persist(); sfx.join(); paintMic(); }
    catch (e) {
      rulesHint(e);
      if (auto) bubble({ icon: makeMic(16, "off").el, title: "الصوت", text: "تعذّرت العودة للقناة الصوتية. المس المايك للانضمام" });
      else if (!S.noRules) toast(micError(e), "error");
      flagSet(null);
    } finally { micD.pulse(false); paintMic(); renderVoice(); }
  }
  async function leaveVoice() { const E = S.eng; if (!E?.on) return; await E.leave(); flagSet(null); sfx.leave(); paintMic(); renderVoice(); }
  function setMute(m, quiet) {
    const E = S.eng; if (!E?.on) return;
    E.setMuted(m, true); persist(); paintMic(); renderVoice();
    if (!quiet) m ? sfx.mute() : sfx.unmute();
  }
  // لمسة = انضمام/كتم/فتح، لمستان = اللوحة. الانضمام يبدأ فوراً داخل اللمسة نفسها (iOS لا يعرض إذن المايك إلا من لمسة مباشرة، وأي تأخير يفشله)،
  // والكتم فوري وإن جاءت اللمسة الثانية خلال 320ms نتراجع عنه بصمت ونفتح اللوحة
  let lastTap = 0, undo = null;
  bMic.onclick = () => {
    const now = performance.now();
    if (now - lastTap < 320) { lastTap = 0; undo?.(); undo = null; return openPanel("voice", { join: false }); }
    lastTap = now; undo = null;
    if (!ready_()) return;
    if (!inVoice()) joinVoice();
    else { const was = S.eng.muted; setMute(!was); undo = () => setMute(was, true); }
  };
  let lastC = 0, undoC = null;                                  // لمسة = فتح/إغلاق الكتابة، لمستان = اللوحة الكاملة
  bChat.onclick = () => {
    const now = performance.now();
    if (now - lastC < 320) { lastC = 0; undoC?.(); undoC = null; return openPanel("list"); }
    lastC = now; const was = S.quick;
    was ? closeQuick() : openQuick();
    undoC = () => { was ? openQuick() : closeQuick(true); };
  };

  // ---- ما يظهر في كل مكان عن الصوت (تُستدعى عند أي تغيير) ----
  function renderVoice() { paintMic(); paintFabTalk(); if (S.P) { paintVoicePanel(); paintPreviews(); } }
  function paintFabTalk() { const any = S.speaking.size > 0; commsIc.active(any); }

  const leaveT = new Map();
  function onMembers(m) {
    const old = S.members; S.members = m;
    if (!S.firstMembers) {
      for (const u of Object.keys(m)) {
        if (u === S.uid || old[u]) continue;
        if (leaveT.has(u)) { clearTimeout(leaveT.get(u)); leaveT.delete(u); continue; }      // عاد خلال المهلة: انتقال بين صفحتين لا انضمام جديد
        sfx.join();
        if (!inVoice() && !S.quick && !S.P) bubble({ icon: makeMic(16, "live").el, title: nameOf(u), text: "دخل القناة الصوتية. انضم إليه", onTap: () => joinVoice() });
      }
      for (const u of Object.keys(old)) {
        if (u === S.uid || m[u] || leaveT.has(u)) continue;
        leaveT.set(u, setTimeout(() => { leaveT.delete(u); if (!S.members[u]) { sfx.leave(); S.speaking.delete(u); renderVoice(); } }, 3500));
      }
    }
    S.firstMembers = false; renderVoice();
  }
  function onLevel(uid, v, sp) {
    const had = S.speaking.has(uid);
    if (uid === S.uid) micD.level(v);
    S.P?.rows.get(uid)?.mic.level(v);
    if (sp !== had) {
      sp ? S.speaking.add(uid) : S.speaking.delete(uid);
      if (uid === S.uid) ringOn(ringD, sp);
      S.P?.sheet.querySelectorAll(`[data-u="${esc(uid)}"] .cm-ring`).forEach(r => ringOn(r, sp));
      paintFabTalk();
    }
  }
  function onPeer(uid, st) { if (st) S.peerSt[uid] = st; else delete S.peerSt[uid]; if (S.P) paintVoicePanel(); }

  // ============================== اللوحة الكاملة ==============================
  const avatar = (name, u, size = 36) => {
    const a = h("span", "cm-av"); a.style.setProperty("--c", hue(u)); a.style.width = a.style.height = size + "px"; a.style.fontSize = size * .42 + "px";
    a.append(h("i", "cm-ring"), h("span", "", [...(name || "؟")][0] || "؟")); return a;
  };

  function paintPreviews() {
    const P = S.P; if (!P) return;
    // نص: آخر رسالتين
    P.tPrev.replaceChildren();
    if (!lastPreview.length) P.tPrev.append(h("span", "cm-pe", "لا رسائل بعد. ابدأ المحادثة!"));
    for (const m of lastPreview) { const l = h("div", "cm-pl"); l.append(h("b", "", (m.u === S.uid ? "أنت" : m.n || "لاعب") + ": "), h("span", "", m.m)); l.dir = "auto"; P.tPrev.append(l); }
    P.tPrev.append(h("div", "cm-fake", "اكتب رسالة…"));
    // صوت: من في القناة
    P.vPrev.replaceChildren();
    const ids = Object.keys(S.eng ? S.eng.visible() : {});
    if (!ids.length) P.vPrev.append(h("span", "cm-pe", "لا أحد في القناة الصوتية الآن"));
    else { const row = h("div", "cm-pav"); ids.forEach(u => { const a = avatar(nameOf(u), u, 34); a.dataset.u = u; if (S.speaking.has(u)) { const r = a.firstChild; setTimeout(() => ringOn(r, true), 0); } row.append(a); }); P.vPrev.append(row); }
    const j = h("div", "cm-fake" + (inVoice() ? " on" : ""), inVoice() ? "أنت في القناة" : "المس للانضمام للقناة"); P.vPrev.append(j);
    P.vCount.textContent = String(ids.length); P.vCount.hidden = !ids.length;
  }

  function micOf(u) { const r = S.eng?.visible()[u]; return u === S.uid ? micState() : r?.m ? "muted" : "live"; }
  function paintVoicePanel() {
    const P = S.P; if (!P) return;
    const E = S.eng, vis = E ? E.visible() : {}, ids = Object.keys(vis).sort((a, b) => (a === S.uid ? -1 : b === S.uid ? 1 : nameOf(a).localeCompare(nameOf(b), "ar")));
    for (const u of ids) {
      let r = P.rows.get(u);
      if (!r) {
        const li = h("li", "cm-vrow"); li.dataset.u = u;
        const av = avatar(nameOf(u), u, 40), info = h("div", "cm-vinfo"), nm = h("b", "", ""), st = h("small", "", "");
        info.append(nm, st);
        const spk = h("button", "cm-b cm-ibtn cm-spk"); spk.type = "button"; const spkI = makeSpeaker(17, E?.muted4.has(u) || false); spk.append(spkI.el);
        spk.onclick = () => { const m = !E.muted4.has(u); E.setPeerMuted(u, m); spkI.set(m); sfx.click(); };
        const mic = makeMic(22, micOf(u)); mic.el.classList.add("cm-rm");
        li.append(av, info, spk, mic.el); P.ul.append(li);
        r = { li, nm, st, spk, mic, av }; P.rows.set(u, r);
        if (G()) gsap.from(li, { x: 36, opacity: 0, scale: .92, duration: .55, ease: "back.out(1.8)" });
        if (S.speaking.has(u)) ringOn(av.firstChild, true);
      }
      const me = u === S.uid, peer = S.peerSt[u];
      r.nm.textContent = nameOf(u) + (me ? " (أنت)" : "");
      r.st.textContent = me ? (E.muted ? "المايك مغلق" : "المايك مفتوح") : peer === "failed" ? "تعذّر الاتصال به" : peer === "connecting" ? "جارٍ الاتصال…" : (S.members[u]?.m ? "مكتوم" : "متصل");
      r.li.classList.toggle("bad", peer === "failed"); r.spk.hidden = me || !inVoice();
      r.mic.set(micOf(u));
    }
    for (const [u, r] of [...P.rows]) if (!ids.includes(u)) {
      P.rows.delete(u);
      G() ? gsap.to(r.li, { x: -40, opacity: 0, height: 0, paddingBlock: 0, marginBlock: 0, duration: .35, ease: "power2.in", onComplete: () => r.li.remove() }) : r.li.remove();
    }
    P.vEmpty.hidden = ids.length > 0;
    // الأزرار بحسب كوني داخل القناة أم خارجها
    const inV = inVoice(); P.ctl.hidden = !inV; P.joinBox.hidden = inV;
    P.bigMic.set(micState()); P.bigLbl.textContent = micState() === "muted" ? "افتح المايك" : "اكتم المايك";
    P.bigBtn.classList.toggle("muted", micState() === "muted");
    P.vHead.classList.toggle("on", inV); P.vHeadDot.hidden = !inV;
  }

  function openPanel(view = "list", o = {}) {
    if (!ready_()) return hint();
    if (S.P) return setView(view, o);
    closeQuick(true); hideBubble(true);
    const sheet = h("div", "ovl sheet cm-sheet"), panel = h("div", "glass sheet-card cm-panel"), top = h("div", "cm-top"), rows = new Map();
    const ttl = h("div", "cm-title"); ttl.append(makeComms(22).el, h("span", "", "التواصل"));
    const x = h("button", "cm-b cm-ibtn", ""); x.type = "button"; x.setAttribute("aria-label", "إغلاق"); x.append(ic("close", 18)); top.append(ttl, x);
    const mkSec = (k, label) => {
      const sec = h("section", "cm-sec cm-" + k), hd = h("button", "cm-sh"); hd.type = "button";
      const un = h("span", "cm-badge cm-un"), cnt = h("span", "cm-count"), dot = h("i", "cm-live"), chev = ic("chevron", 16); chev.classList.add("cm-chev"); dot.hidden = true; un.hidden = true; cnt.hidden = true;
      hd.append(h("span", "cm-hash", "#"), h("span", "cm-sn", label), dot, un, cnt, chev);
      const sb = h("div", "cm-sb"), prev = h("div", "cm-prev"), full = h("div", "cm-full"); sb.append(prev, full); sec.append(hd, sb);
      return { sec, hd, un, cnt, dot, prev, full, chev };
    };
    const T = mkSec("text", "المحادثة النصية"), V = mkSec("voice", "المحادثة الصوتية");
    // محتوى القناة الصوتية الكامل
    const vfull = V.full; vfull.classList.add("cm-vfull");
    const ul = h("ul", "cm-vlist"), vEmpty = h("div", "cm-pe cm-vempty", "لا أحد في القناة الآن");
    const ctl = h("div", "cm-vctl"), bigBtn = h("button", "cm-b cm-bigmic"); bigBtn.type = "button"; const bigMic = makeMic(28, micState()), bigLbl = h("span", "cm-bl", "اكتم المايك"); bigBtn.append(bigMic.el);
    const bigWrap = h("div", "cm-bigwrap"); bigWrap.append(bigBtn, bigLbl);
    const lv = h("button", "cm-b cm-leave"); lv.type = "button"; lv.append(ic("leave", 18), h("span", "", "مغادرة القناة")); ctl.append(bigWrap, lv);
    const joinBox = h("div", "cm-joinbox"), jb = h("button", "cm-b cm-join"); jb.type = "button"; const jm = makeMic(22, "off"); jm.el.style.color = "#06231f"; jb.append(jm.el, h("span", "", "انضم للقناة الصوتية"));
    joinBox.append(h("small", "", "أنت خارج القناة. انضم لتسمعهم ويسمعوك"), jb);
    vfull.append(ul, vEmpty, ctl, joinBox);
    bigBtn.onclick = () => setMute(!S.eng.muted); lv.onclick = () => leaveVoice(); jb.onclick = () => joinVoice();
    panel.append(top, T.sec, V.sec); sheet.append(panel); document.body.append(sheet);
    const P = S.P = P_ = { sheet, panel, rows, ul, ctl, joinBox, vEmpty, bigMic, bigLbl, bigBtn, tPrev: T.prev, vPrev: V.prev, vCount: V.cnt, unT: T.un, vHead: V.hd, vHeadDot: V.dot, T, V, view: null, off: [] };
    P.off.push(fit(sheet));
    // النقر على قسم = الدخول لقناته. النقر على القسم المفتوح من عنوانه = العودة للقائمة
    const close = () => closePanel(); x.onclick = close; P.off.push(dismissOutside(sheet, close));
    T.full.append(chat.root);
    paintPreviews(); paintVoicePanel(); paintUnread();
    setView(view, { ...o, first: true });
    flyFrom(sheet, panel, o.from || fab || bMic);
  }

  // القسمان مفتوحان معاً دائماً (لا طيّ ولا تصغير)
  function setView(k, o = {}) {
    const P = S.P; if (!P) return;
    if (!P.view) {
      P.view = "both";
      for (const sec of [P.T, P.V]) { sec.sec.classList.add("is-open"); sec.chev.hidden = true; }
      P.T.full.append(chat.root); chat.toEnd(); markRead();
      if (G()) gsap.from([P.T.full, P.V.full], { opacity: 0, y: 14, duration: .45, delay: .25, stagger: .08, ease: "power3.out", clearProps: "opacity,transform" });
    }
    paintVoicePanel();
  }

  function closePanel(instant) {
    const P = S.P; if (!P || P._closing) return; P._closing = true;
    P.off.forEach(f => f?.());
    const fin = () => { P.sheet.remove(); if (S.P === P) { S.P = P_ = null; } };
    chat.root.remove();
    if (!G() || instant) return fin();
    flyTo(P.sheet, P.panel, fab || bMic, fin);
  }

  // ============================== زر «التواصل» (الرئيسية والردهة) ==============================
  let fab = null, fabBadge = null, commsIc = makeComms(22);
  if (mode === "lobby") {
    fab = h("button", "fab cm-fab dim"); fab.id = "cm"; fab.type = "button"; fab.setAttribute("aria-label", "التواصل: محادثة نصية وصوتية");
    fabBadge = h("span", "badge"); fabBadge.hidden = true; fab.append(commsIc.el, fabBadge); document.body.append(fab);
    fab.onclick = () => { sfx.click(); S.code ? openPanel("list", { from: fab }) : hint(); };
  }
  function hint() {
    bubble({ icon: makeComms(16).el, title: "التواصل", text: "ادخل غرفة أو أنشئ واحدة لتتحدث مع اللاعبين كتابةً وصوتاً", anchor: fab || dock, ms: 3800 });
  }

  // ============================== الدخول والخروج من الغرفة ==============================
  async function enter(code) {
    if (S.code === code && S.eng) return true;
    await exit(true);
    const u = await ready; S.uid = u.uid;
    S.code = code; S.firstMembers = true; firstChat = true; chat._seen = new Set(); chat.reset(); lastPreview = []; S.lastKey = ""; S.unread = 0; S.members = {}; S.peerSt = {};
    document.documentElement.classList.add("yzc-on");
    S.eng = new VoiceEngine(code, u.uid, myName, { members: onMembers, joined: () => renderVoice(), muted: () => renderVoice(), peer: onPeer, level: onLevel, error: rulesHint, blocked: () => bubble({ icon: makeMic(16, "live").el, title: "الصوت", text: "المس الشاشة لتفعيل سماع الصوت" }), ended: () => { toast("انقطع المايك", "error"); flagSet(null); renderVoice(); } });
    S.subs.push(onValue(roomRef(code, "players"), s => { S.players = s.val() || {}; if (S.P) { paintPreviews(); paintVoicePanel(); } }, () => {}));
    S.subs.push(onValue(query(roomRef(code, "comms/chat"), limitToLast(80)), onChat, rulesHint));
    if (fab) { fab.classList.remove("dim"); if (G()) gsap.fromTo(fab, { scale: .75 }, { scale: 1, duration: .6, ease: "back.out(3)", clearProps: "transform" }); }
    paintUnread(); paintMic();
    dock.hidden = false; follow();
    if (G()) gsap.fromTo(pill, { y: -34, opacity: 0, scale: .7 }, { y: 0, opacity: 1, scale: 1, duration: .8, delay: .15, ease: "elastic.out(1,.55)" });
    const f = flagGet(); if (f && f.c === code) joinVoice(true); else if (f) flagSet(null);      // عودة تلقائية للقناة بعد الانتقال بين الصفحات
    return true;
  }
  async function exit(silent) {
    if (!S.code && !S.eng) return;
    closeQuick(true); closePanel(true); hideBubble(true);
    S.subs.forEach(u => u()); S.subs = [];
    leaveT.forEach(clearTimeout); leaveT.clear();
    const E = S.eng; S.eng = null; S.code = null;
    flagSet(null); try { sessionStorage.removeItem("yz_cr_" + (E?.code || "")); } catch { /* التخزين ممنوع */ }
    S.speaking.clear(); ringOn(ringD, false); micD.set("off");
    document.documentElement.classList.remove("yzc-on");
    fab?.classList.add("dim"); fab?.classList.remove("live"); commsIc.active(false); S.unread = 0; paintUnread();
    const hideDock = () => { dock.hidden = true; lx = ly = -999; };
    if (G() && !silent) gsap.to(pill, { y: -30, opacity: 0, scale: .7, duration: .3, ease: "back.in(2)", onComplete: hideDock }); else hideDock();
    await E?.destroy();
  }
  addEventListener("pagehide", () => { /* onDisconnect ينظّف الخادم؛ الجلسة تعيد الانضمام في الصفحة التالية */ });

  return {
    fab, enter, exit, openPanel, openQuick, closeQuick, hint,
    get micTrack() { return S.eng?.micTrack() || null; },
    get code() { return S.code; }
  };
}
window.YZComms = { micTrack: () => C?.micTrack || null };
