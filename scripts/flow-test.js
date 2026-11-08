/**
 * Full-flow test of the training lifecycle against a RUNNING server:
 * opportunity -> apply -> nominate -> approve -> assignment -> attendance -> report -> note
 * -> final grade -> notifications -> statistics -> letter.
 *
 * Usage:  1) npm run dev   (database running and seeded)
 *         2) npm run test:flow
 * It creates temporary data and deletes it at the end.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const PASSWORD = 'Password123!';

let passed = 0;
let failed = 0;
function check(name, condition, extra = '') {
  if (condition) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}
const show = (r) => `(got ${r.status}: ${JSON.stringify(r.data)?.slice(0, 200)})`;

async function api(method, p, { token, body } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}
async function login(email) {
  const r = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${r.status}`);
  return r.data.token;
}
const ymd = (d) => d.toISOString().split('T')[0];
const addDays = (n) => new Date(Date.now() + n * 864e5);

async function main() {
  console.log(`Flow test against ${BASE}\n`);
  const health = await api('GET', '/health');
  if (health.status !== 200) throw new Error('Server is not running. Start it with: npm run dev');

  const t = {
    admin: await login('admin@coop.test'),
    student: await login('student@coop.test'),
    academic: await login('academic@coop.test'),
    company: await login('company@coop.test'),
  };
  let opportunityId = null;

  try {
    console.log('Opportunities');
    let r = await api('POST', '/opportunities', {
      token: t.student,
      body: { title: 'Flow test', description: 'x', seats: 1, startDate: ymd(addDays(-1)), endDate: ymd(addDays(30)) },
    });
    check('student cannot create an opportunity (403)', r.status === 403, show(r));

    r = await api('POST', '/opportunities', {
      token: t.company,
      body: { title: 'Flow test opportunity', description: 'Temporary', seats: 1, startDate: ymd(addDays(-1)), endDate: ymd(addDays(30)) },
    });
    check('company creates an opportunity (201)', r.status === 201, show(r));
    opportunityId = r.data?.id;

    r = await api('GET', '/opportunities?search=Flow%20test', { token: t.student });
    check('student can search opportunities', r.status === 200 && r.data.items.some((o) => o.id === opportunityId), show(r));

    console.log('Applications');
    r = await api('POST', '/applications', { token: t.student, body: { opportunityId } });
    check('student applies (201, PENDING)', r.status === 201 && r.data.status === 'PENDING', show(r));
    const applicationId = r.data?.id;

    r = await api('POST', '/applications', { token: t.student, body: { opportunityId } });
    check('applying twice is rejected (409)', r.status === 409, show(r));

    r = await api('PATCH', `/applications/${applicationId}/status`, { token: t.company, body: { status: 'APPROVED' } });
    check('company cannot approve before nomination (400)', r.status === 400, show(r));

    r = await api('PATCH', `/applications/${applicationId}/status`, { token: t.academic, body: { status: 'NOMINATED' } });
    check('academic supervisor nominates (200)', r.status === 200 && r.data.status === 'NOMINATED', show(r));

    r = await api('GET', `/opportunities/${opportunityId}/applicants`, { token: t.company });
    check('company sees applicants', r.status === 200 && r.data.count === 1, show(r));

    r = await api('PATCH', `/applications/${applicationId}/status`, { token: t.company, body: { status: 'APPROVED' } });
    check('company approves (200)', r.status === 200 && r.data.status === 'APPROVED', show(r));

    console.log('Assignment');
    const academic = await prisma.academicSupervisor.findFirst({ where: { user: { email: 'academic@coop.test' } } });
    const orgSup = await prisma.orgSupervisor.findFirst({ where: { user: { email: 'company@coop.test' } } });
    r = await api('POST', '/assignments', {
      token: t.admin,
      body: { applicationId, academicSupervisorId: academic.id, orgSupervisorId: orgSup.id, semester: 'Test', academicYear: '1448' },
    });
    check('admin creates the assignment (201)', r.status === 201, show(r));
    const assignmentId = r.data?.id;

    r = await api('GET', `/assignments/${assignmentId}/letter`, { token: t.student });
    check('training letter is generated', r.status === 200 && r.data.studentName && r.data.companyName, show(r));

    console.log('Attendance');
    r = await api('POST', '/attendance/check-in', { token: t.student, body: { assignmentId } });
    check('student checks in (201)', r.status === 201, show(r));
    const attendanceId = r.data?.id;

    r = await api('POST', '/attendance/check-in', { token: t.student, body: { assignmentId } });
    check('second check-in is rejected (409)', r.status === 409, show(r));

    r = await api('POST', '/attendance/check-out', { token: t.student, body: { assignmentId } });
    check('student checks out (200, early-leave warning)', r.status === 200 && r.data.checkOut && r.data.warning, show(r));

    r = await api('PATCH', `/attendance/${attendanceId}`, { token: t.company, body: { status: 'LATE' } });
    check('company marks the day LATE', r.status === 200 && r.data.status === 'LATE', show(r));

    r = await api('GET', `/assignments/${assignmentId}/attendance`, { token: t.student });
    check('attendance list + summary', r.status === 200 && r.data.summary.late === 1, show(r));

    console.log('Reports, notes, grade');
    r = await api('POST', '/reports', { token: t.student, body: { assignmentId, type: 'WEEKLY', title: 'Week 1', content: 'Did things' } });
    check('student submits a weekly report (201)', r.status === 201 && r.data.status === 'SUBMITTED', show(r));
    const reportId = r.data?.id;

    r = await api('POST', '/reports', { token: t.student, body: { assignmentId, type: 'APPROVAL', title: 'x', content: 'x' } });
    check('student cannot submit an APPROVAL report (403)', r.status === 403, show(r));

    r = await api('PATCH', `/reports/${reportId}/status`, { token: t.academic, body: { status: 'APPROVED' } });
    check('academic supervisor approves the report', r.status === 200 && r.data.status === 'APPROVED', show(r));

    r = await api('POST', '/notes', { token: t.academic, body: { assignmentId, note: 'Good progress' } });
    check('academic supervisor adds a note (201)', r.status === 201, show(r));
    r = await api('GET', `/assignments/${assignmentId}/notes`, { token: t.student });
    check('student can read notes', r.status === 200 && r.data.length === 1, show(r));

    r = await api('GET', '/supervisor/students', { token: t.academic });
    const row = Array.isArray(r.data) && r.data.find((x) => x.assignment.id === assignmentId);
    check('monitoring list shows the trainee', r.status === 200 && row && row.reportsSubmitted === 1, show(r));

    r = await api('POST', '/final-grades', { token: t.company, body: { assignmentId, grade: 90 } });
    check('company cannot set the final grade (403)', r.status === 403, show(r));
    r = await api('POST', '/final-grades', { token: t.academic, body: { assignmentId, grade: 90 } });
    check('academic supervisor sets the final grade (201)', r.status === 201, show(r));
    r = await api('POST', '/final-grades', { token: t.academic, body: { assignmentId, grade: 80 } });
    check('second final grade is rejected (409)', r.status === 409, show(r));
    r = await api('GET', `/final-grades/${assignmentId}`, { token: t.student });
    check('student can read the final grade', r.status === 200 && r.data.grade === 90, show(r));
    r = await api('GET', `/assignments/${assignmentId}`, { token: t.student });
    check('assignment is now COMPLETED', r.status === 200 && r.data.status === 'COMPLETED', show(r));

    console.log('Notifications and statistics');
    r = await api('GET', '/notifications?unread=true', { token: t.student });
    check('student has unread notifications', r.status === 200 && r.data.unreadCount > 0, show(r));
    const firstId = r.data?.items?.[0]?.id;
    r = await api('PATCH', `/notifications/${firstId}/read`, { token: t.student });
    check('mark one as read', r.status === 200 && r.data.isRead === true, show(r));
    r = await api('PATCH', `/notifications/${firstId}/read`, { token: t.company });
    check("cannot mark someone else's notification (404)", r.status === 404, show(r));
    r = await api('PATCH', '/notifications/read-all', { token: t.student });
    check('mark all as read', r.status === 200 && typeof r.data.updated === 'number', show(r));

    r = await api('GET', '/stats/summary', { token: t.academic });
    check('stats summary (academic)', r.status === 200 && r.data.totalOpportunities >= 1 && r.data.completedAssignments >= 1, show(r));
    r = await api('GET', '/stats/summary', { token: t.student });
    check('stats are not available to students (403)', r.status === 403, show(r));
  } finally {
    // cleanup: deleting the opportunity cascades to applications; assignments are removed first
    if (opportunityId) {
      await prisma.trainingAssignment.deleteMany({ where: { opportunityId } });
      await prisma.trainingOpportunity.delete({ where: { id: opportunityId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });