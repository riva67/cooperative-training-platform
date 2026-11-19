import React, { useCallback, useEffect, useState } from 'react';
import './App.css';
import {
  api, errorAr, getToken, getSavedUser, saveSession, clearSession, consumeHashSession, MAIN_PORTAL_URL,
  ROLE_AR, STATUS_AR, ORG_TYPE_AR, ASSIGNMENT_AR, dmy, dateTime,
} from './api';

const TABS = [
  { key: 'home', label: 'الرئيسية' },
  { key: 'requests', label: 'طلبات التسجيل', desc: 'اقبل أو ارفض طلبات المشرفين وجهات التدريب.' },
  { key: 'users', label: 'المستخدمون', desc: 'ابحث في الحسابات وفعّلها أو أوقفها.' },
  { key: 'assignments', label: 'التكليفات', desc: 'أنشئ التكليف للطلاب المقبولين وتابع حالته.' },
  { key: 'organizations', label: 'جهات التدريب', desc: 'استعرض الجهات وأنواعها وفرصها.' },
  { key: 'logs', label: 'سجل العمليات', desc: 'تابع العمليات المهمة التي تمت في النظام.' },
];

const SEMESTERS = ['الأول', 'الثاني', 'الصيفي'];

const ACTION_AR = {
  LOGIN: 'تسجيل دخول',
  USER_REGISTERED: 'طلب تسجيل',
  USER_CREATED: 'إنشاء حساب',
  USER_ENABLED: 'تفعيل حساب',
  USER_DISABLED: 'إيقاف حساب',
  REGISTRATION_REJECTED: 'رفض طلب تسجيل',
  USER_ROLE_CHANGED: 'تغيير صلاحية',
  OPPORTUNITY_CREATED: 'نشر فرصة',
  OPPORTUNITY_UPDATED: 'تعديل فرصة',
  OPPORTUNITY_DELETED: 'حذف فرصة',
  APPLICATION_CREATED: 'تقديم طالب',
  APPLICATION_NOMINATED: 'ترشيح طالب',
  APPLICATION_APPROVED: 'قبول طالب',
  APPLICATION_REJECTED: 'رفض طالب',
  ASSIGNMENT_CREATED: 'إنشاء تكليف',
  ASSIGNMENT_COMPLETED: 'إكمال تكليف',
  ASSIGNMENT_CANCELLED: 'إلغاء تكليف',
  REPORT_SUBMITTED: 'إرسال تقرير',
  REPORT_APPROVED: 'اعتماد تقرير',
  REPORT_REJECTED: 'رفض تقرير',
  EVALUATION_SUBMITTED: 'تقييم متدرب',
  FINAL_GRADE_SET: 'رصد الدرجة النهائية',
  VISIT_REQUESTED: 'طلب زيارة',
  VISIT_APPROVED: 'موافقة على زيارة',
  VISIT_DECLINED: 'اعتذار عن زيارة',
};

const statusBadge = (s) => (s === 'ACTIVE' ? 'badge' : s === 'PENDING' ? 'badge pending' : 'badge danger');

export default function App() {
  const [token, setToken] = useState(() => {
    consumeHashSession();
    return getToken();
  });
  const [me, setMe] = useState(() => getSavedUser());
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');

  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [rejectReasons, setRejectReasons] = useState({});
  const [busy, setBusy] = useState(null);

  const [users, setUsers] = useState([]);
  const [userFilter, setUserFilter] = useState({ role: '', status: '', search: '' });

  const [approvedApps, setApprovedApps] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [academics, setAcademics] = useState([]);
  const [orgSupervisors, setOrgSupervisors] = useState({}); // organizationId -> supervisors
  const [assignForms, setAssignForms] = useState({}); // applicationId -> form

  const [organizations, setOrganizations] = useState([]);
  const [logs, setLogs] = useState([]);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setMe(null);
  }, []);

  useEffect(() => {
    window.addEventListener('session-expired', logout);
    return () => window.removeEventListener('session-expired', logout);
  }, [logout]);

  const run = useCallback(async (fn) => {
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorAr(err));
    }
  }, []);

  const loadHome = useCallback(() => run(async () => {
    const [s, p] = await Promise.all([api.stats(), api.users({ status: 'PENDING' })]);
    setStats(s);
    setPending(p.items);
  }), [run]);

  const loadUsers = useCallback(() => run(async () => {
    setUsers((await api.users(userFilter)).items);
  }), [run, userFilter]);

  const loadAssignments = useCallback(() => run(async () => {
    const [apps, asg, acad] = await Promise.all([
      api.approvedApplications(), api.assignments(), api.users({ role: 'ACADEMIC_SUPERVISOR', status: 'ACTIVE' }),
    ]);
    // approved students that do not have a (non-cancelled) placement yet
    const placed = new Set(
      asg.items.filter((a) => a.status !== 'CANCELLED').map((a) => `${a.studentId}-${a.opportunityId}`)
    );
    setApprovedApps(apps.items.filter((a) => !placed.has(`${a.studentId}-${a.opportunityId}`)));
    setAssignments(asg.items);
    setAcademics(acad.items.filter((u) => u.academicSupervisor));
  }), [run]);

  const loadOrganizations = useCallback(() => run(async () => {
    setOrganizations((await api.organizations()).items);
  }), [run]);

  const loadLogs = useCallback(() => run(async () => {
    setLogs((await api.logs()).items);
  }), [run]);

  useEffect(() => {
    if (!token) return;
    api.me().then(setMe).catch(() => {});
  }, [token]);

  // load the data of the open tab
  useEffect(() => {
    if (!token) return;
    if (activeTab === 'home' || activeTab === 'requests') loadHome();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'assignments') loadAssignments();
    if (activeTab === 'organizations') loadOrganizations();
    if (activeTab === 'logs') loadLogs();
  }, [token, activeTab, loadHome, loadUsers, loadAssignments, loadOrganizations, loadLogs]);

  // supervisors of an organization (for the placement form)
  const ensureOrgSupervisors = useCallback(async (orgId, appId) => {
    if (orgSupervisors[orgId]) return;
    try {
      const org = await api.organization(orgId);
      setOrgSupervisors((m) => ({ ...m, [orgId]: org.supervisors }));
      if (org.supervisors.length === 1) {
        setAssignForms((f) => ({ ...f, [appId]: { ...f[appId], orgSupervisorId: String(org.supervisors[0].id) } }));
      }
    } catch (err) {
      setError(errorAr(err));
    }
  }, [orgSupervisors]);

  useEffect(() => {
    approvedApps.forEach((a) => ensureOrgSupervisors(a.opportunity.organizationId, a.id));
  }, [approvedApps, ensureOrgSupervisors]);

  // ===== actions =====
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const { token: t, user } = await api.login(loginForm.email.trim(), loginForm.password);
      if (user.role !== 'ADMIN') {
        setLoginError('هذه اللوحة مخصصة لإدارة النظام فقط.');
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

  const approve = (u) => run(async () => {
    setBusy(u.id);
    try {
      await api.setActive(u.id, true);
      await loadHome();
    } finally {
      setBusy(null);
    }
  });

  const reject = (u) => run(async () => {
    if (!window.confirm(`تأكيد رفض طلب ${u.name}؟`)) return;
    setBusy(u.id);
    try {
      await api.reject(u.id, (rejectReasons[u.id] || '').trim());
      await loadHome();
    } finally {
      setBusy(null);
    }
  });

  const toggleActive = (u) => run(async () => {
    const enable = !u.isActive;
    if (!window.confirm(`${enable ? 'تفعيل' : 'إيقاف'} حساب ${u.name}؟`)) return;
    await api.setActive(u.id, enable);
    await loadUsers();
  });

  const createAssignment = (app) => run(async () => {
    const form = assignForms[app.id] || {};
    if (!form.academicSupervisorId || !form.orgSupervisorId) {
      setError('اختر المشرف الأكاديمي ومشرف جهة التدريب.');
      return;
    }
    await api.createAssignment({
      applicationId: app.id,
      academicSupervisorId: Number(form.academicSupervisorId),
      orgSupervisorId: Number(form.orgSupervisorId),
      semester: form.semester || SEMESTERS[0],
      academicYear: (form.academicYear || '1448').trim(),
    });
    await loadAssignments();
  });

  const setAssignmentStatus = (a, status) => run(async () => {
    const word = status === 'CANCELLED' ? 'إلغاء' : 'إكمال';
    if (!window.confirm(`${word} تكليف الطالب ${a.student.user.name}؟ لا يمكن التراجع.`)) return;
    await api.setAssignmentStatus(a.id, status);
    await loadAssignments();
  });

  const setForm = (appId, key, value) =>
    setAssignForms((f) => ({ ...f, [appId]: { ...f[appId], [key]: value } }));

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

  // ===== login =====
  if (!token) {
    return (
      <div className="portal-wrapper" dir="rtl">
        <GovBar />
        <div className="login-container">
          <div className="login-card">
            <h2>تسجيل الدخول - لوحة إدارة النظام</h2>
            <p>منصة إدارة التدريب التعاوني</p>
            <form onSubmit={handleLogin} className="login-form">
              <div className="input-group">
                <label>البريد الإلكتروني</label>
                <input
                  type="email" dir="ltr" required
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>كلمة المرور</label>
                <input
                  type="password" dir="ltr" required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>
              {loginError && <div className="form-error">{loginError}</div>}
              <button type="submit" className="login-submit-btn" disabled={loggingIn}>
                {loggingIn ? 'جاري الدخول...' : 'تسجيل الدخول'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const pct = (v) => (v == null ? '—' : `${v}%`);

  return (
    <div className="portal-wrapper" dir="rtl">
      <GovBar />

      <header className="portal-header">
        <div className="brand-title">منصة التدريب التعاوني | لوحة إدارة النظام</div>
        <button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="القائمة">☰</button>
      </header>

      {menuOpen && (
        <div className="drawer-bg" onClick={() => setMenuOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <strong>إدارة النظام</strong>
              <button className="menu-btn" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            {TABS.map((t) => (
              <button key={t.key} className={activeTab === t.key ? 'tab-btn active' : 'tab-btn'} onClick={() => goTo(t.key)}>
                {t.label}
                {t.key === 'requests' && pending.length > 0 && ` (${pending.length})`}
              </button>
            ))}
            <button className="logout-btn" onClick={() => { logout(); window.location.href = MAIN_PORTAL_URL; }}>
              خروج
            </button>
          </nav>
        </div>
      )}

      <main className="portal-content">
        {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ===== الرئيسية: مؤشرات الأثر ===== */}
        {activeTab === 'home' && (
          <>
            <section className="section">
              <h1 className="section-title">أهلاً {me?.name || ''}</h1>
              {pending.length > 0 && (
                <div className="note-banner" style={{ cursor: 'pointer' }} onClick={() => goTo('requests')}>
                  <div className="note-icon">📥</div>
                  <div>
                    <strong>{pending.length} طلب تسجيل بانتظار موافقتك</strong>
                    <p>اضغط لمراجعة طلبات المشرفين وجهات التدريب.</p>
                  </div>
                </div>
              )}
            </section>

            <section className="section">
              <h2 className="section-title">مؤشرات الأثر</h2>
              {stats && (
                <div className="stats">
                  <div><div className="stat-icon">💼</div><div className="stat-num">{stats.totalOpportunities}</div><div className="stat-label">عدد فرص التدريب</div></div>
                  <div><div className="stat-icon">🎓</div><div className="stat-num">{pct(stats.completionRate)}</div><div className="stat-label">نسبة إكمال التدريب</div></div>
                  <div>
                    <div className="stat-icon">⭐</div>
                    <div className="stat-num">{stats.providerSatisfaction == null ? '—' : `${stats.providerSatisfaction} / 5`}</div>
                    <div className="stat-label">رضا جهات التدريب ({stats.providerSatisfactionResponses} تقييم)</div>
                  </div>
                  <div>
                    <div className="stat-icon">🤝</div>
                    <div className="stat-num">{pct(stats.employmentRate)}</div>
                    <div className="stat-label">نسبة التوظيف بعد التدريب ({stats.employmentResponses} رد)</div>
                  </div>
                </div>
              )}
            </section>

            {stats && (
              <section className="section soft">
                <h2 className="section-title">تفاصيل إضافية</h2>
                <div className="stats-grid">
                  <div className="stat-box"><span>الفرص المتاحة للتقديم</span><h3>{stats.openOpportunities}</h3></div>
                  <div className="stat-box"><span>الطلبات المقدمة</span><h3>{stats.totalApplications}</h3></div>
                  <div className="stat-box"><span>تدريب جارٍ</span><h3>{stats.activeAssignments}</h3></div>
                  <div className="stat-box green"><span>تدريب مكتمل</span><h3>{stats.completedAssignments}</h3></div>
                  <div className="stat-box"><span>متوسط الحضور</span><h3>{pct(stats.averageAttendanceRate)}</h3></div>
                  <div className="stat-box"><span>متوسط الدرجة النهائية</span><h3>{stats.averageFinalGrade ?? '—'}</h3></div>
                  <div className="stat-box"><span>رغبة الجهات بالتوظيف</span><h3>{pct(stats.wouldHireRate)}</h3></div>
                  <div className="stat-box">
                    <span>الجهات حسب النوع</span>
                    <h3 style={{ fontSize: 15 }}>
                      {Object.entries(stats.organizationsByType || {}).map(([k, v]) => `${ORG_TYPE_AR[k]}: ${v}`).join(' — ') || '—'}
                    </h3>
                  </div>
                </div>
              </section>
            )}

            <section className="section">
              <div className="quick">
                {TABS.slice(1).map((t) => (
                  <button key={t.key} className="quick-item" onClick={() => goTo(t.key)}>
                    <div><h4>{t.label}</h4><p>{t.desc}</p></div>
                    <span className="arrow">←</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {/* ===== طلبات التسجيل ===== */}
        {activeTab === 'requests' && (
          <section className="section">
            <h2 className="section-title">طلبات التسجيل بانتظار الموافقة</h2>
            <p className="muted">
              المشرفون الأكاديميون وجهات التدريب لا يستطيعون الدخول حتى توافق على طلبهم. تحقق من البيانات (ورقم السجل التجاري للمنشآت) قبل القبول.
            </p>
            {pending.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>لا توجد طلبات معلّقة.</p></div>}
            {pending.map((u) => {
              const org = u.orgSupervisor?.organization;
              return (
                <div className="seat-card" key={u.id}>
                  <div className="seat-head">
                    <h4>{u.role === 'ORG_SUPERVISOR' ? '🏢' : '🎓'} {u.name}</h4>
                    <span className="badge pending">{ROLE_AR[u.role]}</span>
                  </div>
                  <ul className="meta">
                    <li>📧 <span dir="ltr">{u.email}</span></li>
                    {u.phone && <li>📞 <span dir="ltr">{u.phone}</span></li>}
                    {u.academicSupervisor && <li>🏛️ الكلية / القسم: {u.academicSupervisor.department || '—'}</li>}
                    {org && (
                      <>
                        <li>🏢 الجهة: {org.name} — {ORG_TYPE_AR[org.type]}{org.sector ? ` (${org.sector})` : ''}</li>
                        <li>📄 رقم السجل التجاري: {org.crNumber || 'لا يوجد'}</li>
                        {u.orgSupervisor.position && <li>👤 المنصب: {u.orgSupervisor.position}</li>}
                      </>
                    )}
                    <li>🕒 تاريخ الطلب: {dateTime(u.createdAt)}</li>
                  </ul>
                  <div className="form-group full" style={{ marginTop: 8 }}>
                    <label>سبب الرفض (اختياري — يظهر للمستخدم عند محاولة الدخول)</label>
                    <input
                      value={rejectReasons[u.id] || ''}
                      onChange={(e) => setRejectReasons({ ...rejectReasons, [u.id]: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="action-btn save" disabled={busy === u.id} onClick={() => approve(u)}>قبول وتفعيل الحساب</button>
                    <button className="action-btn alert" disabled={busy === u.id} onClick={() => reject(u)}>رفض الطلب</button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ===== المستخدمون ===== */}
        {activeTab === 'users' && (
          <section className="section">
            <div className="content-box">
              <h2 className="section-title">المستخدمون</h2>
              <div className="report-form" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>الدور</label>
                  <select value={userFilter.role} onChange={(e) => setUserFilter({ ...userFilter, role: e.target.value })}>
                    <option value="">الكل</option>
                    {Object.entries(ROLE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>الحالة</label>
                  <select value={userFilter.status} onChange={(e) => setUserFilter({ ...userFilter, status: e.target.value })}>
                    <option value="">الكل</option>
                    {Object.entries(STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group full">
                  <label>بحث بالاسم أو البريد</label>
                  <input value={userFilter.search} onChange={(e) => setUserFilter({ ...userFilter, search: e.target.value })} />
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الجهة / القسم</th><th>الحالة</th><th>الإجراء</th></tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td dir="ltr">{u.email}</td>
                        <td>{ROLE_AR[u.role]}</td>
                        <td>
                          {u.orgSupervisor?.organization?.name
                            || u.academicSupervisor?.department
                            || (u.student ? `رقم جامعي ${u.student.universityId}` : '—')}
                        </td>
                        <td>
                          <span className={statusBadge(u.status)}>{STATUS_AR[u.status]}</span>
                          {u.status === 'REJECTED' && u.rejectReason && <small className="muted"> — {u.rejectReason}</small>}
                        </td>
                        <td>
                          {u.id === me?.id ? '—' : u.status === 'PENDING' ? (
                            <button className="action-btn save" onClick={() => goTo('requests')}>مراجعة الطلب</button>
                          ) : (
                            <button className={u.isActive ? 'action-btn alert' : 'action-btn save'} onClick={() => toggleActive(u)}>
                              {u.isActive ? 'إيقاف' : 'تفعيل'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {users.length === 0 && <p className="muted">لا توجد نتائج.</p>}
            </div>
          </section>
        )}

        {/* ===== التكليفات ===== */}
        {activeTab === 'assignments' && (
          <section className="section">
            <h2 className="section-title">طلاب مقبولون بانتظار التكليف</h2>
            <p className="muted">
              بعد أن تقبل جهة التدريب الطالب، حدد مشرفه الأكاديمي ومشرف الجهة لإنشاء التكليف. يصل إشعار للطالب والمشرفَين.
            </p>
            {approvedApps.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>لا يوجد طلاب بانتظار التكليف.</p></div>}
            {approvedApps.map((a) => {
              const form = assignForms[a.id] || {};
              const sups = orgSupervisors[a.opportunity.organizationId] || [];
              return (
                <div className="seat-card" key={a.id}>
                  <div className="seat-head">
                    <h4>🎓 {a.student.user.name} — {a.student.universityId}</h4>
                    <span className="badge">مقبول</span>
                  </div>
                  <p style={{ margin: '4px 0 10px' }}>
                    {a.opportunity.title} — <strong>{a.opportunity.organization.name}</strong>
                    <small className="muted"> (من {dmy(a.opportunity.startDate)} إلى {dmy(a.opportunity.endDate)})</small>
                  </p>
                  <div className="report-form">
                    <div className="form-group">
                      <label>المشرف الأكاديمي</label>
                      <select value={form.academicSupervisorId || ''} onChange={(e) => setForm(a.id, 'academicSupervisorId', e.target.value)}>
                        <option value="">اختر...</option>
                        {academics.map((u) => (
                          <option key={u.academicSupervisor.id} value={u.academicSupervisor.id}>
                            {u.name}{u.academicSupervisor.department ? ` — ${u.academicSupervisor.department}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>مشرف جهة التدريب</label>
                      <select value={form.orgSupervisorId || ''} onChange={(e) => setForm(a.id, 'orgSupervisorId', e.target.value)}>
                        <option value="">اختر...</option>
                        {sups.map((s) => (
                          <option key={s.id} value={s.id}>{s.user.name}{s.position ? ` — ${s.position}` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>الفصل الدراسي</label>
                      <select value={form.semester || SEMESTERS[0]} onChange={(e) => setForm(a.id, 'semester', e.target.value)}>
                        {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>العام الجامعي</label>
                      <input value={form.academicYear ?? '1448'} onChange={(e) => setForm(a.id, 'academicYear', e.target.value)} />
                    </div>
                  </div>
                  <button className="submit-btn" style={{ marginTop: 10 }} onClick={() => createAssignment(a)}>إنشاء التكليف</button>
                </div>
              );
            })}

            <div className="content-box" style={{ marginTop: 24 }}>
              <h2 className="section-title">جميع التكليفات</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr><th>الطالب</th><th>الفرصة / الجهة</th><th>المشرف الأكاديمي</th><th>مشرف الجهة</th><th>الفترة</th><th>الحالة</th><th>الإجراء</th></tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td>{a.student.user.name}</td>
                        <td>{a.opportunity.title}<br /><small className="muted">{a.opportunity.organization.name}</small></td>
                        <td>{a.academicSupervisor.user.name}</td>
                        <td>{a.orgSupervisor.user.name}</td>
                        <td>{dmy(a.startDate)} — {dmy(a.endDate)}</td>
                        <td><span className={a.status === 'CANCELLED' ? 'badge danger' : a.status === 'ACTIVE' ? 'badge pending' : 'badge'}>{ASSIGNMENT_AR[a.status]}</span></td>
                        <td>
                          {a.status === 'ACTIVE' ? (
                            <>
                              <button className="action-btn save" onClick={() => setAssignmentStatus(a, 'COMPLETED')}>إكمال</button>
                              <button className="action-btn alert" onClick={() => setAssignmentStatus(a, 'CANCELLED')}>إلغاء</button>
                            </>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {assignments.length === 0 && <p className="muted">لا توجد تكليفات بعد.</p>}
              <p className="muted" style={{ marginTop: 10 }}>
                عادةً يكتمل التكليف تلقائياً عندما يرصد المشرف الأكاديمي الدرجة النهائية.
              </p>
            </div>
          </section>
        )}

        {/* ===== جهات التدريب ===== */}
        {activeTab === 'organizations' && (
          <section className="section">
            <div className="content-box">
              <h2 className="section-title">جهات التدريب</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr><th>الجهة</th><th>النوع</th><th>التصنيف</th><th>المدينة</th><th>السجل التجاري</th><th>الفرص</th><th>المشرفون</th></tr>
                  </thead>
                  <tbody>
                    {organizations.map((o) => (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td>{ORG_TYPE_AR[o.type]}</td>
                        <td>{o.sector || '—'}</td>
                        <td>{o.city || '—'}</td>
                        <td dir="ltr">{o.crNumber || '—'}</td>
                        <td>{o._count.opportunities}</td>
                        <td>{o._count.supervisors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===== سجل العمليات ===== */}
        {activeTab === 'logs' && (
          <section className="section">
            <div className="content-box">
              <h2 className="section-title">سجل العمليات (آخر 50)</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table">
                  <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>العنصر</th></tr></thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td>{dateTime(l.createdAt)}</td>
                        <td>{l.user ? `${l.user.name} (${ROLE_AR[l.user.role]})` : '—'}</td>
                        <td>{ACTION_AR[l.action] || l.action}</td>
                        <td>{l.entity}{l.entityId ? ` #${l.entityId}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-outline-sm" style={{ marginTop: 10 }} onClick={loadLogs}>تحديث</button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">© منصة التدريب التعاوني — لوحة إدارة النظام</footer>
    </div>
  );
}
