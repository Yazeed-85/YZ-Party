// محرك القناة الصوتية (WebRTC نظير لنظير) بلا واجهة. الإشارات (offer/answer/ice) تمر عبر Firebase:
//   rooms/{code}/comms/voice/{uid} = { s: معرّف الجلسة, n: الاسم, m: 1 إن كان مكتوماً, t }   ← من هو داخل القناة الآن
//   rooms/{code}/comms/sig/{إلى}/{push} = { f: من, s: جلسته, r: جلسة المستلم, k: offer|answer|ice|retry, g: رقم المحاولة, d: بيانات }
// القاعدة: صاحب الـ uid الأكبر هو من يبدأ العرض دائماً، فلا يحدث تعارض عرضين في آنٍ واحد (glare).
// كل صفحة (الردهة أو لعبة) تعيد الانضمام تلقائياً بجلسة جديدة، وغياب الطرف أقل من 4 ثوانٍ لا يهدم اتصاله.
import { set, update, remove, onValue, onChildAdded, push, onDisconnect, serverTimestamp } from "./firebase.js";
import { roomRef } from "./room.js";

// خوادم STUN عامة تكفي لأغلب الشبكات. للشبكات المقيِّدة (بعض شبكات الجوال والشركات) يلزم خادم TURN:
// أضف هنا مثلاً { urls: "turn:YOUR_HOST:443?transport=tcp", username: "…", credential: "…" } (مزوّدون بخطة مجانية: Metered وCloudflare Calls)
export const ICE_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" }
  ],
  iceCandidatePoolSize: 2
};

const rid = () => Math.random().toString(36).slice(2, 10);
const GRACE_MS = 4000, TRY_MS = 14000, MAX_TRIES = 4;
export const micError = e => {                                  // أخطاء المايك بلغة اللاعب
  const n = e?.name || e?.message;
  if (n === "unsupported") return "متصفحك لا يدعم المحادثة الصوتية";
  if (n === "NotAllowedError" || n === "SecurityError") return "اسمح باستخدام المايك من إعدادات المتصفح ثم أعد المحاولة";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "لم أجد مايكاً في جهازك";
  if (n === "NotReadableError" || n === "AbortError") return "المايك مشغول بتطبيق آخر";
  return "تعذّر تشغيل المايك";
};

class Peer {
  constructor(eng, uid, sid) {
    Object.assign(this, { e: eng, uid, sid, g: 0, pc: null, q: [], tries: 0, state: "connecting", audio: null, timer: null, chain: Promise.resolve(), dead: false });
    this.initiator = eng.uid > uid;
  }
  _emit(st) { if (this.state !== st) { this.state = st; this.e.ev.peer?.(this.uid, st); } }
  _mk() {
    const e = this.e, pc = new RTCPeerConnection(ICE_CONFIG); this.pc = pc; this.q = [];
    if (e.track) pc.addTrack(e.track, e.stream);
    pc.onicecandidate = ev => { if (ev.candidate && this.pc === pc) this._send("ice", JSON.stringify(ev.candidate.toJSON())); };
    pc.ontrack = ev => this._attach(ev.streams[0] || new MediaStream([ev.track]));
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || this.dead) return;
      const s = pc.connectionState;
      if (s === "connected") { clearTimeout(this.timer); this.tries = 0; this._emit("connected"); }
      else if (s === "failed") this._fail();
      else if (s === "disconnected") setTimeout(() => { if (this.pc === pc && !this.dead && pc.connectionState !== "connected") this._fail(); }, 5000);
    };
    return pc;
  }
  _send(k, d) {
    const e = this.e;
    push(roomRef(e.code, `comms/sig/${this.uid}`), { f: e.uid, s: e.sid, r: this.sid, k, g: this.g, d: d || "", t: Date.now() }).catch(x => e.ev.error?.(x));
  }
  _arm() { clearTimeout(this.timer); this.timer = setTimeout(() => { if (!this.dead && this.state !== "connected") this._fail(); }, TRY_MS); }
  _fail() {
    if (this.dead) return;
    if (this.initiator) { if (++this.tries > MAX_TRIES) { this._emit("failed"); return; } this.start(); }
    else { this._emit("connecting"); this._send("retry"); this._arm(); }
  }
  // الطرف الذي يبدأ: ينشئ اتصالاً جديداً ويرسل عرضاً (رقم المحاولة يزيد في كل مرة)
  async start() {
    if (this.dead) return;
    this._drop(); this.g++; this.startedAt = Date.now(); this._emit("connecting");
    const pc = this._mk(); this._arm();
    try {
      const off = await pc.createOffer(); if (this.pc !== pc) return;
      await pc.setLocalDescription(off); this._send("offer", JSON.stringify(pc.localDescription));
    } catch (x) { console.warn("offer", x); }
  }
  expectOffer() { this._arm(); }
  handle(m) { this.chain = this.chain.then(() => this._handle(m)).catch(x => console.warn("sig", x)); }
  async _flush() { const q = this.q; this.q = []; for (const c of q) await this.pc.addIceCandidate(c).catch(() => {}); }
  async _handle(m) {
    if (this.dead) return;
    if (m.k === "offer") {
      if (this.initiator || m.g < this.g) return;
      if (m.g > this.g || !this.pc) { this._drop(); this.g = m.g; this._mk(); }
      else if (this.pc.remoteDescription) return;                  // عرض مكرر
      const pc = this.pc;
      await pc.setRemoteDescription(JSON.parse(m.d)); await this._flush();
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
      this._send("answer", JSON.stringify(pc.localDescription)); this._arm();
    } else if (m.k === "answer") {
      if (!this.initiator || m.g !== this.g || !this.pc || this.pc.signalingState !== "have-local-offer") return;
      await this.pc.setRemoteDescription(JSON.parse(m.d)); await this._flush();
    } else if (m.k === "ice") {
      if (m.g !== this.g || !this.pc) return;
      const c = JSON.parse(m.d);
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(c).catch(() => {}); else this.q.push(c);
    } else if (m.k === "retry") {
      if (this.initiator && Date.now() - (this.startedAt || 0) > 3000 && this.tries <= MAX_TRIES) { this.tries++; this.start(); }   // الطرف الآخر لم ينجح: نعيد المحاولة (بلا تكرار أسرع من 3 ثوانٍ)
    }
  }
  _attach(stream) {
    if (!this.audio) {
      const a = document.createElement("audio"); a.autoplay = true; a.setAttribute("playsinline", ""); a.muted = this.e.muted4.has(this.uid);
      this.e.box.append(a); this.audio = a;
    }
    this.audio.srcObject = stream;
    const go = () => this.audio?.play().catch(() => this.e.blocked());
    go(); this.e.analyse(this.uid, stream);
  }
  _drop() {                                                      // نغلق الاتصال فقط ونُبقي الصوت ليستأنف على نفس العنصر
    const pc = this.pc; this.pc = null; this.q = [];
    if (pc) { pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = null; try { pc.close(); } catch { /* مغلق */ } }
  }
  close() {
    this.dead = true; clearTimeout(this.timer); this._drop();
    if (this.audio) { this.audio.srcObject = null; this.audio.remove(); this.audio = null; }
    this.e.unanalyse(this.uid);
  }
}

export class VoiceEngine {
  // ev = { members(map), joined(bool), muted(bool), peer(uid, state), level(uid, v, speaking), error(e), blocked(), ended() }
  constructor(code, uid, getName, ev) {
    Object.assign(this, { code, uid, getName, ev, on: false, joining: false, sid: null, stream: null, track: null, muted: false, members: {}, peers: new Map(), gone: new Map(), pending: [], muted4: new Set(), an: new Map(), ac: null, subs: [], tick: null, heal: null });
    this.box = document.createElement("div"); this.box.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none"; document.body.append(this.box);
    this.vref = roomRef(code, `comms/voice/${uid}`); this.sref = roomRef(code, `comms/sig/${uid}`);
    // نراقب من في القناة دائماً (حتى قبل الانضمام) ليراهم اللاعب في القائمة
    this.subs.push(onValue(roomRef(code, "comms/voice"), s => {
      const v = s.val() || {}, m = {};
      for (const [u, r] of Object.entries(v)) if (r && typeof r.s === "string") m[u] = { s: r.s, n: r.n || "", m: r.m ? 1 : 0 };
      this.members = m;
      if (this.on && !m[this.uid]) this._publish();                // سجلنا مُسح (onDisconnect قادم من صفحة سابقة): نعيده فوراً
      this._sync(); this.ev.members?.(this.visible());
    }, () => {}));
  }
  // الأعضاء كما تعرضهم الواجهة: أنا لا أظهر إلا إن كنت منضماً فعلاً
  visible() { const m = { ...this.members }; if (!this.on) delete m[this.uid]; else m[this.uid] = { ...(m[this.uid] || {}), s: this.sid, n: this.getName(), m: this.muted ? 1 : 0 }; return m; }
  micTrack() { return this.track && this.track.readyState === "live" ? this.track : null; }
  blocked() {                                                    // المتصفح منع التشغيل التلقائي: أول لمسة تالية تشغّله
    if (this._blk) return; this._blk = true; this.ev.blocked?.();
    const go = () => { this._blk = false; this.ac?.resume?.().catch(() => {}); this.peers.forEach(p => p.audio?.play().catch(() => {})); };
    addEventListener("pointerdown", go, { once: true, capture: true });
  }

  async join({ muted = false } = {}) {
    if (this.on || this.joining) return; this.joining = true;
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw { name: "unsupported" };
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) { this.joining = false; throw e; }
    this.stream = stream; this.track = stream.getAudioTracks()[0]; this.muted = !!muted; this.track.enabled = !muted;
    this.track.onended = () => { if (this.on) { this.leave(); this.ev.ended?.(); } };
    this.sid = rid(); this.on = true; this.joining = false;
    try { this.ac ??= new (window.AudioContext || window.webkitAudioContext)(); this.ac.resume?.().catch(() => {}); } catch { /* بلا مؤشر صوت */ }
    addEventListener("pointerdown", () => this.ac?.resume?.().catch(() => {}), { once: true, capture: true });
    try { await remove(this.sref).catch(() => {}); await this._publish(true); }
    catch (e) { this.on = false; this.stream.getTracks().forEach(t => t.stop()); this.stream = this.track = null; throw e; }   // القواعد ترفض: لا نترك المايك مفتوحاً
    onDisconnect(this.vref).remove(); onDisconnect(this.sref).remove();
    this.sigOff = onChildAdded(this.sref, s => this._onSig(s), () => {});
    this.heal = setInterval(() => this._publish(), 8000);
    this._vis = () => { if (!document.hidden) this._publish(); }; document.addEventListener("visibilitychange", this._vis); addEventListener("online", this._vis);
    this.analyse(this.uid, stream);
    this.ev.joined?.(true); this.ev.muted?.(this.muted); this._sync(); this.ev.members?.(this.visible());
  }
  _publish(first) {
    return set(this.vref, { s: this.sid, n: this.getName(), m: this.muted ? 1 : 0, t: serverTimestamp() }).catch(e => { if (first) throw e; this.ev.error?.(e); });
  }
  setMuted(m, quiet) {
    if (!this.on) return; this.muted = !!m; this.track.enabled = !m;
    update(this.vref, { m: m ? 1 : 0 }).catch(() => {});
    if (!quiet) this.ev.muted?.(this.muted);
  }
  setPeerMuted(uid, m) {                                         // كتم شخص عندي أنا فقط
    m ? this.muted4.add(uid) : this.muted4.delete(uid);
    const p = this.peers.get(uid); if (p?.audio) p.audio.muted = m;
  }
  async leave() {
    if (!this.on) return; this.on = false;
    clearInterval(this.heal); clearInterval(this.tick); this.tick = null; this.sigOff?.(); this.sigOff = null;
    document.removeEventListener("visibilitychange", this._vis); removeEventListener("online", this._vis);
    this.gone.forEach(clearTimeout); this.gone.clear(); this.peers.forEach(p => p.close()); this.peers.clear(); this.pending = [];
    this.an.forEach(a => { try { a.src.disconnect(); } catch { /* مفصول */ } }); this.an.clear();
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = this.track = null;
    this.ev.joined?.(false); this.ev.members?.(this.visible());
    onDisconnect(this.vref).cancel().catch(() => {}); onDisconnect(this.sref).cancel().catch(() => {});
    await remove(this.vref).catch(() => {}); await remove(this.sref).catch(() => {});
  }
  async destroy() { await this.leave(); this.subs.forEach(u => u()); this.subs = []; this.box.remove(); try { this.ac?.close(); } catch { /* مغلق */ } }

  // ---- مزامنة الأقران مع قائمة من في القناة ----
  _sync() {
    if (!this.on) return;
    for (const [uid, r] of Object.entries(this.members)) {
      if (uid === this.uid) continue;
      clearTimeout(this.gone.get(uid)); this.gone.delete(uid);
      let p = this.peers.get(uid);
      if (p && p.sid !== r.s) { p.close(); this.peers.delete(uid); p = null; }     // أعاد الانضمام بجلسة جديدة (انتقل لصفحة أخرى)
      if (!p) { p = new Peer(this, uid, r.s); this.peers.set(uid, p); this.ev.peer?.(uid, "connecting"); p.initiator ? p.start() : p.expectOffer(); }
    }
    for (const uid of [...this.peers.keys()]) {
      if (this.members[uid] || this.gone.has(uid)) continue;
      this.gone.set(uid, setTimeout(() => {                         // مهلة قبل الهدم: قد يكون في منتصف انتقال بين صفحتين
        this.gone.delete(uid);
        if (!this.members[uid]) { this.peers.get(uid)?.close(); this.peers.delete(uid); this.ev.peer?.(uid, null); }
      }, GRACE_MS));
    }
    const q = this.pending; this.pending = []; q.forEach(m => this._route(m));
  }
  _onSig(snap) {
    const m = snap.val(); remove(snap.ref).catch(() => {});
    if (!m || !this.on || (m.r && m.r !== this.sid)) return;       // موجّهة لجلسة قديمة مني
    this._route({ ...m, at: Date.now() });
  }
  _route(m) {
    const r = this.members[m.f];
    if (!r || r.s !== m.s) { if (Date.now() - m.at < 8000) this.pending.push(m); return; }   // لم تصلنا جلسته بعد
    this.peers.get(m.f)?.handle(m);
  }

  // ---- مستوى الصوت: من يتكلم الآن ----
  analyse(uid, stream) {
    this.unanalyse(uid);
    if (!this.ac) return;
    try {
      const src = this.ac.createMediaStreamSource(stream), an = this.ac.createAnalyser(); an.fftSize = 512; src.connect(an);
      this.an.set(uid, { src, an, buf: new Uint8Array(an.fftSize), speaking: false, last: 0 });
    } catch { /* بلا مؤشر لهذا الطرف */ }
    this._loop();
  }
  unanalyse(uid) {
    const a = this.an.get(uid); if (!a) return;
    try { a.src.disconnect(); } catch { /* مفصول */ }
    this.an.delete(uid); this.ev.level?.(uid, 0, false);
  }
  _loop() {
    if (this.tick) return;
    this.tick = setInterval(() => {
      if (document.hidden) return;                               // تبويب مخفي: لا قياس ولا رسم
      const now = performance.now();
      for (const [uid, a] of this.an) {
        a.an.getByteTimeDomainData(a.buf);
        let s = 0; for (let i = 0; i < a.buf.length; i++) { const v = (a.buf[i] - 128) / 128; s += v * v; }
        const rms = Math.sqrt(s / a.buf.length), lvl = Math.min(1, rms * 5);
        if (rms > 0.02) a.last = now;
        const sp = now - a.last < 260;
        this.ev.level?.(uid, sp ? lvl : 0, sp);
        a.speaking = sp;
      }
    }, 70);
  }
}
