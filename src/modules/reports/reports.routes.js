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

const typeEnum = z.enum(['WEEKLY', 'FINAL', 'APPROVAL']);
const statusEnum = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']);

const createSchema = z.object({
  assignmentId: z.number().int().positive(),
  type: typeEnum,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20000),
});
const decisionSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });
const listQuerySchema = z.object({
  assignmentId: z.coerce.number().int().positive().optional(),
  type: typeEnum.optional(),
  status: statusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const reportInclude = { submittedBy: { select: { id: true, name: true, role: true } } };

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// POST /reports
//   STUDENT -> WEEKLY / FINAL on their own assignment
//   ORG_SUPERVISOR -> APPROVAL on their trainee's assignment | ADMIN -> any
router.post(
  '/reports',
  authenticate,
  requireRole('STUDENT', 'ORG_SUPERVISOR'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { assignmentId, type, title, content } = req.body;
    const role = req.user.role;

    if (role === 'STUDENT' && type === 'APPROVAL') throw new HttpError(403, 'Students submit WEEKLY or FINAL reports only');
    if (role === 'ORG_SUPERVISOR' && type !== 'APPROVAL') throw new HttpError(403, 'Organization supervisors submit APPROVAL reports only');

    const assignment = await getAccessibleAssignment(req.user, assignmentId, {
      include: { student: true, academicSupervisor: true, orgSupervisor: true },
      roles: [role],
    });
    if (assignment.status === 'CANCELLED') throw new HttpError(400, 'This assignment was cancelled');

    const report = await prisma.report.create({
      data: { assignmentId: assignment.id, type, title, content, submittedById: req.user.id, status: 'SUBMITTED' },
      include: reportInclude,
    });

    await logAction(req.user.id, 'REPORT_SUBMITTED', 'Report', report.id, { type });

    if (role === 'STUDENT') {
      await Promise.all([
        notify(assignment.academicSupervisor.userId, `${req.user.name} submitted a ${type} report: ${title}`),
        notify(assignment.orgSupervisor.userId, `${req.user.name} submitted a ${type} report: ${title}`),
      ]);
    } else {
      await Promise.all([
        notify(assignment.student.userId, `Your organization submitted an approval report: ${title}`),
        notify(assignment.academicSupervisor.userId, `An approval report was submitted for ${assignment.student.universityId}: ${title}`),
      ]);
    }

    res.status(201).json(report);
  })
);

// GET /reports  -> scoped by role like assignments
router.get(
  '/reports',
  authenticate,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { assignmentId, type, status, page, limit } = req.query;
    const where = {
      assignment: assignmentAccessWhere(req.user),
      ...(assignmentId && { assignmentId }),
      ...(type && { type }),
      ...(status && { status }),
    };

    const [items, total] = await Promise.all([
      prisma.report.findMany({
        where, include: reportInclude, orderBy: { id: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// GET /reports/:id
router.get(
  '/reports/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: Number(req.params.id) }, include: reportInclude });
    if (!report) throw new HttpError(404, 'Report not found');
    await getAccessibleAssignment(req.user, report.assignmentId); // 403 if not theirs
    res.json(report);
  })
);

// PATCH /reports/:id/status  -> approve / reject a SUBMITTED report
router.patch(
  '/reports/:id/status',
  authenticate,
  requireRole('ORG_SUPERVISOR', 'ACADEMIC_SUPERVISOR'),
  validate(decisionSchema),
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: Number(req.params.id) } });
    if (!report) throw new HttpError(404, 'Report not found');

    const assignment = await getAccessibleAssignment(req.user, report.assignmentId, {
      include: { student: true },
      roles: ['ORG_SUPERVISOR', 'ACADEMIC_SUPERVISOR'],
    });
    if (report.status !== 'SUBMITTED') throw new HttpError(400, `Only SUBMITTED reports can be reviewed (this one is ${report.status})`);

    const updated = await prisma.report.update({
      where: { id: report.id }, data: { status: req.body.status }, include: reportInclude,
    });

    await logAction(req.user.id, `REPORT_${req.body.status}`, 'Report', report.id);
    await notify(assignment.student.userId, `Your report "${report.title}" was ${req.body.status.toLowerCase()}`);

    res.json(updated);
  })
);

module.exports = router;