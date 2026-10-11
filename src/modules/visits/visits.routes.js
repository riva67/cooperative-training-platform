const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { logAction } = require('../../utils/audit');
const { notify } = require('../../utils/notify');

const contactSelect = { id: true, name: true, email: true, phone: true };
const visitInclude = {
  academicSupervisor: { include: { user: { select: contactSelect } } },
  orgSupervisor: { include: { user: { select: contactSelect }, organization: true } },
};

const DEFAULT_APPROVE = 'الوقت مناسب جداً ونتطلع للقائكم قريباً.';
const DEFAULT_DECLINE = 'نعتذر، الوقت المقترح غير مناسب. نأمل اقتراح موعد آخر.';

const createSchema = z.object({
  orgSupervisorId: z.number().int().positive(),
  scheduledAt: z.coerce.date(),
  message: z.string().max(1000).optional(),
});
const respondSchema = z.object({
  decision: z.enum(['APPROVE', 'DECLINE']),
  message: z.string().max(1000).optional(),
});
const updateSchema = z
  .object({ isDone: z.boolean().optional(), notes: z.string().max(2000).nullable().optional() })
  .refine((d) => d.isDone !== undefined || d.notes !== undefined, { message: 'Send isDone and/or notes' });
const listQuerySchema = z.object({
  when: z.enum(['upcoming', 'past']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'DECLINED', 'CANCELLED']).optional(),
  isDone: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function formatWhen(date) {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(date);
  } catch {
    return date.toISOString();
  }
}

const isAdmin = (user) => user.role === 'ADMIN';

async function loadVisit(id) {
  const visit = await prisma.fieldVisit.findUnique({ where: { id }, include: visitInclude });
  if (!visit) throw new HttpError(404, 'Visit not found');
  return visit;
}

router.use(authenticate);

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// POST /visits  -> academic supervisor books a visit (goes to the organization supervisor for approval)
router.post(
  '/',
  requireRole('ACADEMIC_SUPERVISOR'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { orgSupervisorId, scheduledAt, message } = req.body;

    const academic = await prisma.academicSupervisor.findUnique({ where: { userId: req.user.id } });
    if (!academic) throw new HttpError(403, 'Only academic supervisors can book visits');
    if (scheduledAt <= new Date()) throw new HttpError(400, 'The visit time must be in the future');

    const orgSupervisor = await prisma.orgSupervisor.findUnique({ where: { id: orgSupervisorId } });
    if (!orgSupervisor) throw new HttpError(404, 'Organization supervisor not found');

    const related = await prisma.trainingAssignment.count({
      where: { academicSupervisorId: academic.id, orgSupervisorId, status: 'ACTIVE' },
    });
    if (!related) throw new HttpError(403, 'You have no active trainees with this organization supervisor');

    // visits are 1 hour long: refuse overlapping PENDING/APPROVED visits for either side
    const lo = new Date(scheduledAt.getTime() - 59 * 60000);
    const hi = new Date(scheduledAt.getTime() + 59 * 60000);
    const clash = await prisma.fieldVisit.findFirst({
      where: {
        status: { in: ['PENDING', 'APPROVED'] },
        scheduledAt: { gte: lo, lte: hi },
        OR: [{ academicSupervisorId: academic.id }, { orgSupervisorId }],
      },
    });
    if (clash) throw new HttpError(409, 'There is already a visit at (or within an hour of) this time');

    const when = formatWhen(scheduledAt);
    const requestMessage =
      message?.trim() ||
      `السلام عليكم، أرغب بزيارة جهة التدريب ميدانياً يوم ${when}. نأمل إفادتنا بمدى مناسبة الموعد.`;

    const visit = await prisma.fieldVisit.create({
      data: { academicSupervisorId: academic.id, orgSupervisorId, scheduledAt, requestMessage },
      include: visitInclude,
    });

    await logAction(req.user.id, 'VISIT_REQUESTED', 'FieldVisit', visit.id, { scheduledAt });
    await notify(orgSupervisor.userId, `طلب زيارة ميدانية من ${req.user.name} بتاريخ ${when}. الرجاء الرد بالموافقة أو الاعتذار.`);

    res.status(201).json(visit);
  })
);

// GET /visits?when=upcoming|past&status=&isDone=  -> the "الزيارات الميدانية" table
router.get(
  '/',
  requireRole('ACADEMIC_SUPERVISOR', 'ORG_SUPERVISOR'),
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { when, status, isDone, page, limit } = req.query;
    const now = new Date();

    const scope =
      req.user.role === 'ACADEMIC_SUPERVISOR' ? { academicSupervisor: { userId: req.user.id } }
      : req.user.role === 'ORG_SUPERVISOR' ? { orgSupervisor: { userId: req.user.id } }
      : {};

    const where = {
      ...scope,
      ...(status && { status }),
      ...(isDone !== undefined && { isDone }),
      ...(when === 'upcoming' && { scheduledAt: { gte: now } }),
      ...(when === 'past' && { scheduledAt: { lt: now } }),
    };

    const [items, total] = await Promise.all([
      prisma.fieldVisit.findMany({
        where, include: visitInclude,
        orderBy: { scheduledAt: when === 'upcoming' ? 'asc' : 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.fieldVisit.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// PATCH /visits/:id/respond  -> organization supervisor approves or declines
router.patch(
  '/:id/respond',
  requireRole('ORG_SUPERVISOR'),
  validate(respondSchema),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(Number(req.params.id));
    if (!isAdmin(req.user) && visit.orgSupervisor.userId !== req.user.id) {
      throw new HttpError(403, 'This visit request was not sent to you');
    }
    if (visit.status !== 'PENDING') throw new HttpError(400, 'This request was already answered or cancelled');
    if (visit.scheduledAt <= new Date()) throw new HttpError(400, 'The requested time has already passed');

    const approve = req.body.decision === 'APPROVE';
    const responseMessage = req.body.message?.trim() || (approve ? DEFAULT_APPROVE : DEFAULT_DECLINE);

    const updated = await prisma.fieldVisit.update({
      where: { id: visit.id },
      data: { status: approve ? 'APPROVED' : 'DECLINED', responseMessage, respondedAt: new Date() },
      include: visitInclude,
    });

    await logAction(req.user.id, approve ? 'VISIT_APPROVED' : 'VISIT_DECLINED', 'FieldVisit', visit.id);
    await notify(
      visit.academicSupervisor.userId,
      `${approve ? 'تمت الموافقة على' : 'تم الاعتذار عن'} طلب الزيارة بتاريخ ${formatWhen(visit.scheduledAt)}: ${responseMessage}`
    );

    res.json(updated);
  })
);

// PATCH /visits/:id  -> academic supervisor ticks "Done" and/or writes notes
router.patch(
  '/:id',
  requireRole('ACADEMIC_SUPERVISOR'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(Number(req.params.id));
    if (!isAdmin(req.user) && visit.academicSupervisor.userId !== req.user.id) {
      throw new HttpError(403, 'This is not your visit');
    }
    const { isDone, notes } = req.body;

    const data = {};
    if (notes !== undefined) data.notes = notes;
    if (isDone === true) {
      if (visit.status !== 'APPROVED') throw new HttpError(400, 'Only an approved visit can be marked as done');
      if (visit.scheduledAt > new Date()) throw new HttpError(400, 'The visit date has not arrived yet');
      data.isDone = true;
      data.doneAt = new Date();
    } else if (isDone === false) {
      data.isDone = false;
      data.doneAt = null;
    }

    const updated = await prisma.fieldVisit.update({ where: { id: visit.id }, data, include: visitInclude });
    if (isDone !== undefined) {
      await logAction(req.user.id, isDone ? 'VISIT_DONE' : 'VISIT_UNDONE', 'FieldVisit', visit.id);
    }
    res.json(updated);
  })
);

// PATCH /visits/:id/cancel  -> academic supervisor cancels a pending/approved visit
router.patch(
  '/:id/cancel',
  requireRole('ACADEMIC_SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(Number(req.params.id));
    if (!isAdmin(req.user) && visit.academicSupervisor.userId !== req.user.id) {
      throw new HttpError(403, 'This is not your visit');
    }
    if (!['PENDING', 'APPROVED'].includes(visit.status) || visit.isDone) {
      throw new HttpError(400, 'This visit can no longer be cancelled');
    }

    const updated = await prisma.fieldVisit.update({ where: { id: visit.id }, data: { status: 'CANCELLED' }, include: visitInclude });

    await logAction(req.user.id, 'VISIT_CANCELLED', 'FieldVisit', visit.id);
    await notify(visit.orgSupervisor.userId, `تم إلغاء الزيارة الميدانية المقررة بتاريخ ${formatWhen(visit.scheduledAt)}`);

    res.json(updated);
  })
);

module.exports = router;
