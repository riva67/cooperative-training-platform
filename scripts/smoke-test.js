/**
 * Smoke test: checks auth, roles/permissions, assignments, evaluation form, field visits,
 * messaging/attachments and logs against a RUNNING server.
 *
 * Usage:  1) npm run dev          (database running and seeded)
 *         2) npm run test:smoke   (in another terminal)
 *
 * It creates temporary data and deletes it at the end.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { UPLOAD_DIR } = require('../src/config/uploads');

const prisma = new PrismaClient();
const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const PASSWORD = 'Password123!';
const stamp = Date.now();
const SMOKE_SUBJECT = `smoke-${stamp}`;

let passed = 0;
let failed = 0;
const created = { assignmentIds: [], applicationIds: [], opportunityIds: [], userIds: [], visitIds: [], attachmentIds: [] };

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

async function login(email, password = PASSWORD) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.token;
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  const health = await api('GET', '/health');
  if (health.status !== 200) throw new Error('Server is not running. Start it with: npm run dev');

  // ───────── Auth ─────────
  console.log('Auth');
  const tokens = {
    admin: await login('admin@coop.test'),
    student: await login('student@coop.test'),
    academic: await login('academic@coop.test'),
    company: await login('company@coop.test'),
  };
  let r = await api('POST', '/auth/login', { body: { email: 'admin@coop.test', password: 'wrong-password' } });
  check('wrong password -> 401', r.status === 401);
  r = await api('GET', '/auth/me');
  check('no token -> 401', r.status === 401);
  r = await api('GET', '/auth/me', { token: tokens.student });
  check('/auth/me returns student profile', r.status === 200 && r.data.role === 'STUDENT' && !!r.data.student);
  r = await api('POST', '/auth/login', { body: { email: 'not-an-email' } });
  check('invalid login body -> 400', r.status === 400);
  r = await api('PATCH', '/auth/profile', { token: tokens.company, body: { phone: '+966 55 123 4567' } });
  check('user can update own phone', r.status === 200 && r.data.phone === '+966 55 123 4567', show(r));
  r = await api('PATCH', '/auth/profile', { token: tokens.company, body: { phone: 'abc' } });
  check('invalid phone -> 400', r.status === 400);

  // ───────── Users ─────────
  console.log('\nUsers (admin only)');
  r = await api('GET', '/users', { token: tokens.student });
  check('student cannot list users -> 403', r.status === 403);
  r = await api('GET', '/users', { token: tokens.admin });
  check('admin can list users', r.status === 200 && r.data.total >= 4);
  r = await api('GET', '/users/abc', { token: tokens.admin });
  check('non-numeric id -> 400', r.status === 400);

  // ───────── Test data (directly in DB) ─────────
  const studentUser = await prisma.user.findUnique({ where: { email: 'student@coop.test' }, include: { student: true } });
  const academicUser = await prisma.user.findUnique({ where: { email: 'academic@coop.test' }, include: { academicSupervisor: true } });
  const companyUser = await prisma.user.findUnique({ where: { email: 'company@coop.test' }, include: { orgSupervisor: true } });

  const makeOpportunity = async (title) => {
    const o = await prisma.trainingOpportunity.create({
      data: {
        organizationId: companyUser.orgSupervisor.organizationId, title, description: 'smoke test', seats: 1,
        startDate: new Date('2027-01-15'), endDate: new Date('2027-04-15'),
      },
    });
    created.opportunityIds.push(o.id);
    return o;
  };
  const makeApplication = async (opportunityId, status) => {
    const a = await prisma.application.create({ data: { studentId: studentUser.student.id, opportunityId, status } });
    created.applicationIds.push(a.id);
    return a;
  };

  const opp1 = await makeOpportunity(`Smoke ${stamp} A`);
  const opp2 = await makeOpportunity(`Smoke ${stamp} B`);
  const approved = await makeApplication(opp1.id, 'APPROVED');
  const pending = await makeApplication(opp2.id, 'PENDING');

  const body = (applicationId, extra = {}) => ({
    applicationId,
    academicSupervisorId: academicUser.academicSupervisor.id,
    orgSupervisorId: companyUser.orgSupervisor.id,
    ...extra,
  });

  // ───────── Assignments: creation rules ─────────
  console.log('\nAssignments: creation');
  r = await api('POST', '/assignments', { token: tokens.student, body: body(approved.id) });
  check('student cannot create -> 403', r.status === 403);
  r = await api('POST', '/assignments', { token: tokens.admin, body: { applicationId: approved.id } });
  check('missing fields -> 400', r.status === 400);
  r = await api('POST', '/assignments', { token: tokens.admin, body: body(999999) });
  check('unknown application -> 404', r.status === 404);
  r = await api('POST', '/assignments', { token: tokens.admin, body: body(pending.id) });
  check('PENDING application -> 400', r.status === 400, show(r));

  r = await api('POST', '/assignments', { token: tokens.admin, body: body(approved.id, { semester: 'الفصل الأول', academicYear: '1448' }) });
  check('admin creates from APPROVED application -> 201', r.status === 201, show(r));
  const assignment = r.data;
  if (assignment && assignment.id) created.assignmentIds.push(assignment.id);
  check('new assignment is ACTIVE with student info and semester',
    assignment?.status === 'ACTIVE' && assignment?.student?.user?.email === 'student@coop.test' && assignment?.semester === 'الفصل الأول');

  r = await api('POST', '/assignments', { token: tokens.admin, body: body(approved.id) });
  check('second assignment for same student -> 409', r.status === 409);

  // ───────── Assignments: access control ─────────
  console.log('\nAssignments: access control');
  r = await api('GET', '/assignments', { token: tokens.student });
  check('student list contains their assignment', r.status === 200 && r.data.items.some((a) => a.id === assignment.id));
  for (const role of ['student', 'academic', 'company', 'admin']) {
    r = await api('GET', `/assignments/${assignment.id}`, { token: tokens[role] });
    check(`${role} can read it`, r.status === 200);
  }

  const outsiderEmail = `smoke.${stamp}@coop.test`;
  r = await api('POST', '/users', {
    token: tokens.admin,
    body: { name: 'Smoke Outsider', email: outsiderEmail, password: PASSWORD, role: 'STUDENT', universityId: `SMOKE${stamp}`, phone: '0500000099' },
  });
  check('admin creates a student account -> 201', r.status === 201 && r.data.phone === '0500000099', show(r));
  const outsiderId = r.data?.id;
  if (outsiderId) created.userIds.push(outsiderId);
  const outsiderToken = await login(outsiderEmail);

  r = await api('GET', `/assignments/${assignment.id}`, { token: outsiderToken });
  check('other student cannot read it -> 403', r.status === 403);
  r = await api('GET', '/assignments', { token: outsiderToken });
  check('other student sees an empty list', r.status === 200 && r.data.total === 0);
  r = await api('GET', '/assignments/999999', { token: outsiderToken });
  check('unknown assignment -> 404', r.status === 404);
  r = await api('GET', '/assignments/abc', { token: tokens.admin });
  check('non-numeric assignment id -> 400', r.status === 400);

  // ───────── Evaluation form ─────────
  console.log('\nEvaluation form (نموذج تقييم المتدرب)');
  r = await api('GET', '/evaluations/criteria', { token: tokens.company });
  check('criteria: 8 rows, max total 40', r.status === 200 && r.data.criteria.length === 8 && r.data.maxTotal === 40, show(r));
  const keys = (r.data?.criteria || []).map((c) => c.key);
  const fullScores = (lastScore = 4) => Object.fromEntries(keys.map((k, i) => [k, { score: i === keys.length - 1 ? lastScore : 5, notes: i === 0 ? 'ممتاز' : undefined }]));
  const evalBody = (extra = {}) => ({ assignmentId: assignment.id, scores: fullScores(), wouldHire: true, ...extra });

  r = await api('POST', '/evaluations', { token: tokens.student, body: evalBody() });
  check('student cannot evaluate -> 403', r.status === 403);
  r = await api('POST', '/evaluations', { token: tokens.academic, body: evalBody() });
  check('academic supervisor cannot fill the organization form -> 403', r.status === 403);
  const partial = fullScores(); delete partial[keys[0]];
  r = await api('POST', '/evaluations', { token: tokens.company, body: evalBody({ scores: partial }) });
  check('missing a criterion -> 400', r.status === 400);
  r = await api('POST', '/evaluations', { token: tokens.company, body: evalBody({ scores: fullScores(6) }) });
  check('score above 5 -> 400', r.status === 400);
  r = await api('POST', '/evaluations', { token: tokens.company, body: evalBody({ wouldHire: false }) });
  check('"no hire" without a reason -> 400', r.status === 400);
  r = await api('POST', '/evaluations', { token: tokens.company, body: evalBody() });
  check('organization supervisor submits form -> 201, total 39/40', r.status === 201 && r.data.totalScore === 39 && r.data.maxScore === 40, show(r));
  check('form carries trainee, organization and evaluator job title',
    r.data?.trainee?.universityId === '4400001' && !!r.data?.organization?.name && r.data?.evaluator?.jobTitle === 'Engineering Manager', show(r));
  r = await api('POST', '/evaluations', { token: tokens.company, body: evalBody() });
  check('second evaluation for the same trainee -> 409', r.status === 409);
  r = await api('GET', `/evaluations/${assignment.id}`, { token: tokens.academic });
  check('academic supervisor can read it', r.status === 200 && r.data.wouldHire === true);
  r = await api('GET', `/evaluations/${assignment.id}`, { token: tokens.student });
  check('student cannot read it -> 403', r.status === 403);
  r = await api('GET', `/evaluations/${assignment.id}`, { token: outsiderToken });
  check('outsider cannot read it -> 403', r.status === 403);
  r = await api('GET', '/evaluations', { token: tokens.company });
  check('list contains it', r.status === 200 && r.data.items.some((e) => e.assignmentId === assignment.id));

  // ───────── Field visits ─────────
  console.log('\nField visits (الزيارات الميدانية)');
  const inDays = (d, hour) => { const t = new Date(Date.now() + d * 86400000); t.setUTCHours(hour, 0, 0, 0); return t; };
  const when1 = inDays(7, 7);
  const visitBody = (date, extra = {}) => ({ orgSupervisorId: companyUser.orgSupervisor.id, scheduledAt: date.toISOString(), ...extra });

  r = await api('POST', '/visits', { token: tokens.student, body: visitBody(when1) });
  check('student cannot book -> 403', r.status === 403);
  r = await api('POST', '/visits', { token: tokens.academic, body: visitBody(new Date(Date.now() - 86400000)) });
  check('date in the past -> 400', r.status === 400);

  // an organization supervisor with no trainees of this doctor
  r = await api('POST', '/users', {
    token: tokens.admin,
    body: { name: 'Smoke Org Sup', email: `smoke.org.${stamp}@coop.test`, password: PASSWORD, role: 'ORG_SUPERVISOR', organizationId: companyUser.orgSupervisor.organizationId },
  });
  if (r.data?.id) created.userIds.push(r.data.id);
  const strangerProfile = await prisma.orgSupervisor.findUnique({ where: { userId: r.data.id } });
  r = await api('POST', '/visits', { token: tokens.academic, body: { orgSupervisorId: strangerProfile.id, scheduledAt: when1.toISOString() } });
  check('cannot book with a supervisor who has none of your trainees -> 403', r.status === 403);

  r = await api('POST', '/visits', { token: tokens.academic, body: visitBody(when1) });
  check('academic supervisor books a visit -> 201 PENDING', r.status === 201 && r.data.status === 'PENDING', show(r));
  const visit = r.data;
  if (visit?.id) created.visitIds.push(visit.id);
  check('request message was generated', typeof visit?.requestMessage === 'string' && visit.requestMessage.length > 10);
  r = await api('POST', '/visits', { token: tokens.academic, body: visitBody(new Date(when1.getTime() + 30 * 60000)) });
  check('overlapping time (30 min later) -> 409', r.status === 409);

  r = await api('GET', '/visits?when=upcoming', { token: tokens.company });
  const row = r.data?.items?.find((v) => v.id === visit.id);
  check('organization supervisor sees it in the table with name, supervisor, phone',
    !!row && !!row.orgSupervisor.organization.name && row.orgSupervisor.user.phone === '+966 55 123 4567' && !!row.academicSupervisor.user.name, show(r));
  r = await api('GET', '/visits', { token: tokens.student });
  check('student cannot list visits -> 403', r.status === 403);

  r = await api('PATCH', `/visits/${visit.id}/respond`, { token: tokens.academic, body: { decision: 'APPROVE' } });
  check('academic supervisor cannot answer own request -> 403', r.status === 403);
  r = await api('PATCH', `/visits/${visit.id}/respond`, { token: tokens.company, body: { decision: 'APPROVE' } });
  check('organization approves -> APPROVED with default message', r.status === 200 && r.data.status === 'APPROVED' && r.data.responseMessage.includes('نتطلع'), show(r));
  r = await api('PATCH', `/visits/${visit.id}/respond`, { token: tokens.company, body: { decision: 'DECLINE' } });
  check('answering twice -> 400', r.status === 400);
  r = await api('PATCH', `/visits/${visit.id}`, { token: tokens.academic, body: { isDone: true } });
  check('cannot tick Done before the visit date -> 400', r.status === 400);
  r = await api('PATCH', `/visits/${visit.id}`, { token: tokens.academic, body: { notes: 'تم التحضير للزيارة' } });
  check('notes can be written before the visit', r.status === 200 && r.data.notes === 'تم التحضير للزيارة');
  r = await api('PATCH', `/visits/${visit.id}/cancel`, { token: tokens.company });
  check('organization cannot cancel -> 403', r.status === 403);
  r = await api('PATCH', `/visits/${visit.id}/cancel`, { token: tokens.academic });
  check('academic supervisor cancels -> CANCELLED', r.status === 200 && r.data.status === 'CANCELLED');

  // a past, approved visit to test "Done" + "past" filter
  const past = await prisma.fieldVisit.create({
    data: {
      academicSupervisorId: academicUser.academicSupervisor.id, orgSupervisorId: companyUser.orgSupervisor.id,
      scheduledAt: new Date(Date.now() - 2 * 86400000), status: 'APPROVED', requestMessage: 'smoke past visit',
    },
  });
  created.visitIds.push(past.id);
  r = await api('PATCH', `/visits/${past.id}`, { token: tokens.academic, body: { isDone: true, notes: 'زيارة ناجحة' } });
  check('tick Done + notes on a past approved visit', r.status === 200 && r.data.isDone === true && !!r.data.doneAt && r.data.notes === 'زيارة ناجحة', show(r));
  r = await api('GET', '/visits?when=past&isDone=true', { token: tokens.academic });
  check('past + done filter returns it', r.status === 200 && r.data.items.some((v) => v.id === past.id));
  r = await api('GET', '/visits?when=upcoming', { token: tokens.academic });
  check('upcoming list excludes the past visit', r.status === 200 && !r.data.items.some((v) => v.id === past.id));

  // ───────── Messaging ─────────
  console.log('\nMessaging (chat + email-style + files)');
  const ids = { student: studentUser.id, academic: academicUser.id, company: companyUser.id };
  r = await api('GET', '/messages/contacts', { token: tokens.academic });
  check('academic contacts: student and company supervisor',
    r.status === 200 && r.data.some((c) => c.id === ids.student) && r.data.some((c) => c.id === ids.company), show(r));
  r = await api('GET', '/messages/contacts', { token: tokens.student });
  check('student contacts: only academic supervisors, including theirs',
    r.status === 200 && r.data.length >= 1 && r.data.every((c) => c.role === 'ACADEMIC_SUPERVISOR') && r.data.some((c) => c.id === ids.academic));

  r = await api('POST', '/messages', { token: tokens.student, body: { recipientId: ids.company, body: 'hi', subject: SMOKE_SUBJECT } });
  check('student cannot message the company supervisor -> 403', r.status === 403);
  r = await api('POST', '/messages', { token: tokens.academic, body: { recipientId: outsiderId, body: 'hi', subject: SMOKE_SUBJECT } });
  check('academic cannot message a student that is not theirs -> 403', r.status === 403);
  r = await api('POST', '/messages', { token: tokens.academic, body: { recipientId: ids.student, body: '   ', subject: SMOKE_SUBJECT } });
  check('empty message -> 400', r.status === 400);

  r = await api('POST', '/messages', { token: tokens.academic, body: { recipientId: ids.student, body: 'السلام عليكم، متى موعد التسليم؟', subject: SMOKE_SUBJECT } });
  check('academic sends a message to the student -> 201', r.status === 201, show(r));
  r = await api('GET', '/messages/unread-count', { token: tokens.student });
  check('student has an unread message', r.status === 200 && r.data.count >= 1);
  r = await api('GET', `/messages/with/${ids.academic}`, { token: tokens.student });
  check('student opens the conversation', r.status === 200 && r.data.items.some((m) => m.subject === SMOKE_SUBJECT));
  r = await api('GET', '/messages/conversations', { token: tokens.student });
  const fromAcademic = r.data?.find?.((c) => c.user?.id === ids.academic);
  check('opening it marks the doctor\'s messages as read', r.status === 200 && !!fromAcademic && fromAcademic.unreadCount === 0, show(r));
  r = await api('POST', '/messages', { token: tokens.student, body: { recipientId: ids.academic, body: 'يوم الأحد إن شاء الله', subject: SMOKE_SUBJECT } });
  check('student replies -> 201', r.status === 201);
  r = await api('GET', '/messages/conversations', { token: tokens.academic });
  const convo = r.data?.find?.((c) => c.user?.id === ids.student);
  check('inbox shows the student with last message and unread count', r.status === 200 && !!convo && convo.unreadCount >= 1 && !!convo.lastMessage, show(r));
  r = await api('GET', `/messages/with/${outsiderId}`, { token: tokens.academic });
  check('cannot open a conversation with an unrelated user -> 403', r.status === 403);

  // attachment: upload -> send -> download
  const form = new FormData();
  form.append('file', new Blob(['نموذج تجريبي / smoke test form'], { type: 'text/plain' }), 'نموذج.txt');
  let res = await fetch(`${BASE}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.academic}` }, body: form });
  const att = await res.json();
  check('upload a file -> 201 (Arabic file name kept)', res.status === 201 && att.originalName === 'نموذج.txt', JSON.stringify(att));
  if (att?.id) created.attachmentIds.push(att.id);

  const badForm = new FormData();
  badForm.append('file', new Blob(['MZ...'], { type: 'application/x-msdownload' }), 'virus.exe');
  res = await fetch(`${BASE}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.academic}` }, body: badForm });
  check('executable file type is rejected -> 400', res.status === 400);

  r = await api('POST', '/messages', { token: tokens.student, body: { recipientId: ids.academic, body: 'x', subject: SMOKE_SUBJECT, attachmentId: att.id } });
  check('cannot attach a file someone else uploaded -> 403', r.status === 403);
  r = await api('POST', '/messages', { token: tokens.academic, body: { recipientId: ids.company, body: 'مرفق نموذج الزيارة', subject: SMOKE_SUBJECT, attachmentId: att.id } });
  check('academic sends the file to the company supervisor -> 201', r.status === 201 && r.data.attachment?.id === att.id, show(r));
  res = await fetch(`${BASE}/attachments/${att.id}`, { headers: { Authorization: `Bearer ${tokens.company}` } });
  check('recipient downloads the file', res.status === 200 && (await res.text()).includes('smoke test form'));
  res = await fetch(`${BASE}/attachments/${att.id}`, { headers: { Authorization: `Bearer ${outsiderToken}` } });
  check('outsider cannot download it -> 403', res.status === 403);

  r = await api('POST', '/messages/broadcast', { token: tokens.student, body: { audience: 'BOTH', subject: SMOKE_SUBJECT, body: 'x' } });
  check('student cannot broadcast -> 403', r.status === 403);
  r = await api('POST', '/messages/broadcast', { token: tokens.academic, body: { audience: 'BOTH', subject: SMOKE_SUBJECT, body: 'تعميم: يرجى تعبئة النموذج', attachmentId: att.id } });
  check('academic broadcasts a form to students and organizations -> 201', r.status === 201 && r.data.sent >= 2, show(r));

  // ───────── Assignments: status ─────────
  console.log('\nAssignments: status changes');
  r = await api('PATCH', `/assignments/${assignment.id}/status`, { token: tokens.student, body: { status: 'CANCELLED' } });
  check('student cannot change status -> 403', r.status === 403);
  r = await api('PATCH', `/assignments/${assignment.id}/status`, { token: tokens.admin, body: { status: 'COMPLETED' } });
  check('admin completes it -> 200', r.status === 200 && r.data.status === 'COMPLETED');
  r = await api('PATCH', `/assignments/${assignment.id}/status`, { token: tokens.admin, body: { status: 'CANCELLED' } });
  check('cannot change a non-ACTIVE assignment -> 400', r.status === 400);

  // ───────── Notifications & logs ─────────
  console.log('\nNotifications and logs');
  const studentNotes = await prisma.notification.count({ where: { userId: studentUser.id } });
  check('student received notifications', studentNotes >= 2);
  const companyNotes = await prisma.notification.count({ where: { userId: companyUser.id, message: { contains: 'زيارة' } } });
  check('company supervisor was notified about the visit request', companyNotes >= 1);
  const academicNotes = await prisma.notification.count({ where: { userId: academicUser.id, message: { contains: 'تقييم' } } });
  check('academic supervisor was notified about the evaluation', academicNotes >= 1);
  r = await api('GET', '/logs?action=ASSIGNMENT_CREATED', { token: tokens.admin });
  check('logs contain ASSIGNMENT_CREATED', r.status === 200 && r.data.items.length >= 1);
  r = await api('GET', '/logs?action=VISIT_APPROVED', { token: tokens.admin });
  check('logs contain VISIT_APPROVED', r.status === 200 && r.data.items.length >= 1);
  r = await api('GET', '/logs?action=LOGIN&limit=5', { token: tokens.admin });
  check('logs contain LOGIN with user info', r.status === 200 && r.data.items.length >= 1 && !!r.data.items[0].user);
  r = await api('GET', '/logs', { token: tokens.student });
  check('student cannot read logs -> 403', r.status === 403);
  r = await api('GET', '/logs?page=0', { token: tokens.admin });
  check('invalid pagination -> 400', r.status === 400);
}

async function cleanup() {
  try {
    await prisma.message.deleteMany({ where: { subject: SMOKE_SUBJECT } });
    const atts = await prisma.attachment.findMany({ where: { id: { in: created.attachmentIds } } });
    for (const a of atts) { try { fs.unlinkSync(path.join(UPLOAD_DIR, a.storedName)); } catch { /* already gone */ } }
    await prisma.attachment.deleteMany({ where: { id: { in: created.attachmentIds } } });
    await prisma.fieldVisit.deleteMany({ where: { id: { in: created.visitIds } } });
    await prisma.trainingAssignment.deleteMany({ where: { id: { in: created.assignmentIds } } }); // also removes its evaluation
    await prisma.application.deleteMany({ where: { id: { in: created.applicationIds } } });
    await prisma.trainingOpportunity.deleteMany({ where: { id: { in: created.opportunityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
  } catch (e) {
    console.log('Cleanup warning:', e.message);
  }
}

main()
  .catch((e) => { failed++; console.error('\nTest run aborted:', e.message); })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
