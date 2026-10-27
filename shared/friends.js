// الأصدقاء والدعوات. كل شيء مفتاحه المعرّف الثابت pid:
//   requests/{إلى}/{من} = {n, t}      friends/{أنا}/{هو} = {t}  (متبادل)
//   invites/{إلى}/{id} = {from, n, code, t}     presence/{pid} = {on, t}
import { db, ref, get, set, update, remove, onValue, serverTimestamp } from "./firebase.js";
import { identity } from "./identity.js";

const R = p => (p ? ref(db, p) : ref(db));   // الجذر بلا مسار (ref(db, "") يرفضها Firebase)
export const INVITE_TTL = 10e3;          // الدعوة صالحة 10 ثوانٍ وتظهر للمستلم 5 ثوانٍ

export async function profileOf(pid) { const v = (await get(R(`profiles/${pid}`))).val(); return v ? { pid, ...v } : null; }

export async function sendRequest(to, myName) {
  const me = await identity(); if (!me.ok) throw new Error("ميزة الأصدقاء تحتاج تحديث قواعد Firebase");
  if (to === me.pid) throw new Error("هذا معرّفك أنت");
  if ((await get(R(`friends/${me.pid}/${to}`))).exists()) throw new Error("هو صديقك بالفعل");
  if ((await get(R(`requests/${me.pid}/${to}`))).exists()) return acceptRequest(to);    // سبق أن طلب هو صداقتك: نقبلها
  await set(R(`requests/${to}/${me.pid}`), { n: myName || "لاعب", t: serverTimestamp() });
}
export async function acceptRequest(from) {
  const me = await identity();
  await update(R(""), { [`friends/${me.pid}/${from}`]: { t: Date.now() }, [`friends/${from}/${me.pid}`]: { t: Date.now() }, [`requests/${me.pid}/${from}`]: null });
}
export async function declineRequest(from) { const me = await identity(); await remove(R(`requests/${me.pid}/${from}`)); }
export async function cancelRequest(to) { const me = await identity(); await remove(R(`requests/${to}/${me.pid}`)).catch(() => {}); }
export async function removeFriend(q) { const me = await identity(); await update(R(""), { [`friends/${me.pid}/${q}`]: null, [`friends/${q}/${me.pid}`]: null }); }

const sentAt = [];
export async function sendInvite(to, code, myName) {
  const now = Date.now(); while (sentAt.length && now - sentAt[0] > 10e3) sentAt.shift();
  if (sentAt.length >= 3) throw new Error("تمهّل قليلاً قبل إرسال دعوة أخرى");     // حد أقصى 3 دعوات كل 10 ثوانٍ (بلا مؤقت ظاهر)
  sentAt.push(now);
  const me = await identity();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await set(R(`invites/${to}/${id}`), { from: me.pid, n: myName || "لاعب", code, t: serverTimestamp() });
}
export async function dismissInvite(id) { const me = await identity(); await remove(R(`invites/${me.pid}/${id}`)).catch(() => {}); }

// مراقبة واحدة لكل شيء: cb({ friends: {pid:{name,online}}, requests: {pid:{n}}, invites: [{id,from,n,code,t}] })
export async function watchSocial(cb) {
  const me = await identity(); if (!me.ok) return () => {};
  const subs = [], per = new Map(); let fr = {}, rq = {}, inv = [];
  const names = {}, online = {};
  const push = () => cb({ me: me.pid, friends: Object.fromEntries(Object.keys(fr).map(p => [p, { name: names[p] || "…", online: !!online[p] }])), requests: rq, invites: inv });
  subs.push(onValue(R(`requests/${me.pid}`), s => { rq = s.val() || {}; push(); }, () => {}));
  subs.push(onValue(R(`invites/${me.pid}`), s => { inv = Object.entries(s.val() || {}).map(([id, v]) => ({ id, ...v })); push(); }, () => {}));
  subs.push(onValue(R(`friends/${me.pid}`), s => {
    fr = s.val() || {};
    for (const p of Object.keys(fr)) if (!per.has(p)) {
      per.set(p, [
        onValue(R(`profiles/${p}/name`), x => { names[p] = x.val() || "لاعب"; push(); }, () => {}),
        onValue(R(`presence/${p}/on`), x => { online[p] = x.val() === true; push(); }, () => {})
      ]);
    }
    for (const [p, u] of [...per]) if (!(p in fr)) { u.forEach(f => f()); per.delete(p); }
    push();
  }, () => {}));
  return () => { subs.forEach(f => f()); per.forEach(u => u.forEach(f => f())); };
}
