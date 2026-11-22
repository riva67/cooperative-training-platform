const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { assignmentAccessWhere, getAccessibleAssignment } = require('../../utils/access');
const { logAction } = require('../../utils/audit');
const { notify } = require('../../utils/notify');

const userSelect = { id: true, name: true, email: true };
const fullInclude = {
  student: { include: { user: { select: userSelect } } },
  opportunity: { include: { organization: true } },
  academicSupervisor: { include: { user: { select: userSelect } } },
  orgSupervisor: { include: { user: { select: userSelect } } },
};

const createSchema = z.object({
  applicationId: z.number().int().positive(),
  academicSupervisorId: z.number().int().positive(),
  orgSupervisorId: z.number().int().positive(),
  semester: z.string().max(50).optional(),
  academicYear: z.string().max(20).optional(),
});

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']) });

const listQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.use(authenticate);

// Reject non-numeric ids early
router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// POST /assignments  -> admin creates a placement from an APPROVED application
router.post(
  '/',
  requireRole('ADMIN'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { applicationId, academicSupervisorId, orgSupervisorId, semester, academicYear } = req.body;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { opportunity: true },
    });
    if (!application) throw new HttpError(404, 'Application not found');
    if (application.status !== 'APPROVED') {
      throw new HttpError(400, 'Application must be APPROVED before creating an assignment');
    }

    const [academic, orgSupervisor] = await Promise.all([
      prisma.academicSupervisor.findUnique({ where: { id: academicSupervisorId } }),
      prisma.orgSupervisor.findUnique({ where: { id: orgSupervisorId } }),
    ]);
    if (!academic) throw new HttpError(404, 'Academic supervisor not found');
    if (!orgSupervisor) throw new HttpError(404, 'Organization supervisor not found');
    if (orgSupervisor.organizationId !== application.opportunity.organizationId) {
      throw new HttpError(400, 'This supervisor does not belong to the opportunity\'s organization');
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const alreadyActive = await tx.trainingAssignment.findFirst({
        where: { studentId: application.studentId, status: 'ACTIVE' },
      });
      if (alreadyActive) throw new HttpError(409, 'This student already has an active assignment');

      const taken = await tx.trainingAssignment.count({
        where: { opportunityId: application.opportunityId, status: { not: 'CANCELLED' } },
      });
      if (taken >= application.opportunity.seats) {
        throw new HttpError(409, 'No seats left for this opportunity');
      }

      return tx.trainingAssignment.create({
        data: {
          studentId: application.studentId,
          opportunityId: application.opportunityId,
          academicSupervisorId,
          orgSupervisorId,
          startDate: application.opportunity.startDate,
          endDate: application.opportunity.endDate,
          semester,
          academicYear,
        },
        include: fullInclude,
      });
    });

    await logAction(req.user.id, 'ASSIGNMENT_CREATED', 'TrainingAssignment', assignment.id, { applicationId });
    await Promise.all([
      notify(assignment.student.userId, `You have been placed at ${assignment.opportunity.organization.name}: ${assignment.opportunity.title}`),
      notify(assignment.academicSupervisor.userId, `A new trainee was assigned to you: ${assignment.student.user.name}`),
      notify(assignment.orgSupervisor.userId, `A new trainee was assigned to you: ${assignment.student.user.name}`),
    ]);

    res.status(201).json(assignment);
  })
);

// GET /assignments?status=&page=&limit=  -> scoped by role
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    const where = { ...assignmentAccessWhere(req.user), ...(status && { status }) };

    const [items, total] = await Promise.all([
      prisma.trainingAssignment.findMany({
        where, include: fullInclude, orderBy: { id: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.trainingAssignment.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// GET /assignments/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const assignment = await getAccessibleAssignment(req.user, req.params.id, { include: fullInclude });
    res.json(assignment);
  })
);

// PATCH /assignments/:id/status  -> admin completes or cancels an ACTIVE assignment
router.patch(
  '/:id/status',
  requireRole('ADMIN'),
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;

    const current = await prisma.trainingAssignment.findUnique({ where: { id }, include: fullInclude });
    if (!current) throw new HttpError(404, 'Assignment not found');
    if (current.status !== 'ACTIVE') throw new HttpError(400, 'Only ACTIVE assignments can be changed');
    if (status === 'ACTIVE') throw new HttpError(400, 'Assignment is already ACTIVE');

    const updated = await prisma.trainingAssignment.update({ where: { id }, data: { status }, include: fullInclude });

    await logAction(req.user.id, `ASSIGNMENT_${status}`, 'TrainingAssignment', id);
    await notify(current.student.userId, `Your training assignment is now ${status}`);

    res.json(updated);
  })
);

// ───────── نموذج (1): مباشرة المتدرب بجهة التدريب ─────────
const commencementSchema = z.object({ commencementDate: z.coerce.date() });

// GET /assignments/:id/commencement  -> data of form (1) (the frontend renders / prints it)
router.get(
  '/:id/commencement',
  asyncHandler(async (req, res) => {
    const a = await getAccessibleAssignment(req.user, req.params.id, { include: fullInclude });
    res.json({
      title: 'نموذج (1) مباشرة المتدرب بجهة التدريب',
      semester: a.semester,
      academicYear: a.academicYear,
      organization: { id: a.opportunity.organization.id, name: a.opportunity.organization.name },
      trainee: { name: a.student.user.name, universityId: a.student.universityId, major: a.student.major },
      fieldSupervisor: { name: a.orgSupervisor.user.name, position: a.orgSupervisor.position },
      commencementDate: a.commencementDate ? a.commencementDate.toISOString().split('T')[0] : null,
    });
  })
);

// PATCH /assignments/:id/commencement  -> the training provider confirms / corrects the start date
// (it is also filled automatically on the trainee's first check-in)
router.patch(
  '/:id/commencement',
  requireRole('ORG_SUPERVISOR'),
  validate(commencementSchema),
  asyncHandler(async (req, res) => {
    const a = await getAccessibleAssignment(req.user, req.params.id, { roles: ['ORG_SUPERVISOR'], include: fullInclude });
    if (a.status === 'CANCELLED') throw new HttpError(400, 'This assignment was cancelled');

    const updated = await prisma.trainingAssignment.update({
      where: { id: a.id }, data: { commencementDate: req.body.commencementDate }, include: fullInclude,
    });
    await logAction(req.user.id, 'COMMENCEMENT_CONFIRMED', 'TrainingAssignment', a.id);
    await notify(a.academicSupervisor.userId, `${a.student.user.name} started training at ${a.opportunity.organization.name}`);
    res.json(updated);
  })
);

// ───────── Post-training employment (impact indicator) ─────────
const employmentSchema = z
  .object({
    employed: z.boolean(),
    employerName: z.string().trim().max(150).optional(),
  })
  .refine((d) => !d.employed || d.employerName, { path: ['employerName'], message: 'employerName is required when employed is true' });

// PATCH /assignments/:id/employment  -> the student (own), their academic supervisor or admin records
// whether the trainee got a job after the training
router.patch(
  '/:id/employment',
  requireRole('STUDENT', 'ACADEMIC_SUPERVISOR'),
  validate(employmentSchema),
  asyncHandler(async (req, res) => {
    const a = await getAccessibleAssignment(req.user, req.params.id, { roles: ['STUDENT', 'ACADEMIC_SUPERVISOR'] });
    if (a.status !== 'COMPLETED') throw new HttpError(400, 'Employment can be recorded after the training is completed');

    const updated = await prisma.trainingAssignment.update({
      where: { id: a.id },
      data: {
        employedAfterTraining: req.body.employed,
        employerName: req.body.employed ? req.body.employerName : null,
        employmentRecordedAt: new Date(),
      },
      include: fullInclude,
    });
    await logAction(req.user.id, 'EMPLOYMENT_RECORDED', 'TrainingAssignment', a.id, { employed: req.body.employed });
    res.json(updated);
  })
);

module.exports = router;
