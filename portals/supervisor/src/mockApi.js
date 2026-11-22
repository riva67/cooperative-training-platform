// ─────────────────────────────────────────────────────────────────────────────
// MOCK API — temporary, until the portal is connected to the backend.
//
// Every function here has the SAME name, arguments, response shape and rules as the real backend
// endpoint written next to it, and the data uses the real field names and values
// (PENDING / NOMINATED / APPROVED, WEEKLY / ABSENCE_WARNING, ...).
// To connect: replace this file with an api.js that calls the endpoints with fetch. App.jsx does not change.
// ─────────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const DAY = 864e5;
const now = () => new Date();
const iso = (d) => new Date(d).toISOString();
const dateOnly = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
};
const at = (offsetDays, hh, mm = 0) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
const delay = (value) => new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 120));
const fail = (status, message) => Promise.reject(new ApiError(status, message));

// ───────────── data (same tables / fields as prisma/schema.prisma) ─────────────
const ME_USER_ID = 3; // the logged-in academic supervisor

const db = {
  users: [
    { id: 3, name: 'د. سارة المنصور', email: 'academic@coop.test', phone: '0500000003', role: 'ACADEMIC_SUPERVISOR' },
    { id: 11, name: 'أروى القحطاني', email: 'arwa@coop.test', phone: '0551110011', role: 'STUDENT' },
    { id: 12, name: 'لين الدوسري', email: 'leen@coop.test', phone: '0551110012', role: 'STUDENT' },
    { id: 13, name: 'جنى الحربي', email: 'jana@coop.test', phone: '0551110013', role: 'STUDENT' },
    { id: 14, name: 'ريم الشهري', email: 'reem.s@coop.test', phone: '0551110014', role: 'STUDENT' },
    { id: 15, name: 'نوف السبيعي', email: 'nouf@coop.test', phone: '0551110015', role: 'STUDENT' },
    { id: 21, name: 'م. خالد العتيبي', email: 'khalid@digital.test', phone: '0112223344', role: 'ORG_SUPERVISOR' },
    { id: 22, name: 'أ. هند الشمري', email: 'hind@innovation.test', phone: '0138889900', role: 'ORG_SUPERVISOR' },
  ],
  academicSupervisors: [{ id: 1, userId: 3, department: 'علوم الحاسب ونظم المعلومات' }],
  organizations: [
    { id: 1, name: 'شركة الحلول الرقمية المتقدمة', type: 'PRIVATE', sector: 'شركة', city: 'الرياض', crNumber: '1010101010', contactEmail: 'hr@digital.test', phone: '0112223344' },
    { id: 2, name: 'مؤسسة الابتكار التقني', type: 'PRIVATE', sector: 'مؤسسة', city: 'الخبر', crNumber: '2050505050', contactEmail: 'hr@innovation.test', phone: '0138889900' },
  ],
  orgSupervisors: [
    { id: 1, userId: 21, organizationId: 1, position: 'مدير التطوير' },
    { id: 2, userId: 22, organizationId: 2, position: 'مسؤولة الموارد البشرية' },
  ],
  students: [
    { id: 1, userId: 11, universityId: '442001122', major: 'علوم الحاسب', gpa: 4.6 },
    { id: 2, userId: 12, universityId: '442001489', major: 'نظم المعلومات', gpa: 4.1 },
    { id: 3, userId: 13, universityId: '442001877', major: 'علوم الحاسب', gpa: 4.8 },
    { id: 4, userId: 14, universityId: '442001930', major: 'تقنية المعلومات', gpa: 3.9 },
    { id: 5, userId: 15, universityId: '441009876', major: 'علوم الحاسب', gpa: 4.4 },
  ],
  opportunities: [
    {
      id: 1, organizationId: 1, title: 'تدريب تعاوني — تطوير تطبيقات الويب', type: 'COOP', status: 'OPEN', seats: 3,
      description: 'تطوير واجهات ويب تفاعلية مع فريق التطوير.', startDate: dateOnly(-60), endDate: dateOnly(40),
      deadline: dateOnly(10), location: 'الرياض، حي العليا', target: 'علوم الحاسب', requirements: 'HTML و CSS و JavaScript', createdAt: at(-90, 9),
    },
    {
      id: 2, organizationId: 2, title: 'تدريب تعاوني — تحليل البيانات', type: 'COOP', status: 'OPEN', seats: 2,
      description: 'إعداد تقارير البيانات ولوحات المؤشرات.', startDate: dateOnly(-55), endDate: dateOnly(45),
      deadline: dateOnly(12), location: 'الخبر', target: 'نظم المعلومات', requirements: 'Excel وأساسيات SQL', createdAt: at(-88, 9),
    },
  ],
  applications: [
    { id: 1, studentId: 1, opportunityId: 1, status: 'APPROVED', createdAt: at(-80, 10), updatedAt: at(-70, 10) },
    { id: 2, studentId: 2, opportunityId: 2, status: 'APPROVED', createdAt: at(-79, 11), updatedAt: at(-69, 11) },
    { id: 3, studentId: 3, opportunityId: 1, status: 'PENDING', createdAt: at(-3, 12), updatedAt: at(-3, 12) },
    { id: 4, studentId: 4, opportunityId: 2, status: 'NOMINATED', createdAt: at(-5, 9), updatedAt: at(-2, 9) },
    { id: 5, studentId: 3, opportunityId: 2, status: 'PENDING', createdAt: at(-2, 13), updatedAt: at(-2, 13) },
    { id: 6, studentId: 5, opportunityId: 1, status: 'APPROVED', createdAt: at(-200, 9), updatedAt: at(-190, 9) },
  ],
  // TrainingAssignment
  assignments: [
    {
      id: 1, studentId: 1, opportunityId: 1, academicSupervisorId: 1, orgSupervisorId: 1, status: 'ACTIVE',
      startDate: dateOnly(-60), endDate: dateOnly(40), semester: 'الأول', academicYear: '1448',
      commencementDate: dateOnly(-60), employedAfterTraining: null, employerName: null, employmentRecordedAt: null,
    },
    {
      id: 2, studentId: 2, opportunityId: 2, academicSupervisorId: 1, orgSupervisorId: 2, status: 'ACTIVE',
      startDate: dateOnly(-55), endDate: dateOnly(45), semester: 'الأول', academicYear: '1448',
      commencementDate: dateOnly(-54), employedAfterTraining: null, employerName: null, employmentRecordedAt: null,
    },
    {
      id: 3, studentId: 5, opportunityId: 1, academicSupervisorId: 1, orgSupervisorId: 1, status: 'COMPLETED',
      startDate: dateOnly(-180), endDate: dateOnly(-90), semester: 'الثاني', academicYear: '1447',
      commencementDate: dateOnly(-180), employedAfterTraining: null, employerName: null, employmentRecordedAt: null,
    },
  ],
  attendance: [
    { id: 1, assignmentId: 1, date: dateOnly(-4), checkIn: at(-4, 8, 2), checkOut: at(-4, 15, 5), status: 'PRESENT' },
    { id: 2, assignmentId: 1, date: dateOnly(-3), checkIn: at(-3, 8, 40), checkOut: at(-3, 15, 0), status: 'LATE' },
    { id: 3, assignmentId: 1, date: dateOnly(-2), checkIn: null, checkOut: null, status: 'EXCUSED' },
    { id: 4, assignmentId: 1, date: dateOnly(-1), checkIn: at(-1, 7, 58), checkOut: null, status: 'PRESENT' },
    { id: 5, assignmentId: 2, date: dateOnly(-4), checkIn: at(-4, 8, 0), checkOut: at(-4, 14, 50), status: 'PRESENT' },
    { id: 6, assignmentId: 2, date: dateOnly(-3), checkIn: null, checkOut: null, status: 'ABSENT' },
    { id: 7, assignmentId: 2, date: dateOnly(-2), checkIn: null, checkOut: null, status: 'ABSENT' },
    { id: 8, assignmentId: 2, date: dateOnly(-1), checkIn: at(-1, 8, 5), checkOut: at(-1, 15, 2), status: 'PRESENT' },
  ],
  reports: [
    {
      id: 1, assignmentId: 1, type: 'WEEKLY', weekNumber: 3, title: 'تقرير الأسبوع 3', status: 'APPROVED', submittedById: 11,
      content: 'تعرفت على بيئة العمل وأدوات الفريق وبدأت مهمة صفحة الدخول.', attachmentId: null, createdAt: at(-14, 13), updatedAt: at(-12, 9),
    },
    {
      id: 2, assignmentId: 1, type: 'WEEKLY', weekNumber: 4, title: 'تقرير الأسبوع 4', status: 'SUBMITTED', submittedById: 11,
      content: 'صممت مخطط قاعدة البيانات للمشروع التجريبي، وراجعت متطلبات واجهة المستخدم مع الفريق، ووثقت نقاط الاختبار الأساسية.',
      attachmentId: 1, createdAt: at(-6, 13), updatedAt: at(-6, 13),
    },
    {
      id: 3, assignmentId: 2, type: 'WEEKLY', weekNumber: 3, title: 'تقرير الأسبوع 3', status: 'SUBMITTED', submittedById: 12,
      content: 'أعددت تقارير المتابعة اليومية واختبرت نماذج الإدخال والتحقق من صحة البيانات.', attachmentId: null, createdAt: at(-8, 14), updatedAt: at(-8, 14),
    },
    {
      id: 4, assignmentId: 2, type: 'ABSENCE_WARNING', weekNumber: null, title: 'إنذار غياب', status: 'SUBMITTED', submittedById: 22,
      content: 'تغيبت المتدربة يومين متتاليين دون عذر مسبق.', attachmentId: null, createdAt: at(-2, 10), updatedAt: at(-2, 10),
    },
    {
      id: 5, assignmentId: 2, type: 'VISIT', weekNumber: null, title: 'تقرير زيارة', status: 'SUBMITTED', submittedById: 22,
      content: 'تمت زيارة المشرف الأكاديمي، والمتدربة منتظمة في المهام وتحتاج متابعة في الحضور.', attachmentId: null, createdAt: at(-9, 12), updatedAt: at(-9, 12),
    },
  ],
  attachments: [{ id: 1, originalName: 'تقرير الأسبوع الرابع.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 48213 }],
  notes: [
    { id: 1, assignmentId: 1, supervisorId: 3, note: 'متابعة جيدة، وتحتاج للالتزام بموعد الحضور.', createdAt: at(-10, 11) },
  ],
  evaluations: [
    {
      id: 1, assignmentId: 3, evaluatorId: 21, totalScore: 37, wouldHire: true, noHireReason: null, comments: 'متدربة متميزة.',
      evaluatorTitle: 'مدير التطوير', signature: null, satisfaction: 5, createdAt: at(-92, 10),
      scores: {
        attendance: { score: 5 }, practical_application: { score: 4 }, ambition: { score: 5 }, cooperation: { score: 5 },
        conduct: { score: 5 }, regulations: { score: 4 }, performance: { score: 4 }, tools: { score: 5 },
      },
    },
  ],
  finalGrades: [{ id: 1, assignmentId: 3, grade: 92, finalizedById: 3, finalizedAt: at(-88, 10) }],
  visits: [
    {
      id: 1, academicSupervisorId: 1, orgSupervisorId: 1, scheduledAt: at(4, 10, 30), status: 'PENDING',
      requestMessage: 'أرغب بزيارة جهة التدريب لمتابعة سير التدريب والاطلاع على بيئة العمل.',
      responseMessage: null, respondedAt: null, isDone: false, doneAt: null, notes: null, createdAt: at(-1, 9), updatedAt: at(-1, 9),
    },
    {
      id: 2, academicSupervisorId: 1, orgSupervisorId: 2, scheduledAt: at(-9, 11), status: 'APPROVED',
      requestMessage: 'زيارة تفقدية لمتابعة المتدربة ومناقشة نموذج التقييم.',
      responseMessage: 'الوقت مناسب جداً ونتطلع للقائكم قريباً.', respondedAt: at(-11, 9), isDone: false, doneAt: null, notes: null, createdAt: at(-12, 9), updatedAt: at(-11, 9),
    },
  ],
  notifications: [
    { id: 1, userId: 3, message: 'جنى الحربي قدّمت على "تدريب تعاوني — تطوير تطبيقات الويب".', isRead: false, createdAt: at(-3, 12) },
    { id: 2, userId: 3, message: 'أروى القحطاني رفعت تقرير WEEKLY: تقرير الأسبوع 4', isRead: false, createdAt: at(-6, 13) },
    { id: 3, userId: 3, message: 'جهة التدريب أرسلت إنذار غياب للمتدربة لين الدوسري.', isRead: true, createdAt: at(-2, 10) },
  ],
  // requests students send to their supervisor from the student portal are messages with these subjects
  messages: [
    {
      id: 1, senderId: 11, recipientId: 3, subject: 'طلب اعتماد انصراف (نسيان تسجيل الانصراف)', attachmentId: null, readAt: null, createdAt: at(0, 7, 30),
      body: `الطالب: أروى القحطاني\nالأيام: ${dateOnly(-1).slice(0, 10)}\nوقت الانصراف الفعلي/التقديري: 15:00\nسبب النسيان: تعطل الشبكة الداخلية نهاية الدوام.`,
    },
    {
      id: 2, senderId: 12, recipientId: 3, subject: 'عذر غياب', attachmentId: null, readAt: null, createdAt: at(-1, 18),
      body: `الطالب: لين الدوسري\nتاريخ الغياب: ${dateOnly(-3).slice(0, 10)}\nالعذر: موعد طبي (المرفق لاحقاً).`,
    },
    { id: 3, senderId: 3, recipientId: 22, subject: 'متابعة حضور المتدربة', attachmentId: null, readAt: at(-1, 9), createdAt: at(-2, 12), body: 'نأمل إفادتنا بحضور المتدربة خلال الأسبوع.' },
  ],
};

const CRITERIA = [
  { key: 'attendance', label: 'الحضور والمواظبة في أوقات الدوام الرسمية', max: 5 },
  { key: 'practical_application', label: 'القدرة على التطبيق العملي للمعارف والمهارات', max: 5 },
  { key: 'ambition', label: 'الطموح والرغبة في التعلم واكتساب خبرة جديدة', max: 5 },
  { key: 'cooperation', label: 'الرغبة في التعاون والمشاركة في العمل', max: 5 },
  { key: 'conduct', label: 'حسن التعامل مع الزملاء والاهتمام بالمظهر والسلوك العام', max: 5 },
  { key: 'regulations', label: 'مدى الالتزام بلوائح وأنظمة المنشأة', max: 5 },
  { key: 'performance', label: 'مستوى الأداء والإنتاجية', max: 5 },
  { key: 'tools', label: 'القدرة على استعمال أدوات العمل والمحافظة عليها', max: 5 },
];

// ───────────── helpers that build the same nested objects the backend includes ─────────────
const userSelect = (id) => {
  const u = db.users.find((x) => x.id === id);
  return { id: u.id, name: u.name, email: u.email };
};
const contactSelect = (id) => {
  const u = db.users.find((x) => x.id === id);
  return { id: u.id, name: u.name, email: u.email, phone: u.phone };
};
const personSelect = (id) => {
  const u = db.users.find((x) => x.id === id);
  return { id: u.id, name: u.name, role: u.role };
};
const studentWithUser = (studentId) => {
  const s = db.students.find((x) => x.id === studentId);
  return { ...s, user: userSelect(s.userId) };
};
const opportunityWithOrg = (opportunityId) => {
  const o = db.opportunities.find((x) => x.id === opportunityId);
  return { ...o, organization: db.organizations.find((g) => g.id === o.organizationId) };
};
const orgSupervisorWithUser = (id) => {
  const s = db.orgSupervisors.find((x) => x.id === id);
  return { ...s, user: userSelect(s.userId) };
};
const fullAssignment = (a) => ({
  ...a,
  student: studentWithUser(a.studentId),
  opportunity: opportunityWithOrg(a.opportunityId),
  academicSupervisor: { ...db.academicSupervisors.find((x) => x.id === a.academicSupervisorId), user: userSelect(ME_USER_ID) },
  orgSupervisor: orgSupervisorWithUser(a.orgSupervisorId),
});
const fullApplication = (a) => ({ ...a, student: studentWithUser(a.studentId), opportunity: opportunityWithOrg(a.opportunityId) });
const reportWithIncludes = (r) => ({
  ...r,
  submittedBy: personSelect(r.submittedById),
  attachment: r.attachmentId ? db.attachments.find((x) => x.id === r.attachmentId) : null,
});
const visitWithIncludes = (v) => {
  const os = db.orgSupervisors.find((x) => x.id === v.orgSupervisorId);
  return {
    ...v,
    academicSupervisor: { ...db.academicSupervisors[0], user: contactSelect(ME_USER_ID) },
    orgSupervisor: { ...os, user: contactSelect(os.userId), organization: db.organizations.find((g) => g.id === os.organizationId) },
  };
};

// only the assignments this supervisor follows (backend: assignmentAccessWhere)
const myAssignments = () => db.assignments.filter((a) => a.academicSupervisorId === 1);
function getAccessibleAssignment(id) {
  const a = myAssignments().find((x) => x.id === Number(id));
  if (a) return a;
  throw new ApiError(db.assignments.some((x) => x.id === Number(id)) ? 403 : 404,
    db.assignments.some((x) => x.id === Number(id)) ? 'You do not have access to this assignment' : 'Assignment not found');
}
const nextId = (list) => Math.max(0, ...list.map((x) => x.id)) + 1;
const notifyUser = (userId, message) =>
  db.notifications.push({ id: nextId(db.notifications), userId, message, isRead: false, createdAt: iso(now()) });

// ───────────── API ─────────────
export const api = {
  // POST /auth/login   (the real portal receives the session from the main portal)
  login: (email, password) => {
    const u = db.users.find((x) => x.email === email.trim().toLowerCase());
    if (!u || password !== 'Password123!') return fail(401, 'Invalid email or password');
    if (u.role !== 'ACADEMIC_SUPERVISOR') return delay({ token: 'mock', user: { ...personSelect(u.id), email: u.email } });
    return delay({ token: 'mock-token', user: { id: u.id, name: u.name, email: u.email, role: u.role, status: 'ACTIVE', organization: null } });
  },

  // GET /auth/me
  me: () => delay({ ...contactSelect(ME_USER_ID), role: 'ACADEMIC_SUPERVISOR', status: 'ACTIVE', academicSupervisor: db.academicSupervisors[0] }),

  // GET /supervisor/students   -> my trainees with indicators
  supervisedStudents: () =>
    delay(
      myAssignments()
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((a) => {
          const att = db.attendance.filter((r) => r.assignmentId === a.id);
          const attended = att.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
          const reps = db.reports.filter((r) => r.assignmentId === a.id);
          const fg = db.finalGrades.find((g) => g.assignmentId === a.id);
          return {
            assignment: fullAssignment(a),
            attendanceRate: att.length ? Math.round((attended / att.length) * 1000) / 10 : null,
            reportsSubmitted: reps.filter((r) => (r.type === 'WEEKLY' || r.type === 'FINAL') && r.status !== 'DRAFT').length,
            absenceWarnings: reps.filter((r) => r.type === 'ABSENCE_WARNING').length,
            hasEvaluation: db.evaluations.some((e) => e.assignmentId === a.id),
            finalGrade: fg ? fg.grade : null,
          };
        })
    ),

  // GET /applications?status=   (academic supervisors see all applications)
  applications: ({ status } = {}) => {
    const items = db.applications
      .filter((a) => !status || a.status === status)
      .sort((a, b) => b.id - a.id)
      .map(fullApplication);
    return delay({ items, total: items.length, page: 1, pages: 1 });
  },

  // PATCH /applications/:id/status  { status: 'NOMINATED' }   -> only PENDING can be nominated
  nominate: (applicationId) => {
    const a = db.applications.find((x) => x.id === applicationId);
    if (!a) return fail(404, 'Application not found');
    // same checks, in the same order, as the backend (applications.controller.js)
    if (a.status === 'APPROVED' || a.status === 'REJECTED') return fail(400, `This application is already ${a.status} and cannot be changed`);
    if (a.status === 'NOMINATED') return fail(400, 'Application is already NOMINATED');
    if (a.status !== 'PENDING') return fail(400, 'Only PENDING applications can be nominated');
    const opp = db.opportunities.find((o) => o.id === a.opportunityId);
    if (opp.status !== 'OPEN') return fail(400, 'This opportunity is closed');
    a.status = 'NOMINATED';
    a.updatedAt = iso(now());
    return delay(fullApplication(a));
  },

  // GET /assignments/:id/attendance  -> { items, summary }
  attendance: (assignmentId) => {
    try {
      const a = getAccessibleAssignment(assignmentId);
      const items = db.attendance.filter((r) => r.assignmentId === a.id).sort((x, y) => (x.date < y.date ? 1 : -1));
      const summary = { present: 0, absent: 0, late: 0, excused: 0 };
      for (const r of items) summary[r.status.toLowerCase()] += 1;
      return delay({ items, summary });
    } catch (e) {
      return Promise.reject(e);
    }
  },

  // GET /reports   (scoped to my trainees)
  reports: () => {
    const mine = new Set(myAssignments().map((a) => a.id));
    const items = db.reports.filter((r) => mine.has(r.assignmentId)).sort((a, b) => b.id - a.id).map(reportWithIncludes);
    return delay({ items, total: items.length, page: 1, pages: 1 });
  },

  // PATCH /reports/:id/status  { status: 'APPROVED' | 'REJECTED' }
  reviewReport: (reportId, status) => {
    const r = db.reports.find((x) => x.id === reportId);
    if (!r) return fail(404, 'Report not found');
    if (!['WEEKLY', 'FINAL', 'APPROVAL'].includes(r.type)) return fail(400, `${r.type} reports are notices and are not reviewed`);
    if (r.status !== 'SUBMITTED') return fail(400, `Only SUBMITTED reports can be reviewed (this one is ${r.status})`);
    r.status = status;
    r.updatedAt = iso(now());
    const a = db.assignments.find((x) => x.id === r.assignmentId);
    notifyUser(db.students.find((s) => s.id === a.studentId).userId, `Your report "${r.title}" was ${status.toLowerCase()}`);
    return delay(reportWithIncludes(r));
  },

  // GET /assignments/:id/notes
  notes: (assignmentId) => {
    try {
      const a = getAccessibleAssignment(assignmentId);
      return delay(
        db.notes
          .filter((n) => n.assignmentId === a.id)
          .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
          .map((n) => ({ ...n, supervisor: { id: ME_USER_ID, name: db.users[0].name } }))
      );
    } catch (e) {
      return Promise.reject(e);
    }
  },

  // POST /notes  { assignmentId, note }
  addNote: (assignmentId, note) => {
    try {
      const a = getAccessibleAssignment(assignmentId);
      const n = { id: nextId(db.notes), assignmentId: a.id, supervisorId: ME_USER_ID, note, createdAt: iso(now()) };
      db.notes.push(n);
      return delay(n);
    } catch (e) {
      return Promise.reject(e);
    }
  },

  // GET /visits
  visits: () => delay({ items: db.visits.slice().sort((a, b) => (a.scheduledAt < b.scheduledAt ? 1 : -1)).map(visitWithIncludes) }),

  // POST /visits  { orgSupervisorId, scheduledAt, message? }
  requestVisit: ({ orgSupervisorId, scheduledAt, message }) => {
    const when = new Date(scheduledAt);
    if (when <= now()) return fail(400, 'The visit time must be in the future');
    const related = myAssignments().some((a) => a.orgSupervisorId === orgSupervisorId && a.status === 'ACTIVE');
    if (!related) return fail(403, 'You have no active trainees with this organization supervisor');
    const clash = db.visits.some(
      (v) => ['PENDING', 'APPROVED'].includes(v.status) && Math.abs(new Date(v.scheduledAt) - when) < 60 * 60000 &&
        (v.orgSupervisorId === orgSupervisorId || v.academicSupervisorId === 1)
    );
    if (clash) return fail(409, 'There is already a visit at (or within an hour of) this time');
    const v = {
      id: nextId(db.visits), academicSupervisorId: 1, orgSupervisorId, scheduledAt: iso(when), status: 'PENDING',
      requestMessage: message?.trim() || 'السلام عليكم، أرغب بزيارة جهة التدريب ميدانياً. نأمل إفادتنا بمدى مناسبة الموعد.',
      responseMessage: null, respondedAt: null, isDone: false, doneAt: null, notes: null, createdAt: iso(now()), updatedAt: iso(now()),
    };
    db.visits.push(v);
    return delay(visitWithIncludes(v));
  },

  // PATCH /visits/:id  { isDone?, notes? }
  updateVisit: (visitId, { isDone, notes }) => {
    const v = db.visits.find((x) => x.id === visitId);
    if (!v) return fail(404, 'Visit not found');
    if (isDone === true) {
      if (v.status !== 'APPROVED') return fail(400, 'Only an approved visit can be marked as done');
      if (new Date(v.scheduledAt) > now()) return fail(400, 'The visit date has not arrived yet');
      v.isDone = true;
      v.doneAt = iso(now());
    } else if (isDone === false) {
      v.isDone = false;
      v.doneAt = null;
    }
    if (notes !== undefined) v.notes = notes;
    v.updatedAt = iso(now());
    return delay(visitWithIncludes(v));
  },

  // PATCH /visits/:id/cancel
  cancelVisit: (visitId) => {
    const v = db.visits.find((x) => x.id === visitId);
    if (!v) return fail(404, 'Visit not found');
    if (!['PENDING', 'APPROVED'].includes(v.status) || v.isDone) return fail(400, 'This visit can no longer be cancelled');
    v.status = 'CANCELLED';
    v.updatedAt = iso(now());
    return delay(visitWithIncludes(v));
  },

  // GET /evaluations/criteria
  criteria: () => delay({ criteria: CRITERIA, maxTotal: 40 }),

  // GET /evaluations/:assignmentId   -> 404 until the training provider fills form (2)
  evaluation: (assignmentId) => {
    try {
      const a = getAccessibleAssignment(assignmentId);
      const ev = db.evaluations.find((e) => e.assignmentId === a.id);
      if (!ev) return fail(404, 'This trainee has not been evaluated yet');
      const full = fullAssignment(a);
      const evaluator = db.users.find((u) => u.id === ev.evaluatorId);
      return delay({
        id: ev.id, assignmentId: a.id, semester: a.semester, academicYear: a.academicYear,
        trainee: { name: full.student.user.name, universityId: full.student.universityId, major: full.student.major },
        organization: { id: full.opportunity.organization.id, name: full.opportunity.organization.name },
        scores: ev.scores, totalScore: ev.totalScore, maxScore: 40, wouldHire: ev.wouldHire, noHireReason: ev.noHireReason,
        comments: ev.comments, satisfaction: ev.satisfaction, signature: ev.signature,
        evaluator: { id: evaluator.id, name: evaluator.name, jobTitle: ev.evaluatorTitle }, evaluatedAt: ev.createdAt,
      });
    } catch (e) {
      return Promise.reject(e);
    }
  },

  // GET /assignments/:id/commencement   -> form (1)
  commencement: (assignmentId) => {
    try {
      const a = fullAssignment(getAccessibleAssignment(assignmentId));
      return delay({
        title: 'نموذج (1) مباشرة المتدرب بجهة التدريب', semester: a.semester, academicYear: a.academicYear,
        organization: { id: a.opportunity.organization.id, name: a.opportunity.organization.name },
        trainee: { name: a.student.user.name, universityId: a.student.universityId, major: a.student.major },
        fieldSupervisor: { name: a.orgSupervisor.user.name, position: a.orgSupervisor.position },
        commencementDate: a.commencementDate ? a.commencementDate.slice(0, 10) : null,
      });
    } catch (e) {
      return Promise.reject(e);
    }
  },

  // POST /final-grades  { assignmentId, grade }   -> once; marks the assignment COMPLETED
  setFinalGrade: (assignmentId, grade) => {
    try {
      const a = getAccessibleAssignment(assignmentId);
      if (a.status === 'CANCELLED') return fail(400, 'Cannot grade a cancelled assignment');
      if (db.finalGrades.some((g) => g.assignmentId === a.id)) return fail(409, 'A final grade already exists for this assignment');
      const fg = { id: nextId(db.finalGrades), assignmentId: a.id, grade, finalizedById: ME_USER_ID, finalizedAt: iso(now()) };
      db.finalGrades.push(fg);
      a.status = 'COMPLETED';
      return delay(fg);
    } catch (e) {
      return Promise.reject(e);
    }
  },

  // PATCH /assignments/:id/employment  { employed, employerName? }   -> after COMPLETED only
  recordEmployment: (assignmentId, { employed, employerName }) => {
    try {
      const a = getAccessibleAssignment(assignmentId);
      if (a.status !== 'COMPLETED') return fail(400, 'Employment can be recorded after the training is completed');
      if (employed && !employerName) return fail(400, 'Validation failed');
      a.employedAfterTraining = employed;
      a.employerName = employed ? employerName : null;
      a.employmentRecordedAt = iso(now());
      return delay(fullAssignment(a));
    } catch (e) {
      return Promise.reject(e);
    }
  },

  // GET /notifications
  notifications: () => {
    const items = db.notifications.filter((n) => n.userId === ME_USER_ID).sort((a, b) => b.id - a.id);
    return delay({ items, unreadCount: items.filter((n) => !n.isRead).length, total: items.length, page: 1, pages: 1 });
  },
  // PATCH /notifications/read-all
  markAllRead: () => {
    let updated = 0;
    db.notifications.forEach((n) => {
      if (n.userId === ME_USER_ID && !n.isRead) {
        n.isRead = true;
        updated += 1;
      }
    });
    return delay({ updated });
  },

  // GET /messages/contacts   -> my students + their organization supervisors
  contacts: () => {
    const map = new Map();
    for (const a of myAssignments()) {
      const s = db.students.find((x) => x.id === a.studentId);
      const os = db.orgSupervisors.find((x) => x.id === a.orgSupervisorId);
      map.set(s.userId, personSelect(s.userId));
      map.set(os.userId, { ...personSelect(os.userId), organizationName: db.organizations.find((g) => g.id === os.organizationId).name });
    }
    return delay([...map.values()].sort((x, y) => x.name.localeCompare(y.name)));
  },

  // GET /messages/with/:userId   -> conversation (oldest first); marks their messages as read
  thread: (userId) => {
    const items = db.messages
      .filter((m) => (m.senderId === ME_USER_ID && m.recipientId === userId) || (m.senderId === userId && m.recipientId === ME_USER_ID))
      .sort((a, b) => a.id - b.id);
    items.forEach((m) => {
      if (m.senderId === userId && !m.readAt) m.readAt = iso(now());
    });
    return delay({ items: items.map((m) => ({ ...m, attachment: null })), hasMore: false });
  },

  // GET /messages/conversations   -> inbox (one row per person)
  conversations: () => {
    const last = new Map();
    for (const m of db.messages.slice().sort((a, b) => b.id - a.id)) {
      if (m.senderId !== ME_USER_ID && m.recipientId !== ME_USER_ID) continue;
      const other = m.senderId === ME_USER_ID ? m.recipientId : m.senderId;
      if (!last.has(other)) last.set(other, m);
    }
    return delay(
      [...last.entries()].map(([otherId, lastMessage]) => ({
        user: personSelect(otherId),
        lastMessage: { ...lastMessage, attachment: null },
        unreadCount: db.messages.filter((m) => m.senderId === otherId && m.recipientId === ME_USER_ID && !m.readAt).length,
      }))
    );
  },

  // POST /messages  { recipientId, subject?, body }
  sendMessage: ({ recipientId, subject, body }) => {
    const allowed = myAssignments().some((a) => {
      const s = db.students.find((x) => x.id === a.studentId);
      const os = db.orgSupervisors.find((x) => x.id === a.orgSupervisorId);
      return s.userId === recipientId || os.userId === recipientId;
    });
    if (!allowed) return fail(403, 'You cannot message this user');
    const m = { id: nextId(db.messages), senderId: ME_USER_ID, recipientId, subject: subject || null, body, attachmentId: null, readAt: null, createdAt: iso(now()) };
    db.messages.push(m);
    return delay({ ...m, attachment: null });
  },

  // GET /stats/summary   -> impact indicators
  stats: () => {
    const total = db.assignments.length;
    const completed = db.assignments.filter((a) => a.status === 'COMPLETED').length;
    const sat = db.evaluations.filter((e) => e.satisfaction != null);
    const responded = db.assignments.filter((a) => a.status === 'COMPLETED' && a.employedAfterTraining != null);
    const avg = sat.length ? sat.reduce((s, e) => s + e.satisfaction, 0) / sat.length : null;
    const grades = db.finalGrades.map((g) => g.grade);
    const att = db.attendance;
    const attended = att.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const round1 = (n) => Math.round(n * 10) / 10;
    const byType = {};
    for (const o of db.organizations) byType[o.type] = (byType[o.type] || 0) + 1;
    return delay({
      totalOpportunities: db.opportunities.length,
      completionRate: total ? Math.round((completed / total) * 1000) / 10 : 0,
      providerSatisfaction: avg == null ? null : Math.round(avg * 10) / 10,
      providerSatisfactionRate: avg == null ? null : round1(((avg - 1) / 4) * 100),
      providerSatisfactionResponses: sat.length,
      employmentRate: responded.length
        ? Math.round((responded.filter((a) => a.employedAfterTraining).length / responded.length) * 1000) / 10
        : null,
      employmentResponses: responded.length,
      openOpportunities: db.opportunities.filter((o) => o.status === 'OPEN').length,
      organizationsByType: byType,
      totalApplications: db.applications.length,
      activeAssignments: db.assignments.filter((a) => a.status === 'ACTIVE').length,
      completedAssignments: completed,
      averageFinalGrade: grades.length ? round1(grades.reduce((a, b) => a + b, 0) / grades.length) : null,
      wouldHireRate: db.evaluations.length ? round1((db.evaluations.filter((e) => e.wouldHire).length / db.evaluations.length) * 100) : null,
      averageAttendanceRate: att.length ? round1((attended / att.length) * 100) : null,
      averageEvaluationScore: db.evaluations.length ? round1(db.evaluations.reduce((a, e) => a + e.totalScore, 0) / db.evaluations.length) : null,
    });
  },

  // GET /attachments/:id   (real version downloads the file with the token)
  downloadAttachment: (attachment) => {
    alert(`(تجريبي) سيتم تحميل الملف بعد الربط: ${attachment.originalName}`);
    return Promise.resolve();
  },
};

// Requests students send from the student portal arrive as messages with these subjects
export const STUDENT_REQUEST_SUBJECTS = ['طلب اعتماد انصراف (نسيان تسجيل الانصراف)', 'عذر غياب', 'طلب استئذان / انصراف مبكر'];
