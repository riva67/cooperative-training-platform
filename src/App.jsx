import React, { useState } from 'react';
import './App.css';
import Visits from './visits';
import EvaluationSection from './EvaluationSection';
import coverImg from './assets/COVER.jpeg';

// ===== إعدادات الربط مع المنصة الرئيسية =====
const DEMO_MODE = true; // اجعلها false بعد الربط الفعلي
const LOGIN_API = 'رابط_تسجيل_الدخول'; // يحدده فريق الواجهة الخلفية
// حوّل قيم نوع الجهة القادمة من المنصة الرئيسية إلى العربي (عدّل المفاتيح حسب ما ترجعه المنصة)
const ENTITY_TYPES = { establishment: 'منشأة', educational: 'تعليمية', government: 'حكومية' };

const TABS = [
  { key: 'home', label: 'الرئيسية' },
  { key: 'opportunities', label: 'فرص التدريب', desc: 'أدر الفرص التي قدّمتها جهتك وتابع حالة التقديم عليها.' },
  { key: 'capacity', label: 'المقاعد التدريبية', desc: 'تابع المقاعد المتاحة والشاغرة في جهتك.' },
  { key: 'evaluation', label: 'تقييم المتدرب', desc: 'قيّم حضور المتدربين ومهامهم والتقييم النهائي.' },
  { key: 'visits', label: 'زيارات المشرف', desc: 'وثّق زيارات المشرف الأكاديمي الميدانية.' },
  { key: 'reports', label: 'التقارير', desc: 'أرسل تقارير الزيارات وإنذارات الغياب.' },
];

const emptyOppForm = {
  title: '', company: '', description: '', type: 'تدريب تعاوني', status: 'متاح',
  startDate: '', endDate: '', deadline: '', seats: 1,
  location: '', duration: '', target: '', requirements: '',
};

// البنود الإلزامية قبل النشر
const REQUIRED_FIELDS = {
  title: 'عنوان الفرصة',
  company: 'اسم الجهة',
  description: 'وصف الفرصة',
  startDate: 'تاريخ بداية التدريب',
  endDate: 'تاريخ نهاية التدريب',
  deadline: 'آخر موعد للتقديم',
  location: 'موقع التدريب',
  duration: 'مدة التدريب',
  target: 'الفئة المستهدفة',
  requirements: 'متطلبات الفرصة',
};

const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '');

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState({ name: '', entityType: '' });
  const [loginForm, setLoginForm] = useState({ email: '', password: '', entityType: 'منشأة' });
  const [activeTab, setActiveTab] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [oppFilter, setOppFilter] = useState('الكل');
  const [selectedOppId, setSelectedOppId] = useState(null);
  const [showOppForm, setShowOppForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [oppForm, setOppForm] = useState(emptyOppForm);
  const [formError, setFormError] = useState('');
  const [regForm, setRegForm] = useState({ name: '', major: '' });

  const [students, setStudents] = useState([
    { id: 1, name: 'سارة أحمد', major: 'هندسة برمجيات', universityId: '441001234', phone: '0501234567', email: 'sara@student.edu', attendanceGrade: 30, tasksGrade: 50, finalGrade: 100, notes: 'ملتزمة جدا ومتميزة في المشاريع التقنية' },
    { id: 2, name: 'ريم خالد', major: 'نظم معلومات إدارية', universityId: '441005678', phone: '0559876543', email: 'reem@student.edu', attendanceGrade: 25, tasksGrade: 40, finalGrade: 86, notes: 'تحتاج إلى متابعة في الحضور والالتزام' },
    { id: 3, name: 'نورة العتيبي', major: 'علوم الحاسب', universityId: '441002345', phone: '0551112233', email: 'noura@student.edu', attendanceGrade: 28, tasksGrade: 45, finalGrade: 92, notes: 'مبادرة وتتعلم بسرعة' },
    { id: 4, name: 'العنود السبيعي', major: 'علوم الحاسب', universityId: '441003456', phone: '0562223344', email: 'alanoud@student.edu', attendanceGrade: 27, tasksGrade: 42, finalGrade: 88, notes: 'أداء جيد وتحتاج لتطوير مهارات العرض' },
    { id: 5, name: 'أسماء الغامدي', major: 'هندسة برمجيات', universityId: '441004567', phone: '0503334455', email: 'asma@student.edu', attendanceGrade: 30, tasksGrade: 47, finalGrade: 95, notes: 'ملتزمة بالدوام وتنجز المهام قبل موعدها' },
    { id: 6, name: 'جود المالكي', major: 'علوم الحاسب', universityId: '441006789', phone: '0544445566', email: 'joud@student.edu', attendanceGrade: 22, tasksGrade: 38, finalGrade: 80, notes: 'تحتاج إلى متابعة في تسليم المهام' },
    { id: 7, name: 'شهد العسيري', major: 'أمن سيبراني', universityId: '441007890', phone: '0535556677', email: 'shahad@student.edu', attendanceGrade: 26, tasksGrade: 41, finalGrade: 84, notes: 'مهتمة بالجانب التقني وتتفاعل مع الفريق' },
    { id: 8, name: 'ريما الزهراني', major: 'نظم معلومات صحية', universityId: '441008901', phone: '0576667788', email: 'reema@student.edu', attendanceGrade: 29, tasksGrade: 44, finalGrade: 90, notes: 'منضبطة ومتعاونة مع زميلاتها' },
  ]);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [reportData, setReportData] = useState({ studentId: '', reportType: '', details: '' });

  // كل الفرص (لكل فرصة نوع جهة: منشأة / تعليمية / حكومية)
  const [allOpps, setAllOpps] = useState([
    {
      id: 1, entityType: 'تعليمية', icon: '🏫', title: 'تدريب تعاوني في التعليم العام', company: 'مدرسة ابتدائية آل مطاع والطفولة المبكرة...', type: 'تدريب تعاوني',
      description: 'تدريب ميداني داخل المدرسة يشمل مساندة المعلمات والمشاركة في الأنشطة الصفية.',
      startDate: '2026-11-01', endDate: '2027-02-08',
      requirements: 'الالتزام بالدوام الرسمي، ومهارات تواصل جيدة، واجتياز 60 ساعة دراسية.',
      deadline: '19/10/2026', location: 'القنفذة، العرضية الجنوبية، سبت شمران', duration: '3 أشهر و أسبوع', target: 'الكلية التطبيقية', status: 'متاح', seats: 4,
      applicants: [
        { name: 'سارة أحمد', major: 'هندسة برمجيات', status: 'مقبول' },
        { name: 'ريم خالد', major: 'نظم معلومات إدارية', status: 'مقبول' },
        { name: 'نورة العتيبي', major: 'علوم الحاسب', status: 'قيد المراجعة' },
      ],
    },
    {
      id: 2, entityType: 'منشأة', icon: '📡', title: 'تدريب صيفي إداري وإشراف', company: 'شركة الاتصالات السعودية (stc)', type: 'تدريب صيفي',
      description: 'مساندة الفرق الإدارية في إعداد التقارير ومتابعة المشاريع.',
      startDate: '2026-12-15', endDate: '2027-02-15',
      requirements: 'إجادة برامج أوفيس واللغة الإنجليزية.',
      deadline: '25/11/2026', location: 'أبها، المركز الرئيسي', duration: 'شهرين', target: 'الكلية التطبيقية', status: 'منتهي', seats: 3,
      applicants: [
        { name: 'لمى الشهراني', major: 'إدارة أعمال', status: 'مقبول' },
        { name: 'هند القحطاني', major: 'نظم معلومات إدارية', status: 'مرفوض' },
      ],
    },
    {
      id: 3, entityType: 'منشأة', icon: '💻', title: 'تدريب تعاوني في تطوير الواجهات', company: 'شركة الحلول الرقمية الذكية', type: 'تدريب تعاوني',
      description: 'تطوير واجهات ويب تفاعلية بالتعاون مع فريق التصميم والبرمجة.',
      startDate: '2027-01-05', endDate: '2027-05-05',
      requirements: 'معرفة بـ HTML و CSS و JavaScript، ومعرفة React ميزة إضافية.',
      deadline: '30/11/2026', location: 'أبها، حي المنسك', duration: '4 أشهر', target: 'علوم الحاسب', status: 'متاح', seats: 5,
      applicants: [
        { name: 'العنود السبيعي', major: 'علوم الحاسب', status: 'قيد المراجعة' },
        { name: 'أسماء الغامدي', major: 'هندسة برمجيات', status: 'قيد المراجعة' },
        { name: 'جود المالكي', major: 'علوم الحاسب', status: 'مقبول' },
        { name: 'شهد العسيري', major: 'أمن سيبراني', status: 'قيد المراجعة' },
      ],
    },
    {
      id: 4, entityType: 'حكومية', icon: '🏥', title: 'تدريب تعاوني في إدارة المعلومات الصحية', company: 'مستشفى أبها العام', type: 'تدريب تعاوني',
      description: 'العمل على أنظمة السجلات الطبية الإلكترونية وتحليل بيانات المرضى.',
      startDate: '2027-01-10', endDate: '2027-06-10',
      requirements: 'معدل تراكمي لا يقل عن 3.5، والتعهد بسرية المعلومات.',
      deadline: '10/12/2026', location: 'أبها، الخدمات الطبية', duration: '5 أشهر', target: 'نظم المعلومات', status: 'متاح', seats: 2,
      applicants: [{ name: 'ريما الزهراني', major: 'نظم معلومات صحية', status: 'قيد المراجعة' }],
    },
    {
      id: 5, entityType: 'حكومية', icon: '🏛️', title: 'تدريب تعاوني في التحول الرقمي', company: 'أمانة منطقة عسير وبلدياتها', type: 'تدريب تعاوني',
      description: 'المشاركة في مشاريع الخدمات الرقمية للأمانة والبلديات.',
      startDate: '2027-01-20', endDate: '2027-04-20',
      requirements: 'تخصص تقني، ومهارات في التحليل وكتابة التقارير.',
      deadline: '15/12/2026', location: 'أبها، مقر الأمانة', duration: '3 أشهر', target: 'علوم الحاسب', status: 'متاح', seats: 6,
      applicants: [],
    },
    {
      id: 6, entityType: 'تعليمية', icon: '📊', title: 'تدريب صيفي في تحليل البيانات', company: 'مركز الابتكار وريادة الأعمال', type: 'تدريب صيفي',
      description: 'تحليل بيانات الأعمال وبناء لوحات مؤشرات الأداء.',
      startDate: '2026-07-01', endDate: '2026-08-30',
      requirements: 'معرفة بـ Excel وأساسيات الإحصاء.',
      deadline: '01/10/2026', location: 'خميس مشيط', duration: 'شهرين', target: 'إدارة الأعمال', status: 'منتهي', seats: 2,
      applicants: [
        { name: 'غادة آل سالم', major: 'إدارة أعمال', status: 'مقبول' },
        { name: 'رزان الدوسري', major: 'إدارة أعمال', status: 'مقبول' },
      ],
    },
  ]);

  // الفرص الظاهرة: فقط اللي تخص نوع الجهة المسجّلة
  const opportunities = allOpps.filter((o) => o.entityType === currentUser.entityType);

  // ===== المقاعد: تحسب تلقائياً من المسجلين =====
  const occupiedOf = (o) => o.applicants.filter((a) => a.status !== 'مرفوض').length;
  const availableOf = (o) => Math.max((Number(o.seats) || 0) - occupiedOf(o), 0);
  const totalSeats = opportunities.reduce((s, o) => s + (Number(o.seats) || 0), 0);
  const totalOccupied = opportunities.reduce((s, o) => s + occupiedOf(o), 0);
  const totalAvailable = opportunities.reduce((s, o) => s + availableOf(o), 0);

  const updateOpp = (id, patch) =>
    setAllOpps((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const selectedOpp = opportunities.find((o) => o.id === selectedOppId);

  // ===== حذف فرصة =====
  const deleteOpp = (o) => {
    const ok = window.confirm(`هل أنت متأكد من حذف الفرصة "${o.title}"؟\nسيتم حذف المتقدمين عليها أيضاً ولا يمكن التراجع.`);
    if (!ok) return;
    setAllOpps((list) => list.filter((x) => x.id !== o.id));
    if (selectedOppId === o.id) setSelectedOppId(null);
  };

  const registerStudent = (o) => {
    if (!regForm.name.trim()) { alert('الرجاء إدخال اسم الطالب'); return; }
    if (o.status === 'منتهي') { alert('التقديم على هذه الفرصة منتهي'); return; }
    if (availableOf(o) === 0) { alert('لا توجد مقاعد شاغرة'); return; }
    updateOpp(o.id, {
      applicants: [...o.applicants, { name: regForm.name.trim(), major: regForm.major.trim() || 'غير محدد', status: 'قيد المراجعة' }],
    });
    setRegForm({ name: '', major: '' });
  };

  const changeApplicantStatus = (o, idx, status) => {
    const was = o.applicants[idx].status;
    if (was === 'مرفوض' && status !== 'مرفوض' && availableOf(o) === 0) {
      alert('لا توجد مقاعد شاغرة لإعادة قبول الطالب');
      return;
    }
    updateOpp(o.id, { applicants: o.applicants.map((a, i) => (i === idx ? { ...a, status } : a)) });
  };

  // ===== نشر / تعديل فرصة =====
  const openCreate = () => {
    setEditingId(null);
    setFormError('');
    setOppForm({ ...emptyOppForm, company: currentUser.name });
    setShowOppForm(true);
  };
  const openEdit = (o) => {
    setEditingId(o.id);
    setFormError('');
    setOppForm({
      title: o.title, company: o.company, description: o.description || '', type: o.type, status: o.status,
      startDate: o.startDate || '', endDate: o.endDate || '', deadline: o.deadline, seats: o.seats,
      location: o.location, duration: o.duration, target: o.target, requirements: o.requirements || '',
    });
    setShowOppForm(true);
  };
  const closeOppForm = () => { setShowOppForm(false); setFormError(''); };
  const f = (k) => (e) => setOppForm({ ...oppForm, [k]: e.target.value });

  const saveOpp = (e) => {
    e.preventDefault();

    // 1) كل البنود الإلزامية لازم تكون معبّاة
    const missing = Object.keys(REQUIRED_FIELDS).filter((k) => !String(oppForm[k]).trim());
    if (missing.length > 0) {
      setFormError('لا يمكن نشر الفرصة قبل تعبئة: ' + missing.map((k) => REQUIRED_FIELDS[k]).join('، '));
      return;
    }
    // 2) المقاعد
    if (!(Number(oppForm.seats) > 0)) {
      setFormError('عدد المقاعد يجب أن يكون 1 أو أكثر');
      return;
    }
    // 3) ترتيب التواريخ
    if (oppForm.endDate < oppForm.startDate) {
      setFormError('تاريخ نهاية التدريب يجب أن يكون بعد تاريخ البداية');
      return;
    }

    const data = { ...oppForm, seats: Number(oppForm.seats) };
    if (editingId) {
      updateOpp(editingId, data);
    } else {
      const nextId = Math.max(0, ...allOpps.map((o) => o.id)) + 1;
      // الفرصة الجديدة تأخذ نوع جهة الحساب المسجّل تلقائياً
      setAllOpps([{ id: nextId, icon: '💼', applicants: [], entityType: currentUser.entityType, ...data }, ...allOpps]);
    }
    closeOppForm();
  };

  const avgGrade = students.length
    ? Math.round(students.reduce((sum, s) => sum + Number(s.finalGrade || 0), 0) / students.length)
    : 0;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : hour < 18 ? 'طاب يومك' : 'مساء النور';

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      alert('الرجاء إدخال البريد وكلمة المرور');
      return;
    }
    // وضع التجربة: الاسم من البريد ونوع الجهة من القائمة
    if (DEMO_MODE) {
      setCurrentUser({ name: loginForm.email.split('@')[0], entityType: loginForm.entityType });
      setIsLoggedIn(true);
      return;
    }
    // بعد الربط: الاسم ونوع الجهة يجيبهم السيرفر من حساب المنصة الرئيسية
    try {
      const res = await fetch(LOGIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginForm.email, password: loginForm.password }),
      });
      if (!res.ok) { alert('بيانات الدخول غير صحيحة'); return; }
      const data = await res.json();
      setCurrentUser({
        name: data.name,
        entityType: ENTITY_TYPES[data.entityType] || data.entityType,
      });
      setIsLoggedIn(true);
    } catch {
      alert('تعذر الاتصال بالخادم');
    }
  };

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

  // شاشة تسجيل الدخول
  if (!isLoggedIn) {
    return (
      <div className="portal-wrapper" dir="rtl">
        <GovBar />
        <div className="login-container">
          <div className="login-card">
            <h2>تسجيل الدخول - بوابة جهة التدريب</h2>
            <p>منصة إدارة التدريب التعاوني: أدخل بيانات الحساب للوصول إلى لوحة التحكم</p>
            <form onSubmit={handleLogin} className="login-form">
              <div className="input-group">
                <label>البريد الإلكتروني</label>
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="input-group">
                <label>كلمة المرور</label>
                <input
                  type="password"
                  placeholder="********"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  required
                />
              </div>
              {DEMO_MODE && (
                <div className="input-group">
                  <label>نوع الجهة (للتجربة فقط)</label>
                  <select
                    value={loginForm.entityType}
                    onChange={(e) => setLoginForm({ ...loginForm, entityType: e.target.value })}
                  >
                    <option>منشأة</option>
                    <option>تعليمية</option>
                    <option>حكومية</option>
                  </select>
                </div>
              )}
              <button type="submit" className="login-submit-btn">تسجيل الدخول</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const OppCard = ({ item }) => (
    <div className="card opp-card">
      <div className={item.status === 'متاح' ? 'ribbon' : 'ribbon late'} />
      <div className="card-head">
        <span className={item.status === 'متاح' ? 'badge' : 'badge pending'}>
          {item.status === 'متاح' ? 'التقديم متاح' : 'التقديم منتهي'}
        </span>
        <div className="logo-circle">{item.icon}</div>
      </div>
      <h3>{item.title}</h3>
      <div className="entity">{item.company}</div>
      <div className="tags">
        <span className="tag">ينتهي التقديم في {item.deadline}</span>
        <span className="tag">{item.type}</span>
        <span className="tag">🪑 {availableOf(item)} / {item.seats} مقعد شاغر</span>
      </div>
      <ul className="meta">
        <li>📍 موقع التدريب : {item.location}</li>
        <li>⏳ مدة التدريب : {item.duration}</li>
        {item.startDate && item.endDate && (
          <li>🗓️ من {fmtDate(item.startDate)} إلى {fmtDate(item.endDate)}</li>
        )}
        <li>👥 مخصص لطلاب {item.target}</li>
      </ul>
      <div className="card-actions">
        <button className="btn btn-primary" onClick={() => setSelectedOppId(item.id)}>
          عرض التفاصيل
        </button>
        <button className="btn btn-outline-sm" onClick={() => openEdit(item)}>
          تعديل الفرصة
        </button>
        <button className="btn btn-danger-sm" onClick={() => deleteOpp(item)}>
          حذف الفرصة
        </button>
      </div>
    </div>
  );

  const emptyOpps = (
    <div className="card">
      <p className="muted" style={{ margin: 0 }}>
        لا توجد فرص مقدمة لجهات ({currentUser.entityType}) حالياً. يمكنك نشر فرصة جديدة.
      </p>
    </div>
  );

  const filteredOpps = opportunities.filter(
    (o) => oppFilter === 'الكل' || o.status === oppFilter
  );

  const statusClass = (s) => (s === 'مقبول' ? 'badge' : s === 'مرفوض' ? 'badge danger' : 'badge pending');

  const Req = () => <span className="req">*</span>;

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
              <strong>بوابة جهة التدريب</strong>
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
            <button
              className="logout-btn"
              onClick={() => { setIsLoggedIn(false); setCurrentUser({ name: '', entityType: '' }); }}
            >
              خروج
            </button>
          </nav>
        </div>
      )}

      <main className="portal-content">
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
                <div><div className="stat-icon">🎓</div><div className="stat-num">{students.length}</div><div className="stat-label">متدربة حالياً</div></div>
                <div><div className="stat-icon">🪑</div><div className="stat-num">{totalAvailable}</div><div className="stat-label">مقعد شاغر</div></div>
                <div><div className="stat-icon">⭐</div><div className="stat-num">{avgGrade}</div><div className="stat-label">متوسط التقييم</div></div>
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
                <div className="stat-box"><span>إجمالي المقاعد</span><h3>{totalSeats} مقاعد</h3></div>
                <div className="stat-box"><span>المقاعد المحجوزة</span><h3>{totalOccupied} مقعد</h3></div>
                <div className="stat-box green"><span>المقاعد الشاغرة</span><h3>{totalAvailable} مقعد شاغر</h3></div>
              </div>
              <p className="muted" style={{ marginTop: 14 }}>
                تتحدث المقاعد الشاغرة تلقائياً كلما سُجّل طالب على الفرصة.
              </p>
            </div>

            {opportunities.map((o) => {
              const occ = occupiedOf(o);
              const fill = Number(o.seats) ? Math.min(Math.round((occ / Number(o.seats)) * 100), 100) : 0;
              return (
                <div className="seat-card" key={o.id}>
                  <div className="seat-head">
                    <h4>{o.icon} {o.title}</h4>
                    <span className={o.status === 'متاح' ? 'badge' : 'badge pending'}>{o.status}</span>
                  </div>
                  <div className="seat-edit">
                    <label>عدد المقاعد</label>
                    <input
                      type="number"
                      min="0"
                      value={o.seats}
                      onChange={(e) => updateOpp(o.id, { seats: e.target.value === '' ? '' : Math.max(Number(e.target.value), 0) })}
                    />
                  </div>
                  <div className="seat-nums">
                    <div><b>{o.applicants.length}</b><span>المسجلون</span></div>
                    <div><b>{occ}</b><span>محجوزة</span></div>
                    <div className="free"><b>{availableOf(o)}</b><span>شاغرة</span></div>
                  </div>
                  <div className="progress"><div style={{ width: `${fill}%` }} /></div>
                  <button className="btn btn-outline-sm" style={{ marginTop: 10 }} onClick={() => setSelectedOppId(o.id)}>
                    إدارة المسجلين
                  </button>
                </div>
              );
            })}
          </section>
        )}

        {activeTab === 'evaluation' && (
          <section className="section">
            <EvaluationSection students={students} setStudents={setStudents} />
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
              <h2 className="section-title">نموذج الزيارة الميدانية وإرسال التقارير</h2>
              <form
                onSubmit={(e) => { e.preventDefault(); alert('تم إرسال التقرير بنجاح'); }}
              >
                <div className="form-group">
                  <label>المتدربة</label>
                  <select
                    value={reportData.studentId}
                    onChange={(e) => setReportData({ ...reportData, studentId: e.target.value })}
                  >
                    <option value="">اختر المتدربة...</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>نوع التقرير</label>
                  <select
                    value={reportData.reportType}
                    onChange={(e) => setReportData({ ...reportData, reportType: e.target.value })}
                  >
                    <option value="">اختر النوع...</option>
                    <option value="warning">إنذار غياب</option>
                    <option value="report">زيارة</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>التفاصيل</label>
                  <textarea
                    rows="3"
                    value={reportData.details}
                    onChange={(e) => setReportData({ ...reportData, details: e.target.value })}
                  />
                </div>
                <button type="submit" className="submit-btn">إرسال التقرير</button>
              </form>
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
            <p className="muted" style={{ margin: '6px 0 0' }}>جميع البنود المعلّمة بـ (*) مطلوبة قبل النشر.</p>
            <form onSubmit={saveOpp} noValidate className="report-form" style={{ marginTop: 14 }}>
              <div className="form-group full">
                <label>عنوان الفرصة <Req /></label>
                <input value={oppForm.title} onChange={f('title')} placeholder="مثال: تدريب تعاوني في تطوير الويب" />
              </div>
              <div className="form-group full">
                <label>اسم الجهة <Req /></label>
                <input value={oppForm.company} onChange={f('company')} placeholder="اسم الشركة أو المؤسسة" />
              </div>
              <div className="form-group full">
                <label>وصف الفرصة <Req /></label>
                <textarea rows="3" value={oppForm.description} onChange={f('description')} placeholder="اكتب وصفاً مختصراً لطبيعة التدريب والمهام" />
              </div>
              <div className="form-group">
                <label>نوع التدريب</label>
                <select value={oppForm.type} onChange={f('type')}>
                  <option>تدريب تعاوني</option>
                  <option>تدريب صيفي</option>
                </select>
              </div>
              <div className="form-group">
                <label>حالة التقديم</label>
                <select value={oppForm.status} onChange={f('status')}>
                  <option value="متاح">متاح</option>
                  <option value="منتهي">منتهي</option>
                </select>
              </div>
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
                <input value={oppForm.deadline} onChange={f('deadline')} placeholder="19/10/2026" />
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
                <label>مدة التدريب <Req /></label>
                <input value={oppForm.duration} onChange={f('duration')} placeholder="3 أشهر" />
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
                <button type="submit" className="submit-btn">
                  {editingId ? 'حفظ التعديلات' : 'نشر الفرصة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل الفرصة التدريبية */}
      {selectedOpp && (() => {
        const occ = occupiedOf(selectedOpp);
        const avail = availableOf(selectedOpp);
        const fill = Number(selectedOpp.seats) ? Math.min(Math.round((occ / Number(selectedOpp.seats)) * 100), 100) : 0;
        return (
          <div className="modal-bg" onClick={() => setSelectedOppId(null)}>
            <div className="modal-box opp-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-top">
                <div>
                  <span className={selectedOpp.status === 'متاح' ? 'badge' : 'badge pending'}>
                    {selectedOpp.status === 'متاح' ? 'التقديم متاح' : 'التقديم منتهي'}
                  </span>
                  <h3 style={{ marginTop: 10 }}>{selectedOpp.icon} {selectedOpp.title}</h3>
                  <div className="entity" style={{ marginBottom: 0 }}>{selectedOpp.company}</div>
                </div>
                <button className="modal-close" onClick={() => setSelectedOppId(null)}>✕</button>
              </div>

              <div className="detail-stats">
                <div className="detail-stat"><b>{selectedOpp.seats}</b><span>إجمالي المقاعد</span></div>
                <div className="detail-stat"><b>{selectedOpp.applicants.length}</b><span>الطلاب المسجلون</span></div>
                <div className="detail-stat"><b>{avail}</b><span>مقاعد شاغرة</span></div>
              </div>

              <div className="progress"><div style={{ width: `${fill}%` }} /></div>
              <small className="muted">تم حجز {occ} من {selectedOpp.seats} مقعد ({fill}%)</small>

              {selectedOpp.description && (
                <>
                  <h4 className="detail-title" style={{ marginTop: 16 }}>وصف الفرصة</h4>
                  <p className="desc-text">{selectedOpp.description}</p>
                </>
              )}

              <ul className="meta detail-list">
                <li>📌 {selectedOpp.type}</li>
                {selectedOpp.startDate && selectedOpp.endDate && (
                  <li>🗓️ فترة التدريب: من {fmtDate(selectedOpp.startDate)} إلى {fmtDate(selectedOpp.endDate)}</li>
                )}
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

              <h4 className="detail-title">الطلاب المسجلون ({selectedOpp.applicants.length})</h4>
              {selectedOpp.applicants.length === 0 ? (
                <p className="muted">لا يوجد طلاب مسجلون على هذه الفرصة حتى الآن.</p>
              ) : (
                selectedOpp.applicants.map((a, i) => (
                  <div className="applicant" key={i}>
                    <div>
                      <strong>{a.name}</strong>
                      <small>{a.major}</small>
                    </div>
                    <select
                      className={statusClass(a.status)}
                      value={a.status}
                      onChange={(e) => changeApplicantStatus(selectedOpp, i, e.target.value)}
                    >
                      <option>قيد المراجعة</option>
                      <option>مقبول</option>
                      <option>مرفوض</option>
                    </select>
                  </div>
                ))
              )}

              <h4 className="detail-title" style={{ marginTop: 16 }}>تسجيل طالب جديد</h4>
              <div className="reg-form">
                <input placeholder="اسم الطالب" value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} />
                <input placeholder="التخصص" value={regForm.major} onChange={(e) => setRegForm({ ...regForm, major: e.target.value })} />
                <button className="btn btn-primary" onClick={() => registerStudent(selectedOpp)}>تسجيل الطالب</button>
              </div>

              <button className="btn-danger-block" onClick={() => deleteOpp(selectedOpp)}>حذف الفرصة</button>
              <button className="submit-btn" style={{ marginTop: 10 }} onClick={() => setSelectedOppId(null)}>إغلاق</button>
            </div>
          </div>
        );
      })()}

      {selectedStudent && (
        <div className="modal-bg">
          <div className="modal-box">
            <h3>ملف المتدربة: {selectedStudent.name}</h3>
            <p><strong>التخصص:</strong> {selectedStudent.major}</p>
            <p><strong>الرقم الجامعي:</strong> {selectedStudent.universityId}</p>
            <p><strong>البريد:</strong> {selectedStudent.email}</p>
            <p><strong>الجوال:</strong> {selectedStudent.phone}</p>
            <p><strong>التقييم الشامل:</strong> {selectedStudent.finalGrade} / 100</p>
            <p><strong>ملاحظات:</strong> {selectedStudent.notes}</p>
            <button className="submit-btn" onClick={() => setSelectedStudent(null)}>إغلاق</button>
          </div>
        </div>
      )}

      <footer className="footer">© منصة التدريب التعاوني — بوابة جهة التدريب</footer>
    </div>
  );
}