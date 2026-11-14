import { useRef, useState, useEffect } from 'react';

const CRITERIA = [
  'الحضور والمواظبة في أوقات الدوام الرسمية',
  'القدرة على التطبيق العملي للمعارف والمهارات',
  'الطموح والرغبة في التعلم واكتساب خبرة جديدة',
  'الرغبة في التعاون والمشاركة في العمل',
  'حسن التعامل مع الزملاء والاهتمام بالمظهر والسلوك العام',
  'مدى الالتزام بلوائح وانظمة المنشأة',
  'مستوى الأداء والانتاجية',
  'القدرة على استعمال أدوات العمل والمحافظة عليها',
];
const MAX_ITEM = 5;
const MAX_TOTAL = CRITERIA.length * MAX_ITEM; // 40

const sum = (scores) => scores.reduce((a, s) => a + (Number(s) || 0), 0);
const toPercent = (scores) => Math.round((sum(scores) / MAX_TOTAL) * 100);

const emptyForm = () => ({
  semester: '',
  year: '',
  company: '',
  scores: CRITERIA.map(() => ''),
  notes: CRITERIA.map(() => ''),
  wantHire: '',
  noReason: '',
  supervisor: '',
  jobTitle: '',
  date: '',
  signature: '',
});

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    overflowY: 'auto', padding: '20px', zIndex: 1000,
  },
  sheet: {
    background: '#fff', borderRadius: 12, padding: 24, width: '100%',
    maxWidth: 900, direction: 'rtl', color: '#111',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 8, marginBottom: 16,
  },
  fieldBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    border: '1px solid #d1d5db', padding: '6px 10px', borderRadius: 4,
  },
  input: {
    flex: 1, minWidth: 0, border: 'none', outline: 'none',
    background: 'transparent', fontSize: 14, fontFamily: 'inherit',
  },
  th: { border: '1px solid #374151', padding: 8, color: '#92400e', textAlign: 'center' },
  td: { border: '1px solid #374151', padding: 8, fontSize: 14 },
  btn: {
    border: 'none', borderRadius: 8, padding: '10px 22px',
    fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },
};

/* ---------- التوقيع ---------- */
function SignaturePad({ value, onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  }, [value]);

  const pos = (e) => {
    const c = ref.current;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };
  const start = (e) => {
    drawing.current = true;
    const ctx = ref.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ref.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = ref.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f2937';
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current.toDataURL());
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={400}
        height={120}
        style={{
          width: '100%', maxWidth: 400, height: 100, touchAction: 'none',
          border: '1px dashed #9ca3af', borderRadius: 6, background: '#fff',
        }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div>
        <button
          type="button"
          onClick={() => onChange('')}
          style={{ background: 'none', border: 'none', color: '#6b7280', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
        >
          مسح التوقيع
        </button>
      </div>
    </div>
  );
}

/* ---------- نموذج التقييم ---------- */
function EvaluationForm({ student, initial, onSave, onClose }) {
  const [ev, setEv] = useState(initial || emptyForm());
  const set = (k, v) => setEv((p) => ({ ...p, [k]: v }));
  const setArr = (k, i, v) =>
    setEv((p) => ({ ...p, [k]: p[k].map((x, j) => (j === i ? v : x)) }));

  const setScore = (i, raw) => {
    if (raw === '') return setArr('scores', i, '');
    const n = Math.min(MAX_ITEM, Math.max(0, Number(raw)));
    setArr('scores', i, n);
  };

  const field = (label, key, type = 'text') => (
    <label style={S.fieldBox}>
      <span style={{ fontWeight: 'bold', fontSize: 14, whiteSpace: 'nowrap' }}>{label}</span>
      <input type={type} value={ev[key]} onChange={(e) => set(key, e.target.value)} style={S.input} />
    </label>
  );
  const fixed = (label, value) => (
    <div style={{ ...S.fieldBox, background: '#f9fafb' }}>
      <span style={{ fontWeight: 'bold', fontSize: 14, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 14 }}>{value}</span>
    </div>
  );

  const canSave =
    ev.scores.every((s) => s !== '') &&
    ev.wantHire &&
    (ev.wantHire === 'نعم' || ev.noReason.trim());

  return (
    <div style={S.overlay}>
      <div style={S.sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>نموذج (٢)</div>
            <h2 style={{ margin: 0, fontSize: 20 }}>نموذج تقييم المتدرب من جهة التدريب</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 26, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <div style={S.grid}>
          {field('الفصل الدراسي:', 'semester')}
          {field('العام الجامعي:', 'year')}
          {field('جهة التدريب:', 'company')}
          {fixed('المتدرب:', student.name)}
          {fixed('الرقم الجامعي:', student.universityId)}
          {fixed('التخصص:', student.major)}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: 'right' }}>المادة</th>
                <th style={{ ...S.th, width: 70 }}>الدرجة</th>
                <th style={{ ...S.th, width: 120 }}>الدرجة المستحقة</th>
                <th style={{ ...S.th, width: 200 }}>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((c, i) => (
                <tr key={c}>
                  <td style={S.td}>{c}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{MAX_ITEM}</td>
                  <td style={S.td}>
                    <input
                      type="number" min="0" max={MAX_ITEM}
                      value={ev.scores[i]}
                      onChange={(e) => setScore(i, e.target.value)}
                      style={{ ...S.input, width: '100%', textAlign: 'center' }}
                    />
                  </td>
                  <td style={S.td}>
                    <input
                      value={ev.notes[i]}
                      onChange={(e) => setArr('notes', i, e.target.value)}
                      style={{ ...S.input, width: '100%' }}
                    />
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 'bold', background: '#f9fafb' }}>
                <td style={S.td}>المجموع</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{MAX_TOTAL}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{sum(ev.scores)}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{toPercent(ev.scores)} / 100</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ border: '1px dashed #6b7280', borderRadius: 8, padding: 16, marginTop: 20 }}>
          <div style={{ fontWeight: 'bold', color: '#92400e', marginBottom: 8 }}>
            هل ترغبون بتوظيف المتدرب بعد تخرجه؟
          </div>
          <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
            {['نعم', 'لا'].map((opt) => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio" name="wantHire"
                  checked={ev.wantHire === opt}
                  onChange={() => set('wantHire', opt)}
                />
                {opt}
              </label>
            ))}
          </div>

          {ev.wantHire === 'لا' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 'bold', color: '#92400e', marginBottom: 4 }}>
                إذا كانت الإجابة (لا) الرجاء ذكر الأسباب:
              </div>
              <textarea
                rows={3}
                value={ev.noReason}
                onChange={(e) => set('noReason', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, padding: 8, fontFamily: 'inherit' }}
              />
            </div>
          )}

          <div style={S.grid}>
            {field('المشرف على التدريب:', 'supervisor')}
            {field('المسمى الوظيفي:', 'jobTitle')}
            {field('التاريخ:', 'date', 'date')}
          </div>

          <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>التوقيع:</div>
          <SignaturePad value={ev.signature} onChange={(v) => set('signature', v)} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button
            disabled={!canSave}
            onClick={() => onSave(ev)}
            style={{ ...S.btn, background: '#047857', color: '#fff', opacity: canSave ? 1 : 0.4 }}
          >
            حفظ التقييم
          </button>
          <button onClick={onClose} style={{ ...S.btn, background: '#fff', border: '1px solid #d1d5db' }}>
            إلغاء
          </button>
        </div>
        {!canSave && (
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            للحفظ: عبّي كل الدرجات، وحدد خيار التوظيف (وإذا كانت الإجابة لا اذكر السبب).
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- الجدول (نفس تصميمك القديم) ---------- */
export default function EvaluationSection({ students, setStudents }) {
  const [forms, setForms] = useState({}); // التقييمات المحفوظة لكل متدربة
  const [open, setOpen] = useState(null); // المتدربة المفتوح نموذجها

  const updateGrade = (id, value) =>
    setStudents(students.map((s) => (s.id === id ? { ...s, finalGrade: Number(value) } : s)));

  const save = (student, ev) => {
    setForms({ ...forms, [student.id]: ev });
    updateGrade(student.id, toPercent(ev.scores));
    setOpen(null);
    alert('تم حفظ التقييم');
  };

  return (
    <div className="content-box">
      <h2>بنود التقييم واكمال الدرجات (من 100 درجة)</h2>
      <table className="custom-table">
        <thead>
          <tr>
            <th>(اضغط للعرض) اسم المتدربة</th>
            <th>التخصص</th>
            <th>التقييم الشامل (من 100)</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td>
                <button className="student-link" onClick={() => setOpen(student)}>
                  {student.name} 🔍
                </button>
              </td>
              <td>{student.major}</td>
              <td>
                <input
                  type="number"
                  className="small-input"
                  value={student.finalGrade}
                  onChange={(e) => updateGrade(student.id, e.target.value)}
                />
              </td>
              <td>
                <button className="action-btn save" onClick={() => alert('تم الحفظ بنجاح')}>حفظ</button>
                <button className="action-btn alert" onClick={() => alert('تم إرسال تنبيه')}>شكوى</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {open && (
        <EvaluationForm
          key={open.id}
          student={open}
          initial={forms[open.id]}
          onSave={(ev) => save(open, ev)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}