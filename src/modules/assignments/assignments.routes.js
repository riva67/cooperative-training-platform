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

module.exports = router;
