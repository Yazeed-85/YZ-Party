// قائمة الألعاب. لإضافة لعبة: ضع مجلدها في games/ وأضف سطراً هنا وغيّر ready إلى true
// min/max = عدد اللاعبين المسموح. المسار: games/{id}/index.html
export const GAMES = [
  { id: "connect4",    name: "أربعة في صف",   icon: "🔴", desc: "اجمع أربع قطع متتالية",       min: 2, max: 2, ready: true },
  { id: "reversi",     name: "ريفيرسي",       icon: "⚫", desc: "اقلب قطع خصمك واملك اللوح",   min: 2, max: 2, ready: true },
  { id: "dots-boxes",  name: "نقاط ومربعات",  icon: "🔲", desc: "أغلق المربعات قبل خصمك",      min: 2, max: 2, ready: true },
  { id: "my-balance",  name: "كم رصيدي؟",     icon: "💰", desc: "خمّن رصيد خصمك بنعم ولا",     min: 2, max: 2, ready: true },
  { id: "shared-word", name: "الكلمة المشتركة", icon: "🧠", desc: "فكّرا بنفس الكلمة",          min: 2, max: 2, ready: true },
  { id: "reverse-echo", name: "التحدي العكسي",  icon: "🔁", desc: "قلّد الجملة وهي مقلوبة",     min: 2, max: 2, ready: true },
  { id: "hot-cold",     name: "حار بارد",  icon: "🔥", desc: "خمّن كلمتك السرية بمساعدة خصمك",     min: 2, max: 2, ready: true },
  { id: "xo",     name: "X & O",  icon: "⚔️", desc: "",     min: 2, max: 2, ready: true },
  { id: "truth-lie",    name: "صادق أم كاذب",  icon: "📦", desc: "اكشف من يكذب في الصندوق",    min: 2, max: 2, ready: true }
];
