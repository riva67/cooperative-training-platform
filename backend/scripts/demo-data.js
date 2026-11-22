/**
 * Demo data for presenting the portals (run AFTER `npm run db:seed`, with the server running):
 *   npm run db:demo
 *
 * Everything goes through the API, so it follows the real rules. It creates, for company@coop.test:
 *  - an open opportunity "تدريب تعاوني في تطوير الويب"
 *  - a demo student (noura@coop.test) placed on it (active trainee: evaluation, reports, attendance)
 *    (the test accounts used by `npm run test:*` are left untouched)
 *  - a weekly report from that student (to approve / reject in the provider portal)
 *  - two more students: one NOMINATED (accept / reject buttons), one PENDING (waits for the academic supervisor)
 *  - a field-visit request from academic@coop.test for tomorrow 10:00 (approve / decline)
 * and for the admin portal (admin@coop.test):
 *  - two registration requests waiting for approval (an educational provider and an academic supervisor)
 *  - a student accepted by the provider and waiting for the admin to create the placement
 * Running it twice does nothing the second time.
 */
require('dotenv').config();

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const PASSWORD = 'Password123!';
const TITLE = 'تدريب تعاوني في تطوير الويب';

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
const login = async (email) => (await api('POST', '/auth/login', { body: { email, password: PASSWORD } })).token;
const ymd = (d) => d.toISOString().split('T')[0];
const addDays = (n) => new Date(Date.now() + n * 864e5);

async function ensureStudent(admin, email, name, universityId, major) {
  const found = await api('GET', `/users?search=${encodeURIComponent(email)}`, { token: admin });
  if (!found.items.length) {
    await api('POST', '/users', { token: admin, body: { role: 'STUDENT', name, email, password: PASSWORD, universityId, major } });
  }
  return login(email);
}

async function main() {
  await api('GET', '/health');
  const t = {
    admin: await login('admin@coop.test'),
    company: await login('company@coop.test'),
    academic: await login('academic@coop.test'),
  };

  const mine = await api('GET', '/opportunities?mine=true&limit=100', { token: t.company });
  const existing = mine.items.find((o) => o.title === TITLE);
  if (existing) {
    const added = await adminDemo(t, existing.id);
    console.log(added ? 'Admin demo data added.' : 'Demo data is already there. Nothing to do.');
    return;
  }

  const opp = await api('POST', '/opportunities', {
    token: t.company,
    body: {
      title: TITLE,
      description: 'تطوير واجهات ويب تفاعلية بالتعاون مع فريق التصميم والبرمجة.',
      type: 'COOP', seats: 3,
      startDate: ymd(addDays(-7)), endDate: ymd(addDays(80)), deadline: ymd(addDays(20)),
      location: 'جدة، المقر الرئيسي', target: 'علوم الحاسب',
      requirements: 'معرفة بـ HTML و CSS و JavaScript، ومعرفة React ميزة إضافية.',
    },
  });

  // 1) a demo student -> placed (active trainee)
  t.student = await ensureStudent(t.admin, 'noura@coop.test', 'نورة العتيبي', '446300178', 'علوم الحاسب');
  const app1 = await api('POST', '/applications', { token: t.student, body: { opportunityId: opp.id } });
  await api('PATCH', `/applications/${app1.id}/status`, { token: t.academic, body: { status: 'NOMINATED' } });
  await api('PATCH', `/applications/${app1.id}/status`, { token: t.company, body: { status: 'APPROVED' } });
  const me = await api('GET', '/auth/me', { token: t.academic });
  const company = await api('GET', '/auth/me', { token: t.company });
  const assignment = await api('POST', '/assignments', {
    token: t.admin,
    body: {
      applicationId: app1.id, academicSupervisorId: me.academicSupervisor.id, orgSupervisorId: company.orgSupervisor.id,
      semester: 'الأول', academicYear: '1448',
    },
  });
  await api('POST', '/reports', {
    token: t.student,
    body: { assignmentId: assignment.id, type: 'WEEKLY', weekNumber: 1, title: 'تقرير الأسبوع الأول', content: 'تعرفت على فريق العمل وبيئة التطوير، وبدأت مهمة تصميم صفحة تسجيل الدخول.' },
  });

  // 2) a nominated student (accept / reject in the provider portal)
  const sara = await ensureStudent(t.admin, 'sara@coop.test', 'سارة أحمد', '446300179', 'علوم الحاسب');
  const app2 = await api('POST', '/applications', { token: sara, body: { opportunityId: opp.id } });
  await api('PATCH', `/applications/${app2.id}/status`, { token: t.academic, body: { status: 'NOMINATED' } });

  // 3) a pending student (waits for the academic supervisor)
  const reem = await ensureStudent(t.admin, 'reem@coop.test', 'ريم خالد', '446300180', 'نظم المعلومات');
  await api('POST', '/applications', { token: reem, body: { opportunityId: opp.id } });

  // 4) a field-visit request for tomorrow 10:00 (Riyadh)
  const tomorrow = ymd(addDays(1));
  await api('POST', '/visits', {
    token: t.academic,
    body: { orgSupervisorId: company.orgSupervisor.id, scheduledAt: `${tomorrow}T10:00:00+03:00` },
  });

  await adminDemo(t, opp.id);

  console.log('Demo data created. Log in to the provider portal with company@coop.test / ' + PASSWORD);
  console.log('Admin portal: admin@coop.test — 2 registration requests + 1 student waiting for a placement.');
  console.log('Demo student accounts: noura@coop.test (trainee), sara@coop.test, reem@coop.test (same password).');
}

// Data for the admin portal. Returns true when something was added.
async function adminDemo(t, opportunityId) {
  let added = false;

  // registration requests (status PENDING) — a 409 means it already exists
  const requests = [
    {
      role: 'ORG_SUPERVISOR', name: 'مسؤول التدريب', email: 'school@coop.test', phone: '0551112233', password: PASSWORD,
      organizationName: 'متوسطة وثانوية الوديعة', organizationType: 'EDUCATIONAL', organizationSubtype: 'مدرسة',
    },
    { role: 'ACADEMIC_SUPERVISOR', name: 'د. خالد العمري', email: 'khalid@coop.test', password: PASSWORD, department: 'الكلية التطبيقية - علوم الحاسب' },
  ];
  for (const body of requests) {
    try {
      await api('POST', '/auth/register', { body });
      added = true;
    } catch (e) {
      if (!e.message.includes('409')) throw e;
    }
  }

  // a student accepted by the provider, waiting for the admin to create the placement
  const joud = await ensureStudent(t.admin, 'joud@coop.test', 'جود المالكي', '446300181', 'علوم الحاسب');
  const apps = await api('GET', `/applications?opportunityId=${opportunityId}&limit=100`, { token: joud });
  if (!apps.items.length) {
    const app = await api('POST', '/applications', { token: joud, body: { opportunityId } });
    await api('PATCH', `/applications/${app.id}/status`, { token: t.academic, body: { status: 'NOMINATED' } });
    await api('PATCH', `/applications/${app.id}/status`, { token: t.company, body: { status: 'APPROVED' } });
    added = true;
  }
  return added;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
