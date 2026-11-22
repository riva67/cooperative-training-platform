const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { getStudentProfile, getOrgSupervisorProfile, userIdsByRole } = require('../../utils/profiles');
const { logAction } = require('../../utils/audit');
const { notify } = require('../../utils/notify');
const { todayDate, dateOnly } = require('../../utils/dates');

const userSelect = { id: true, name: true, email: true };
const appInclude = {
  student: { include: { user: { select: userSelect } } },
  opportunity: { include: { organization: true } },
};

// Which applications may this user see?
//  STUDENT -> own | ORG_SUPERVISOR -> to their organization | ACADEMIC_SUPERVISOR / ADMIN -> all
async function applicationScope(user) {
  switch (user.role) {
    case 'STUDENT': return { student: { userId: user.id } };
    case 'ORG_SUPERVISOR': {
      const p = await getOrgSupervisorProfile(user);
      return { opportunity: { organizationId: p.organizationId } };
    }
    case 'ACADEMIC_SUPERVISOR':
    case 'ADMIN': return {};
    default: return { id: -1 };
  }
}

// Org-supervisor user ids of an organization
async function orgSupervisorUserIds(organizationId) {
  const list = await prisma.orgSupervisor.findMany({ where: { organizationId }, select: { userId: true } });
  return list.map((s) => s.userId);
}

// POST /applications  (STUDENT)
const createApplication = asyncHandler(async (req, res) => {
  if (req.user.role !== 'STUDENT') throw new HttpError(403, 'Only students can apply');
  const student = await getStudentProfile(req.user);
  const { opportunityId } = req.body;

  const opportunity = await prisma.trainingOpportunity.findUnique({
    where: { id: opportunityId },
    include: { organization: true },
  });
  if (!opportunity) throw new HttpError(404, 'Opportunity not found');
  if (opportunity.status !== 'OPEN') throw new HttpError(400, 'This opportunity is closed');
  if (opportunity.deadline && todayDate() > dateOnly(opportunity.deadline)) {
    throw new HttpError(400, 'The application deadline for this opportunity has passed');
  }

  const active = await prisma.trainingAssignment.count({ where: { studentId: student.id, status: 'ACTIVE' } });
  if (active) throw new HttpError(400, 'You already have an active training assignment');

  const existing = await prisma.application.findUnique({
    where: { studentId_opportunityId: { studentId: student.id, opportunityId } },
  });
  if (existing) throw new HttpError(409, 'You have already applied to this opportunity');

  const created = await prisma.application.create({
    data: { studentId: student.id, opportunityId },
    include: appInclude,
  });

  await logAction(req.user.id, 'APPLICATION_CREATED', 'Application', created.id, { opportunityId });
  const orgUsers = await orgSupervisorUserIds(opportunity.organizationId);
  await Promise.all(orgUsers.map((uid) => notify(uid, `New application from ${req.user.name} for "${opportunity.title}"`)));
  // academic supervisors nominate the applicants, so they are notified too
  const academics = await userIdsByRole('ACADEMIC_SUPERVISOR');
  await Promise.all(
    academics.map((uid) =>
      notify(uid, `${req.user.name} applied to "${opportunity.title}" at ${opportunity.organization.name}. Waiting for nomination.`)
    )
  );

  res.status(201).json(created);
});

// GET /applications
const listApplications = asyncHandler(async (req, res) => {
  const { status, opportunityId, page, limit } = req.query;
  const where = {
    ...(await applicationScope(req.user)),
    ...(status && { status }),
    ...(opportunityId && { opportunityId }),
  };

  const [items, total] = await Promise.all([
    prisma.application.findMany({
      where, include: appInclude, orderBy: { id: 'desc' },
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.application.count({ where }),
  ]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// PATCH /applications/:id/status
//   PENDING -> NOMINATED  (ACADEMIC_SUPERVISOR)
//   NOMINATED -> APPROVED / REJECTED  (ORG_SUPERVISOR of that organization)
//   ADMIN can perform any step. APPROVED / REJECTED are final.
const updateStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  const application = await prisma.application.findUnique({ where: { id }, include: appInclude });
  if (!application) throw new HttpError(404, 'Application not found');

  const current = application.status;
  const role = req.user.role;
  const isAdmin = role === 'ADMIN';

  if (current === 'APPROVED' || current === 'REJECTED') {
    throw new HttpError(400, `This application is already ${current} and cannot be changed`);
  }
  if (status === current) throw new HttpError(400, `Application is already ${current}`);

  if (status === 'NOMINATED') {
    if (!isAdmin && role !== 'ACADEMIC_SUPERVISOR') {
      throw new HttpError(403, 'Only an academic supervisor can nominate');
    }
    if (current !== 'PENDING') throw new HttpError(400, 'Only PENDING applications can be nominated');
  } else {
    // APPROVED or REJECTED
    if (!isAdmin) {
      if (role !== 'ORG_SUPERVISOR') throw new HttpError(403, 'Only the training organization can approve or reject');
      const profile = await getOrgSupervisorProfile(req.user);
      if (profile.organizationId !== application.opportunity.organizationId) {
        throw new HttpError(403, 'This application belongs to another organization');
      }
      if (current !== 'NOMINATED') {
        throw new HttpError(400, 'The student must be nominated by the academic supervisor first');
      }
    }
  }

  if (status !== 'REJECTED' && application.opportunity.status !== 'OPEN') {
    throw new HttpError(400, 'This opportunity is closed');
  }
  if (status === 'APPROVED') {
    const approved = await prisma.application.count({ where: { opportunityId: application.opportunityId, status: 'APPROVED' } });
    if (approved >= application.opportunity.seats) {
      throw new HttpError(409, 'All seats of this opportunity are taken. Increase the seats or reject the application');
    }
  }

  const updated = await prisma.application.update({ where: { id }, data: { status }, include: appInclude });

  await logAction(req.user.id, `APPLICATION_${status}`, 'Application', id, { from: current });

  const title = application.opportunity.title;
  const orgName = application.opportunity.organization.name;
  const messages = {
    NOMINATED: `You were nominated by the university for "${title}" at ${orgName}. Waiting for the organization's decision.`,
    APPROVED: `Congratulations! Your application for "${title}" at ${orgName} was approved.`,
    REJECTED: `Your application for "${title}" at ${orgName} was rejected.`,
  };
  await notify(application.student.userId, messages[status]);

  if (status === 'NOMINATED') {
    const orgUsers = await orgSupervisorUserIds(application.opportunity.organizationId);
    await Promise.all(orgUsers.map((uid) => notify(uid, `${application.student.user.name} was nominated for "${title}". Please approve or reject.`)));
  }
  if (status === 'APPROVED') {
    const admins = await userIdsByRole('ADMIN');
    await Promise.all(admins.map((uid) => notify(uid, `${application.student.user.name} was approved for "${title}". Create the assignment.`)));
  }

  res.json(updated);
});

// GET /opportunities/:id/applicants  -> applicants sorted by GPA (highest first, no GPA last)
const getApplicantsForOpportunity = asyncHandler(async (req, res) => {
  const opportunityId = Number(req.params.id);
  const opportunity = await prisma.trainingOpportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw new HttpError(404, 'Opportunity not found');

  if (req.user.role === 'ORG_SUPERVISOR') {
    const profile = await getOrgSupervisorProfile(req.user);
    if (profile.organizationId !== opportunity.organizationId) {
      throw new HttpError(403, 'This opportunity belongs to another organization');
    }
  }

  const where = { opportunityId, ...(req.query.status && { status: req.query.status }) };
  const items = await prisma.application.findMany({
    where,
    include: { student: { include: { user: { select: userSelect } } } },
  });

  items.sort((a, b) => (b.student.gpa ?? -1) - (a.student.gpa ?? -1));
  res.json({ opportunityId, count: items.length, items });
});

module.exports = { createApplication, listApplications, updateStatus, getApplicantsForOpportunity };