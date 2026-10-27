// واجهة الأصدقاء: أيقونة بجانب زر الصوت، لوحة الأصدقاء/الطلبات/الحساب، وبطاقات الدعوة الواردة.
import { identity, fmtPid, parsePid, parseKey, fmtKey, restoreIdentity } from "./identity.js";
import { watchSocial, sendRequest, acceptRequest, declineRequest, removeFriend, sendInvite, dismissInvite, profileOf, INVITE_TTL } from "./friends.js";
import { toast, sfx, confirmDialog, flyFrom, flyTo, dismissOutside } from "./ui.js";
import { serverNow } from "./firebase.js";

const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const G = () => window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches;
const copy = async t => { try { await navigator.clipboard.writeText(t); toast("نُسخ"); } catch { toast("تعذّر النسخ", "error"); } };
const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/></svg>';

// صورة الطرفة: ضع ملفاً باسم media/this-is-you بإحدى الامتدادات (png/jpg/jpeg/gif/webp)، وإن لم يوجد يظهر رمز تعبيري
const tryImg = urls => new Promise(res => { let i = 0; const next = () => { if (i >= urls.length) return res(null); const u = urls[i++], im = new Image(); im.onload = () => res(im); im.onerror = next; im.src = u; }; next(); });
const selfImg = tryImg(["png", "jpg", "jpeg", "gif", "webp"].map(e => `media/this-is-you.${e}`));
async function thisIsYou() {
  document.activeElement?.blur?.();                       // يغلق الكيبورد ويعيد الشاشة لمكانها فتظهر النافذة في منتصف الشاشة (iOS يرفع الصفحة مع الكيبورد)
  [0, 120, 350, 700].forEach(t => setTimeout(() => { scrollTo(0, 0); document.querySelector('.sheet-card .fbody')?.scrollTo?.(0, 0); }, t));
  const o = el("div", "ovl"), c = el("div", "glass joke"), img = await selfImg;
  if (img) { img.className = "joke-img"; c.append(img); } else c.append(el("div", "joke-emoji", "🤦"));
  c.append(el("div", "joke-t", "هذا انت ياذكي!")); o.append(c); document.body.append(o);
  const close = () => { off(); G() ? gsap.to(c, { scale: .6, opacity: 0, y: 30, duration: .25, ease: "back.in(2)", onComplete: () => { gsap.to(o, { opacity: 0, duration: .15, onComplete: () => o.remove() }); } }) : o.remove(); };
  const off = dismissOutside(o, close); setTimeout(() => { if (o.isConnected) close(); }, 4500);
  if (G()) { gsap.fromTo(o, { opacity: 0 }, { opacity: 1, duration: .2 }); gsap.fromTo(c, { scale: .3, rotation: -12, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: .7, ease: "elastic.out(1,.5)" }); }
  sfx.error();
}

// h = { members(): مجموعة pid لمن معك في الغرفة، name(): الاسم الحالي، room(): كود الغرفة أو null، createRoom(): ينشئ غرفة ويفتح ردهتها ويرجع الكود، join(code): ينضم لغرفة }
export async function initSocial(h) {
  const me = await identity();
  const btn = el("button", "fab fr"); btn.id = "fr"; btn.setAttribute("aria-label", "الأصدقاء"); btn.innerHTML = ICON;
  const badge = el("span", "badge"); badge.hidden = true; btn.append(badge); document.body.append(btn);
  let D = { friends: {}, requests: {}, invites: [] }, sheet = null; const sent = new Set(), shown = new Set();
  const status = pid => (D.friends[pid] ? "friend" : D.requests[pid] ? "incoming" : sent.has(pid) ? "sent" : "none");
  const listeners = new Set(); const emit = () => listeners.forEach(f => f());

  function paintBtn() {
    const n = Object.keys(D.requests).length, on = Object.values(D.friends).some(f => f.online);
    badge.hidden = !n; badge.textContent = n; btn.classList.toggle("on", on);
    btn.title = on ? "أصدقاء متصلون" : "الأصدقاء";
  }
  const row = (title, sub) => { const r = el("div", "frrow"), t = el("div", "frt"); t.append(el("b", "", title)); if (sub) t.append(el("small", "", sub)); r.append(t); return r; };
  const sb = (txt, fn, cls = "") => { const b = el("button", "sbtn " + cls, txt); b.onclick = () => { sfx.click(); fn(b); }; return b; };

  async function invite(pid) {
    try {
      let code = h.room(); if (!code) code = await h.createRoom();
      await sendInvite(pid, code, h.name()); toast("أُرسلت الدعوة ✓", "ok");
    } catch (e) { toast(e.message || "تعذّر إرسال الدعوة", "error"); }
  }
  function renderSheet() {
    if (!sheet) return;
    const body = sheet.querySelector(".fbody"), keep = body.scrollTop;
    const vals = [...body.querySelectorAll("input")].map(i => i.value), fi = [...body.querySelectorAll("input")].indexOf(document.activeElement);   // لا نضيّع ما يكتبه اللاعب عند تحديث الحضور
    body.replaceChildren();
    if (!me.ok) body.append(el("div", "fnote", "ميزة الأصدقاء تحتاج تحديث قواعد Firebase (الصق ملف firebase.rules.json في Rules ثم Publish)."));
    const reqs = Object.entries(D.requests);
    if (reqs.length) {
      body.append(el("h3", "", `طلبات الصداقة (${reqs.length})`));
      for (const [p, v] of reqs) { const r = row(v.n || "لاعب", fmtPid(p)); r.append(sb("قبول", () => acceptRequest(p).then(() => toast("أصبحتم أصدقاء 🎉", "ok")).catch(e => toast(e.message, "error")), "ok"), sb("رفض", () => declineRequest(p))); body.append(r); }
    }
    const fr = Object.entries(D.friends).sort((a, b) => (b[1].online - a[1].online) || a[1].name.localeCompare(b[1].name, "ar"));
    body.append(el("h3", "", `الأصدقاء (${fr.length})`));
    if (!fr.length) body.append(el("div", "fnote", "لا أصدقاء بعد. أضف صديقاً من قائمة اللاعبين في الغرفة أو بمعرّفه أدناه."));
    for (const [p, v] of fr) {
      const r = row(v.name, v.online ? "متصل الآن" : "غير متصل"); r.classList.toggle("onl", v.online);
      r.prepend(el("i", "dot" + (v.online ? "" : " off gray")));
      if (h.members?.().has(p)) r.append(el("span", "chip ok", "معك في الغرفة"));     // لا معنى لدعوة من هو في غرفتك أصلاً
      else { const inv = sb("دعوة", () => invite(p), "ok"); inv.disabled = !v.online; r.append(inv); }
      const rm = sb("إزالة", async () => { if (await confirmDialog(`إزالة ${v.name} من أصدقائك؟`, "إزالة", "إلغاء")) removeFriend(p).then(() => toast("أُزيلت الصداقة")).catch(e => toast(e.message, "error")); }, "bad");
      r.append(rm); body.append(r);
    }
    body.append(el("h3", "", "إضافة صديق بالمعرّف"));
    const add = el("div", "fadd"), inp = el("input"); inp.placeholder = "YZ-XXXX-XXXX"; inp.dir = "ltr"; inp.autocomplete = "off";
    const go = sb("إرسال", async () => {
      const p = parsePid(inp.value); if (!p) return toast("المعرّف غير صحيح", "error");
      try { const pr = await profileOf(p); if (!pr) return toast("لا يوجد لاعب بهذا المعرّف", "error"); await add_(p, pr.name); inp.value = ""; } catch (e) { toast(e.message, "error"); }
    }, "ok");
    add.append(inp, go); body.append(add);
    body.append(el("h3", "", "حسابي"));
    const my = row("معرّفك", fmtPid(me.pid) || "—"); if (me.pid) my.append(sb("نسخ", () => copy(fmtPid(me.pid)))); body.append(my);
    if (me.key) {
      const k = row("رمز الاسترجاع (سرّي)", "احفظه: به تستعيد حسابك وأصدقاءك على أي جهاز أو متصفح، حتى بعد مسح البيانات"), kv = el("code", "kv", "••••-••••-••••-••••-••••-••••");
      let shownKey = false;
      k.append(sb("إظهار", b => { shownKey = !shownKey; kv.textContent = shownKey ? fmtKey(me.key) : "••••-••••-••••-••••-••••-••••"; b.textContent = shownKey ? "إخفاء" : "إظهار"; }), sb("نسخ", () => copy(fmtKey(me.key))));
      body.append(k, kv);
    }
    const rs = el("div", "fadd"), ri = el("input"); ri.placeholder = "رمز استرجاع لحساب آخر"; ri.dir = "ltr"; ri.autocomplete = "off";
    const self = () => { if (me.key && parseKey(ri.value) === me.key) { ri.value = ""; thisIsYou(); return true; } return false; };   // رمزك الحالي: لا داعي لاسترجاعه
    ri.addEventListener("input", () => { if (parseKey(ri.value)) self(); });
    rs.append(ri, sb("استرجاع", async () => {
      if (self()) return;
      if (!(await confirmDialog("سيحلّ هذا الحساب محل حسابك الحالي على هذا الجهاز. متأكد؟", "استرجاع", "إلغاء"))) return;
      try { await restoreIdentity(ri.value); toast("تم الاسترجاع", "ok"); setTimeout(() => location.reload(), 700); } catch (e) { toast(e.message, "error"); }
    }, "bad")); body.append(rs);
    const ins = [...body.querySelectorAll("input")]; ins.forEach((i, k) => { if (vals[k]) i.value = vals[k]; }); if (fi >= 0 && ins[fi]) ins[fi].focus();
    body.scrollTop = keep;
  }
  async function add_(pid, name) {
    if (status(pid) === "incoming") { await acceptRequest(pid); toast(`أصبحت صديق ${name || "اللاعب"} 🎉`, "ok"); return; }
    await sendRequest(pid, h.name()); sent.add(pid); toast("أُرسل طلب الصداقة ✓", "ok"); emit(); renderSheet();
  }
  function open() {
    if (sheet) return; sfx.click();
    sheet = el("div", "ovl sheet"); const c = el("div", "glass sheet-card"), hd = el("div", "fhead"), x = el("button", "sbtn", "✕");
    hd.append(el("h2", "", "الأصدقاء"), x); const body = el("div", "fbody"); c.append(hd, body); sheet.append(c); document.body.append(sheet);
    let off = null;
    const close = () => { const s = sheet; if (!s || s._closing) return; s._closing = true; off?.(); flyTo(s, c, btn, () => { s.remove(); if (sheet === s) sheet = null; }); };
    x.onclick = close; off = dismissOutside(sheet, close);
    renderSheet(); flyFrom(sheet, c, btn);
  }
  btn.onclick = open;

  // دعوات واردة: بطاقة واحدة فقط؛ الجديدة تدفع القديمة وتأخذ مكانها، وتختفي وحدها بعد 5 ثوانٍ
  const stack = el("div", "invstack"); document.body.append(stack);
  let cur = null; const SHOW_MS = 5000;
  function hideInvite(x, how = "up", cb) {
    if (!x || x.gone) return cb?.(); x.gone = true; clearTimeout(x.t); dismissInvite(x.id);
    const end = () => { x.c.remove(); cb?.(); };
    if (!G()) return end();
    gsap.killTweensOf([x.c, x.bar]);
    gsap.to(x.c, how === "push" ? { x: -90, opacity: 0, scale: .92, duration: .28, ease: "power2.in", onComplete: end } : { y: -50, opacity: 0, scale: .9, duration: .4, ease: "back.in(1.6)", onComplete: end });
  }
  function showInvite(i) {
    const c = el("div", "glass inv"), x = { id: i.id, c, gone: false, bar: el("i", "ibar") };
    const t = el("div", "invt"); t.append(el("b", "", i.n || "صديق"), el("span", "", " يدعوك للعب 🎮"));
    const a = el("div", "inva");
    a.append(sb("انضم", async b => {
      b.disabled = true; clearTimeout(x.t);
      try {
        if (h.room() && h.room() !== i.code && !(await confirmDialog("ستغادر غرفتك الحالية وتنضم للدعوة. تتابع؟", "انضم", "ابقَ"))) { b.disabled = false; return; }
        await dismissInvite(i.id); hideInvite(x); if (cur === x) cur = null; await h.join(i.code);
      } catch (e) { toast(e.message || "الغرفة لم تعد متاحة", "error"); b.disabled = false; }
    }, "ok"), sb("رفض", () => { dismissInvite(i.id); hideInvite(x); if (cur === x) cur = null; }));
    c.append(t, a, x.bar);
    const old = cur; cur = x; if (old) hideInvite(old, "push");
    stack.append(c); sfx.turn();
    if (G()) {
      gsap.fromTo(c, { y: -60, x: old ? 70 : 0, opacity: 0, scale: .85 }, { y: 0, x: 0, opacity: 1, scale: 1, duration: .6, ease: "elastic.out(1,.6)", delay: old ? .12 : 0 });
      gsap.fromTo(x.bar, { scaleX: 1 }, { scaleX: 0, duration: SHOW_MS / 1000, ease: "none", delay: .2 });     // شريط يتناقص بلا أرقام
    }
    x.t = setTimeout(() => { dismissInvite(i.id); hideInvite(x); if (cur === x) cur = null; }, SHOW_MS + 200);
  }
  function showInvites() {
    const now = serverNow(), live = D.invites.filter(i => now - (i.t || now) < INVITE_TTL).sort((p, q) => (p.t || 0) - (q.t || 0));
    D.invites.filter(i => !live.includes(i) && !shown.has(i.id)).forEach(i => dismissInvite(i.id));      // قديمة: تُحذف دون عرض
    const fresh = live.filter(i => !shown.has(i.id)); fresh.forEach(i => shown.add(i.id));
    live.filter(i => i !== fresh[fresh.length - 1] && fresh.includes(i)).forEach(i => dismissInvite(i.id));   // إن وصلت عدة دعوات معاً نعرض الأحدث فقط
    if (fresh.length) showInvite(fresh[fresh.length - 1]);
  }
  if (me.ok) watchSocial(d => { D = d; paintBtn(); showInvites(); renderSheet(); emit(); });
  return { me, refresh: renderSheet, status, add: add_, accept: p => add_(p), onChange: f => { listeners.add(f); return () => listeners.delete(f); }, open };
}
