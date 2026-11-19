import React, { useCallback, useEffect, useState } from 'react';
import './App.css';
import Visits from './visits';
import EvaluationSection from './EvaluationSection';
import coverImg from './assets/COVER.jpeg';
import {
  api, errorAr, getToken, getSavedUser, saveSession, clearSession, consumeHashSession, MAIN_PORTAL_URL,
  ORG_TYPE_AR, OPP_TYPE_AR, OPP_STATUS_AR, APP_STATUS_AR, ymd, dmy,
} from './api';

const TABS = [
  { key: 'home', label: 'الرئيسية' },
  { key: 'opportunities', label: 'فرص التدريب', desc: 'أدر الفرص التي قدّمتها جهتك وتابع حالة التقديم عليها.' },
  { key: 'capacity', label: 'المقاعد التدريبية', desc: 'تابع المقاعد المتاحة والشاغرة في جهتك.' },
  { key: 'evaluation', label: 'تقييم المتدرب', desc: 'عبّئ نموذج تقييم المتدرب من جهة التدريب.' },
  { key: 'visits', label: 'زيارات المشرف', desc: 'رد على طلبات الزيارات الميدانية من المشرف الأكاديمي.' },
  { key: 'reports', label: 'التقارير', desc: 'أرسل تقارير الزيارات وإنذارات الغياب، وراجع تقارير المتدربين.' },
];

const emptyOppForm = {
  title: '', description: '', type: 'COOP', status: 'OPEN',
  startDate: '', endDate: '', deadline: '', seats: 1,
  location: '', target: '', requirements: '',
};

// البنود الإلزامية قبل النشر
const REQUIRED_FIELDS = {
  title: 'عنوان الفرصة',
  description: 'وصف الفرصة',
  startDate: 'تاريخ بداية التدريب',
  endDate: 'تاريخ نهاية التدريب',
  deadline: 'آخر موعد للتقديم',
  location: 'موقع التدريب',
  target: 'الفئة المستهدفة',
  requirements: 'متطلبات الفرصة',
};

// مدة التدريب تُحسب من التاريخين
function durationOf(start, end) {
  if (!start || !end) return '';
  const days = Math.round((new Date(end) - new Date(start)) / 864e5) + 1;
  if (days < 14) return `${days} يوم`;
  if (days < 60) return `${Math.round(days / 7)} أسابيع`;
  return `${Math.round(days / 30)} أشهر`;
}

// backend opportunity -> the shape the cards use
const toUi = (o) => ({
  id: o.id,
  icon: o.type === 'SUMMER' ? '☀️' : '💼',
  title: o.title,
  company: o.organization?.name,
  description: o.description,
  type: OPP_TYPE_AR[o.type] || o.type,
  typeCode: o.type,
  status: OPP_STATUS_AR[o.status],
  statusCode: o.status,
  startDate: ymd(o.startDate),
  endDate: ymd(o.endDate),
  deadline: o.deadline ? dmy(o.deadline) : 'غير محدد',
  deadlineIso: ymd(o.deadline),
  seats: o.seats,
  seatsTaken: o.seatsTaken,
  seatsAvailable: o.seatsAvailable,
  applicationsCount: o.applicationsCount,
  location: o.location || '—',
  duration: durationOf(o.startDate, o.endDate),
  target: o.target || '—',
  requirements: o.requirements || '',
});

const statusClass = (s) => (s === 'APPROVED' ? 'badge' : s === 'REJECTED' ? 'badge danger' : 'badge pending');

const REPORT_TYPE_AR = { WEEKLY: 'أسبوعي', FINAL: 'نهائي', APPROVAL: 'إفادة', ABSENCE_WARNING: 'إنذار غياب', VISIT: 'تقرير زيارة' };
const REPORT_STATUS_AR = { SUBMITTED: 'بانتظار المراجعة', APPROVED: 'معتمد', REJECTED: 'مرفوض', DRAFT: 'مسودة' };

export default function App() {
  const [token, setToken] = useState(() => {
    consumeHashSession();
    return getToken();
  });
  const [currentUser, setCurrentUser] = useState(() => {
    const u = getSavedUser();
    return { name: u?.name || '', entityType: ORG_TYPE_AR[u?.organization?.type] || '', orgName: u?.organization?.name || '' };
  });
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [oppFilter, setOppFilter] = useState('الكل');
  const [selectedOppId, setSelectedOppId] = useState(null);
  const [applicants, setApplicants] = useState(null);
  const [showOppForm, setShowOppForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [oppForm, setOppForm] = useState(emptyOppForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [seatDrafts, setSeatDrafts] = useState({});

  const [opportunities, setOpportunities] = useState([]);
  const [summary, setSummary] = useState({ seatsAvailable: 0, totalSeats: 0, seatsTaken: 0 });
  const [trainees, setTrainees] = useState([]);
  const [avgEvaluation, setAvgEvaluation] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [reports, setReports] = useState([]);
  const [reportData, setReportData] = useState({ assignmentId: '', reportType: '', title: '', details: '' });
  const [reportMsg, setReportMsg] = useState('');

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setCurrentUser({ name: '', entityType: '', orgName: '' });
  }, []);

  // expired session anywhere -> login screen
  useEffect(() => {
    window.addEventListener('session-expired', logout);
    return () => window.removeEventListener('session-expired', logout);
  }, [logout]);

  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      const [opps, sum, rows, evals] = await Promise.all([
        api.myOpportunities(), api.seatsSummary(), api.trainees(), api.evaluations(),
      ]);
      setOpportunities(opps.items.map(toUi));
      setSummary(sum);
      setTrainees(rows);
      const scores = evals.items.map((e) => (e.totalScore / e.maxScore) * 100);
      setAvgEvaluation(scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null);
    } catch (err) {
      setLoadError(errorAr(err));
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setReports((await api.reports()).items);
    } catch (err) {
      setReportMsg(errorAr(err));
    }
  }, []);

  // after login: organization info + all data
  useEffect(() => {
    if (!token) return;
    api.me()
      .then((me) => {
        const org = me.orgSupervisor?.organization;
        setCurrentUser({ name: me.name, entityType: ORG_TYPE_AR[org?.type] || '', orgName: org?.name || '' });
      })
      .catch(() => {});
    loadAll();
  }, [token, loadAll]);

  useEffect(() => {
    if (token && activeTab === 'reports') loadReports();
  }, [token, activeTab, loadReports]);

  // applicants of the opened opportunity (sorted by GPA)
  const loadApplicants = useCallback(async (oppId) => {
    setApplicants(null);
    try {
      setApplicants((await api.applicants(oppId)).items);
    } catch (err) {
      alert(errorAr(err));
      setApplicants([]);
    }
  }, []);
  useEffect(() => {
    if (selectedOppId) loadApplicants(selectedOppId);
  }, [selectedOppId, loadApplicants]);

  const selectedOpp = opportunities.find((o) => o.id === selectedOppId);
  const activeTrainees = trainees.filter((t) => t.assignment.status === 'ACTIVE');

  // ===== تسجيل الدخول =====
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const { token: t, user } = await api.login(loginForm.email.trim(), loginForm.password);
      if (user.role !== 'ORG_SUPERVISOR') {
        setLoginError('هذه البوابة مخصصة لجهات التدريب. استخدم البوابة الرئيسية للدخول إلى بوابتك.');
        return;
      }
      saveSession(t, user);
      setToken(t);
    } catch (err) {
      setLoginError(errorAr(err));
    } finally {
      setLoggingIn(false);
    }
  };

  // ===== حذف فرصة (أو إغلاقها إذا تقدّم عليها طلاب) =====
  const deleteOpp = async (o) => {
    if (o.applicationsCount > 0) {
      if (o.statusCode === 'CLOSED') {
        alert('تقدّم طلاب على هذه الفرصة فلا يمكن حذفها، والتقديم عليها مغلق بالفعل.');
        return;
      }
      if (window.confirm(`تقدّم طلاب على الفرصة "${o.title}" ولا يمكن حذفها.\nهل تريد إغلاق التقديم عليها بدلاً من ذلك؟`)) {
        try {
          await api.updateOpportunity(o.id, { status: 'CLOSED' });
          await loadAll();
        } catch (err) {
          alert(errorAr(err));
        }
      }
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف الفرصة "${o.title}"؟\nلا يمكن التراجع.`)) return;
    try {
      await api.deleteOpportunity(o.id);
      if (selectedOppId === o.id) setSelectedOppId(null);
      await loadAll();
    } catch (err) {
      alert(errorAr(err));
    }
  };

  // ===== قبول / رفض المرشحين =====
  const decide = async (app, status) => {
    const word = status === 'APPROVED' ? 'قبول' : 'رفض';
    if (!window.confirm(`تأكيد ${word} الطالب ${app.student.user.name}؟ لا يمكن تغيير القرار بعد ذلك.`)) return;
    try {
      await api.decideApplication(app.id, status);
      await Promise.all([loadApplicants(selectedOppId), loadAll()]);
    } catch (err) {
      alert(errorAr(err));
    }
  };

  // ===== نشر / تعديل فرصة =====
  const openCreate = () => {
    setEditingId(null);
    setFormError('');
    setOppForm(emptyOppForm);
    setShowOppForm(true);
  };
  const openEdit = (o) => {
    setEditingId(o.id);
    setFormError('');
    setOppForm({
      title: o.title, description: o.description || '', type: o.typeCode, status: o.statusCode,
      startDate: o.startDate, endDate: o.endDate, deadline: o.deadlineIso, seats: o.seats,
      location: o.location === '—' ? '' : o.location, target: o.target === '—' ? '' : o.target,
      requirements: o.requirements || '',
    });
    setShowOppForm(true);
  };
  const closeOppForm = () => { setShowOppForm(false); setFormError(''); };
  const f = (k) => (e) => setOppForm({ ...oppForm, [k]: e.target.value });

  const saveOpp = async (e) => {
    e.preventDefault();

    const missing = Object.keys(REQUIRED_FIELDS).filter((k) => !String(oppForm[k]).trim());
    if (missing.length > 0) {
      setFormError('لا يمكن نشر الفرصة قبل تعبئة: ' + missing.map((k) => REQUIRED_FIELDS[k]).join('، '));
      return;
    }
    if (!(Number(oppForm.seats) > 0)) {
      setFormError('عدد المقاعد يجب أن يكون 1 أو أكثر');
      return;
    }
    if (oppForm.endDate <= oppForm.startDate) {
      setFormError('تاريخ نهاية التدريب يجب أن يكون بعد تاريخ البداية');
      return;
    }
    if (oppForm.deadline > oppForm.endDate) {
      setFormError('آخر موعد للتقديم يجب أن يكون قبل نهاية التدريب');
      return;
    }

    const data = {
      title: oppForm.title.trim(), description: oppForm.description.trim(), type: oppForm.type,
      seats: Number(oppForm.seats), startDate: oppForm.startDate, endDate: oppForm.endDate, deadline: oppForm.deadline,
      location: oppForm.location.trim(), target: oppForm.target.trim(), requirements: oppForm.requirements.trim(),
    };
    setSaving(true);
    try {
      if (editingId) await api.updateOpportunity(editingId, { ...data, status: oppForm.status });
      else await api.createOpportunity(data);
      closeOppForm();
      await loadAll();
    } catch (err) {
      setFormError(errorAr(err));
    } finally {
      setSaving(false);
    }
  };

  // ===== تعديل عدد المقاعد من صفحة المقاعد =====
  const saveSeats = async (o) => {
    const value = seatDrafts[o.id];
    if (value === undefined || Number(value) === o.seats) return;
    try {
      if (!(Number(value) > 0)) throw new Error('عدد المقاعد يجب أن يكون 1 أو أكثر');
      await api.updateOpportunity(o.id, { seats: Number(value) });
      await loadAll();
    } catch (err) {
      alert(errorAr(err));
    } finally {
      setSeatDrafts((d) => {
        const rest = { ...d };
        delete rest[o.id];
        return rest;
      });
    }
  };

  // ===== التقارير =====
  const sendReport = async (e) => {
    e.preventDefault();
    setReportMsg('');
    const { assignmentId, reportType, title, details } = reportData;
    if (!assignmentId || !reportType || !details.trim()) {
      setReportMsg('اختر المتدرب ونوع التقرير واكتب التفاصيل.');
      return;
    }
    const defaultTitle = { ABSENCE_WARNING: 'إنذار غياب', VISIT: 'تقرير زيارة', APPROVAL: 'إفادة جهة التدريب' }[reportType];
    try {
      await api.submitReport({
        assignmentId: Number(assignmentId), type: reportType, title: title.trim() || defaultTitle, content: details.trim(),
      });
      setReportData({ assignmentId: '', reportType: '', title: '', details: '' });
      setReportMsg('✅ تم إرسال التقرير، ووصل إشعار للمتدرب والمشرف الأكاديمي.');
      await Promise.all([loadReports(), loadAll()]);
    } catch (err) {
      setReportMsg(errorAr(err));
    }
  };

  const reviewReport = async (r, status) => {
    try {
      await api.reviewReport(r.id, status);
      await loadReports();
    } catch (err) {
      alert(errorAr(err));
    }
  };

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : hour < 18 ? 'طاب يومك' : 'مساء النور';

  const goTo = (key) => {
    setActiveTab(key);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const GovBar = () => (
    <>
      <div className="gov-bar">🇸🇦 موقع حكومي رسمي تابع لحكومة المملكة العربية السعودية</div>
      <div className="green-strip" />
    </>
  );

  // شاشة تسجيل الدخول (يمكن الدخول أيضاً من البوابة الرئيسية مباشرة)
  if (!token) {
    return (
      <div className="portal-wrapper" dir="rtl">
        <GovBar />
        <div className="login-container">
          <div className="login-card">
            <h2>تسجيل الدخول - بوابة جهة التدريب</h2>
            <p>منصة إدارة التدريب التعاوني: أدخل بيانات حساب جهتك للوصول إلى لوحة التحكم</p>
            <form onSubmit={handleLogin} className="login-form">
              <div className="input-group">
                <label>البريد الإلكتروني</label>
                <input
                  type="email" dir="ltr" placeholder="name@company.com" required
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>كلمة المرور</label>
                <input
                  type="password" dir="ltr" placeholder="********" required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>
              {loginError && <div className="form-error">{loginError}</div>}
              <button type="submit" className="login-submit-btn" disabled={loggingIn}>
                {loggingIn ? 'جاري الدخول...' : 'تسجيل الدخول'}
              </button>
            </form>
            <p className="muted" style={{ marginTop: 14 }}>
              ليس لديك حساب؟ <a href={MAIN_PORTAL_URL}>سجّل جهتك من البوابة الرئيسية</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const OppCard = ({ item }) => (
    <div className="card opp-card">
      <div className={item.statusCode === 'OPEN' ? 'ribbon' : 'ribbon late'} />
      <div className="card-head">
        <span className={item.statusCode === 'OPEN' ? 'badge' : 'badge pending'}>
          {item.statusCode === 'OPEN' ? 'التقديم متاح' : 'التقديم منتهي'}
        </span>
        <div className="logo-circle">{item.icon}</div>
      </div>
      <h3>{item.title}</h3>
      <div className="entity">{item.company}</div>
      <div className="tags">
        <span className="tag">ينتهي التقديم في {item.deadline}</span>
        <span className="tag">{item.type}</span>
        <span className="tag">🪑 {item.seatsAvailable} / {item.seats} مقعد شاغر</span>
        <span className="tag">📨 {item.applicationsCount} طلب</span>
      </div>
      <ul className="meta">
        <li>📍 موقع التدريب : {item.location}</li>
        <li>⏳ مدة التدريب : {item.duration}</li>
        <li>🗓️ من {dmy(item.startDate)} إلى {dmy(item.endDate)}</li>
        <li>👥 مخصص لطلاب {item.target}</li>
      </ul>
      <div className="card-actions">
        <button className="btn btn-primary" onClick={() => setSelectedOppId(item.id)}>
          عرض التفاصيل والمتقدمين
        </button>
        <button className="btn btn-outline-sm" onClick={() => openEdit(item)}>
          تعديل الفرصة
        </button>
        <button className="btn btn-danger-sm" onClick={() => deleteOpp(item)}>
          {item.applicationsCount > 0 ? 'إغلاق / حذف' : 'حذف الفرصة'}
        </button>
      </div>
    </div>
  );

  const emptyOpps = (
    <div className="card">
      <p className="muted" style={{ margin: 0 }}>
        لم تنشر جهتك أي فرصة تدريبية بعد. يمكنك نشر فرصة جديدة.
      </p>
    </div>
  );

  const filteredOpps = opportunities.filter((o) => oppFilter === 'الكل' || o.status === oppFilter);

  const Req = () => <span className="req">*</span>;

  const studentReports = reports.filter((r) => r.type === 'WEEKLY' || r.type === 'FINAL');
  const sentReports = reports.filter((r) => !['WEEKLY', 'FINAL'].includes(r.type));
  const traineeName = (assignmentId) =>
    trainees.find((t) => t.assignment.id === assignmentId)?.assignment.student.user.name || `تكليف #${assignmentId}`;

  return (
    <div className="portal-wrapper" dir="rtl">
      <GovBar />

      <header className="portal-header">
        <div className="brand-title">منصة التدريب التعاوني | بوابة جهة التدريب</div>
        <button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="القائمة">☰</button>
      </header>

      {menuOpen && (
        <div className="drawer-bg" onClick={() => setMenuOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <strong>{currentUser.orgName || 'بوابة جهة التدريب'}</strong>
              <button className="menu-btn" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={activeTab === t.key ? 'tab-btn active' : 'tab-btn'}
                onClick={() => goTo(t.key)}
              >
                {t.label}
              </button>
            ))}
            <button className="logout-btn" onClick={() => { logout(); window.location.href = MAIN_PORTAL_URL; }}>
              خروج
            </button>
          </nav>
        </div>
      )}

      <main className="portal-content">
        {loadError && (
          <div className="form-error" style={{ marginBottom: 16 }}>
            {loadError} <button className="btn btn-outline-sm" onClick={loadAll}>إعادة المحاولة</button>
          </div>
        )}

        {activeTab === 'home' && (
          <>
            <section className="hero">
              <div className="hero-inner">
                <div className="hero-text">
                  <span className="hero-badge">
                    شريك النجاح{currentUser.entityType ? ` — جهة ${currentUser.entityType}` : ''}
                  </span>
                  <h1>{greet}، أهلاً بك {currentUser.name ? `يا ${currentUser.name}` : 'في بوابتك التدريبية'}</h1>
                  <p>من هنا تصنع الفرص، وتتابع المتدربين خطوة بخطوة، وتشارك في بناء جيلٍ يفخر به الوطن.</p>
                  <button className="btn btn-light" onClick={() => goTo('opportunities')}>إدارة الفرص المقدمة</button>
                  <button className="btn btn-ghost" onClick={() => goTo('reports')}>إرسال تقرير</button>
                </div>
                <div className="hero-art">
                  <img src={coverImg} alt="شراكة التدريب" className="hero-img" />
                  <span className="float-chip chip-a">متدربون</span>
                  <span className="float-chip chip-b">فرص</span>
                </div>
              </div>
            </section>

            <section className="section">
              <h2 className="section-title">مؤشرات جهتك</h2>
              <div className="stats">
                <div><div className="stat-icon">💼</div><div className="stat-num">{opportunities.length}</div><div className="stat-label">فرصة مقدمة</div></div>
                <div><div className="stat-icon">🎓</div><div className="stat-num">{activeTrainees.length}</div><div className="stat-label">متدرب حالياً</div></div>
                <div><div className="stat-icon">🪑</div><div className="stat-num">{summary.seatsAvailable}</div><div className="stat-label">مقعد شاغر</div></div>
                <div><div className="stat-icon">⭐</div><div className="stat-num">{avgEvaluation ?? '—'}</div><div className="stat-label">متوسط التقييم (من 100)</div></div>
              </div>
            </section>

            <section className="section">
              <div className="note-banner">
                <div className="note-icon">👋</div>
                <div>
                  <strong>نتطلع لرؤيتك في زيارة المشرف القادمة</strong>
                  <p>حضورك ومتابعتك يصنعان فرقاً حقيقياً في رحلة متدربيك.</p>
                </div>
              </div>
            </section>

            <section className="section soft">
              <h2 className="section-title">أقسام إدارة التدريب</h2>
              <div className="quick">
                {TABS.slice(1).map((t) => (
                  <button key={t.key} className="quick-item" onClick={() => goTo(t.key)}>
                    <div>
                      <h4>{t.label}</h4>
                      <p>{t.desc}</p>
                    </div>
                    <span className="arrow">←</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="section">
              <div className="section-head">
                <h2 className="section-title">أحدث الفرص المقدمة</h2>
              </div>
              {opportunities.length === 0 ? emptyOpps : (
                <div className="scroller">
                  {opportunities.slice(0, 4).map((item) => (
                    <div className="scroller-item" key={item.id}><OppCard item={item} /></div>
                  ))}
                </div>
              )}
              <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => goTo('opportunities')}>عرض الكل</button>
            </section>

            <section className="section soft">
              <div className="quote">
                <span>“</span>
                <p>الشباب هم الطاقة الحقيقية، وشراكتكم تمنحهم أول خطوة نحو مستقبلٍ مشرق.</p>
              </div>
            </section>
          </>
        )}

        {activeTab === 'opportunities' && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">الفرص المقدمة</h2>
              <button className="btn btn-primary" onClick={openCreate}>+ نشر فرصة جديدة</button>
            </div>
            <div className="chips">
              {['الكل', 'متاح', 'منتهي'].map((s) => (
                <button key={s} className={oppFilter === s ? 'chip on' : 'chip'} onClick={() => setOppFilter(s)}>
                  {s}
                </button>
              ))}
            </div>
            {filteredOpps.length === 0 ? emptyOpps : filteredOpps.map((item) => <OppCard key={item.id} item={item} />)}
          </section>
        )}

        {activeTab === 'capacity' && (
          <section className="section">
            <div className="content-box">
              <h2 className="section-title">إدارة المقاعد التدريبية</h2>
              <div className="stats-grid">
                <div className="stat-box"><span>إجمالي المقاعد</span><h3>{summary.totalSeats} مقاعد</h3></div>
                <div className="stat-box"><span>المقاعد المحجوزة</span><h3>{summary.seatsTaken} مقعد</h3></div>
                <div className="stat-box green"><span>المقاعد الشاغرة</span><h3>{summary.seatsAvailable} مقعد شاغر</h3></div>
              </div>
              <p className="muted" style={{ marginTop: 14 }}>
                يُحجز المقعد عند قبول جهتك للطالب. الأرقام تشمل الفرص المتاحة للتقديم فقط.
              </p>
            </div>

            {opportunities.map((o) => {
              const fill = o.seats ? Math.min(Math.round((o.seatsTaken / o.seats) * 100), 100) : 0;
              return (
                <div className="seat-card" key={o.id}>
                  <div className="seat-head">
                    <h4>{o.icon} {o.title}</h4>
                    <span className={o.statusCode === 'OPEN' ? 'badge' : 'badge pending'}>{o.status}</span>
                  </div>
                  <div className="seat-edit">
                    <label>عدد المقاعد</label>
                    <input
                      type="number"
                      min="1"
                      value={seatDrafts[o.id] ?? o.seats}
                      onChange={(e) => setSeatDrafts({ ...seatDrafts, [o.id]: e.target.value })}
                      onBlur={() => saveSeats(o)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                  </div>
                  <div className="seat-nums">
                    <div><b>{o.applicationsCount}</b><span>المتقدمون</span></div>
                    <div><b>{o.seatsTaken}</b><span>محجوزة</span></div>
                    <div className="free"><b>{o.seatsAvailable}</b><span>شاغرة</span></div>
                  </div>
                  <div className="progress"><div style={{ width: `${fill}%` }} /></div>
                  <button className="btn btn-outline-sm" style={{ marginTop: 10 }} onClick={() => setSelectedOppId(o.id)}>
                    إدارة المتقدمين
                  </button>
                </div>
              );
            })}
          </section>
        )}

        {activeTab === 'evaluation' && (
          <section className="section">
            <EvaluationSection trainees={trainees} evaluatorName={currentUser.name} onSaved={loadAll} />
          </section>
        )}

        {activeTab === 'visits' && (
          <section className="section">
            <div className="note-banner">
              <div className="note-icon">👋</div>
              <div>
                <strong>نتطلع لرؤيتك في زيارتك القادمة</strong>
                <p>بيئة تدريب ملهمة تستحق التوثيق، شكراً لاحتضانكم متدربينا.</p>
              </div>
            </div>
            <Visits />
          </section>
        )}

        {activeTab === 'reports' && (
          <section className="section">
            <div className="content-box">
              <h2 className="section-title">إرسال تقرير زيارة أو إنذار غياب</h2>
              {activeTrainees.length === 0 ? (
                <p className="muted">لا يوجد متدربون حالياً في جهتك.</p>
              ) : (
                <form onSubmit={sendReport}>
                  <div className="form-group">
                    <label>المتدرب</label>
                    <select
                      value={reportData.assignmentId}
                      onChange={(e) => setReportData({ ...reportData, assignmentId: e.target.value })}
                    >
                      <option value="">اختر المتدرب...</option>
                      {activeTrainees.map((t) => (
                        <option key={t.assignment.id} value={t.assignment.id}>
                          {t.assignment.student.user.name} — {t.assignment.opportunity.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>نوع التقرير</label>
                    <select
                      value={reportData.reportType}
                      onChange={(e) => setReportData({ ...reportData, reportType: e.target.value })}
                    >
                      <option value="">اختر النوع...</option>
                      <option value="ABSENCE_WARNING">إنذار غياب</option>
                      <option value="VISIT">تقرير زيارة</option>
                      <option value="APPROVAL">إفادة جهة التدريب</option>
                    </select>
                  </div>
                  <div className="form-group full">
                    <label>عنوان التقرير (اختياري)</label>
                    <input
                      value={reportData.title}
                      onChange={(e) => setReportData({ ...reportData, title: e.target.value })}
                    />
                  </div>
                  <div className="form-group full">
                    <label>التفاصيل</label>
                    <textarea
                      rows="3"
                      value={reportData.details}
                      onChange={(e) => setReportData({ ...reportData, details: e.target.value })}
                    />
                  </div>
                  {reportMsg && <p className={reportMsg.startsWith('✅') ? 'muted' : 'form-error'}>{reportMsg}</p>}
                  <button type="submit" className="submit-btn">إرسال التقرير</button>
                </form>
              )}
            </div>

            <div className="content-box" style={{ marginTop: 20 }}>
              <h2 className="section-title">تقارير المتدربين</h2>
              {studentReports.length === 0 ? (
                <p className="muted">لا توجد تقارير من المتدربين حتى الآن.</p>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr><th>المتدرب</th><th>النوع</th><th>العنوان</th><th>الحالة</th><th>الإجراءات</th></tr>
                  </thead>
                  <tbody>
                    {studentReports.map((r) => (
                      <tr key={r.id}>
                        <td>{r.submittedBy?.name || traineeName(r.assignmentId)}</td>
                        <td>{REPORT_TYPE_AR[r.type]}{r.weekNumber ? ` (أسبوع ${r.weekNumber})` : ''}</td>
                        <td title={r.content}>{r.title}</td>
                        <td>{REPORT_STATUS_AR[r.status]}</td>
                        <td>
                          {r.status === 'SUBMITTED' ? (
                            <>
                              <button className="action-btn save" onClick={() => reviewReport(r, 'APPROVED')}>اعتماد</button>
                              <button className="action-btn alert" onClick={() => reviewReport(r, 'REJECTED')}>رفض</button>
                            </>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="content-box" style={{ marginTop: 20 }}>
              <h2 className="section-title">التقارير المرسلة من جهتك</h2>
              {sentReports.length === 0 ? (
                <p className="muted">لم ترسل جهتك أي تقرير بعد.</p>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr><th>المتدرب</th><th>النوع</th><th>العنوان</th><th>التاريخ</th></tr>
                  </thead>
                  <tbody>
                    {sentReports.map((r) => (
                      <tr key={r.id}>
                        <td>{traineeName(r.assignmentId)}</td>
                        <td>{REPORT_TYPE_AR[r.type]}</td>
                        <td title={r.content}>{r.title}</td>
                        <td>{dmy(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}
      </main>

      {/* نافذة نشر / تعديل فرصة */}
      {showOppForm && (
        <div className="modal-bg" onClick={closeOppForm}>
          <div className="modal-box opp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>{editingId ? 'تعديل الفرصة التدريبية' : 'نشر فرصة تدريبية جديدة'}</h3>
              <button className="modal-close" onClick={closeOppForm}>✕</button>
            </div>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              جهة التدريب: <strong>{currentUser.orgName}</strong> — جميع البنود المعلّمة بـ (*) مطلوبة قبل النشر.
            </p>
            <form onSubmit={saveOpp} noValidate className="report-form" style={{ marginTop: 14 }}>
              <div className="form-group full">
                <label>عنوان الفرصة <Req /></label>
                <input value={oppForm.title} onChange={f('title')} placeholder="مثال: تدريب تعاوني في تطوير الويب" />
              </div>
              <div className="form-group full">
                <label>وصف الفرصة <Req /></label>
                <textarea rows="3" value={oppForm.description} onChange={f('description')} placeholder="اكتب وصفاً مختصراً لطبيعة التدريب والمهام" />
              </div>
              <div className="form-group">
                <label>نوع التدريب</label>
                <select value={oppForm.type} onChange={f('type')}>
                  <option value="COOP">تدريب تعاوني</option>
                  <option value="SUMMER">تدريب صيفي</option>
                </select>
              </div>
              {editingId && (
                <div className="form-group">
                  <label>حالة التقديم</label>
                  <select value={oppForm.status} onChange={f('status')}>
                    <option value="OPEN">متاح</option>
                    <option value="CLOSED">منتهي</option>
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>تاريخ بداية التدريب <Req /></label>
                <input type="date" value={oppForm.startDate} onChange={f('startDate')} />
              </div>
              <div className="form-group">
                <label>تاريخ نهاية التدريب <Req /></label>
                <input type="date" value={oppForm.endDate} onChange={f('endDate')} />
              </div>
              <div className="form-group">
                <label>آخر موعد للتقديم <Req /></label>
                <input type="date" value={oppForm.deadline} onChange={f('deadline')} />
              </div>
              <div className="form-group">
                <label>عدد المقاعد <Req /></label>
                <input type="number" min="1" value={oppForm.seats} onChange={f('seats')} />
              </div>
              <div className="form-group full">
                <label>موقع التدريب <Req /></label>
                <input value={oppForm.location} onChange={f('location')} placeholder="المدينة، الحي" />
              </div>
              <div className="form-group">
                <label>مدة التدريب</label>
                <input value={durationOf(oppForm.startDate, oppForm.endDate) || 'تُحسب من التاريخين'} disabled />
              </div>
              <div className="form-group">
                <label>الفئة المستهدفة <Req /></label>
                <input value={oppForm.target} onChange={f('target')} placeholder="علوم الحاسب" />
              </div>
              <div className="form-group full">
                <label>متطلبات الفرصة <Req /></label>
                <textarea rows="3" value={oppForm.requirements} onChange={f('requirements')} placeholder="مثال: معدل تراكمي، مهارات مطلوبة، لغة..." />
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="form-group full">
                <button type="submit" className="submit-btn" disabled={saving}>
                  {saving ? 'جاري الحفظ...' : editingId ? 'حفظ التعديلات' : 'نشر الفرصة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل الفرصة التدريبية والمتقدمين */}
      {selectedOpp && (() => {
        const fill = selectedOpp.seats ? Math.min(Math.round((selectedOpp.seatsTaken / selectedOpp.seats) * 100), 100) : 0;
        return (
          <div className="modal-bg" onClick={() => setSelectedOppId(null)}>
            <div className="modal-box opp-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-top">
                <div>
                  <span className={selectedOpp.statusCode === 'OPEN' ? 'badge' : 'badge pending'}>
                    {selectedOpp.statusCode === 'OPEN' ? 'التقديم متاح' : 'التقديم منتهي'}
                  </span>
                  <h3 style={{ marginTop: 10 }}>{selectedOpp.icon} {selectedOpp.title}</h3>
                  <div className="entity" style={{ marginBottom: 0 }}>{selectedOpp.company}</div>
                </div>
                <button className="modal-close" onClick={() => setSelectedOppId(null)}>✕</button>
              </div>

              <div className="detail-stats">
                <div className="detail-stat"><b>{selectedOpp.seats}</b><span>إجمالي المقاعد</span></div>
                <div className="detail-stat"><b>{selectedOpp.applicationsCount}</b><span>المتقدمون</span></div>
                <div className="detail-stat"><b>{selectedOpp.seatsAvailable}</b><span>مقاعد شاغرة</span></div>
              </div>

              <div className="progress"><div style={{ width: `${fill}%` }} /></div>
              <small className="muted">تم حجز {selectedOpp.seatsTaken} من {selectedOpp.seats} مقعد ({fill}%)</small>

              {selectedOpp.description && (
                <>
                  <h4 className="detail-title" style={{ marginTop: 16 }}>وصف الفرصة</h4>
                  <p className="desc-text">{selectedOpp.description}</p>
                </>
              )}

              <ul className="meta detail-list">
                <li>📌 {selectedOpp.type}</li>
                <li>🗓️ فترة التدريب: من {dmy(selectedOpp.startDate)} إلى {dmy(selectedOpp.endDate)}</li>
                <li>📅 ينتهي التقديم في {selectedOpp.deadline}</li>
                <li>📍 موقع التدريب : {selectedOpp.location}</li>
                <li>⏳ مدة التدريب : {selectedOpp.duration}</li>
                <li>👥 الفئة المستهدفة: {selectedOpp.target}</li>
              </ul>

              {selectedOpp.requirements && (
                <>
                  <h4 className="detail-title">متطلبات الفرصة</h4>
                  <p className="desc-text">{selectedOpp.requirements}</p>
                </>
              )}

              <h4 className="detail-title">الطلاب المتقدمون (مرتبون حسب المعدل)</h4>
              <p className="muted" style={{ marginTop: 0 }}>
                يتقدّم الطالب من بوابته، ثم يرشّحه المشرف الأكاديمي، وبعدها يظهر لك زرّا القبول والرفض.
              </p>
              {applicants === null ? (
                <p className="muted">جاري التحميل...</p>
              ) : applicants.length === 0 ? (
                <p className="muted">لا يوجد طلاب متقدمون على هذه الفرصة حتى الآن.</p>
              ) : (
                applicants.map((a) => (
                  <div className="applicant" key={a.id}>
                    <div>
                      <strong>{a.student.user.name}</strong>
                      <small>
                        {a.student.major || 'تخصص غير محدد'} — الرقم الجامعي {a.student.universityId}
                        {a.student.gpa != null && ` — المعدل ${a.student.gpa}`}
                      </small>
                    </div>
                    {a.status === 'NOMINATED' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="action-btn save" onClick={() => decide(a, 'APPROVED')}>قبول</button>
                        <button className="action-btn alert" onClick={() => decide(a, 'REJECTED')}>رفض</button>
                      </div>
                    ) : (
                      <span className={statusClass(a.status)}>{APP_STATUS_AR[a.status]}</span>
                    )}
                  </div>
                ))
              )}

              <button className="btn-danger-block" onClick={() => deleteOpp(selectedOpp)}>
                {selectedOpp.applicationsCount > 0 ? 'إغلاق التقديم على الفرصة' : 'حذف الفرصة'}
              </button>
              <button className="submit-btn" style={{ marginTop: 10 }} onClick={() => setSelectedOppId(null)}>إغلاق</button>
            </div>
          </div>
        );
      })()}

      <footer className="footer">© منصة التدريب التعاوني — بوابة جهة التدريب</footer>
    </div>
  );
}
