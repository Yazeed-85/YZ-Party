// لوحة تحكم الغرفة: كل لاعب (مرة واحدة بمعرّفه الثابت) بدوره ووقت انضمامه وإحصائياته، وسجل ألعاب الغرفة وسجلّي مع من لعبت.
import { db, ref, get } from "./firebase.js";
import { roomRef } from "./room.js";
import { identity, fmtPid } from "./identity.js";
import { GAMES } from "./games-registry.js";

const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const gname = id => { const g = GAMES.find(x => x.id === id); return g ? `${g.icon} ${g.name}` : id || "لعبة"; };
const hm = t => new Date(t).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? "الآن" : m < 60 ? `منذ ${m} د` : `منذ ${Math.floor(m / 60)} س`; };
const day = t => new Date(t).toLocaleDateString("ar", { day: "numeric", month: "short" });
const RES = { win: ["فوز", "ok"], lose: ["خسارة", "bad"], draw: ["تعادل", ""], "coop-win": ["فوز جماعي", "ok"], "coop-lose": ["خسارة جماعية", "bad"] };

export async function openRoomDash({ code, meta, players, scores, uid }) {
  const o = el("div", "ovl sheet"), c = el("div", "glass sheet-card"), hd = el("div", "fhead"), x = el("button", "sbtn", "✕");
  hd.append(el("h2", "", `لوحة الغرفة ${code}`), x); const body = el("div", "fbody"); body.append(el("div", "fnote", "جارٍ التحميل…")); c.append(hd, body); o.append(c); document.body.append(o);
  x.onclick = () => o.remove(); o.onclick = e => { if (e.target === o) o.remove(); };
  const me = await identity();
  const list = Object.entries(players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const [profs, log, mine] = await Promise.all([
    Promise.all(list.map(async ([, p]) => (p.pid ? (await get(ref(db, `profiles/${p.pid}`)).catch(() => null))?.val?.() : null))),
    get(roomRef(code, "party/log")).then(s => Object.values(s.val() || {}).sort((a, b) => b.t - a.t)).catch(() => []),
    me.ok ? get(ref(db, `history/${me.pid}`)).then(s => Object.values(s.val() || {}).sort((a, b) => b.t - a.t).slice(0, 12)).catch(() => []) : []
  ]);
  body.replaceChildren();
  const seen = new Set();                                   // لا يتكرر لاعب: المرجع هو المعرّف الثابت (أو الجلسة إن لم يتوفر)
  body.append(el("h3", "", `اللاعبون (${list.length}/${meta.maxPlayers})`));
  list.forEach(([id, p], i) => {
    const key = p.pid || id; if (seen.has(key)) return; seen.add(key);
    const pr = profs[i] || {}, st = pr.stats || {}, card = el("div", "pcard"), top = el("div", "ptop");
    top.append(el("i", "dot" + (p.connected === false ? " off" : "")), el("b", "", p.name + (id === uid ? " (أنت)" : "")), el("span", "crown", id === meta.host ? "المضيف" : "لاعب"));
    top.append(el("span", "pts", scores[id] || 0)); card.append(top);
    const kv = el("div", "pkv"), add = (k, v) => { const d = el("div"); d.append(el("small", "", k), el("span", "", v)); kv.append(d); };
    add("المعرّف", p.pid ? fmtPid(p.pid) : "—"); add("انضم", `${hm(p.joinedAt)} · ${ago(p.joinedAt)}`);
    add("ألعاب", st.games || 0); add("انتصارات", st.wins || 0);
    add("نسبة الفوز", st.games ? Math.round((st.wins || 0) / st.games * 100) + "%" : "—"); add("عضو منذ", pr.created ? day(pr.created) : "—");
    const al = Object.values(pr.aliases || {}).filter(n => n !== p.name); if (al.length) add("أسماء سابقة", al.slice(0, 3).join("، "));
    card.append(kv);
    const gs = Object.entries(st.g || {}).sort((a, b) => (b[1].p || 0) - (a[1].p || 0)).slice(0, 4);
    if (gs.length) { const g = el("div", "pgames"); gs.forEach(([k, v]) => g.append(el("span", "chip", `${gname(k)} ${v.w || 0}/${v.p || 0}`))); card.append(g); }
    body.append(card);
  });
  body.append(el("h3", "", `سجل ألعاب الغرفة (${log.length})`));
  if (!log.length) body.append(el("div", "fnote", "لم تُلعب أي لعبة في هذه الغرفة بعد."));
  log.forEach(l => { const r = el("div", "frrow"), t = el("div", "frt"); t.append(el("b", "", gname(l.g)), el("small", "", `${hm(l.t)} · ${l.o === "draw" ? "تعادل" : l.w?.length ? "الفائز: " + Object.values(l.w).join("، ") : l.o === "coop-win" ? "فوز جماعي" : l.o === "coop-lose" ? "خسارة جماعية" : ""}`)); r.append(t); body.append(r); });
  if (me.ok) {
    body.append(el("h3", "", "آخر ألعابي (مع من لعبت)"));
    if (!mine.length) body.append(el("div", "fnote", "لا سجل بعد."));
    mine.forEach(l => { const r = el("div", "frrow"), t = el("div", "frt"), [lb, cl] = RES[l.r] || [l.r, ""];
      t.append(el("b", "", gname(l.g)), el("small", "", `${day(l.t)} ${hm(l.t)} · مع ${Object.values(l.w || {}).map(w => w.n).join("، ") || "—"}`));
      r.append(t, el("span", "chip " + cl, lb)); body.append(r); });
  }
}
