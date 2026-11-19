import { useRef, useState, useEffect } from 'react';
import { api, errorAr, dmy } from './api';

// نموذج (2) تقييم المتدرب من جهة التدريب — `key` is what the backend expects (same order as the paper form)
const CRITERIA = [
  { key: 'attendance', label: 'الحضور والمواظبة في أوقات الدوام الرسمية' },
  { key: 'practical_application', label: 'القدرة على التطبيق العملي للمعارف والمهارات' },
  { key: 'ambition', label: 'الطموح والرغبة في التعلم واكتساب خبرة جديدة' },
  { key: 'cooperation', label: 'الرغبة في التعاون والمشاركة في العمل' },
  { key: 'conduct', label: 'حسن التعامل مع الزملاء والاهتمام بالمظهر والسلوك العام' },
  { key: 'regulations', label: 'مدى الالتزام بلوائح وانظمة المنشأة' },
  { key: 'performance', label: 'مستوى الأداء والانتاجية' },
  { key: 'tools', label: 'القدرة على استعمال أدوات العمل والمحافظة عليها' },
];
const MAX_ITEM = 5;
const MAX_TOTAL = CRITERIA.length * MAX_ITEM; // 40

const SATISFACTION = ['غير راضٍ إطلاقاً', 'غير راضٍ', 'محايد', 'راضٍ', 'راضٍ جداً']; // 1..5

const sum = (scores) => scores.reduce((a, s) => a + (Number(s) || 0), 0);
const toPercent = (scores) => Math.round((sum(scores) / MAX_TOTAL) * 100);

const emptyForm = () => ({
  scores: CRITERIA.map(() => ''),
  notes: CRITERIA.map(() => ''),
  wantHire: '',
  noReason: '',
  jobTitle: '',
  satisfaction: '',
  signature: '',
});

// saved evaluation from the backend -> the form's shape (read-only view)
const fromBackend = (ev) => ({
  scores: CRITERIA.map((c) => ev.scores[c.key]?.score ?? ''),
  notes: CRITERIA.map((c) => ev.scores[c.key]?.notes ?? ''),
  wantHire: ev.wantHire ?? (ev.wouldHire ? 'نعم' : 'لا'),
  noReason: ev.noHireReason || '',
  jobTitle: ev.evaluator?.jobTitle || '',
  satisfaction: ev.satisfaction || '',
  signature: ev.signature || '',
  evaluatorName: ev.evaluator?.name,
  date: dmy(ev.evaluatedAt),
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
function SignaturePad({ value, onChange, readOnly }) {
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
    if (readOnly) return;
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
    onChange(ref.current.toDataURL('image/png'));
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
      {!readOnly && (
        <div>
          <button
            type="button"
            onClick={() => onChange('')}
            style={{ background: 'none', border: 'none', color: '#6b7280', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
          >
            مسح التوقيع
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- نموذج التقييم ---------- */
function EvaluationForm({ trainee, evaluatorName, initial, readOnly, onSave, onClose }) {
  const [ev, setEv] = useState(initial || emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setEv((p) => ({ ...p, [k]: v }));
  const setArr = (k, i, v) =>
    setEv((p) => ({ ...p, [k]: p[k].map((x, j) => (j === i ? v : x)) }));

  const setScore = (i, raw) => {
    if (raw === '') return setArr('scores', i, '');
    const n = Math.min(MAX_ITEM, Math.max(0, Number(raw)));
    setArr('scores', i, n);
  };

  const field = (label, key) => (
    <label style={S.fieldBox}>
      <span style={{ fontWeight: 'bold', fontSize: 14, whiteSpace: 'nowrap' }}>{label}</span>
      <input value={ev[key]} disabled={readOnly} onChange={(e) => set(key, e.target.value)} style={S.input} />
    </label>
  );
  const fixed = (label, value) => (
    <div style={{ ...S.fieldBox, background: '#f9fafb' }}>
      <span style={{ fontWeight: 'bold', fontSize: 14, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 14 }}>{value || '—'}</span>
    </div>
  );

  const canSave =
    ev.scores.every((s) => s !== '') &&
    ev.wantHire &&
    (ev.wantHire === 'نعم' || ev.noReason.trim()) &&
    ev.satisfaction;

  const a = trainee.assignment;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(ev);
    } catch (err) {
      setError(errorAr(err));
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={S.sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>نموذج (٢)</div>
            <h2 style={{ margin: 0, fontSize: 20 }}>نموذج تقييم المتدرب من جهة التدريب</h2>
            {readOnly && <div style={{ fontSize: 13, color: '#047857', marginTop: 4 }}>تم إرسال هذا التقييم (للعرض فقط)</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 26, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>

        <div style={S.grid}>
          {fixed('الفصل الدراسي:', a.semester)}
          {fixed('العام الجامعي:', a.academicYear)}
          {fixed('جهة التدريب:', a.opportunity.organization.name)}
          {fixed('المتدرب:', a.student.user.name)}
          {fixed('الرقم الجامعي:', a.student.universityId)}
          {fixed('التخصص:', a.student.major)}
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
                <tr key={c.key}>
                  <td style={S.td}>{c.label}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{MAX_ITEM}</td>
                  <td style={S.td}>
                    <input
                      type="number" min="0" max={MAX_ITEM}
                      value={ev.scores[i]}
                      disabled={readOnly}
                      onChange={(e) => setScore(i, e.target.value)}
                      style={{ ...S.input, width: '100%', textAlign: 'center' }}
                    />
                  </td>
                  <td style={S.td}>
                    <input
                      value={ev.notes[i]}
                      disabled={readOnly}
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
                  disabled={readOnly}
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
                disabled={readOnly}
                onChange={(e) => set('noReason', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, padding: 8, fontFamily: 'inherit' }}
              />
            </div>
          )}

          {/* مؤشر "رضا جهات التدريب" */}
          <div style={{ fontWeight: 'bold', color: '#92400e', margin: '8px 0' }}>
            ما مدى رضا جهتكم عن برنامج التدريب التعاوني؟
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            {SATISFACTION.map((label, i) => (
              <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio" name="satisfaction"
                  checked={Number(ev.satisfaction) === i + 1}
                  disabled={readOnly}
                  onChange={() => set('satisfaction', i + 1)}
                />
                {label}
              </label>
            ))}
          </div>

          <div style={S.grid}>
            {fixed('المشرف على التدريب:', ev.evaluatorName || evaluatorName)}
            {field('المسمى الوظيفي:', 'jobTitle')}
            {fixed('التاريخ:', ev.date || dmy(new Date()))}
          </div>

          <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>التوقيع:</div>
          <SignaturePad value={ev.signature} readOnly={readOnly} onChange={(v) => set('signature', v)} />
        </div>

        {error && <p style={{ color: '#b91c1c', marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {!readOnly && (
            <button
              disabled={!canSave || saving}
              onClick={submit}
              style={{ ...S.btn, background: '#047857', color: '#fff', opacity: canSave && !saving ? 1 : 0.4 }}
            >
              {saving ? 'جاري الإرسال...' : 'إرسال التقييم'}
            </button>
          )}
          <button onClick={onClose} style={{ ...S.btn, background: '#fff', border: '1px solid #d1d5db' }}>
            {readOnly ? 'إغلاق' : 'إلغاء'}
          </button>
        </div>
        {!readOnly && !canSave && (
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            للإرسال: عبّي كل الدرجات، وحدد خيار التوظيف (وإذا كانت الإجابة لا اذكر السبب)، وحدد مدى الرضا.
          </p>
        )}
        {!readOnly && (
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            يُرسل التقييم مرة واحدة لكل متدرب ولا يمكن تعديله بعد الإرسال، ويصل للمشرف الأكاديمي (لا يراه الطالب).
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- جدول المتدربين ---------- */
export default function EvaluationSection({ trainees, evaluatorName, onSaved }) {
  const [open, setOpen] = useState(null); // { trainee, initial, readOnly }

  const openForm = async (t) => {
    if (!t.hasEvaluation) {
      setOpen({ trainee: t, initial: null, readOnly: false });
      return;
    }
    try {
      const ev = await api.evaluation(t.assignment.id);
      setOpen({ trainee: t, initial: fromBackend(ev), readOnly: true });
    } catch (err) {
      alert(errorAr(err));
    }
  };

  const save = async (t, ev) => {
    await api.submitEvaluation({
      assignmentId: t.assignment.id,
      scores: Object.fromEntries(
        CRITERIA.map((c, i) => [c.key, { score: Number(ev.scores[i]), ...(ev.notes[i].trim() && { notes: ev.notes[i].trim() }) }])
      ),
      wouldHire: ev.wantHire === 'نعم',
      ...(ev.wantHire === 'لا' && { noHireReason: ev.noReason.trim() }),
      satisfaction: Number(ev.satisfaction),
      ...(ev.jobTitle.trim() && { evaluatorTitle: ev.jobTitle.trim() }),
      ...(ev.signature && { signature: ev.signature }),
    });
    setOpen(null);
    alert('تم إرسال التقييم بنجاح');
    onSaved?.();
  };

  const evaluable = trainees.filter((t) => t.assignment.status !== 'CANCELLED');

  return (
    <div className="content-box">
      <h2>تقييم المتدربين — نموذج (٢)</h2>
      {evaluable.length === 0 ? (
        <p className="muted">لا يوجد متدربون في جهتك حالياً.</p>
      ) : (
        <table className="custom-table">
          <thead>
            <tr>
              <th>(اضغط للعرض) اسم المتدرب</th>
              <th>التخصص</th>
              <th>نسبة الحضور</th>
              <th>التقييم</th>
              <th>الدرجة النهائية (من الجامعة)</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {evaluable.map((t) => (
              <tr key={t.assignment.id}>
                <td>
                  <button className="student-link" onClick={() => openForm(t)}>
                    {t.assignment.student.user.name} 🔍
                  </button>
                </td>
                <td>{t.assignment.student.major || '—'}</td>
                <td>{t.attendanceRate == null ? '—' : `${t.attendanceRate}%`}</td>
                <td>{t.hasEvaluation ? '✅ تم التقييم' : 'لم يُقيَّم بعد'}</td>
                <td>{t.finalGrade == null ? '—' : `${t.finalGrade} / 100`}</td>
                <td>
                  <button className="action-btn save" onClick={() => openForm(t)}>
                    {t.hasEvaluation ? 'عرض التقييم' : 'تعبئة النموذج'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <EvaluationForm
          key={open.trainee.assignment.id}
          trainee={open.trainee}
          evaluatorName={evaluatorName}
          initial={open.initial}
          readOnly={open.readOnly}
          onSave={(ev) => save(open.trainee, ev)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
