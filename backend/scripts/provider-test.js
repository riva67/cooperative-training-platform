/**
 * Test of the account-approval system and the training-provider portal against a RUNNING server:
 * register (provider / academic supervisor) -> pending -> admin approves / rejects -> provider publishes
 * opportunities (new fields, seats, delete) -> student applies -> nominate -> approve -> assignment ->
 * form (1) commencement -> provider reports (absence warning) -> student report with file, rejected and resubmitted ->
 * evaluation with satisfaction + signature -> final grade -> employment -> impact indicators.
 *
 * Usage:  1) npm run dev   (database running and seeded)
 *         2) npm run test:provider
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
const RUN = Date.now().toString().slice(-7);

let passed = 0;
let failed = 0;
function check(name, condition, extra = '') {
  if (condition) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}
const show = (r) => `(got ${r.status}: ${JSON.stringify(r.data)?.slice(0, 200)})`;

async function api(method, p, { token, body, form } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(!form && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}
const login = (email) => api('POST', '/auth/login', { body: { email, password: PASSWORD } });
async function token(email) {
  const r = await login(email);
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${r.status}`);
  return r.data.token;
}
const ymd = (d) => d.toISOString().split('T')[0];
const addDays = (n) => new Date(Date.now() + n * 864e5);
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const created = { userEmails: [], opportunityIds: [], attachmentIds: [], organizationIds: [] };

async function main() {
  console.log(`Provider / account-approval test against ${BASE}\n`);
  if ((await api('GET', '/health')).status !== 200) throw new Error('Server is not running. Start it with: npm run dev');

  const t = { admin: await token('admin@coop.test'), student: await token('student@coop.test'), academic: await token('academic@coop.test') };
  const providerEmail = `provider${RUN}@test.local`;
  const academicEmail = `academic${RUN}@test.local`;
  const student2Email = `student${RUN}@test.local`;
  created.userEmails.push(providerEmail, academicEmail, student2Email);

  try {
    console.log('Account approval');
    let r = await api('POST', '/auth/register', {
      body: {
        role: 'ORG_SUPERVISOR', name: 'Test Provider', email: providerEmail, phone: '0551234567', password: PASSWORD,
        organizationName: `Test Ministry ${RUN}`, organizationType: 'GOVERNMENT', organizationSubtype: 'وزارة', position: 'HR',
      },
    });
    check('government provider registers without a CR number (201, pending)', r.status === 201 && r.data.pending === true && !r.data.token, show(r));
    const providerUserId = r.data?.user?.id;

    r = await login(providerEmail);
    check('pending provider cannot log in (403, code PENDING)', r.status === 403 && r.data.code === 'PENDING', show(r));

    r = await api('GET', '/users?status=PENDING&limit=100', { token: t.admin });
    check('admin sees the request in status=PENDING', r.status === 200 && r.data.items.some((u) => u.id === providerUserId), show(r));

    r = await api('PATCH', `/users/${providerUserId}/active`, { token: t.admin, body: { isActive: true } });
    check('admin approves the provider', r.status === 200 && r.data.status === 'ACTIVE', show(r));

    r = await login(providerEmail);
    check('approved provider logs in and gets organization.type', r.status === 200 && r.data.user.organization?.type === 'GOVERNMENT', show(r));
    t.provider = r.data?.token;
    const orgId = r.data?.user?.organization?.id;
    created.organizationIds.push(orgId);

    r = await api('POST', '/auth/register', {
      body: { role: 'ACADEMIC_SUPERVISOR', name: 'Test Academic', email: academicEmail, password: PASSWORD, department: 'Computer Science' },
    });
    check('academic supervisor registers (201, pending)', r.status === 201 && r.data.pending === true, show(r));
    const academicUserId = r.data?.user?.id;
    r = await api('POST', `/users/${academicUserId}/reject`, { token: t.admin, body: { reason: 'Not a university e-mail' } });
    check('admin rejects the request', r.status === 200 && r.data.status === 'REJECTED', show(r));
    r = await login(academicEmail);
    check('rejected user gets code REJECTED with the reason', r.status === 403 && r.data.code === 'REJECTED' && r.data.reason, show(r));

    r = await api('PATCH', `/users/${academicUserId}/role`, { token: t.admin, body: { role: 'STUDENT' } });
    check('role change to STUDENT without a student profile is refused (400)', r.status === 400, show(r));

    console.log('Organizations');
    r = await api('GET', '/organizations?type=GOVERNMENT&limit=100', { token: t.student });
    check('list organizations by type', r.status === 200 && r.data.items.some((o) => o.id === orgId), show(r));
    r = await api('PATCH', `/organizations/${orgId}`, { token: t.provider, body: { city: 'Najran' } });
    check('provider edits own organization', r.status === 200 && r.data.city === 'Najran', show(r));
    r = await api('PATCH', `/organizations/${orgId}`, { token: t.provider, body: { crNumber: '1234567' } });
    check('provider cannot change the CR number (403)', r.status === 403, show(r));

    console.log('Opportunities (published by the provider)');
    const oppBody = {
      title: `Provider test ${RUN}`, description: 'Temporary', type: 'SUMMER', seats: 1,
      startDate: ymd(addDays(-1)), endDate: ymd(addDays(60)), deadline: ymd(addDays(10)),
      location: 'Najran', target: 'Computer Science', requirements: 'Excel',
    };
    r = await api('POST', '/opportunities', { token: t.provider, body: oppBody });
    check('provider publishes an opportunity with the new fields', r.status === 201 && r.data.type === 'SUMMER' && r.data.location === 'Najran' && r.data.seatsAvailable === 1, show(r));
    const oppId = r.data?.id;
    created.opportunityIds.push(oppId);

    r = await api('POST', '/opportunities', { token: t.provider, body: { ...oppBody, title: `To delete ${RUN}` } });
    const delId = r.data?.id;
    created.opportunityIds.push(delId);
    r = await api('DELETE', `/opportunities/${delId}`, { token: t.provider });
    check('provider deletes an opportunity nobody applied to (204)', r.status === 204, show(r));

    r = await api('POST', '/opportunities', { token: t.provider, body: { ...oppBody, title: `Expired ${RUN}`, deadline: ymd(addDays(-1)) } });
    const expiredId = r.data?.id;
    created.opportunityIds.push(expiredId);
    r = await api('POST', '/applications', { token: t.student, body: { opportunityId: expiredId } });
    check('applying after the deadline is refused (400)', r.status === 400, show(r));

    r = await api('GET', '/opportunities?mine=true&limit=100', { token: t.provider });
    check('provider lists only its own opportunities (mine=true)', r.status === 200 && r.data.items.length === 2 && r.data.items.every((o) => o.organizationId === orgId), show(r));
    r = await api('GET', '/opportunities?organizationType=GOVERNMENT&limit=100', { token: t.student });
    check('student filters by organization type', r.status === 200 && r.data.items.some((o) => o.id === oppId), show(r));

    console.log('Application flow (kept as is)');
    r = await api('POST', '/applications', { token: t.student, body: { opportunityId: oppId } });
    check('student applies (201)', r.status === 201, show(r));
    const appId = r.data?.id;
    r = await api('DELETE', `/opportunities/${oppId}`, { token: t.provider });
    check('cannot delete an opportunity with applicants (409)', r.status === 409, show(r));

    r = await api('POST', '/users', {
      token: t.admin,
      body: { role: 'STUDENT', name: 'Second Student', email: student2Email, password: PASSWORD, universityId: `T${RUN}` },
    });
    t.student2 = await token(student2Email);
    r = await api('POST', '/applications', { token: t.student2, body: { opportunityId: oppId } });
    const app2Id = r.data?.id;

    r = await api('GET', `/applications?opportunityId=${oppId}`, { token: t.academic });
    check('academic supervisor sees the applications', r.status === 200 && r.data.total === 2, show(r));
    r = await api('GET', `/applications?opportunityId=${oppId}`, { token: t.provider });
    check('provider sees the applications', r.status === 200 && r.data.total === 2, show(r));

    await api('PATCH', `/applications/${appId}/status`, { token: t.academic, body: { status: 'NOMINATED' } });
    await api('PATCH', `/applications/${app2Id}/status`, { token: t.academic, body: { status: 'NOMINATED' } });
    r = await api('PATCH', `/applications/${appId}/status`, { token: t.provider, body: { status: 'APPROVED' } });
    check('provider approves the first student', r.status === 200 && r.data.status === 'APPROVED', show(r));
    r = await api('PATCH', `/applications/${app2Id}/status`, { token: t.provider, body: { status: 'APPROVED' } });
    check('approving beyond the seats is refused (409)', r.status === 409, show(r));
    r = await api('GET', '/opportunities/summary', { token: t.provider });
    check('seats summary', r.status === 200 && r.data.totalSeats === 2 && r.data.seatsTaken === 1 && r.data.seatsAvailable === 1, show(r));

    console.log('Assignment and form (1)');
    const academic = await prisma.academicSupervisor.findFirst({ where: { user: { email: 'academic@coop.test' } } });
    const orgSup = await prisma.orgSupervisor.findFirst({ where: { user: { email: providerEmail } } });
    r = await api('POST', '/assignments', { token: t.admin, body: { applicationId: appId, academicSupervisorId: academic.id, orgSupervisorId: orgSup.id, semester: 'الأول', academicYear: '1448' } });
    check('admin creates the assignment', r.status === 201, show(r));
    const assignmentId = r.data?.id;

    r = await api('GET', `/assignments/${assignmentId}/commencement`, { token: t.provider });
    check('form (1) before starting has no date', r.status === 200 && r.data.commencementDate === null && r.data.fieldSupervisor.name, show(r));
    await api('POST', '/attendance/check-in', { token: t.student, body: { assignmentId } });
    r = await api('GET', `/assignments/${assignmentId}/commencement`, { token: t.academic });
    check('first check-in fills the commencement date', r.status === 200 && r.data.commencementDate === ymd(new Date(Date.now() + 3 * 36e5)), show(r));
    r = await api('PATCH', `/assignments/${assignmentId}/commencement`, { token: t.provider, body: { commencementDate: ymd(addDays(-1)) } });
    check('provider confirms / corrects the date', r.status === 200, show(r));

    console.log('Reports');
    r = await api('POST', '/reports', { token: t.provider, body: { assignmentId, type: 'ABSENCE_WARNING', title: 'إنذار غياب', content: 'Absent 3 days' } });
    check('provider sends an absence warning', r.status === 201, show(r));
    const warningId = r.data?.id;
    r = await api('PATCH', `/reports/${warningId}/status`, { token: t.academic, body: { status: 'APPROVED' } });
    check('absence warnings are not reviewed (400)', r.status === 400, show(r));
    r = await api('POST', '/reports', { token: t.student, body: { assignmentId, type: 'VISIT', title: 'x', content: 'x' } });
    check('students cannot send VISIT reports (403)', r.status === 403, show(r));

    const form = new FormData();
    form.append('file', new Blob(['weekly report'], { type: 'text/plain' }), 'week1.txt');
    r = await api('POST', '/attachments', { token: t.student, form });
    const attachmentId = r.data?.id;
    created.attachmentIds.push(attachmentId);
    r = await api('POST', '/reports', { token: t.student, body: { assignmentId, type: 'WEEKLY', weekNumber: 1, title: 'Week 1', content: 'Did things', attachmentId } });
    check('student submits a weekly report with a file and week number', r.status === 201 && r.data.weekNumber === 1 && r.data.attachment?.id === attachmentId, show(r));
    const reportId = r.data?.id;

    const dl = await fetch(`${BASE}/attachments/${attachmentId}`, { headers: { Authorization: `Bearer ${t.academic}` } });
    check('academic supervisor can download the report file', dl.status === 200, `(got ${dl.status})`);

    r = await api('PATCH', `/reports/${reportId}/status`, { token: t.provider, body: { status: 'REJECTED' } });
    check('provider rejects the report', r.status === 200 && r.data.status === 'REJECTED', show(r));
    r = await api('PATCH', `/reports/${reportId}`, { token: t.student, body: { content: 'Did more things' } });
    check('student edits and resubmits it (SUBMITTED again)', r.status === 200 && r.data.status === 'SUBMITTED', show(r));
    r = await api('PATCH', `/reports/${reportId}`, { token: t.provider, body: { content: 'hack' } });
    check('only the author can edit a report (403)', r.status === 403, show(r));

    console.log('Evaluation, grade, employment, indicators');
    const scores = Object.fromEntries(
      ['attendance', 'practical_application', 'ambition', 'cooperation', 'conduct', 'regulations', 'performance', 'tools'].map((k) => [k, { score: 5 }])
    );
    r = await api('POST', '/evaluations', {
      token: t.provider,
      body: { assignmentId, scores, wouldHire: true, satisfaction: 4, evaluatorTitle: 'HR Manager', signature: TINY_PNG },
    });
    check('provider evaluates with satisfaction, job title and signature', r.status === 201 && r.data.satisfaction === 4 && r.data.evaluator.jobTitle === 'HR Manager' && r.data.signature, show(r));

    r = await api('PATCH', `/assignments/${assignmentId}/employment`, { token: t.student, body: { employed: true, employerName: 'X' } });
    check('employment cannot be recorded before completion (400)', r.status === 400, show(r));
    await api('POST', '/final-grades', { token: t.academic, body: { assignmentId, grade: 95 } });
    r = await api('PATCH', `/assignments/${assignmentId}/employment`, { token: t.student, body: { employed: true, employerName: 'Test Ministry' } });
    check('student records post-training employment', r.status === 200 && r.data.employedAfterTraining === true, show(r));

    r = await api('GET', '/stats/summary', { token: t.admin });
    check(
      'stats include the four impact indicators',
      r.status === 200 && r.data.totalOpportunities >= 1 && typeof r.data.completionRate === 'number'
        && r.data.providerSatisfaction !== null && r.data.employmentRate !== null,
      show(r)
    );
  } finally {
    const users = await prisma.user.findMany({ where: { email: { in: created.userEmails } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    const oppIds = created.opportunityIds.filter(Boolean);
    await prisma.trainingAssignment.deleteMany({ where: { opportunityId: { in: oppIds } } });
    await prisma.trainingOpportunity.deleteMany({ where: { id: { in: oppIds } } });
    const atts = await prisma.attachment.findMany({ where: { id: { in: created.attachmentIds.filter(Boolean) } } });
    for (const a of atts) fs.rmSync(path.join(UPLOAD_DIR, a.storedName), { force: true });
    await prisma.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } });
    await prisma.report.deleteMany({ where: { submittedById: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: created.organizationIds.filter(Boolean) } } });
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
