// هوية اللاعب الثابتة (لا تتغير بتغيير الاسم ولا بتبديل الجهاز):
//   pid  = المعرّف العام (8 أحرف) يظهر للآخرين ويُستخدم في الصداقة والسجل.
//   key  = رمز الاسترجاع السري (24 حرفاً) يحفظه اللاعب ليستعيد نفس الهوية على أي جهاز أو متصفح أو بعد مسح البيانات.
// الجلسة المجهولة في Firebase (uid) تتغير مع كل متصفح، لذا نربطها بالـ pid عبر link/{uid} بعد إثبات معرفة الـ key (انظر firebase.rules.json).
import { db, ready, ref, get, set, update, onValue, onDisconnect, serverTimestamp } from "./firebase.js";

const LS = "yz_ident", AL = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const rnd = n => { const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(x => AL[x % AL.length]).join(""); };
export const fmtPid = p => (p ? `YZ-${p.slice(0, 4)}-${p.slice(4)}` : "");
export const parsePid = s => { const t = (s || "").toUpperCase().replace(/^YZ/, "").replace(/[^A-Z0-9]/g, ""); return /^[A-Z0-9]{8}$/.test(t) ? t : null; };
export const fmtKey = k => (k || "").match(/.{1,4}/g)?.join("-") || "";
export const parseKey = s => { const t = (s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^[A-Z0-9]{24}$/.test(t) ? t : null; };

const load = () => { try { const v = JSON.parse(localStorage.getItem(LS)); return v?.pid && v?.key ? v : null; } catch { return null; } };
const save = v => { try { localStorage.setItem(LS, JSON.stringify({ pid: v.pid, key: v.key })); } catch { /* التخزين ممنوع */ } };
try { navigator.storage?.persist?.(); } catch { /* طلب إبقاء البيانات: اختياري */ }

async function linkNow(uid, s) {
  if ((await get(ref(db, `link/${uid}`))).val() === s.pid) return;
  await set(ref(db, `proof/${uid}`), s.key);
  await set(ref(db, `link/${uid}`), s.pid);
}
async function createNew(uid) {
  for (let i = 0; i < 6; i++) {
    const s = { pid: rnd(8), key: rnd(24) };
    if ((await get(ref(db, `profiles/${s.pid}`))).exists()) continue;
    await set(ref(db, `keys/${s.key}`), s.pid);
    await linkNow(uid, s);
    await set(ref(db, `profiles/${s.pid}`), { created: Date.now(), last: serverTimestamp(), name: "" });
    save(s); return s;
  }
  throw new Error("تعذّر إنشاء المعرّف");
}

let P = null;
// ترجع { pid, key, ok } — ok=false إن لم تكن قواعد Firebase محدَّثة (تعمل اللعبة بلا ميزات الأصدقاء)
export const identity = () => (P ??= (async () => {
  const u = await ready; let s = load();
  try { if (s) await linkNow(u.uid, s); else s = await createNew(u.uid); return { ...s, ok: true }; }
  catch (e) {
    console.warn("identity", e);
    // الحساب حُذف من لوحة التحكم (الرمز لم يعد موجوداً): نبدأ هوية جديدة بدل البقاء بهوية ميتة. أي فشل اتصال لا يمسح شيئاً
    try {
      if (s && (await get(ref(db, `keys/${s.key}`))).val() === null) {
        try { localStorage.removeItem(LS); } catch { /* ممنوع */ }
        return { ...(await createNew(u.uid)), ok: true };
      }
    } catch { /* نكمل للرد الاحتياطي */ }
    return { ...(s || {}), ok: false };
  }
})());

// استرجاع الهوية برمز الاسترجاع على جهاز/متصفح جديد
export async function restoreIdentity(input) {
  const key = parseKey(input); if (!key) throw new Error("الرمز غير صحيح");
  const u = await ready;
  let pid; try { pid = (await get(ref(db, `keys/${key}`))).val(); } catch { throw new Error("تعذّر الاتصال"); }
  if (!pid) throw new Error("لا يوجد حساب بهذا الرمز");
  await linkNow(u.uid, { pid, key });
  save({ pid, key }); P = null;
  return identity();
}

// الاسم الحالي والأسماء السابقة تُسجَّل في الملف العام (الاسم يتغير لكن المعرّف ثابت)
export async function syncProfile(name) {
  const me = await identity(); if (!me.ok) return;
  const k = btoa(unescape(encodeURIComponent(name))).replace(/[^A-Za-z0-9]/g, "").slice(0, 40) || "x";
  await update(ref(db, `profiles/${me.pid}`), { name, last: serverTimestamp(), [`aliases/${k}`]: name }).catch(() => {});
}

// الحضور: متصل/غير متصل (يظهر لأصدقائك فقط في الواجهة)
let presenceOn = false;
export async function startPresence() {
  if (presenceOn) return; presenceOn = true;
  const me = await identity(); if (!me.ok) return;
  const pr = ref(db, `presence/${me.pid}`), on = () => set(pr, { on: true, t: serverTimestamp() }).catch(() => {});
  onValue(ref(db, ".info/connected"), s => { if (s.val()) { onDisconnect(pr).set({ on: false, t: serverTimestamp() }); on(); } });
  setInterval(on, 45e3);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) on(); });
}
