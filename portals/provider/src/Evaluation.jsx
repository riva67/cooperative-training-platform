import { useRef, useState, useEffect } from "react";

const CRITERIA = [
  "الحضور والمواظبة في أوقات الدوام الرسمية",
  "القدرة على التطبيق العملي للمعارف والمهارات",
  "الطموح والرغبة في التعلم واكتساب خبرة جديدة",
  "الرغبة في التعاون والمشاركة في العمل",
  "حسن التعامل مع الزملاء والاهتمام بالمظهر والسلوك العام",
  "مدى الالتزام بلوائح وانظمة المنشأة",
  "مستوى الأداء والانتاجية",
  "القدرة على استعمال أدوات العمل والمحافظة عليها",
];
const MAX_PER_ITEM = 5;
const MAX_TOTAL = CRITERIA.length * MAX_PER_ITEM; // 40

const emptyEvaluation = () => ({
  id: Date.now(),
  semester: "",
  year: "",
  company: "",
  trainee: "",
  universityId: "",
  major: "",
  scores: CRITERIA.map(() => ""),
  notes: CRITERIA.map(() => ""),
  wantHire: "",
  noReason: "",
  supervisor: "",
  jobTitle: "",
  date: "",
  signature: "",
});

const sample = {
  ...emptyEvaluation(),
  id: 1,
  semester: "الأول",
  year: "1447",
  company: "شركة المثال",
  trainee: "متدرب تجريبي",
  universityId: "443000000",
  major: "تقنية المعلومات",
  scores: [5, 4, 5, 4, 5, 4, 4, 5],
  notes: CRITERIA.map(() => ""),
  wantHire: "نعم",
  supervisor: "المشرف التجريبي",
  jobTitle: "مدير التدريب",
  date: "2025-01-01",
};

const total = (ev) =>
  ev.scores.reduce((sum, s) => sum + (Number(s) || 0), 0);
const percent = (ev) => Math.round((total(ev) / MAX_TOTAL) * 100);

/* ---------- Signature pad ---------- */
function SignaturePad({ value, onChange, readOnly }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  }, [value]);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  const start = (e) => {
    if (readOnly) return;
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2937";
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL());
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="w-full h-24 border border-dashed border-gray-400 rounded bg-white"
        style={{ touchAction: "none" }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-sm text-gray-500 mt-1 underline"
        >
          مسح التوقيع
        </button>
      )}
    </div>
  );
}

/* ---------- The form (edit or view) ---------- */
function EvaluationForm({ initial, readOnly, onSave, onClose }) {
  const [ev, setEv] = useState(initial);
  const set = (k, v) => setEv((p) => ({ ...p, [k]: v }));
  const setArr = (k, i, v) =>
    setEv((p) => ({ ...p, [k]: p[k].map((x, j) => (j === i ? v : x)) }));

  const setScore = (i, raw) => {
    if (raw === "") return setArr("scores", i, "");
    const n = Math.min(MAX_PER_ITEM, Math.max(0, Number(raw)));
    setArr("scores", i, n);
  };

  const field = (label, key, type = "text") => (
    <label className="flex items-center gap-2 border border-gray-300 px-2 py-1">
      <span className="font-bold whitespace-nowrap text-sm">{label}</span>
      <input
        type={type}
        value={ev[key]}
        disabled={readOnly}
        onChange={(e) => set(key, e.target.value)}
        className="flex-1 min-w-0 bg-transparent outline-none text-sm"
      />
    </label>
  );

  const canSave =
    ev.trainee.trim() &&
    ev.scores.every((s) => s !== "") &&
    ev.wantHire &&
    (ev.wantHire === "نعم" || ev.noReason.trim());

  return (
    <div dir="rtl" className="bg-white rounded-lg shadow p-4 md:p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-sm text-gray-500">نموذج (٢)</p>
          <h2 className="text-xl font-bold text-gray-800">
            نموذج تقييم المتدرب من جهة التدريب
          </h2>
        </div>
        <button onClick={onClose} className="text-gray-500 text-2xl leading-none">
          ×
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-2 mb-5">
        {field("الفصل الدراسي:", "semester")}
        {field("العام الجامعي:", "year")}
        {field("جهة التدريب:", "company")}
        {field("المتدرب:", "trainee")}
        {field("الرقم الجامعي:", "universityId")}
        {field("التخصص:", "major")}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[560px]">
          <thead>
            <tr className="text-amber-800">
              <th className="border border-gray-700 p-2 text-right">المادة</th>
              <th className="border border-gray-700 p-2 w-16">الدرجة</th>
              <th className="border border-gray-700 p-2 w-28">الدرجة المستحقة</th>
              <th className="border border-gray-700 p-2 w-48">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {CRITERIA.map((c, i) => (
              <tr key={c}>
                <td className="border border-gray-700 p-2">{c}</td>
                <td className="border border-gray-700 p-2 text-center">
                  {MAX_PER_ITEM}
                </td>
                <td className="border border-gray-700 p-1">
                  <input
                    type="number"
                    min="0"
                    max={MAX_PER_ITEM}
                    value={ev.scores[i]}
                    disabled={readOnly}
                    onChange={(e) => setScore(i, e.target.value)}
                    className="w-full text-center bg-transparent outline-none"
                  />
                </td>
                <td className="border border-gray-700 p-1">
                  <input
                    value={ev.notes[i]}
                    disabled={readOnly}
                    onChange={(e) => setArr("notes", i, e.target.value)}
                    className="w-full bg-transparent outline-none"
                  />
                </td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <td className="border border-gray-700 p-2">المجموع</td>
              <td className="border border-gray-700 p-2 text-center">{MAX_TOTAL}</td>
              <td className="border border-gray-700 p-2 text-center">{total(ev)}</td>
              <td className="border border-gray-700 p-2 text-center">
                {percent(ev)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="border border-dashed border-gray-500 rounded p-4 mt-5">
        <p className="font-bold text-amber-800 mb-2">
          هل ترغبون بتوظيف المتدرب بعد تخرجه؟
        </p>
        <div className="flex gap-6 mb-3">
          {["نعم", "لا"].map((opt) => (
            <label key={opt} className="flex items-center gap-2">
              <input
                type="radio"
                name={`hire-${ev.id}`}
                checked={ev.wantHire === opt}
                disabled={readOnly}
                onChange={() => set("wantHire", opt)}
              />
              {opt}
            </label>
          ))}
        </div>

        {ev.wantHire === "لا" && (
          <div className="mb-3">
            <p className="font-bold text-amber-800 mb-1">
              إذا كانت الإجابة (لا) الرجاء ذكر الأسباب:
            </p>
            <textarea
              rows={3}
              value={ev.noReason}
              disabled={readOnly}
              onChange={(e) => set("noReason", e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm"
            />
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-2 mt-3">
          {field("المشرف على التدريب:", "supervisor")}
          {field("المسمى الوظيفي:", "jobTitle")}
          {field("التاريخ:", "date", "date")}
        </div>

        <div className="mt-3">
          <p className="font-bold text-sm mb-1">التوقيع:</p>
          <SignaturePad
            value={ev.signature}
            readOnly={readOnly}
            onChange={(v) => set("signature", v)}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        {!readOnly && (
          <button
            disabled={!canSave}
            onClick={() => onSave(ev)}
            className="bg-blue-600 text-white px-5 py-2 rounded disabled:opacity-40"
          >
            حفظ التقييم
          </button>
        )}
        <button onClick={onClose} className="border border-gray-300 px-5 py-2 rounded">
          {readOnly ? "إغلاق" : "إلغاء"}
        </button>
      </div>
      {!readOnly && !canSave && (
        <p className="text-xs text-gray-500 mt-2">
          للحفظ: اكتب اسم المتدرب، عبّي كل الدرجات، وحدد خيار التوظيف (وإذا كانت
          الإجابة لا اذكر السبب).
        </p>
      )}
    </div>
  );
}

/* ---------- Main page ---------- */
export default function Evaluation() {
  const [list, setList] = useState([sample]);
  const [view, setView] = useState(null); // { ev, readOnly }

  if (view) {
    return (
      <EvaluationForm
        key={view.ev.id}
        initial={view.ev}
        readOnly={view.readOnly}
        onClose={() => setView(null)}
        onSave={(ev) => {
          setList((prev) =>
            prev.some((x) => x.id === ev.id)
              ? prev.map((x) => (x.id === ev.id ? ev : x))
              : [ev, ...prev]
          );
          setView(null);
        }}
      />
    );
  }

  return (
    <div dir="rtl" className="bg-white rounded-lg shadow p-4 md:p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">تقييم المتدربين</h2>
        <button
          onClick={() => setView({ ev: emptyEvaluation(), readOnly: false })}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          إضافة تقييم
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-right">المتدرب</th>
              <th className="p-2 text-right">جهة التدريب</th>
              <th className="p-2 text-right">التاريخ</th>
              <th className="p-2 text-center">التقييم من 100</th>
              <th className="p-2 text-center">التوظيف</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  لا توجد تقييمات بعد. اضغط "إضافة تقييم" للبدء.
                </td>
              </tr>
            )}
            {list.map((ev) => (
              <tr key={ev.id} className="border-t">
                <td className="p-2">{ev.trainee}</td>
                <td className="p-2">{ev.company}</td>
                <td className="p-2">{ev.date}</td>
                <td className="p-2 text-center">
                  <button
                    onClick={() => setView({ ev, readOnly: true })}
                    title="اضغط لعرض تفاصيل التقييم"
                    className="font-bold text-blue-700 underline underline-offset-4"
                  >
                    {percent(ev)} / 100
                  </button>
                </td>
                <td className="p-2 text-center">{ev.wantHire}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}