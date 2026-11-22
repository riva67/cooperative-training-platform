import React, { useCallback, useEffect, useMemo, useState } from "react";
// Connected to the backend. (src/mockApi.js has the same functions with demo data, for working without the server.)
import {
  api, STUDENT_REQUEST_SUBJECTS, MAIN_PORTAL_URL, getToken, saveSession, clearSession, consumeHashSession,
} from "./api";

// ───────────── labels (backend values -> Arabic) ─────────────
const APP_STATUS = {
  PENDING: { label: "بانتظار ترشيحك", cls: "bg-amber-50 text-amber-800" },
  NOMINATED: { label: "مرشّح — بانتظار قرار الجهة", cls: "bg-sky-50 text-sky-800" },
  APPROVED: { label: "مقبول من الجهة", cls: "bg-emerald-50 text-emerald-800" },
  REJECTED: { label: "مرفوض من الجهة", cls: "bg-rose-50 text-rose-800" },
};
const ATT_STATUS = {
  PRESENT: { label: "حاضر", cls: "bg-emerald-50 text-emerald-800" },
  LATE: { label: "متأخر", cls: "bg-amber-50 text-amber-800" },
  EXCUSED: { label: "غائب بعذر", cls: "bg-sky-50 text-sky-800" },
  ABSENT: { label: "غائب", cls: "bg-rose-50 text-rose-800" },
};
const REPORT_TYPE = { WEEKLY: "أسبوعي", FINAL: "نهائي", APPROVAL: "إفادة الجهة", ABSENCE_WARNING: "إنذار غياب", VISIT: "تقرير زيارة" };
const REPORT_STATUS = {
  SUBMITTED: { label: "بانتظار المراجعة", cls: "bg-amber-100 text-amber-900" },
  APPROVED: { label: "معتمد", cls: "bg-emerald-100 text-emerald-900" },
  REJECTED: { label: "مرفوض", cls: "bg-rose-100 text-rose-900" },
  DRAFT: { label: "مسودة", cls: "bg-slate-100 text-slate-700" },
};
const VISIT_STATUS = {
  PENDING: { label: "بانتظار رد جهة التدريب", cls: "bg-amber-100 text-amber-900" },
  APPROVED: { label: "وافقت جهة التدريب", cls: "bg-emerald-100 text-emerald-900" },
  DECLINED: { label: "اعتذرت جهة التدريب", cls: "bg-rose-100 text-rose-900" },
  CANCELLED: { label: "ملغاة", cls: "bg-slate-100 text-slate-700" },
};
const ASSIGNMENT_STATUS = { ACTIVE: "تدريب جارٍ", COMPLETED: "مكتمل", CANCELLED: "ملغى" };

// backend error messages -> Arabic
const ERRORS_AR = {
  "Only PENDING applications can be nominated": "يمكن ترشيح الطلبات التي بانتظار الترشيح فقط.",
  "This opportunity is closed": "التقديم على هذه الفرصة مغلق.",
  "The visit time must be in the future": "يجب أن يكون موعد الزيارة في المستقبل.",
  "You have no active trainees with this organization supervisor": "ليس لديك متدربون حاليون لدى مشرف هذه الجهة.",
  "There is already a visit at (or within an hour of) this time": "يوجد زيارة أخرى في نفس الوقت (أو خلال ساعة منه).",
  "Only an approved visit can be marked as done": "لا يمكن تسجيل الزيارة إلا بعد موافقة جهة التدريب.",
  "The visit date has not arrived yet": "لم يحن موعد الزيارة بعد.",
  "This visit can no longer be cancelled": "لا يمكن إلغاء هذه الزيارة.",
  "A final grade already exists for this assignment": "تم رصد الدرجة النهائية مسبقاً.",
  "Employment can be recorded after the training is completed": "يُسجَّل التوظيف بعد اكتمال التدريب.",
  "This trainee has not been evaluated yet": "لم تقيّم جهة التدريب المتدرب بعد.",
  "You cannot message this user": "لا يمكنك مراسلة هذا المستخدم.",
  "Invalid email or password": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "Your account is not active yet. If you just registered, please wait for the administration to approve it.":
    "حسابك قيد المراجعة. ستتمكن من الدخول بعد موافقة إدارة النظام.",
  "Your registration request was rejected by the administration.": "تم رفض طلب التسجيل من إدارة النظام.",
  "Your account has been disabled. Please contact the administration.": "تم إيقاف حسابك. يرجى التواصل مع إدارة النظام.",
};
const errorAr = (err) => {
  const m = err.message || "";
  if (ERRORS_AR[m]) return ERRORS_AR[m];
  if (m.startsWith("Only SUBMITTED reports")) return "تمت مراجعة هذا التقرير مسبقاً.";
  if (m.startsWith("This application is already")) return "تم البت في هذا الطلب من جهة التدريب ولا يمكن تغييره.";
  if (m.startsWith("Application is already")) return "هذا الطلب مرشّح مسبقاً.";
  return m || "حدث خطأ غير متوقع";
};

const ymd = (d) => (d ? String(d).slice(0, 10) : "");
const fmtDateTime = (d) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d));

const NAV_ITEMS = [
  { key: "الرئيسية", label: "الرئيسية" },
  { key: "الترشيح", label: "الترشيح" },
  { key: "المتابعة", label: "المتابعة" },
  { key: "الحضور", label: "الحضور" },
  { key: "التقارير", label: "التقارير" },
  { key: "الزيارات", label: "الزيارات والإنذارات" },
  { key: "النماذج والتقييم", label: "النماذج والتقييم" },
  { key: "المراسلة", label: "الإشعارات والمراسلة" },
];

export default function App() {
  // ── session (after connecting, it comes from the main portal like the other portals) ──
  const [me, setMe] = useState(null);
  // session sent by the main portal (#session=...) or saved from a previous visit
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    consumeHashSession();
    return Boolean(getToken());
  });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  const [activePage, setActivePage] = useState("الرئيسية");
  const [toastMessage, setToastMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

  // ── data from the backend ──
  const [rows, setRows] = useState([]); // GET /supervisor/students
  const [applications, setApplications] = useState([]); // GET /applications
  const [reports, setReports] = useState([]); // GET /reports
  const [visits, setVisits] = useState([]); // GET /visits
  const [notifications, setNotifications] = useState({ items: [], unreadCount: 0 });
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [studentRequests, setStudentRequests] = useState([]);
  const [stats, setStats] = useState(null);

  // ── page state ──
  const [appFilter, setAppFilter] = useState("PENDING");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");

  const [attendanceAssignmentId, setAttendanceAssignmentId] = useState(null);
  const [attendance, setAttendance] = useState({ items: [], summary: null });
  const [replyDrafts, setReplyDrafts] = useState({});

  const [selectedReportId, setSelectedReportId] = useState(null);
  const [reportCommentDraft, setReportCommentDraft] = useState("");
  const [reportFilter, setReportFilter] = useState("SUBMITTED");

  const [visitOrgSupervisorId, setVisitOrgSupervisorId] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("10:00");
  const [visitNotes, setVisitNotes] = useState("");
  const [visitNoteDrafts, setVisitNoteDrafts] = useState({});

  const [evalAssignmentId, setEvalAssignmentId] = useState(null);
  const [form1, setForm1] = useState(null);
  const [form2, setForm2] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [scoreInput, setScoreInput] = useState("");
  const [employment, setEmployment] = useState({ employed: "", employerName: "" });

  const [msgRecipientId, setMsgRecipientId] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");

  const notify = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage((prev) => (prev === text ? "" : prev)), 3500);
  };

  // run an action, show the Arabic error if the backend refuses it
  const run = async (fn, successText) => {
    setBusy(true);
    try {
      await fn();
      if (successText) notify(successText);
    } catch (err) {
      notify(`⚠️ ${errorAr(err)}`);
    } finally {
      setBusy(false);
    }
  };

  // ───────────── loading ─────────────
  const loadStudentRequests = useCallback(async (contactList) => {
    // excuses / forgotten check-outs are messages the students send from their portal
    const students = contactList.filter((c) => c.role === "STUDENT");
    const threads = await Promise.all(students.map((s) => api.thread(s.id).then((t) => ({ student: s, items: t.items }))));
    const list = [];
    for (const { student, items } of threads) {
      for (const m of items) {
        if (m.senderId === student.id && STUDENT_REQUEST_SUBJECTS.includes(m.subject)) list.push({ ...m, student });
      }
    }
    setStudentRequests(list.sort((a, b) => b.id - a.id));
  }, []);

  const loadAll = useCallback(async () => {
    setLoadError("");
    try {
      const [meRes, rowsRes, appsRes, repRes, visRes, notRes, convRes, conRes, statsRes] = await Promise.all([
        api.me(), api.supervisedStudents(), api.applications(), api.reports(), api.visits(),
        api.notifications(), api.conversations(), api.contacts(), api.stats(),
      ]);
      setMe(meRes);
      setRows(rowsRes);
      setApplications(appsRes.items);
      setReports(repRes.items);
      setVisits(visRes.items);
      setNotifications(notRes);
      setConversations(convRes);
      setContacts(conRes);
      setStats(statsRes);
      await loadStudentRequests(conRes);
    } catch (err) {
      setLoadError(errorAr(err));
    }
  }, [loadStudentRequests]);

  useEffect(() => {
    if (isLoggedIn) loadAll();
  }, [isLoggedIn, loadAll]);

  useEffect(() => {
    if (isLoggedIn) api.criteria().then((c) => setCriteria(c.criteria)).catch(() => {});
  }, [isLoggedIn]);

  // expired session -> back to the login screen
  useEffect(() => {
    const onExpired = () => {
      setIsLoggedIn(false);
      setAuthNotice("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى.");
    };
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, []);

  const logout = () => {
    clearSession();
    window.location.href = MAIN_PORTAL_URL;
  };

  // default selections once the trainees are loaded
  useEffect(() => {
    if (!rows.length) return;
    const first = rows[0].assignment.id;
    setSelectedAssignmentId((v) => v ?? first);
    setAttendanceAssignmentId((v) => v ?? first);
    setEvalAssignmentId((v) => v ?? first);
  }, [rows]);

  // notes of the trainee shown in "المتابعة"
  useEffect(() => {
    if (selectedAssignmentId) api.notes(selectedAssignmentId).then(setNotes).catch(() => setNotes([]));
  }, [selectedAssignmentId]);

  // attendance log of the selected trainee
  useEffect(() => {
    if (attendanceAssignmentId) api.attendance(attendanceAssignmentId).then(setAttendance).catch(() => setAttendance({ items: [], summary: null }));
  }, [attendanceAssignmentId]);

  // forms (1) and (2) of the selected trainee
  useEffect(() => {
    if (!evalAssignmentId) return;
    setScoreInput("");
    setEmployment({ employed: "", employerName: "" });
    api.commencement(evalAssignmentId).then(setForm1).catch(() => setForm1(null));
    api.evaluation(evalAssignmentId).then(setForm2).catch(() => setForm2(null));
  }, [evalAssignmentId]);

  // ───────────── derived values ─────────────
  const rowOf = (assignmentId) => rows.find((r) => r.assignment.id === assignmentId);
  const nameOf = (assignmentId) => rowOf(assignmentId)?.assignment.student.user.name || `تكليف #${assignmentId}`;

  const pendingStudentReports = reports.filter((r) => (r.type === "WEEKLY" || r.type === "FINAL") && r.status === "SUBMITTED");
  const absenceWarnings = reports.filter((r) => r.type === "ABSENCE_WARNING");
  const providerVisitReports = reports.filter((r) => r.type === "VISIT" || r.type === "APPROVAL");
  const unreadMessages = conversations.reduce((s, c) => s + c.unreadCount, 0);

  const summary = useMemo(() => {
    const rates = rows.map((r) => r.attendanceRate).filter((v) => v != null);
    return {
      traineesCount: rows.filter((r) => r.assignment.status === "ACTIVE").length,
      pendingReports: pendingStudentReports.length,
      pendingApplications: applications.filter((a) => a.status === "PENDING").length,
      avgAttendance: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
      upcomingVisits: visits.filter((v) => v.status !== "CANCELLED" && new Date(v.scheduledAt) > new Date()).length,
    };
  }, [rows, pendingStudentReports.length, applications, visits]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(({ assignment: a }) =>
      [a.student.user.name, a.student.universityId, a.opportunity.organization.name].some((v) => v.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);

  // applications grouped by opportunity, highest GPA first (as the backend's /opportunities/:id/applicants)
  const applicationsByOpportunity = useMemo(() => {
    const groups = new Map();
    for (const a of applications.filter((x) => !appFilter || x.status === appFilter)) {
      if (!groups.has(a.opportunityId)) groups.set(a.opportunityId, { opportunity: a.opportunity, items: [] });
      groups.get(a.opportunityId).items.push(a);
    }
    for (const g of groups.values()) g.items.sort((x, y) => (y.student.gpa ?? -1) - (x.student.gpa ?? -1));
    return [...groups.values()];
  }, [applications, appFilter]);

  // organization supervisors I can book a visit with (they have an ACTIVE trainee of mine)
  const visitTargets = useMemo(() => {
    const map = new Map();
    for (const { assignment: a } of rows) {
      if (a.status !== "ACTIVE") continue;
      map.set(a.orgSupervisor.id, { id: a.orgSupervisor.id, name: a.orgSupervisor.user.name, org: a.opportunity.organization });
    }
    return [...map.values()];
  }, [rows]);

  const followUpRow = rowOf(selectedAssignmentId);
  const evalRow = rowOf(evalAssignmentId);
  const selectedReport = reports.find((r) => r.id === selectedReportId) || null;
  const studentReportsList = reports.filter(
    (r) => (r.type === "WEEKLY" || r.type === "FINAL") && (!reportFilter || r.status === reportFilter)
  );

  // ───────────── actions ─────────────
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setAuthNotice("");
    api
      .login(loginEmail, loginPassword)
      .then(({ token, user }) => {
        if (user.role !== "ACADEMIC_SUPERVISOR") {
          setAuthNotice("هذه البوابة مخصصة للمشرفين الأكاديميين. استخدم البوابة الرئيسية للدخول إلى بوابتك.");
          return;
        }
        saveSession(token, user);
        setLoginPassword("");
        setIsLoggedIn(true);
        notify(`تم تسجيل الدخول باسم ${user.name}`);
      })
      .catch((err) => setAuthNotice(errorAr(err)));
  };

  const handleNominate = (app) =>
    run(async () => {
      await api.nominate(app.id);
      setApplications((await api.applications()).items);
    }, `تم ترشيح ${app.student.user.name} — الطلب الآن بانتظار قرار ${app.opportunity.organization.name}`);

  const handleAddNote = (e) => {
    e.preventDefault();
    if (!noteDraft.trim()) return;
    run(async () => {
      await api.addNote(selectedAssignmentId, noteDraft.trim());
      setNotes(await api.notes(selectedAssignmentId));
      setNoteDraft("");
    }, "تم حفظ الملاحظة، ووصل إشعار للمتدرب");
  };

  // reply to a student's excuse / forgotten check-out, or forward it to the training provider
  const handleReplyToStudent = (req) => {
    const text = (replyDrafts[req.id] || "").trim();
    if (!text) return notify("⚠️ اكتب الرد أولاً");
    run(async () => {
      await api.sendMessage({ recipientId: req.student.id, subject: `رد: ${req.subject}`, body: text });
      setReplyDrafts((d) => ({ ...d, [req.id]: "" }));
      setConversations(await api.conversations());
    }, `تم إرسال الرد إلى ${req.student.name}`);
  };
  const handleForwardToProvider = (req) => {
    const row = rows.find((r) => r.assignment.student.user.id === req.student.id && r.assignment.status === "ACTIVE");
    if (!row) return notify("⚠️ لا يوجد تدريب جارٍ لهذا الطالب");
    const org = row.assignment.orgSupervisor;
    const extra = (replyDrafts[req.id] || "").trim();
    run(async () => {
      await api.sendMessage({
        recipientId: org.user.id,
        subject: `طلب مراجعة حضور: ${req.student.name}`,
        body: `أرسل المتدرب الطلب التالي، نأمل مراجعته وتعديل سجل الحضور إن لزم (تعديل الحضور من صلاحية جهة التدريب):\n\n${req.subject}\n${req.body}${extra ? `\n\nملاحظة المشرف: ${extra}` : ""}`,
      });
      setConversations(await api.conversations());
    }, `تم تحويل الطلب إلى ${org.user.name} (${row.assignment.opportunity.organization.name})`);
  };

  const handleReportDecision = (status) =>
    run(async () => {
      await api.reviewReport(selectedReport.id, status);
      // the backend has no comment field on reports: the optional note is sent to the student as a message
      const comment = reportCommentDraft.trim();
      if (comment) {
        await api.sendMessage({
          recipientId: selectedReport.submittedBy.id,
          subject: `ملاحظة على ${selectedReport.title}`,
          body: comment,
        });
      }
      setReports((await api.reports()).items);
      setReportCommentDraft("");
    }, status === "APPROVED" ? "تم اعتماد التقرير" : "تم رفض التقرير، ويستطيع الطالب تعديله وإعادة إرساله");

  const handleCreateVisitRequest = (e) => {
    e.preventDefault();
    if (!visitOrgSupervisorId || !visitDate || !visitTime) return notify("⚠️ اختر جهة التدريب والتاريخ والوقت");
    run(async () => {
      await api.requestVisit({
        orgSupervisorId: Number(visitOrgSupervisorId),
        scheduledAt: new Date(`${visitDate}T${visitTime}:00+03:00`).toISOString(),
        message: visitNotes.trim() || undefined,
      });
      setVisits((await api.visits()).items);
      setVisitNotes("");
    }, "تم إرسال طلب الزيارة، وتصل جهة التدريب إشعاراً للموافقة أو الاعتذار");
  };

  const handleVisitDone = (v) =>
    run(async () => {
      await api.updateVisit(v.id, { isDone: true, notes: (visitNoteDrafts[v.id] ?? v.notes ?? "").trim() || null });
      setVisits((await api.visits()).items);
    }, "تم تسجيل الزيارة كمنجزة");

  const handleSaveVisitNotes = (v) =>
    run(async () => {
      await api.updateVisit(v.id, { notes: (visitNoteDrafts[v.id] ?? "").trim() || null });
      setVisits((await api.visits()).items);
    }, "تم حفظ ملاحظات الزيارة");

  const handleCancelVisit = (v) => {
    if (!window.confirm(`إلغاء زيارة ${v.orgSupervisor.organization.name}؟`)) return;
    run(async () => {
      await api.cancelVisit(v.id);
      setVisits((await api.visits()).items);
    }, "تم إلغاء الزيارة وإبلاغ جهة التدريب");
  };

  const handleSetFinalGrade = (e) => {
    e.preventDefault();
    const grade = Number(scoreInput);
    if (scoreInput === "" || grade < 0 || grade > 100) return notify("⚠️ أدخل درجة من 0 إلى 100");
    if (!window.confirm(`رصد الدرجة ${grade}/100 للمتدرب ${evalRow.assignment.student.user.name}؟\nلا يمكن تعديلها بعد الرصد، ويُعتبر التدريب مكتملاً.`)) return;
    run(async () => {
      await api.setFinalGrade(evalAssignmentId, grade);
      setRows(await api.supervisedStudents());
      setStats(await api.stats());
    }, "تم رصد الدرجة النهائية واكتمال التدريب");
  };

  const handleEmployment = (e) => {
    e.preventDefault();
    if (!employment.employed) return;
    const employed = employment.employed === "yes";
    if (employed && !employment.employerName.trim()) return notify("⚠️ اكتب اسم جهة العمل");
    run(async () => {
      await api.recordEmployment(evalAssignmentId, { employed, ...(employed && { employerName: employment.employerName.trim() }) });
      setRows(await api.supervisedStudents());
      setStats(await api.stats());
    }, "تم تسجيل حالة التوظيف");
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!msgRecipientId || !msgBody.trim()) return;
    run(async () => {
      await api.sendMessage({ recipientId: Number(msgRecipientId), subject: msgSubject.trim() || undefined, body: msgBody.trim() });
      setConversations(await api.conversations());
      setMsgSubject("");
      setMsgBody("");
    }, "تم إرسال الرسالة");
  };

  const handleMarkAllRead = () =>
    run(async () => {
      await api.markAllRead();
      setNotifications(await api.notifications());
    }, "تم تعليم جميع الإشعارات كمقروءة");

  const Badge = ({ info }) => (
    <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${info.cls}`}>{info.label}</span>
  );

  // ───────────── UI ─────────────
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white">
              ت م
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 sm:text-lg">
                نظام إدارة التدريب الميداني — بوابة المشرف الأكاديمي
              </h1>
              <p className="text-xs text-slate-500">
                {isLoggedIn && me
                  ? `المشرف الحالي: ${me.name} • ${me.academicSupervisor?.department || ""} • ${me.email}`
                  : "يرجى تسجيل الدخول"}
              </p>
            </div>
          </div>

          {isLoggedIn && (
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              تسجيل الخروج
            </button>
          )}
        </div>

        {isLoggedIn && (
          <nav aria-label="أقسام البوابة" className="border-t border-slate-100 bg-slate-50/90">
            <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-2.5">
              {NAV_ITEMS.map((item) => {
                const isActive = activePage === item.key;
                const count =
                  item.key === "الترشيح" ? summary.pendingApplications
                  : item.key === "التقارير" ? summary.pendingReports
                  : item.key === "المراسلة" ? notifications.unreadCount + unreadMessages
                  : 0;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActivePage(item.key)}
                    className={`min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-bold transition sm:text-sm ${
                      isActive
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60"
                    }`}
                  >
                    {item.label}
                    {count > 0 && (
                      <span
                        className={`mr-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                          isActive ? "bg-white text-emerald-800" : "bg-emerald-700 text-white"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {toastMessage && (
        <div role="status" className="mx-auto mt-4 max-w-7xl px-4">
          <div className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${
            toastMessage.startsWith("⚠️") ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}>
            <span>{toastMessage}</span>
            <button type="button" onClick={() => setToastMessage("")} className="text-xs underline">
              إغلاق
            </button>
          </div>
        </div>
      )}

      {!isLoggedIn ? (
        <main className="mx-auto max-w-lg px-4 py-10">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">تسجيل دخول المشرف الأكاديمي</h2>
            <p className="mt-1 text-sm text-slate-600">
              يمكنك الدخول من البوابة الرئيسية مباشرة، أو بحسابك هنا.
            </p>

            {authNotice && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{authNotice}</p>
            )}

            <form onSubmit={handleLoginSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">البريد الإلكتروني الجامعي</label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">كلمة المرور</label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
              >
                دخول إلى البوابة
              </button>
            </form>
          </section>
        </main>
      ) : (
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
          {loadError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {loadError}{" "}
              <button type="button" onClick={loadAll} className="font-bold underline">إعادة المحاولة</button>
            </div>
          )}

          {/* ═════════════ الرئيسية ═════════════ */}
          {activePage === "الرئيسية" && (
            <div className="space-y-6">
              <section className="rounded-2xl bg-gradient-to-l from-emerald-800 to-emerald-600 p-6 text-white shadow-sm">
                <p className="text-xs font-semibold text-emerald-100">مرحباً بك</p>
                <h2 className="mt-1 text-xl font-bold sm:text-2xl">لوحة المشرف الأكاديمي — {me?.name}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50">
                  ترشيح الطلاب المتقدمين لجهات التدريب، ومتابعة الحضور والتقارير، وحجز الزيارات الميدانية،
                  والاطلاع على تقييم الجهة، ورصد الدرجة النهائية من 100.
                </p>
              </section>

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <button type="button" onClick={() => setActivePage("المتابعة")} className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm hover:border-emerald-300">
                  <p className="text-xs font-semibold text-slate-500">متدربون حالياً</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.traineesCount}</p>
                  <p className="mt-1 text-xs text-emerald-700">من أصل {rows.length} تكليف</p>
                </button>
                <button type="button" onClick={() => setActivePage("الترشيح")} className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm hover:border-emerald-300">
                  <p className="text-xs font-semibold text-slate-500">طلبات بانتظار ترشيحك</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.pendingApplications}</p>
                  <p className="mt-1 text-xs text-amber-700">تُرشَّح من قسم الترشيح</p>
                </button>
                <button type="button" onClick={() => setActivePage("التقارير")} className="rounded-2xl border border-slate-200 bg-white p-5 text-right shadow-sm hover:border-emerald-300">
                  <p className="text-xs font-semibold text-slate-500">تقارير بانتظار المراجعة</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.pendingReports}</p>
                  <p className="mt-1 text-xs text-amber-700">تُعتمد أو تُرفض من قسم التقارير</p>
                </button>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">متوسط نسبة الحضور</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.avgAttendance == null ? "—" : `${summary.avgAttendance}%`}</p>
                  <p className="mt-1 text-xs text-slate-600">إنذارات الغياب من الجهات: {absenceWarnings.length}</p>
                </div>
              </section>

              {stats && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 text-base font-bold text-slate-900">مؤشرات الأثر</h3>
                  <div className="grid grid-cols-2 gap-4 text-center lg:grid-cols-4">
                    {[
                      ["عدد فرص التدريب", stats.totalOpportunities],
                      ["نسبة إكمال التدريب", `${stats.completionRate}%`],
                      ["رضا جهات التدريب", stats.providerSatisfaction == null ? "—" : `${stats.providerSatisfaction} / 5`],
                      ["نسبة التوظيف بعد التدريب", stats.employmentRate == null ? "—" : `${stats.employmentRate}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-emerald-50/60 p-4">
                        <p className="text-2xl font-extrabold text-emerald-800">{value}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">{label}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900">ملخص حالة المتدربين</h3>
                  <button
                    type="button"
                    onClick={() => setActivePage("المتابعة")}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    عرض صفحة المتابعة الكاملة
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2.5 pr-2">المتدرب</th>
                        <th className="py-2.5">جهة التدريب</th>
                        <th className="py-2.5">الحالة</th>
                        <th className="py-2.5">الحضور</th>
                        <th className="py-2.5">التقارير</th>
                        <th className="py-2.5">الإنذارات</th>
                        <th className="py-2.5 pl-2">الدرجة (100)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => (
                        <tr key={r.assignment.id}>
                          <td className="py-3 pr-2 font-semibold text-slate-900">{r.assignment.student.user.name}</td>
                          <td className="py-3 text-slate-600">{r.assignment.opportunity.organization.name}</td>
                          <td className="py-3 text-xs text-slate-600">{ASSIGNMENT_STATUS[r.assignment.status]}</td>
                          <td className="py-3 font-semibold text-emerald-700">{r.attendanceRate == null ? "—" : `${r.attendanceRate}%`}</td>
                          <td className="py-3 text-slate-700">{r.reportsSubmitted}</td>
                          <td className="py-3 text-rose-700">{r.absenceWarnings}</td>
                          <td className="py-3 pl-2 font-bold text-slate-800">{r.finalGrade == null ? "—" : `${r.finalGrade} / 100`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* ═════════════ الترشيح ═════════════ */}
          {activePage === "الترشيح" && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">ترشيح الطلاب المتقدمين لجهات التدريب</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      الطالب يتقدّم على الفرصة من بوابته ← ترشّحه هنا ← تقبله جهة التدريب أو ترفضه ← ينشئ مسؤول النظام التكليف.
                      المتقدمون مرتبون حسب المعدل التراكمي.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[["PENDING", "بانتظار ترشيحك"], ["NOMINATED", "مرشّحون"], ["APPROVED", "مقبولون"], ["REJECTED", "مرفوضون"], ["", "الكل"]].map(([v, l]) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setAppFilter(v)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold ${appFilter === v ? "bg-emerald-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {applicationsByOpportunity.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">لا توجد طلبات في هذا التصنيف.</p>
              )}

              {applicationsByOpportunity.map(({ opportunity: o, items }) => (
                <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{o.title}</h3>
                      <p className="text-xs text-slate-500">
                        {o.organization.name} — {o.organization.city} • المقاعد: {o.seats} • آخر موعد للتقديم: {ymd(o.deadline) || "—"}
                      </p>
                    </div>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${o.status === "OPEN" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {o.status === "OPEN" ? "التقديم متاح" : "التقديم مغلق"}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                        <div>
                          <p className="font-bold text-slate-900">{a.student.user.name}</p>
                          <p className="text-xs text-slate-500">
                            {a.student.universityId} • {a.student.major} • المعدل: {a.student.gpa ?? "—"} • تاريخ التقديم: {ymd(a.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge info={APP_STATUS[a.status]} />
                          {a.status === "PENDING" && (
                            <button
                              type="button"
                              disabled={busy || o.status !== "OPEN"}
                              onClick={() => handleNominate(a)}
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                            >
                              ترشيح للجهة
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* ═════════════ المتابعة ═════════════ */}
          {activePage === "المتابعة" && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">متابعة المتدربين</h2>
                    <p className="text-xs text-slate-600">نسبة الحضور والتقارير وإنذارات الجهة لكل متدرب.</p>
                  </div>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث بالاسم أو الرقم الجامعي أو الجهة..."
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm sm:w-72"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                        <th className="p-3">المتدرب</th>
                        <th className="p-3">جهة التدريب</th>
                        <th className="p-3">نسبة الحضور</th>
                        <th className="p-3">التقارير</th>
                        <th className="p-3">الإنذارات</th>
                        <th className="p-3">التفاصيل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.map((r) => (
                        <tr key={r.assignment.id} className={selectedAssignmentId === r.assignment.id ? "bg-emerald-50/50" : ""}>
                          <td className="p-3 font-bold text-slate-900">{r.assignment.student.user.name}</td>
                          <td className="p-3 text-slate-700">{r.assignment.opportunity.organization.name}</td>
                          <td className="p-3 font-bold text-emerald-700">{r.attendanceRate == null ? "—" : `${r.attendanceRate}%`}</td>
                          <td className="p-3 text-slate-700">{r.reportsSubmitted} تقارير</td>
                          <td className="p-3 font-semibold text-rose-700">{r.absenceWarnings} إنذارات</td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => setSelectedAssignmentId(r.assignment.id)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-800 hover:bg-slate-100"
                            >
                              عرض السجل
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {followUpRow && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900">بطاقة متابعة: {followUpRow.assignment.student.user.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {followUpRow.assignment.opportunity.title} — {followUpRow.assignment.opportunity.organization.name} • مشرف الجهة:{" "}
                    {followUpRow.assignment.orgSupervisor.user.name} • {ASSIGNMENT_STATUS[followUpRow.assignment.status]}
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-4 text-xs sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="text-slate-500">تاريخ المباشرة (نموذج 1)</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{ymd(followUpRow.assignment.commencementDate) || "لم يباشر بعد"}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="text-slate-500">الدرجة النهائية من 100</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{followUpRow.finalGrade == null ? "لم تُرصد بعد" : `${followUpRow.finalGrade} / 100`}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3.5">
                      <p className="text-slate-500">التوظيف بعد التدريب</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {followUpRow.assignment.employedAfterTraining == null
                          ? followUpRow.assignment.status === "COMPLETED" ? "لم يُسجَّل بعد" : "بعد اكتمال التدريب"
                          : followUpRow.assignment.employedAfterTraining
                          ? `توظّف في ${followUpRow.assignment.employerName}`
                          : "لم يتوظف بعد"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
                    <p className="font-bold text-slate-700">ملاحظات المشرف على المتدرب (تصل للمتدرب كإشعار):</p>
                    <form onSubmit={handleAddNote} className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="أضف ملاحظة جديدة..."
                        className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs"
                      />
                      <button type="submit" disabled={busy} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                        حفظ الملاحظة
                      </button>
                    </form>
                    <div className="mt-2 divide-y divide-slate-200">
                      {notes.length === 0 && <p className="py-2 text-slate-500">لا توجد ملاحظات مسجلة حالياً.</p>}
                      {notes.map((n) => (
                        <div key={n.id} className="py-2">
                          <p className="text-slate-700">{n.note}</p>
                          <p className="text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ═════════════ الحضور ═════════════ */}
          {activePage === "الحضور" && (
            <div className="space-y-6">
              {/* 1. طلبات الطلاب: أعذار الغياب ونسيان تسجيل الانصراف (تصل كرسائل من بوابة الطالب) */}
              <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">طلبات الطلاب: أعذار الغياب ونسيان الانصراف</h2>
                    <p className="mt-1 text-xs text-slate-600">
                      تعديل سجل الحضور من صلاحية جهة التدريب. ردّ على الطالب، أو حوّل الطلب لمشرف الجهة لاعتماده.
                    </p>
                  </div>
                  <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">الطلبات: {studentRequests.length}</span>
                </div>

                {studentRequests.length === 0 && <p className="text-sm text-slate-500">لا توجد طلبات من الطلاب.</p>}
                <div className="space-y-3">
                  {studentRequests.map((req) => (
                    <div key={req.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold text-slate-900">{req.student.name} — {req.subject}</p>
                        <span className="text-[11px] text-slate-500">{fmtDateTime(req.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-xs leading-6 text-slate-700">{req.body}</p>
                      <textarea
                        rows={2}
                        value={replyDrafts[req.id] || ""}
                        onChange={(e) => setReplyDrafts({ ...replyDrafts, [req.id]: e.target.value })}
                        placeholder="ردك على الطالب أو ملاحظتك لجهة التدريب..."
                        className="mt-2 w-full rounded-xl border border-slate-300 p-2.5 text-xs"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => handleReplyToStudent(req)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                          إرسال الرد للطالب
                        </button>
                        <button type="button" disabled={busy} onClick={() => handleForwardToProvider(req)} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                          تحويل لجهة التدريب لتعديل الحضور
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2. سجل الحضور كما سجّله المتدرب وجهة التدريب */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">سجل الحضور</h3>
                    <p className="mt-1 text-xs text-slate-600">يسجّل المتدرب حضوره وانصرافه، وتعدّل جهة التدريب الحالة عند الحاجة.</p>
                  </div>
                  <select
                    value={attendanceAssignmentId ?? ""}
                    onChange={(e) => setAttendanceAssignmentId(Number(e.target.value))}
                    className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold"
                  >
                    {rows.map((r) => (
                      <option key={r.assignment.id} value={r.assignment.id}>
                        {r.assignment.student.user.name} (الحضور: {r.attendanceRate == null ? "—" : `${r.attendanceRate}%`})
                      </option>
                    ))}
                  </select>
                </div>

                {attendance.summary && (
                  <div className="mb-4 grid grid-cols-2 gap-3 text-center text-xs sm:grid-cols-4">
                    {[["present", "حاضر", "text-emerald-700"], ["late", "متأخر", "text-amber-700"], ["excused", "غائب بعذر", "text-sky-700"], ["absent", "غائب", "text-rose-700"]].map(([k, l, c]) => (
                      <div key={k} className="rounded-xl bg-slate-50 p-3">
                        <p className={`text-xl font-extrabold ${c}`}>{attendance.summary[k]}</p>
                        <p className="text-slate-600">{l}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {attendance.items.length === 0 && <p className="p-4 text-sm text-slate-500">لا يوجد سجل حضور بعد.</p>}
                  {attendance.items.map((log) => (
                    <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{ymd(log.date)}</p>
                        <p className="text-slate-500">
                          {log.checkIn ? `حضور ${fmtDateTime(log.checkIn).split("،").pop()}` : "لم يسجل حضور"}
                          {" • "}
                          {log.checkOut ? `انصراف ${fmtDateTime(log.checkOut).split("،").pop()}` : log.checkIn ? "لم يسجل انصراف" : ""}
                        </p>
                      </div>
                      <Badge info={ATT_STATUS[log.status]} />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ═════════════ التقارير ═════════════ */}
          {activePage === "التقارير" && (
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
                <h2 className="text-base font-bold text-slate-900">تقارير المتدربين</h2>
                <div className="flex flex-wrap gap-2">
                  {[["SUBMITTED", "بانتظار المراجعة"], ["APPROVED", "معتمدة"], ["REJECTED", "مرفوضة"], ["", "الكل"]].map(([v, l]) => (
                    <button key={l} type="button" onClick={() => setReportFilter(v)} className={`rounded-lg px-3 py-1 text-xs font-bold ${reportFilter === v ? "bg-emerald-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {studentReportsList.length === 0 && <p className="text-sm text-slate-500">لا توجد تقارير في هذا التصنيف.</p>}
                {studentReportsList.map((rep) => (
                  <button
                    key={rep.id}
                    type="button"
                    onClick={() => {
                      setSelectedReportId(rep.id);
                      setReportCommentDraft("");
                    }}
                    className={`w-full rounded-xl border p-3.5 text-right transition ${
                      selectedReport?.id === rep.id ? "border-emerald-600 bg-emerald-50/70" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900">{rep.title}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${REPORT_STATUS[rep.status].cls}`}>{REPORT_STATUS[rep.status].label}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {rep.submittedBy.name} • {REPORT_TYPE[rep.type]} • {ymd(rep.createdAt)} {rep.attachment ? "• 📎 ملف مرفق" : ""}
                    </p>
                  </button>
                ))}
              </div>

              {selectedReport ? (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{selectedReport.title}</h3>
                      <p className="text-xs text-slate-500">
                        مقدم من: {selectedReport.submittedBy.name} • {rowOf(selectedReport.assignmentId)?.assignment.opportunity.organization.name} • تاريخ الرفع: {ymd(selectedReport.createdAt)}
                      </p>
                    </div>
                    <Badge info={REPORT_STATUS[selectedReport.status]} />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-1.5 text-xs font-bold text-slate-500">محتوى التقرير:</p>
                    <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{selectedReport.content}</p>
                  </div>

                  {selectedReport.attachment && (
                    <button
                      type="button"
                      onClick={() => api.downloadAttachment(selectedReport.attachment)}
                      className="flex w-full items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm hover:bg-emerald-100"
                    >
                      <span className="font-semibold text-emerald-900">📎 {selectedReport.attachment.originalName}</span>
                      <span className="text-xs font-bold text-emerald-700">تحميل</span>
                    </button>
                  )}

                  {selectedReport.status === "SUBMITTED" ? (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700">ملاحظة للطالب (اختيارية — تُرسل له كرسالة)</label>
                        <textarea
                          rows={3}
                          value={reportCommentDraft}
                          onChange={(e) => setReportCommentDraft(e.target.value)}
                          placeholder="مثال: يرجى إضافة تفاصيل المهام اليومية..."
                          className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button type="button" disabled={busy} onClick={() => handleReportDecision("APPROVED")} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                          اعتماد التقرير
                        </button>
                        <button type="button" disabled={busy} onClick={() => handleReportDecision("REJECTED")} className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-800 disabled:opacity-50">
                          رفض التقرير
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      {selectedReport.status === "REJECTED"
                        ? "تم رفض التقرير. يستطيع الطالب تعديله وإعادة إرساله، وسيظهر هنا بانتظار المراجعة."
                        : "تم اعتماد هذا التقرير."}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 lg:col-span-7">
                  اختر تقريراً لعرض محتواه.
                </div>
              )}
            </section>
          )}

          {/* ═════════════ الزيارات والإنذارات ═════════════ */}
          {activePage === "الزيارات" && (
            <div className="space-y-6">
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <form onSubmit={handleCreateVisitRequest} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">طلب زيارة ميدانية لجهة التدريب</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      يحجز المشرف الموعد، وتوافق جهة التدريب أو تعتذر من بوابتها، ويصلك ردها هنا.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">جهة التدريب (التي لديك فيها متدربون حاليون)</label>
                    <select
                      value={visitOrgSupervisorId}
                      onChange={(e) => setVisitOrgSupervisorId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    >
                      <option value="">اختر...</option>
                      {visitTargets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.org.name} ({t.org.city}) — {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">تاريخ الزيارة المقترح</label>
                      <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">الوقت</label>
                      <input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">رسالة الطلب (اختيارية — تُكتب رسالة مهذبة تلقائياً)</label>
                    <textarea
                      rows={2}
                      value={visitNotes}
                      onChange={(e) => setVisitNotes(e.target.value)}
                      placeholder="هدف الزيارة أو النقاط المطلوب مناقشتها مع جهة التدريب..."
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                    />
                  </div>

                  <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                    إرسال طلب الزيارة إلى جهة التدريب
                  </button>
                </form>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900">طلبات الزيارة ورد جهة التدريب</h3>
                  {visits.length === 0 && <p className="text-sm text-slate-500">لا توجد زيارات.</p>}
                  {visits.map((v) => {
                    const past = new Date(v.scheduledAt) <= new Date();
                    return (
                      <div key={v.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900">{v.orgSupervisor.organization.name}</span>
                          <Badge info={v.isDone ? { label: "تمت الزيارة ✅", cls: "bg-emerald-100 text-emerald-900" } : VISIT_STATUS[v.status]} />
                        </div>
                        <p className="text-slate-600">
                          الموعد: {fmtDateTime(v.scheduledAt)} • مشرف الجهة: {v.orgSupervisor.user.name} • 📞 <span dir="ltr">{v.orgSupervisor.user.phone || "—"}</span>
                        </p>
                        <p className="text-slate-600">طلبك: {v.requestMessage}</p>
                        <p className="font-semibold text-slate-800">رد الجهة: {v.responseMessage || "لم ترد جهة التدريب بعد"}</p>

                        {v.status === "APPROVED" && (
                          <div className="space-y-2 pt-1">
                            <textarea
                              rows={2}
                              value={visitNoteDrafts[v.id] ?? v.notes ?? ""}
                              onChange={(e) => setVisitNoteDrafts({ ...visitNoteDrafts, [v.id]: e.target.value })}
                              placeholder="ملاحظاتك عن الزيارة..."
                              className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"
                            />
                            <div className="flex flex-wrap gap-2">
                              {!v.isDone && past && (
                                <button type="button" disabled={busy} onClick={() => handleVisitDone(v)} className="rounded-lg bg-emerald-700 px-2.5 py-1 font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                                  تسجيل «تمت الزيارة»
                                </button>
                              )}
                              <button type="button" disabled={busy} onClick={() => handleSaveVisitNotes(v)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                                حفظ الملاحظات
                              </button>
                            </div>
                          </div>
                        )}
                        {["PENDING", "APPROVED"].includes(v.status) && !v.isDone && !past && (
                          <button type="button" disabled={busy} onClick={() => handleCancelVisit(v)} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                            إلغاء الزيارة
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900">إنذارات الغياب (من جهات التدريب)</h3>
                  <p className="text-xs text-slate-500">تُصدر جهة التدريب الإنذار من بوابتها، ويصل للمتدرب ولك.</p>
                  <div className="divide-y divide-slate-100">
                    {absenceWarnings.length === 0 && <p className="py-2 text-sm text-slate-500">لا توجد إنذارات.</p>}
                    {absenceWarnings.map((w) => (
                      <div key={w.id} className="py-2.5 text-xs">
                        <p className="font-bold text-rose-800">{nameOf(w.assignmentId)} — {ymd(w.createdAt)}</p>
                        <p className="text-slate-700">{w.content}</p>
                        <p className="text-[11px] text-slate-400">من: {w.submittedBy.name}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900">تقارير الزيارة والإفادات (من جهات التدريب)</h3>
                  <div className="divide-y divide-slate-100">
                    {providerVisitReports.length === 0 && <p className="py-2 text-sm text-slate-500">لا توجد تقارير من الجهات.</p>}
                    {providerVisitReports.map((r) => (
                      <div key={r.id} className="py-2.5 text-xs">
                        <p className="font-bold text-slate-900">{REPORT_TYPE[r.type]}: {r.title} — {nameOf(r.assignmentId)}</p>
                        <p className="mt-0.5 text-slate-600">{r.content}</p>
                        <p className="text-[11px] text-slate-400">من: {r.submittedBy.name} • {ymd(r.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ═════════════ النماذج والتقييم ═════════════ */}
          {activePage === "النماذج والتقييم" && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <label className="mb-1 block text-xs font-bold text-slate-700">اختر المتدرب</label>
                <select
                  value={evalAssignmentId ?? ""}
                  onChange={(e) => setEvalAssignmentId(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                >
                  {rows.map((r) => (
                    <option key={r.assignment.id} value={r.assignment.id}>
                      {r.assignment.student.user.name} — {r.assignment.opportunity.organization.name} ({ASSIGNMENT_STATUS[r.assignment.status]})
                    </option>
                  ))}
                </select>
              </div>

              {evalRow && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="space-y-6 lg:col-span-7">
                    {/* نموذج (1) */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h2 className="text-base font-bold text-slate-900">نموذج (1): مباشرة المتدرب بجهة التدريب</h2>
                      {form1 && (
                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          {[
                            ["الفصل الدراسي", form1.semester],
                            ["العام الجامعي", form1.academicYear],
                            ["جهة التدريب", form1.organization.name],
                            ["المشرف الميداني", `${form1.fieldSupervisor.name}${form1.fieldSupervisor.position ? ` — ${form1.fieldSupervisor.position}` : ""}`],
                            ["المتدرب", `${form1.trainee.name} (${form1.trainee.universityId})`],
                            ["تاريخ المباشرة", form1.commencementDate || "لم يباشر بعد"],
                          ].map(([k, v]) => (
                            <div key={k} className="rounded-xl bg-slate-50 p-3">
                              <p className="text-slate-500">{k}</p>
                              <p className="mt-0.5 font-bold text-slate-900">{v || "—"}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-[11px] text-slate-400">يُسجَّل تاريخ المباشرة تلقائياً مع أول حضور، وتؤكده جهة التدريب.</p>
                    </div>

                    {/* الدرجة النهائية */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-base font-bold text-slate-900">الدرجة النهائية للمتدرب</h2>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">من 100</span>
                      </div>
                      {evalRow.finalGrade != null ? (
                        <p className="mt-3 text-3xl font-extrabold text-emerald-700">{evalRow.finalGrade} / 100</p>
                      ) : evalRow.assignment.status === "CANCELLED" ? (
                        <p className="mt-3 text-sm text-slate-500">التكليف ملغى.</p>
                      ) : (
                        <form onSubmit={handleSetFinalGrade} className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            type="number" min={0} max={100}
                            value={scoreInput}
                            onChange={(e) => setScoreInput(e.target.value)}
                            placeholder="0 إلى 100"
                            className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                          />
                          <button type="submit" disabled={busy} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                            رصد الدرجة
                          </button>
                        </form>
                      )}
                      <p className="mt-2 text-[11px] text-slate-400">تُرصد مرة واحدة، وبرصدها يكتمل التدريب ويصل إشعار للمتدرب.</p>
                    </div>

                    {/* التوظيف بعد التدريب */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h2 className="text-base font-bold text-slate-900">التوظيف بعد التدريب (مؤشر أثر)</h2>
                      {evalRow.assignment.status !== "COMPLETED" ? (
                        <p className="mt-2 text-sm text-slate-500">يُسجَّل بعد اكتمال التدريب (رصد الدرجة النهائية).</p>
                      ) : evalRow.assignment.employedAfterTraining != null ? (
                        <p className="mt-2 text-sm font-bold text-slate-800">
                          {evalRow.assignment.employedAfterTraining ? `✅ توظّف في: ${evalRow.assignment.employerName}` : "لم يتوظف بعد"}
                        </p>
                      ) : (
                        <form onSubmit={handleEmployment} className="mt-3 space-y-3 text-sm">
                          <div className="flex gap-6">
                            {[["yes", "توظّف"], ["no", "لم يتوظف بعد"]].map(([v, l]) => (
                              <label key={v} className="flex items-center gap-2">
                                <input type="radio" name="employed" checked={employment.employed === v} onChange={() => setEmployment({ ...employment, employed: v })} />
                                {l}
                              </label>
                            ))}
                          </div>
                          {employment.employed === "yes" && (
                            <input
                              value={employment.employerName}
                              onChange={(e) => setEmployment({ ...employment, employerName: e.target.value })}
                              placeholder="اسم جهة العمل"
                              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                            />
                          )}
                          <button type="submit" disabled={busy || !employment.employed} className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                            حفظ
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* نموذج (2) */}
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5">
                    <h3 className="text-base font-bold text-slate-900">نموذج (2): تقييم المتدرب من جهة التدريب</h3>
                    {!form2 ? (
                      <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                        لم تقيّم جهة التدريب هذا المتدرب بعد.
                      </p>
                    ) : (
                      <>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-center">
                          <p className="text-3xl font-extrabold text-emerald-800">{form2.totalScore} / {form2.maxScore}</p>
                          <p className="mt-1 text-xs text-slate-600">{form2.organization.name}</p>
                        </div>
                        <table className="w-full text-right text-xs">
                          <tbody className="divide-y divide-slate-100">
                            {criteria.map((c) => (
                              <tr key={c.key}>
                                <td className="py-2 text-slate-700">{c.label}</td>
                                <td className="py-2 text-center font-bold text-slate-900">{form2.scores[c.key]?.score ?? "—"} / {c.max}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                          <p>• الرغبة في توظيفه بعد التخرج: <strong>{form2.wouldHire ? "نعم" : "لا"}</strong>{!form2.wouldHire && form2.noHireReason ? ` — ${form2.noHireReason}` : ""}</p>
                          {form2.satisfaction != null && <p>• رضا الجهة عن البرنامج: <strong>{form2.satisfaction} / 5</strong></p>}
                          {form2.comments && <p>• ملاحظات: {form2.comments}</p>}
                          <p>• المقيّم: {form2.evaluator.name}{form2.evaluator.jobTitle ? ` — ${form2.evaluator.jobTitle}` : ""} • {ymd(form2.evaluatedAt)}</p>
                        </div>
                        {form2.signature && <img src={form2.signature} alt="توقيع المقيّم" className="h-16 rounded border border-slate-200 bg-white" />}
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ═════════════ الإشعارات والمراسلة ═════════════ */}
          {activePage === "المراسلة" && (
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <form onSubmit={handleSendMessage} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5">
                <h2 className="text-lg font-bold text-slate-900">إرسال رسالة</h2>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">المرسل إليه (متدربوك وجهاتهم)</label>
                  <select value={msgRecipientId} onChange={(e) => setMsgRecipientId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                    <option value="">اختر...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.role === "STUDENT" ? `المتدرب: ${c.name}` : `جهة التدريب — ${c.organizationName}: ${c.name}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">العنوان (اختياري)</label>
                  <input type="text" value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} placeholder="عنوان الرسالة..." className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">نص الرسالة</label>
                  <textarea rows={3} required value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder="اكتب محتوى الرسالة..." className="w-full rounded-xl border border-slate-300 p-3 text-sm" />
                </div>
                <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
                  إرسال الرسالة
                </button>

                <div className="border-t border-slate-100 pt-3">
                  <h3 className="mb-2 text-sm font-bold text-slate-900">المحادثات</h3>
                  {conversations.length === 0 && <p className="text-xs text-slate-500">لا توجد محادثات.</p>}
                  {conversations.map((c) => (
                    <div key={c.user.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs last:border-0">
                      <div>
                        <p className="font-bold text-slate-900">{c.user.name}</p>
                        <p className="line-clamp-1 text-slate-500">{c.lastMessage.subject || c.lastMessage.body}</p>
                      </div>
                      {c.unreadCount > 0 && (
                        <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">{c.unreadCount}</span>
                      )}
                    </div>
                  ))}
                </div>
              </form>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900">الإشعارات</h3>
                  <button type="button" onClick={handleMarkAllRead} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100">
                    تعليم الكل كمقروء
                  </button>
                </div>
                <div className="space-y-2.5">
                  {notifications.items.length === 0 && <p className="text-sm text-slate-500">لا توجد إشعارات.</p>}
                  {notifications.items.map((n) => (
                    <div key={n.id} className={`rounded-xl border p-3.5 text-xs ${!n.isRead ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-800">{n.message}</span>
                        <span className="shrink-0 text-[11px] text-slate-500">{fmtDateTime(n.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
