import React, { useCallback, useEffect, useState } from 'react';
import { api, errorAr } from './api';

// The academic supervisor books a field visit from their portal; the training provider approves or declines here.
const STATUS = {
  PENDING: { label: 'بانتظار ردك', cls: 'badge pending' },
  APPROVED: { label: 'تمت الموافقة', cls: 'badge' },
  DECLINED: { label: 'تم الاعتذار', cls: 'badge danger' },
  CANCELLED: { label: 'ألغاها المشرف', cls: 'badge danger' },
};

const when = (d) =>
  new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(d));

export default function Visits() {
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState('');
  const [replies, setReplies] = useState({}); // optional reply text per visit
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setVisits((await api.visits()).items);
    } catch (err) {
      setError(errorAr(err));
      setVisits([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (v, decision) => {
    setBusy(v.id);
    try {
      await api.respondVisit(v.id, decision, replies[v.id]);
      await load();
    } catch (err) {
      alert(errorAr(err));
    } finally {
      setBusy(null);
    }
  };

  const now = new Date();
  const pending = (visits || []).filter((v) => v.status === 'PENDING' && new Date(v.scheduledAt) > now);
  const others = (visits || []).filter((v) => !pending.includes(v));

  return (
    <div className="content-box" style={{ marginTop: 16 }}>
      <h2 className="section-title">زيارات المشرف الأكاديمي</h2>
      <p className="muted">يحجز المشرف الأكاديمي موعد الزيارة من بوابته، ويصلك الطلب هنا للموافقة أو الاعتذار.</p>
      {error && <p className="form-error">{error}</p>}
      {visits === null && <p className="muted">جاري التحميل...</p>}

      {visits && visits.length === 0 && <p className="muted">لا توجد طلبات زيارة حتى الآن.</p>}

      {pending.length > 0 && <h4 className="detail-title">طلبات بانتظار ردك ({pending.length})</h4>}
      {pending.map((v) => (
        <div className="seat-card" key={v.id}>
          <div className="seat-head">
            <h4>🗓️ {when(v.scheduledAt)}</h4>
            <span className={STATUS[v.status].cls}>{STATUS[v.status].label}</span>
          </div>
          <p style={{ margin: '6px 0' }}>
            <strong>المشرف الأكاديمي:</strong> {v.academicSupervisor.user.name}
            {v.academicSupervisor.user.phone && <> — 📞 <span dir="ltr">{v.academicSupervisor.user.phone}</span></>}
          </p>
          <p className="desc-text">{v.requestMessage}</p>
          <div className="form-group full">
            <label>ردّك (اختياري — يُرسل رد مهذب تلقائياً إذا تركته فارغاً)</label>
            <textarea
              rows="2"
              value={replies[v.id] || ''}
              onChange={(e) => setReplies({ ...replies, [v.id]: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="action-btn save" disabled={busy === v.id} onClick={() => respond(v, 'APPROVE')}>
              موافقة على الموعد
            </button>
            <button className="action-btn alert" disabled={busy === v.id} onClick={() => respond(v, 'DECLINE')}>
              اعتذار
            </button>
          </div>
        </div>
      ))}

      {others.length > 0 && (
        <>
          <h4 className="detail-title" style={{ marginTop: 20 }}>سجل الزيارات</h4>
          <table className="custom-table">
            <thead>
              <tr><th>الموعد</th><th>المشرف الأكاديمي</th><th>الحالة</th><th>تمت الزيارة</th><th>ملاحظات المشرف</th></tr>
            </thead>
            <tbody>
              {others.map((v) => (
                <tr key={v.id}>
                  <td>{when(v.scheduledAt)}</td>
                  <td>{v.academicSupervisor.user.name}</td>
                  <td>
                    <span className={(STATUS[v.status] || STATUS.PENDING).cls}>
                      {v.status === 'PENDING' ? 'انتهى الموعد دون رد' : STATUS[v.status].label}
                    </span>
                  </td>
                  <td>{v.isDone ? '✅' : '—'}</td>
                  <td>{v.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
