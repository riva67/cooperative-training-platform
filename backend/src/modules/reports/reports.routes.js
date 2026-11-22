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

const typeEnum = z.enum(['WEEKLY', 'FINAL', 'APPROVAL', 'ABSENCE_WARNING', 'VISIT']);

// Who submits which report type
const STUDENT_TYPES = ['WEEKLY', 'FINAL'];
const PROVIDER_TYPES = ['APPROVAL', 'ABSENCE_WARNING', 'VISIT']; // إفادة، إنذار غياب، تقرير زيارة
// Only these are reviewed (approved / rejected); warnings and visit reports are notices
const REVIEWABLE = ['WEEKLY', 'FINAL', 'APPROVAL'];
const statusEnum = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']);

const createSchema = z.object({
  assignmentId: z.number().int().positive(),
  type: typeEnum,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20000),
  weekNumber: z.number().int().min(1).max(52).optional(),
  attachmentId: z.number().int().positive().optional(), // upload the file first with POST /attachments
});
const editSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(20000),
    weekNumber: z.number().int().min(1).max(52).nullable(),
    attachmentId: z.number().int().positive().nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Send at least one field to change' });
const decisionSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });
const listQuerySchema = z.object({
  assignmentId: z.coerce.number().int().positive().optional(),
  type: typeEnum.optional(),
  status: statusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const reportInclude = {
  submittedBy: { select: { id: true, name: true, role: true } },
  attachment: { select: { id: true, originalName: true, mimeType: true, size: true } },
};

async function checkAttachmentOwner(user, attachmentId) {
  if (!attachmentId) return;
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) throw new HttpError(404, 'Attachment not found');
  if (att.uploadedById !== user.id) throw new HttpError(403, 'You can only attach files you uploaded');
}

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// POST /reports
//   STUDENT -> WEEKLY / FINAL on their own assignment
//   ORG_SUPERVISOR -> APPROVAL / ABSENCE_WARNING / VISIT on their trainee's assignment | ADMIN -> any
router.post(
  '/reports',
  authenticate,
  requireRole('STUDENT', 'ORG_SUPERVISOR'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { assignmentId, type, title, content, weekNumber, attachmentId } = req.body;
    const role = req.user.role;

    if (role === 'STUDENT' && !STUDENT_TYPES.includes(type)) throw new HttpError(403, 'Students submit WEEKLY or FINAL reports only');
    if (role === 'ORG_SUPERVISOR' && !PROVIDER_TYPES.includes(type)) {
      throw new HttpError(403, 'Training providers submit APPROVAL, ABSENCE_WARNING or VISIT reports only');
    }
    await checkAttachmentOwner(req.user, attachmentId);

    const assignment = await getAccessibleAssignment(req.user, assignmentId, {
      include: { student: true, academicSupervisor: true, orgSupervisor: true },
      roles: [role],
    });
    if (assignment.status === 'CANCELLED') throw new HttpError(400, 'This assignment was cancelled');

    const report = await prisma.report.create({
      data: {
        assignmentId: assignment.id, type, title, content, submittedById: req.user.id, status: 'SUBMITTED',
        weekNumber: type === 'WEEKLY' ? weekNumber : null, attachmentId,
      },
      include: reportInclude,
    });

    await logAction(req.user.id, 'REPORT_SUBMITTED', 'Report', report.id, { type });

    if (role === 'STUDENT') {
      await Promise.all([
        notify(assignment.academicSupervisor.userId, `${req.user.name} submitted a ${type} report: ${title}`),
        notify(assignment.orgSupervisor.userId, `${req.user.name} submitted a ${type} report: ${title}`),
      ]);
    } else {
      const label = { APPROVAL: 'an approval report', ABSENCE_WARNING: 'an absence warning', VISIT: 'a visit report' }[type] || 'a report';
      await Promise.all([
        notify(assignment.student.userId, `Your training organization sent ${label}: ${title}`),
        notify(assignment.academicSupervisor.userId, `The training organization sent ${label} for ${assignment.student.universityId}: ${title}`),
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
    if (!REVIEWABLE.includes(report.type)) throw new HttpError(400, `${report.type} reports are notices and are not reviewed`);
    if (report.submittedById === req.user.id) throw new HttpError(403, 'You cannot review your own report');
    if (report.status !== 'SUBMITTED') throw new HttpError(400, `Only SUBMITTED reports can be reviewed (this one is ${report.status})`);

    const updated = await prisma.report.update({
      where: { id: report.id }, data: { status: req.body.status }, include: reportInclude,
    });

    await logAction(req.user.id, `REPORT_${req.body.status}`, 'Report', report.id);
    await notify(assignment.student.userId, `Your report "${report.title}" was ${req.body.status.toLowerCase()}`);

    res.json(updated);
  })
);

// PATCH /reports/:id  -> the author edits a SUBMITTED or REJECTED report; it goes back to SUBMITTED for review
router.patch(
  '/reports/:id',
  authenticate,
  validate(editSchema),
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: Number(req.params.id) } });
    if (!report) throw new HttpError(404, 'Report not found');
    if (report.submittedById !== req.user.id) throw new HttpError(403, 'Only the author can edit this report');
    if (report.status === 'APPROVED') throw new HttpError(400, 'An approved report cannot be changed');

    const assignment = await getAccessibleAssignment(req.user, report.assignmentId, {
      include: { student: true, academicSupervisor: true, orgSupervisor: true },
    });
    if (assignment.status === 'CANCELLED') throw new HttpError(400, 'This assignment was cancelled');
    await checkAttachmentOwner(req.user, req.body.attachmentId);

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: { ...req.body, ...(report.type !== 'WEEKLY' && { weekNumber: null }), status: 'SUBMITTED' },
      include: reportInclude,
    });

    await logAction(req.user.id, report.status === 'REJECTED' ? 'REPORT_RESUBMITTED' : 'REPORT_EDITED', 'Report', report.id);
    if (report.status === 'REJECTED') {
      const reviewers = STUDENT_TYPES.includes(report.type)
        ? [assignment.academicSupervisor.userId, assignment.orgSupervisor.userId]
        : [assignment.academicSupervisor.userId];
      await Promise.all(reviewers.map((uid) => notify(uid, `${req.user.name} resubmitted the report: ${updated.title}`)));
    }

    res.json(updated);
  })
);

module.exports = router;