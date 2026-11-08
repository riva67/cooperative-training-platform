require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PASSWORD = 'Password123!';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await prisma.organization.upsert({
    where: { id: 1 },
    update: { phone: '0126000000' },
    create: { name: 'Tech Solutions Co.', sector: 'IT', city: 'Jeddah', contactEmail: 'hr@techsolutions.test', phone: '0126000000' },
  });

  await prisma.user.upsert({
    where: { email: 'admin@coop.test' }, update: { phone: '0500000001' },
    create: { name: 'System Admin', phone: '0500000001', email: 'admin@coop.test', passwordHash, role: 'ADMIN' },
  });

  await prisma.user.upsert({
    where: { email: 'student@coop.test' }, update: { phone: '0500000002' },
    create: {
      name: 'Test Student', phone: '0500000002', email: 'student@coop.test', passwordHash, role: 'STUDENT',
      student: { create: { universityId: '4400001', major: 'Computer Science' } },
    },
  });

  await prisma.user.upsert({
    where: { email: 'academic@coop.test' }, update: { phone: '0500000003' },
    create: {
      name: 'Dr. Academic Supervisor', phone: '0500000003', email: 'academic@coop.test', passwordHash, role: 'ACADEMIC_SUPERVISOR',
      academicSupervisor: { create: { department: 'Computer Science' } },
    },
  });

  await prisma.user.upsert({
    where: { email: 'company@coop.test' }, update: { phone: '0500000004' },
    create: {
      name: 'Company Supervisor', phone: '0500000004', email: 'company@coop.test', passwordHash, role: 'ORG_SUPERVISOR',
      orgSupervisor: { create: { organizationId: org.id, position: 'Engineering Manager' } },
    },
  });

  await prisma.trainingOpportunity.upsert({
    where: { id: 1 },
    update: {},
    create: {
      organizationId: org.id,
      title: 'Backend Developer Trainee',
      description: 'Work with the engineering team on Node.js APIs and PostgreSQL.',
      seats: 3,
      startDate: new Date('2027-01-15'),
      endDate: new Date('2027-04-15'),
    },
  });

  console.log('Seed complete. Test accounts (password for all: ' + PASSWORD + '):');
  console.log(' admin@coop.test | student@coop.test | academic@coop.test | company@coop.test');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());