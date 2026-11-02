// قائمة الألعاب. لإضافة لعبة: ضع مجلدها في games/ وأضف سطراً هنا وغيّر ready إلى true
// min/max = عدد اللاعبين المسموح. المسار: games/{id}/index.html
// voice = سياسة الصوت: free (حر دائماً) أو phase (اللعبة تغلق القناة في مراحل معيّنة عبر voiceGate من shared/voice-gate.js)
export const GAMES = [
  { id: "connect4", voice: "free",    name: "أربعة في صف",   icon: "🔴", desc: "اجمع أربع قطع متتالية",       min: 2, max: 2, ready: true },
  { id: "reversi", voice: "free",     name: "ريفيرسي",       icon: "⚫", desc: "اقلب قطع خصمك واملك اللوح",   min: 2, max: 2, ready: true },
  { id: "dots-boxes", voice: "free",  name: "نقاط ومربعات",  icon: "🔲", desc: "أغلق المربعات قبل خصمك",      min: 2, max: 2, ready: true },
  { id: "my-balance", voice: "phase",  name: "كم رصيدي؟",     icon: "💰", desc: "خمّن رصيد خصمك بنعم ولا",     min: 2, max: 2, ready: true },
  { id: "shared-word", voice: "phase", name: "الكلمة المشتركة", icon: "🧠", desc: "فكّرا بنفس الكلمة",          min: 2, max: 2, ready: true },
  { id: "reverse-echo", voice: "phase", name: "التحدي العكسي",  icon: "🔁", desc: "قلّد الجملة وهي مقلوبة",     min: 2, max: 2, ready: true },
  { id: "truth-lie", voice: "free",    name: "صادق أم كاذب",  icon: "📦", desc: "اكشف من يكذب في الصندوق",    min: 2, max: 4, ready: true },

  { id: "liars-bar", voice: "free",   name: "بار الكذّابين", icon: "🔫",     desc: "اكذب بذكاء أو مت بشرف",       min: 2, max: 4, ready: true },
  { id: "hot-cold", voice: "phase",    name: "حار بارد",  icon: "🔥",     desc: "خمّن كلمتك السرية بمساعدة خصمك",  min: 2, max: 2, ready: true },
  { id: "counter", voice: "free",    name: "العدّاد",       icon: "⏱️",     desc: "أوقف العدّاد المخفي قبل الهدف وإلا انفجر قلبك", min: 2, max: 2, ready: true },
  { id: "xo", voice: "free",          name: "X & O",  icon: "⚔️",      desc: "ثلاث قطع متتالية تحسم الجولة", min: 2, max: 2, ready: true },
  { id: "codenames", voice: "free",   name: "الكلمات المشفرة",  icon: "🕵️‍♂️",  desc: "فريقان: قائد يلمّح وعميل يخمّن (4 لاعبين)", min: 4, max: 4, ready: true }
];
