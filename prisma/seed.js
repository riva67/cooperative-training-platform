require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PASSWORD = 'Password123!';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await prisma.organization.upsert({
    where: { id: 1 },
    update: {},
    create: { name: 'Tech Solutions Co.', sector: 'IT', city: 'Jeddah', contactEmail: 'hr@techsolutions.test' },
  });

  await prisma.user.upsert({
    where: { email: 'admin@coop.test' }, update: {},
    create: { name: 'System Admin', email: 'admin@coop.test', passwordHash, role: 'ADMIN' },
  });

  await prisma.user.upsert({
    where: { email: 'student@coop.test' }, update: {},
    create: {
      name: 'Test Student', email: 'student@coop.test', passwordHash, role: 'STUDENT',
      student: { create: { universityId: '4400001', major: 'Computer Science' } },
    },
  });

  await prisma.user.upsert({
    where: { email: 'academic@coop.test' }, update: {},
    create: {
      name: 'Dr. Academic Supervisor', email: 'academic@coop.test', passwordHash, role: 'ACADEMIC_SUPERVISOR',
      academicSupervisor: { create: { department: 'Computer Science' } },
    },
  });

  await prisma.user.upsert({
    where: { email: 'company@coop.test' }, update: {},
    create: {
      name: 'Company Supervisor', email: 'company@coop.test', passwordHash, role: 'ORG_SUPERVISOR',
      orgSupervisor: { create: { organizationId: org.id, position: 'Engineering Manager' } },
    },
  });

  console.log('Seed complete. Test accounts (password for all: ' + PASSWORD + '):');
  console.log(' admin@coop.test | student@coop.test | academic@coop.test | company@coop.test');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
