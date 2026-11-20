import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Login from './Login';
import { api, getSavedUser, clearSession, consumeHashSession } from './api';
import { 
  Clock, CheckCircle2, FileText, Building2, Calendar, 
  AlertCircle, Upload, Image as ImageIcon, Plus, Trash2,
  LogIn, LogOut, CheckSquare, Send, X, MapPin, AlertTriangle, FileCheck, Eye,
  Briefcase, Printer
} from 'lucide-react';

const TOTAL_TRAINING_HOURS = 280; // إجمالي ساعات التدريب المطلوبة
const REQUIRED_DAILY_HOURS = 6;   // الحد الأدنى لساعات العمل اليومية
const daysArabic = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const ATTENDANCE_STATUS_AR = { PRESENT: 'حاضر', LATE: 'متأخر', ABSENT: 'غائب', EXCUSED: 'غائب بعذر' };
const REPORT_STATUS_AR = { DRAFT: 'مسودة', SUBMITTED: 'قيد المراجعة', APPROVED: 'مقبول', REJECTED: 'مرفوض' };
const REPORT_NOTE_AR = {
  DRAFT: 'لم يتم تسليم التقرير بعد.',
  SUBMITTED: 'تم التسليم وفي انتظار مراجعة المشرف.',
  APPROVED: 'تم اعتماد التقرير من المشرف.',
  REJECTED: 'تم رفض التقرير، يرجى مراجعة المشرف وإعادة التسليم.',
};
const APPLICATION_STATUS = {
  PENDING: { label: 'قيد المراجعة', cls: 'bg-amber-50 text-amber-600' },
  NOMINATED: { label: 'مرشّح من الجامعة', cls: 'bg-blue-50 text-blue-600' },
  APPROVED: { label: 'مقبول', cls: 'bg-emerald-50 text-emerald-600' },
  REJECTED: { label: 'مرفوض', cls: 'bg-rose-50 text-rose-600' },
};

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

function timeAgo(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

// Opens the related tab when a notification is clicked (the backend sends its messages in English)
function tabForNotification(message) {
  const m = message.toLowerCase();
  if (m.includes('report')) return 'reports';
  if (m.includes('attendance')) return 'attendance';
  if (m.includes('application') || m.includes('nominated') || m.includes('opportunit')) return 'opportunities';
  return null;
}

// Working days (Sunday-Thursday) from the start of the training until yesterday with NO attendance record
function missingWorkdays(startIso, endIso, recordDates, todayStr, maxDays = 14) {
  const out = [];
  const start = new Date(`${startIso.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${endIso.slice(0, 10)}T00:00:00Z`);
  const yesterday = new Date(`${todayStr}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const last = yesterday < end ? yesterday : end;
  for (let d = new Date(last); d >= start && out.length < maxDays; d.setUTCDate(d.getUTCDate() - 1)) {
    const dow = d.getUTCDay();
    if (dow === 5 || dow === 6) continue; // Friday / Saturday
    const ds = d.toISOString().slice(0, 10);
    if (!recordDates.has(ds)) out.push(ds);
  }
  return out;
}

export default function App() {
  const [user, setUser] = useState(() => {
    consumeHashSession(); // signed in from the main portal?
    return getSavedUser();
  });

  // the token expired or was rejected -> back to the login screen
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  if (!user) return <Login onLogin={setUser} />;
  return <Portal key={user.id} user={user} onLogout={handleLogout} />;
}

function Portal({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');

  // ================= البيانات القادمة من الـ backend =================
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [attendanceItems, setAttendanceItems] = useState([]);
  const [reportsRaw, setReportsRaw] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [opportunities, setOpportunities] = useState([]);
  const [applications, setApplications] = useState([]);
  const [letter, setLetter] = useState(null);

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  const refreshAttendance = useCallback(async (assignmentId) => {
    const { items } = await api.attendance(assignmentId);
    setAttendanceItems(items);
  }, []);
  const refreshReports = useCallback(async () => {
    const { items } = await api.reports();
    setReportsRaw(items);
  }, []);
  const refreshNotifications = useCallback(async () => {
    const data = await api.notifications();
    setNotifications(data.items);
    setUnreadCount(data.unreadCount);
  }, []);
  const refreshApplications = useCallback(async () => {
    const { items } = await api.myApplications();
    setApplications(items);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [assignmentsRes, oppRes] = await Promise.all([api.assignments(), api.openOpportunities()]);
      const current = assignmentsRes.items.find((a) => a.status === 'ACTIVE') || assignmentsRes.items[0] || null;
      setAssignment(current);
      setOpportunities(oppRes.items);
      await Promise.all([
        refreshReports(),
        refreshNotifications(),
        refreshApplications(),
        current ? refreshAttendance(current.id) : Promise.resolve(),
      ]);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [refreshReports, refreshNotifications, refreshApplications, refreshAttendance]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // new notifications appear automatically (checked every minute)
  useEffect(() => {
    const timer = setInterval(() => refreshNotifications().catch(() => {}), 60000);
    return () => clearInterval(timer);
  }, [refreshNotifications]);

  // Requests the backend has no structured endpoint for (forgotten check-out fix, absence excuse)
  // are sent to the academic supervisor as a message. We remember which days were already sent.
  const requestsKey = `coop_requests_${user.id}`;
  const [requests, setRequests] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(requestsKey)) || { fix: [], excuse: [] };
    } catch {
      return { fix: [], excuse: [] };
    }
  });
  const addRequests = (kind, dates) => {
    setRequests((prev) => {
      const next = { ...prev, [kind]: [...new Set([...prev[kind], ...dates])] };
      localStorage.setItem(requestsKey, JSON.stringify(next));
      return next;
    });
  };

  const sendToSupervisor = async (subject, body, file) => {
    const recipientId = assignment?.academicSupervisor?.user?.id;
    if (!recipientId) throw new Error('لا يوجد مشرف أكاديمي مرتبط بتدريبك حالياً.');
    let attachmentId;
    if (file) attachmentId = (await api.uploadAttachment(file)).id;
    await api.sendMessage({ recipientId, subject, body, ...(attachmentId && { attachmentId }) });
  };

  // --- 1. حالة توثيق الأنشطة والصور الفعلية (محلية فقط - لا يوجد endpoint لها في الـ backend بعد) ---
  const [activities, setActivities] = useState([
    {
      id: 1,
      title: 'إعداد وتجهيز الخوادم ورَبْط الشبكة الداخلية',
      date: '2026-10-08',
      category: 'شبكات وبنية تحتية',
      imageUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=60',
      description: 'تم ربط السيرفرات وإعداد العناوين وتجربة الاتصال بنجاح مع الفريق.'
    }
  ]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(URL.createObjectURL(file));
    }
  };

  const handleAddActivity = (e) => {
    e.preventDefault();
    if (!newTitle) return;
    const newAct = {
      id: Date.now(),
      title: newTitle,
      date: new Date().toISOString().split('T')[0],
      category: 'توثيق ميداني',
      imageUrl: selectedImage || 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=600&auto=format&fit=crop&q=60',
      description: newDesc || 'تم إنجاز هذا النشاط وتوثيقه بنجاح.'
    };
    setActivities([newAct, ...activities]);
    setNewTitle('');
    setNewDesc('');
    setSelectedImage(null);
  };

  // --- 2. سجل الحضور والغياب والانصراف (من الـ backend) ---
  const attendanceLog = useMemo(() => {
    const rows = attendanceItems.map((r) => {
      const date = r.date.slice(0, 10);
      const day = daysArabic[new Date(`${date}T00:00:00Z`).getUTCDay()];
      const checkIn = r.checkIn ? formatTime(r.checkIn) : '-';
      const worked = r.checkIn && r.checkOut ? (new Date(r.checkOut) - new Date(r.checkIn)) / 36e5 : null;

      let status;
      let checkOut;
      let hours;
      let note;

      const forgotCheckOut =
        r.checkIn && !r.checkOut && date < todayStr && (r.status === 'PRESENT' || r.status === 'LATE');

      if (forgotCheckOut) {
        status = requests.fix.includes(date) ? 'قيد مراجعة المشرف' : 'نسيان انصراف';
        note = requests.fix.includes(date) ? 'تم إرسال طلب اعتماد الانصراف للمشرف' : 'يتطلب تقديم طلب تصحيح للمشرف';
        checkOut = 'غير مسجل ⚠️';
        hours = 'معلق';
      } else if (r.checkIn && !r.checkOut && date === todayStr) {
        status = 'قيد العمل';
        note = 'لم يتم تسجيل الانصراف بعد';
        checkOut = '-';
        hours = 'جارٍ';
      } else {
        status = ATTENDANCE_STATUS_AR[r.status] || r.status;
        if (r.status === 'ABSENT' && requests.excuse.includes(date)) status = 'غائب بعذر (قيد المراجعة)';
        checkOut = r.checkOut ? formatTime(r.checkOut) : '-';
        hours = worked !== null ? `${worked.toFixed(1)} ساعة` : '-';
        if (r.status === 'LATE') note = 'تأخر عن موعد الحضور';
        else if (r.status === 'EXCUSED') note = 'اعتمد المشرف العذر';
        else if (r.status === 'ABSENT') note = 'لم يتم تسجيل حضور - متاح تقديم عذر';
        else if (worked !== null && worked < REQUIRED_DAILY_HOURS) note = `أقل من الحد الأدنى (${REQUIRED_DAILY_HOURS} ساعات)`;
        else note = 'مكتمل - نطاق الجامعة';
      }

      return { id: `a${r.id}`, day, date, checkIn, checkOut, hours, status, note };
    });

    // working days with no record at all are absences
    const recordDates = new Set(attendanceItems.map((r) => r.date.slice(0, 10)));
    const absentRows = assignment
      ? missingWorkdays(assignment.startDate, assignment.endDate, recordDates, todayStr).map((date) => {
          const excused = requests.excuse.includes(date);
          return {
            id: `m${date}`,
            day: daysArabic[new Date(`${date}T00:00:00Z`).getUTCDay()],
            date,
            checkIn: '-',
            checkOut: '-',
            hours: '0 ساعات',
            status: excused ? 'غائب بعذر (قيد المراجعة)' : 'غائب',
            note: excused ? 'تم إرسال العذر للمشرف' : 'لم يتم تسجيل حضور - متاح تقديم عذر',
          };
        })
      : [];

    return [...rows, ...absentRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceItems, assignment, requests, todayStr]);

  const todayRecord = attendanceItems.find((r) => r.date.slice(0, 10) === todayStr) || null;
  const todayCheckedIn = Boolean(todayRecord?.checkIn && !todayRecord?.checkOut);
  const todayDone = Boolean(todayRecord?.checkIn && todayRecord?.checkOut);
  const checkInTime = todayRecord?.checkIn ? formatTime(todayRecord.checkIn) : null;
  const checkInTimestamp = todayRecord?.checkIn ? new Date(todayRecord.checkIn).getTime() : null;
  const hasPendingForgotCheckout = attendanceLog.some((item) => item.status === 'نسيان انصراف');

  const workedHours = attendanceItems.reduce(
    (sum, r) => (r.checkIn && r.checkOut ? sum + (new Date(r.checkOut) - new Date(r.checkIn)) / 36e5 : sum),
    0
  );
  const hoursProgress = Math.min(100, Math.round((workedHours / TOTAL_TRAINING_HOURS) * 100));

  const [isWithinCampus, setIsWithinCampus] = useState(true);

  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionReason, setPermissionReason] = useState('');
  
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotOutTime, setForgotOutTime] = useState('02:00 م');
  const [forgotReason, setForgotReason] = useState('');
  const [forgotProof, setForgotProof] = useState(null);

  const handleCheckIn = async () => {
    if (!assignment) {
      alert('⚠️ لا يوجد تدريب مسجل لك حالياً. قدّم على فرصة تدريبية أولاً.');
      return;
    }
    if (hasPendingForgotCheckout) {
      alert('⚠️ لديك يوم سابق غير مغلق بالانصراف! يرجى تقديم طلب تصحيح انصراف أولاً.');
      return;
    }
    if (!isWithinCampus) {
      alert('⚠️ يرجى التواجد داخل نطاق الجامعة / مقر التدريب لتسجيل الحضور.');
      return;
    }
    setBusy(true);
    try {
      await api.checkIn(assignment.id);
      await refreshAttendance(assignment.id);
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doCheckOut = async () => {
    await api.checkOut(assignment.id);
    await refreshAttendance(assignment.id);
  };

  const handleCheckOut = async () => {
    if (!todayCheckedIn) return;
    const hoursPassed = (Date.now() - checkInTimestamp) / (1000 * 60 * 60);

    if (hoursPassed < REQUIRED_DAILY_HOURS) {
      setShowPermissionModal(true);
      return;
    }

    setBusy(true);
    try {
      await doCheckOut();
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSendPermission = async (e) => {
    e.preventDefault();
    if (!permissionReason) return;
    setBusy(true);
    try {
      await doCheckOut();
      try {
        await sendToSupervisor(
          'طلب استئذان / انصراف مبكر',
          `الطالب: ${user.name}\nالتاريخ: ${todayStr}\nسبب الانصراف المبكر: ${permissionReason}`
        );
      } catch (err) {
        alert(`تم تسجيل الانصراف لكن تعذر إرسال الاستئذان للمشرف: ${err.message}`);
      }
      setShowPermissionModal(false);
      setPermissionReason('');
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSendForgotCorrection = async (e) => {
    e.preventDefault();
    if (!forgotReason) return;
    const dates = attendanceLog.filter((item) => item.status === 'نسيان انصراف').map((item) => item.date);
    if (dates.length === 0) return;

    setBusy(true);
    try {
      await sendToSupervisor(
        'طلب اعتماد انصراف (نسيان تسجيل الانصراف)',
        `الطالب: ${user.name}\nالأيام: ${dates.join('، ')}\nوقت الانصراف الفعلي/التقديري: ${forgotOutTime}\nسبب النسيان: ${forgotReason}`,
        forgotProof
      );
      addRequests('fix', dates);
      setShowForgotModal(false);
      setForgotReason('');
      setForgotProof(null);
      alert('✅ تم إرسال طلب اعتماد الانصراف وإثبات الحضور للمشرف بنجاح!');
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExcuse = async (log) => {
    const reason = prompt('يرجى كتابة سبب/عذر الغياب للمشرف:');
    if (!reason) return;
    try {
      await sendToSupervisor('عذر غياب', `الطالب: ${user.name}\nتاريخ الغياب: ${log.date}\nالعذر: ${reason}`);
      addRequests('excuse', [log.date]);
      alert('✅ تم إرسال عذر الغياب للمشرف بنجاح!');
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    }
  };

  // --- 3. التقارير الأسبوعية (من الـ backend) ---
  const reports = useMemo(
    () =>
      reportsRaw
        .filter((r) => r.type !== 'APPROVAL')
        .map((r) => ({
          id: r.id,
          week: r.title,
          date: r.createdAt.slice(0, 10),
          status: REPORT_STATUS_AR[r.status] || r.status,
          notes: REPORT_NOTE_AR[r.status] || '',
          content: r.content,
        })),
    [reportsRaw]
  );
  const [repWeek, setRepWeek] = useState('');
  const [repContent, setRepContent] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);

  const handleAddReport = async (e) => {
    e.preventDefault();
    if (!repWeek || !repContent) return;
    if (!assignment) {
      alert('⚠️ لا يوجد تدريب مسجل لك حالياً لإرسال التقرير.');
      return;
    }
    setBusy(true);
    try {
      await api.submitReport({ assignmentId: assignment.id, type: 'WEEKLY', title: repWeek, content: repContent });
      await refreshReports();
      setRepWeek('');
      setRepContent('');
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // --- 4. حالة المهام ومعاينتها (بيانات تجريبية - لا يوجد endpoint للمهام في الـ backend بعد) ---
  const [tasks, setTasks] = useState([
    {
      id: 1,
      title: 'مراجعة كود واجهات المستخدم RTL',
      date: '2026-10-09',
      status: 'مكتملة ✅',
      supervisor: 'أ. أسامة القحطاني',
      description: 'التأكد من دعم اللغة العربية بالكامل والتجاوب مع جميع الشاشات والهواتف الذكية وتعديل تنسيقات CSS.'
    },
    {
      id: 2,
      title: 'اختبار ربط قاعدة البيانات وقواعد SQL',
      date: '2026-10-11',
      status: 'قيد التنفيذ ⏳',
      supervisor: 'أ. أسامة القحطاني',
      description: 'تنفيذ الاستعلامات وحساب المتوسطات والنسب للإحصائيات والتأكد من سرعة استجابة قاعدة البيانات.'
    },
    {
      id: 3,
      title: 'إعداد العرض التقديمي للتقرير النهائي',
      date: '2026-10-06',
      status: 'مكتملة ✅',
      supervisor: 'د. عبدالمجيد الغامدي',
      description: 'تجهيز الشرائح وشرح المخرجات والنتائج الإحصائية لعرضها في المناقشة الميدانية والأكاديمية.'
    }
  ]);
  const [selectedTask, setSelectedTask] = useState(null);

  // --- 5. فرص التدريب وطلباتي ---
  const appliedIds = new Set(applications.map((a) => a.opportunityId));

  const handleApply = async (opportunityId) => {
    setBusy(true);
    try {
      await api.apply(opportunityId);
      await refreshApplications();
      alert('✅ تم إرسال طلب التدريب بنجاح!');
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // --- 6. الإشعارات ---
  const handleOpenNotification = (n) => {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      api.markRead(n.id).catch(() => refreshNotifications().catch(() => {}));
    }
    const tab = tabForNotification(n.message);
    if (tab) setActiveTab(tab);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllRead();
      await refreshNotifications();
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    }
  };

  // --- 7. خطاب التدريب ---
  const handleOpenLetter = async () => {
    try {
      setLetter(await api.letter(assignment.id));
    } catch (err) {
      alert(`⚠️ ${err.message}`);
    }
  };

  // قيم الواجهة
  const orgName = assignment?.opportunity?.organization?.name || '—';
  const opportunityTitle = assignment?.opportunity?.title || '—';
  const orgSupervisorName = assignment?.orgSupervisor?.user?.name || '—';
  const academicSupervisorName = assignment?.academicSupervisor?.user?.name || '—';
  const semesterLabel =
    [assignment?.semester, assignment?.academicYear].filter(Boolean).join(' - ') || 'التدريب التعاوني';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
        جاري تحميل بياناتك...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl border border-slate-100 shadow-sm p-6 text-center space-y-4">
          <AlertTriangle size={32} className="text-amber-500 mx-auto" />
          <p className="text-sm text-slate-700">{loadError}</p>
          <div className="flex justify-center gap-2">
            <button onClick={loadAll} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-5 py-2 rounded-xl transition">
              إعادة المحاولة
            </button>
            <button onClick={onLogout} className="text-slate-500 hover:bg-slate-100 text-xs font-medium px-5 py-2 rounded-xl transition">
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* القائمة الجانبية */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} unreadCount={unreadCount} onLogout={onLogout} />

      {/* المحتوى الرئيسي */}
      <main className="flex-1 mr-64 p-8">
        
        {/* الترويسة */}
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">مرحباً بك، {user.name} 👋</h1>
            <p className="text-slate-500 text-sm mt-1">نظام بوابة التدريب التعاوني الميداني التفاعلي.</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2 text-slate-600 text-sm">
            <Calendar size={18} className="text-blue-600" />
            <span>{semesterLabel}</span>
          </div>
        </header>

        {/* 1. الرئيسية (Dashboard) */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-500 text-sm font-medium">ساعات التدريب</span>
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Clock size={22} /></div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-800">{Math.round(workedHours)}</span>
                  <span className="text-slate-400 text-sm">/ {TOTAL_TRAINING_HOURS} ساعة</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${hoursProgress}%` }}></div>
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('reports')} 
                className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm cursor-pointer hover:border-emerald-300 hover:shadow-md transition duration-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-500 text-sm font-medium">التقارير المرفوعة</span>
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><FileText size={22} /></div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-800">{reports.length}</span>
                  <span className="text-slate-400 text-sm">تقارير أسبوعية</span>
                </div>
                <p className="text-emerald-600 text-xs mt-4 flex items-center gap-1">
                  <CheckCircle2 size={14} /> اضغطي للانتقال للتقارير ←
                </p>
              </div>

              <div 
                onClick={() => setActiveTab('activities')} 
                className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm cursor-pointer hover:border-purple-300 hover:shadow-md transition duration-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-500 text-sm font-medium">الأنشطة الموثقة بالصور</span>
                  <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><ImageIcon size={22} /></div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-800">{activities.length}</span>
                  <span className="text-slate-400 text-sm">إثباتات مصورة</span>
                </div>
                <p className="text-purple-600 text-xs mt-4 flex items-center gap-1">
                  اضغطي للانتقال لصفحة الأنشطة ←
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Building2 className="text-blue-600" size={20} />
                    معلومات جهة التدريب
                  </h2>
                  {assignment && (
                    <button
                      onClick={handleOpenLetter}
                      className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                    >
                      <FileText size={14} /> خطاب التدريب
                    </button>
                  )}
                </div>
                {!assignment && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4">
                    لم يتم تعيينك في جهة تدريب بعد. قدّم على فرصة تدريبية من صفحة{' '}
                    <button onClick={() => setActiveTab('opportunities')} className="font-bold underline">فرص التدريب وطلباتي</button>.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-4 bg-slate-50 rounded-xl"><span className="text-slate-400 block text-xs mb-1">الجهة</span><span className="font-semibold text-slate-700">{orgName}</span></div>
                  <div className="p-4 bg-slate-50 rounded-xl"><span className="text-slate-400 block text-xs mb-1">الفرصة التدريبية</span><span className="font-semibold text-slate-700">{opportunityTitle}</span></div>
                  <div className="p-4 bg-slate-50 rounded-xl"><span className="text-slate-400 block text-xs mb-1">المشرف الميداني</span><span className="font-semibold text-slate-700">{orgSupervisorName}</span></div>
                  <div className="p-4 bg-slate-50 rounded-xl"><span className="text-slate-400 block text-xs mb-1">المشرف الأكاديمي</span><span className="font-semibold text-slate-700">{academicSupervisorName}</span></div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <AlertCircle className="text-amber-500" size={20} />
                  تنبيهات مهمة
                </h2>
                <div className="space-y-3">
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-xs font-semibold text-amber-800">تذكير تسليم التقرير</p>
                    <p className="text-xs text-amber-600 mt-1">يرجى رفع تقرير الأسبوع الحالي قبل يوم الخميس.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. توثيق الأنشطة */}
        {activeTab === 'activities' && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Plus size={20} className="text-blue-600" />
                إضافة نشاط / مهمة موثقة بصلب العمل
              </h2>
              <form onSubmit={handleAddActivity} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">عنوان النشاط / المهمة</label>
                    <input 
                      type="text" 
                      placeholder="مثال: إعداد السيرفر أو برمجة واجهة"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">إرفاق صورة إثبات النشاط من جهازك</label>
                    <label className="flex items-center justify-between px-4 py-2.5 border border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer hover:bg-slate-100 transition">
                      <div className="flex items-center gap-2 text-slate-600 text-xs">
                        <Upload size={18} className="text-blue-600" />
                        <span>{selectedImage ? 'تم اختيار الصورة ✅' : 'اضغط لاختيار صورة من جهازك'}</span>
                      </div>
                      <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                  </div>
                </div>

                {selectedImage && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-500 mb-1">معاينة الصورة المرفقة:</p>
                    <img src={selectedImage} alt="Preview" className="h-32 rounded-xl object-cover border border-slate-200" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">شرح مختصر للنشاط</label>
                  <textarea 
                    rows="2"
                    placeholder="اكتب توضيحاً سريعاً عما قمت به..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                  ></textarea>
                </div>

                <button 
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition shadow-lg shadow-blue-500/20"
                >
                  حفظ وتوثيق النشاط
                </button>
              </form>
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <ImageIcon size={20} className="text-blue-600" />
                معرض الأنشطة والإثباتات المصورة ({activities.length})
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activities.map((act) => (
                  <div key={act.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition">
                    <div className="cursor-pointer overflow-hidden relative group" onClick={() => setZoomedImage(act.imageUrl)}>
                      <img src={act.imageUrl} alt={act.title} className="w-full h-48 object-cover group-hover:scale-105 transition duration-300" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold gap-1">
                        <ImageIcon size={16} /> تكبير المعاينة
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">{act.category}</span>
                        <span className="text-xs text-slate-400">{act.date}</span>
                      </div>
                      <h3 className="font-bold text-slate-800 text-base mb-2">{act.title}</h3>
                      <p className="text-slate-500 text-xs leading-relaxed">{act.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {zoomedImage && (
              <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setZoomedImage(null)}>
                <div className="relative max-w-4xl max-h-[90vh] bg-white p-3 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-[80vh] rounded-xl object-contain mx-auto" />
                  <div className="flex justify-between items-center mt-3 px-2">
                    <span className="text-xs text-slate-500">معاينة الإثبات الميداني</span>
                    <button 
                      className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1"
                      onClick={() => setZoomedImage(null)}
                    >
                      <X size={16} /> إغلاق
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. الحضور والانصراف المطور مع حالة الغياب */}
        {activeTab === 'attendance' && (
          <div className="space-y-8">
            {hasPendingForgotCheckout && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-3">
                <div className="flex items-center gap-3 text-amber-800 text-xs">
                  <AlertTriangle size={22} className="text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold block text-sm">تنبيه: لديك تسجيل حضور يوم سابق لم يتم إغلاقه بالانصراف!</span>
                    <span>يرجى تقديم طلب اعتماد انصراف وإرفاق الإثبات للمشرف لتكملة الساعات وينفك تجميد تسجيل اليوم.</span>
                  </div>
                </div>
                <button 
                  onClick={() => setShowForgotModal(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-medium px-4 py-2 rounded-xl text-xs transition shadow-md shrink-0 flex items-center gap-1"
                >
                  <FileCheck size={16} /> تقديم طلب اعتماد انصراف
                </button>
              </div>
            )}

            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <MapPin size={18} className={isWithinCampus ? "text-emerald-600" : "text-rose-500"} />
                <span className="font-semibold text-slate-700">الموقع الجغرافي التلقائي:</span>
                <span className={isWithinCampus ? "text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-lg" : "text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded-lg"}>
                  {isWithinCampus ? "داخل حرم الجامعة / مقر التدريب ✅" : "خارج نطاق الجامعة ❌"}
                </span>
              </div>
              <button 
                onClick={() => setIsWithinCampus(!isWithinCampus)}
                className="text-slate-400 hover:text-slate-600 text-[11px] underline"
              >
                (تجربة الموقع: {isWithinCampus ? "تبديل إلى خارج الجامعة" : "تبديل إلى داخل الجامعة"})
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">تسجيل الحضور والانصراف (M-CheckIn)</h2>
                <p className="text-xs text-slate-500 mt-1">يلزم التواجد داخل نطاق الجامعة وإكمال 6 ساعات عمل يومية.</p>
              </div>

              <div className="flex items-center gap-3">
                {todayDone ? (
                  <span className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 px-4 py-3 rounded-xl font-medium">
                    تم تسجيل حضورك وانصرافك لهذا اليوم ✅
                  </span>
                ) : !todayCheckedIn ? (
                  <button 
                    onClick={handleCheckIn}
                    disabled={hasPendingForgotCheckout || busy || !assignment}
                    className={`font-medium px-6 py-3 rounded-xl text-sm transition flex items-center gap-2 shadow-lg ${
                      hasPendingForgotCheckout 
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' 
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                    }`}
                  >
                    <LogIn size={18} /> {hasPendingForgotCheckout ? "مغلق (عالج النسيان أولاً)" : "تسجيل حضور اليوم"}
                  </button>
                ) : (
                  <button 
                    onClick={handleCheckOut}
                    disabled={busy}
                    className="bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-3 rounded-xl text-sm transition flex items-center gap-2 shadow-lg shadow-red-600/20"
                  >
                    <LogOut size={18} /> تسجيل انصراف (تم الحضور: {checkInTime})
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 text-base">سجل الحضور والغياب والانصراف المعتمد</h3>
                <span className="text-xs text-slate-400">الحد الأدنى المطلوب: 6 ساعات / يوم</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-400 text-xs uppercase border-b border-slate-100">
                    <tr>
                      <th className="p-4">اليوم والتاريخ</th>
                      <th className="p-4">وقت الحضور</th>
                      <th className="p-4">وقت الانصراف</th>
                      <th className="p-4">الساعات المنجزة</th>
                      <th className="p-4">الحالة والتفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceLog.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="p-4 font-semibold text-slate-800">{log.day} - {log.date}</td>
                        <td className="p-4 text-emerald-600 font-medium">{log.checkIn}</td>
                        <td className={`p-4 font-medium ${log.checkOut.includes('غير') ? 'text-amber-600' : 'text-red-500'}`}>
                          {log.checkOut}
                        </td>
                        <td className="p-4">{log.hours}</td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                            log.status === 'حاضر' ? 'bg-emerald-50 text-emerald-600' : 
                            log.status === 'غائب' ? 'bg-rose-50 text-rose-600 border border-rose-200' :
                            log.status.includes('عذر') ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                            log.status === 'نسيان انصراف' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-blue-50 text-blue-600'
                          }`}>
                            {log.status}
                          </span>

                          {/* زر تقديم عذر غياب لو الحالة غائب */}
                          {log.status === 'غائب' && (
                            <button 
                              onClick={() => handleExcuse(log)}
                              className="block text-[11px] text-blue-600 font-bold underline mt-1 hover:text-blue-800"
                            >
                              + تقديم عذر غياب
                            </button>
                          )}

                          <span className="block text-[11px] text-slate-400 mt-1">{log.note}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {showForgotModal && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
                  <div className="flex items-center gap-3 text-amber-600 mb-4">
                    <FileCheck size={24} />
                    <h3 className="font-bold text-slate-800 text-base">تقديم طلب اعتماد انصراف نسياني</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    يرجى تحديد وقت الخروج التقديري وإرفاق سبب عدم التسجيل لرفعه للمشرف للاعتماد.
                  </p>
                  <form onSubmit={handleSendForgotCorrection} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">وقت الانصراف الفعلي/التقديري</label>
                      <input 
                        type="text" 
                        value={forgotOutTime}
                        onChange={(e) => setForgotOutTime(e.target.value)}
                        placeholder="مثال: 02:00 م"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">سبب نسيان الانصراف</label>
                      <textarea 
                        rows="2"
                        required
                        placeholder="اكتب التبرير للمشرف..."
                        value={forgotReason}
                        onChange={(e) => setForgotReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                      ></textarea>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">إرفاق إثبات (سجل موقع GPS / صورة مهمة)</label>
                      <input 
                        type="file" 
                        accept="image/*,.pdf"
                        onChange={(e) => setForgotProof(e.target.files[0])}
                        className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button 
                        type="button" 
                        onClick={() => setShowForgotModal(false)}
                        className="px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-xl"
                      >
                        إلغاء
                      </button>
                      <button 
                        type="submit" 
                        className="px-4 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-md"
                      >
                        إرسال للمشرف للاعتماد
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {showPermissionModal && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100">
                  <div className="flex items-center gap-3 text-amber-600 mb-4">
                    <AlertTriangle size={24} />
                    <h3 className="font-bold text-slate-800 text-base">استئذان / انصراف مبكر</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-4">
                    لم تكتمل الـ 6 ساعات المحددة لهذا اليوم. إذا أردت الخروج الآن، يرجى تقديم طلب استئذان يرسل للمشرف للاعتماد.
                  </p>
                  <form onSubmit={handleSendPermission} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">سبب الخروج المبكر / الاستئذان</label>
                      <textarea 
                        rows="3"
                        required
                        placeholder="اكتب سبب الاستئذان..."
                        value={permissionReason}
                        onChange={(e) => setPermissionReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-500"
                      ></textarea>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button 
                        type="button" 
                        onClick={() => setShowPermissionModal(false)}
                        className="px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-xl"
                      >
                        إلغاء
                      </button>
                      <button 
                        type="submit" 
                        className="px-4 py-2 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-md"
                      >
                        إرسال الاستئذان للمشرف
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

          </div>
        )}

        {/* 4. التقارير الأسبوعية */}
        {activeTab === 'reports' && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Send size={20} className="text-blue-600" />
                تقديم التقرير الأسبوعي
              </h2>
              <form onSubmit={handleAddReport} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">حدد الأسبوع</label>
                  <input 
                    type="text" 
                    placeholder="مثال: الأسبوع السابع"
                    value={repWeek}
                    onChange={(e) => setRepWeek(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">تفاصيل المهام والإنجازات الأسبوعية</label>
                  <textarea 
                    rows="3"
                    placeholder="اكتب بالتفصيل أهم المهام التي قمت بها خلال هذا الأسبوع..."
                    value={repContent}
                    onChange={(e) => setRepContent(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                  ></textarea>
                </div>
                <button type="submit" disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition shadow-lg shadow-blue-500/20">
                  إرسال التقرير للمشرف
                </button>
              </form>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 text-base mb-4">التقارير المرفوعة سابقاً (اضغطي لقراءة التفاصيل)</h3>
              <div className="space-y-3">
                {reports.length === 0 && (
                  <p className="text-xs text-slate-400">لا توجد تقارير مرفوعة بعد.</p>
                )}
                {reports.map((r) => (
                  <div 
                    key={r.id} 
                    onClick={() => setSelectedReport(r)}
                    className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 rounded-xl flex justify-between items-center cursor-pointer transition group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition">{r.week}</h4>
                        <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Eye size={12} /> معاينة التقرير
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">تاريخ التسليم: {r.date} — {r.notes}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${r.status === 'مقبول' ? 'bg-emerald-50 text-emerald-600' : r.status === 'مرفوض' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {selectedReport && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedReport(null)}>
                <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                      <FileText className="text-blue-600" size={20} />
                      تفاصيل {selectedReport.week}
                    </h3>
                    <button onClick={() => setSelectedReport(null)} className="text-slate-400 hover:text-slate-600 p-1">
                      <X size={20} />
                    </button>
                  </div>
                  
                  <div className="space-y-3 text-xs text-slate-600">
                    <div className="flex justify-between bg-slate-50 p-3 rounded-xl">
                      <span>تاريخ التسليم: <strong className="text-slate-800">{selectedReport.date}</strong></span>
                      <span>حالة التقرير: <strong className="text-emerald-600">{selectedReport.status}</strong></span>
                    </div>

                    <div>
                      <span className="font-bold text-slate-700 block mb-1">تفاصيل ومحتوى التقرير الأسبوعي:</span>
                      <p className="bg-slate-50 p-4 rounded-xl leading-relaxed text-slate-700 font-normal">
                        {selectedReport.content || 'تم رفع إنجازات وتفاصيل هذا الأسبوع بصلب العمل والمهمات الموكلة وفق الخطة التدريبية.'}
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      <span className="font-bold text-slate-700 block mb-1">ملاحظات واعتماد المشرف:</span>
                      <p className="text-emerald-700 font-medium bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                        {selectedReport.notes}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button 
                      onClick={() => setSelectedReport(null)}
                      className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-5 py-2 rounded-xl transition"
                    >
                      إغلاق المعاينة
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* 5. الجدول والمهام */}
        {activeTab === 'tasks' && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">قائمة المهام التدريبية الموكلة</h2>
                <p className="text-xs text-slate-500 mt-1">اضغطي على أي بطاقة لعرض كامل تفاصيل المهمة الموكلة.</p>
              </div>
              <span className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-xs font-bold">
                إجمالي المهام: {tasks.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {tasks.map((task) => (
                <div 
                  key={task.id} 
                  onClick={() => setSelectedTask(task)}
                  className="bg-white p-5 rounded-2xl border border-slate-100 hover:border-blue-300 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        task.status.includes('مكتملة') ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                      }`}>
                        {task.status}
                      </span>
                      <span className="text-xs text-slate-400">{task.date}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 text-sm mb-2 group-hover:text-blue-600 transition">{task.title}</h3>
                    <p className="text-slate-500 text-xs line-clamp-2">{task.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-50 text-xs text-slate-400 flex justify-between items-center">
                    <span>المشرف: {task.supervisor}</span>
                    <span className="text-blue-600 text-[11px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <Eye size={12} /> فتح التفاصيل
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {selectedTask && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
                <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                      <CheckSquare className="text-blue-600" size={20} />
                      تفاصيل المهمة الموكلة
                    </h3>
                    <button onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-600 p-1">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-3 text-xs text-slate-600">
                    <h4 className="text-sm font-bold text-slate-800">{selectedTask.title}</h4>
                    
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl">
                      <div><span className="text-slate-400 block mb-0.5">تاريخ التسليم:</span><strong>{selectedTask.date}</strong></div>
                      <div><span className="text-slate-400 block mb-0.5">الحالة:</span><strong className="text-blue-600">{selectedTask.status}</strong></div>
                    </div>

                    <div>
                      <span className="font-bold text-slate-700 block mb-1">وصف المهمة والمتطلبات:</span>
                      <p className="bg-slate-50 p-3.5 rounded-xl leading-relaxed text-slate-700">
                        {selectedTask.description}
                      </p>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-0.5">المشرف المسؤول:</span>
                      <span className="font-semibold text-slate-800">{selectedTask.supervisor}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button 
                      onClick={() => setSelectedTask(null)}
                      className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-5 py-2 rounded-xl transition"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* 6. فرص التدريب وطلباتي */}
        {activeTab === 'opportunities' && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Briefcase size={20} className="text-blue-600" />
                  طلباتي ({applications.length})
                </h2>
                <button
                  onClick={loadAll}
                  className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                >
                  تحديث
                </button>
              </div>
              {applications.length === 0 ? (
                <p className="text-xs text-slate-400">لم تقدم على أي فرصة تدريبية بعد.</p>
              ) : (
                <div className="space-y-3">
                  {applications.map((a) => {
                    const st = APPLICATION_STATUS[a.status] || { label: a.status, cls: 'bg-slate-50 text-slate-600' };
                    return (
                      <div key={a.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">{a.opportunity?.title}</h4>
                          <p className="text-xs text-slate-400 mt-1">
                            {a.opportunity?.organization?.name} — تاريخ التقديم: {a.createdAt.slice(0, 10)}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${st.cls}`}>{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Building2 size={20} className="text-blue-600" />
                الفرص التدريبية المتاحة ({opportunities.length})
              </h2>
              {opportunities.length === 0 && (
                <p className="text-xs text-slate-400">لا توجد فرص تدريبية مفتوحة حالياً.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {opportunities.map((o) => (
                  <div key={o.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                          {o.organization?.name}
                        </span>
                        <span className="text-xs text-slate-400">المقاعد: {o.seats}</span>
                      </div>
                      <h3 className="font-bold text-slate-800 text-base mb-2">{o.title}</h3>
                      <p className="text-slate-500 text-xs leading-relaxed">{o.description}</p>
                      <p className="text-[11px] text-slate-400 mt-3">
                        من {o.startDate.slice(0, 10)} إلى {o.endDate.slice(0, 10)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleApply(o.id)}
                      disabled={busy || appliedIds.has(o.id)}
                      className={`mt-4 font-medium px-5 py-2.5 rounded-xl text-sm transition ${
                        appliedIds.has(o.id)
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                      }`}
                    >
                      {appliedIds.has(o.id) ? 'تم التقديم ✅' : 'تقديم طلب'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 7. مركز الإشعارات (من الـ backend) */}
        {activeTab === 'notifications' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold text-slate-800">مركز الإشعارات والتنبيهات الواردة</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">غير المقروءة: {unreadCount}</span>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="text-xs text-blue-600 font-semibold underline">
                    تعليم الكل كمقروء
                  </button>
                )}
              </div>
            </div>

            {notifications.length === 0 && (
              <p className="text-xs text-slate-400">لا توجد إشعارات حالياً.</p>
            )}

            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleOpenNotification(n)}
                className={`p-4 border rounded-xl flex items-start gap-3 cursor-pointer transition ${
                  n.isRead
                    ? 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                    : 'bg-blue-50/50 border-blue-100 hover:bg-blue-100/60'
                }`}
              >
                <span className="text-lg mt-0.5">{n.isRead ? '🔔' : '📌'}</span>
                <div className="flex-1">
                  <p className={`text-sm ${n.isRead ? 'text-slate-600' : 'font-bold text-slate-800'}`}>{n.message}</p>
                  <span className="text-[10px] text-slate-400 mt-2 block">{timeAgo(n.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* خطاب التدريب */}
        {letter && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setLetter(null)}>
            <div id="letter-print" className="bg-white rounded-2xl p-8 max-w-xl w-full shadow-2xl border border-slate-100 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="text-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-lg">{letter.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{letter.university}</p>
                <p className="text-xs text-slate-400">تاريخ الإصدار: {letter.issuedDate}</p>
              </div>
              <p className="text-sm text-slate-700">إلى: <strong>{letter.companyName}</strong></p>
              <p className="text-sm text-slate-700 leading-loose">{letter.content}</p>
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl text-xs text-slate-600">
                <div><span className="text-slate-400 block mb-0.5">الطالب</span><strong>{letter.studentName}</strong></div>
                <div><span className="text-slate-400 block mb-0.5">الرقم الجامعي</span><strong>{letter.universityId}</strong></div>
                <div><span className="text-slate-400 block mb-0.5">الفرصة التدريبية</span><strong>{letter.trainingTitle}</strong></div>
                <div><span className="text-slate-400 block mb-0.5">فترة التدريب</span><strong>{letter.startDate} → {letter.endDate}</strong></div>
              </div>
              <div className="no-print pt-2 flex justify-end gap-2">
                <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-5 py-2 rounded-xl transition flex items-center gap-1">
                  <Printer size={14} /> طباعة
                </button>
                <button onClick={() => setLetter(null)} className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-5 py-2 rounded-xl transition">
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}


      </main>
    </div>
  );
}