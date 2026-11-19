const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { getOrgSupervisorProfile } = require('../../utils/profiles');
const { logAction } = require('../../utils/audit');

// Flow kept as agreed: the training provider publishes an opportunity -> students apply ->
// the application is visible to the academic supervisor and to the training provider (see applications module).

const status = z.enum(['OPEN', 'CLOSED']);
const type = z.enum(['COOP', 'SUMMER']); // تدريب تعاوني / تدريب صيفي
const optionalText = (max) => z.string().trim().max(max).nullable().optional();

const baseFields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(5000),
  type: type.default('COOP'),
  seats: z.number().int().min(1).max(1000),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  deadline: z.coerce.date().nullable().optional(), // last day to apply
  location: optionalText(300),
  target: optionalText(200), // target major / college
  requirements: optionalText(3000),
};

const createSchema = z
  .object({ ...baseFields, organizationId: z.number().int().positive().optional() /* ADMIN only */ })
  .refine((d) => d.endDate > d.startDate, { path: ['endDate'], message: 'endDate must be after startDate' })
  .refine((d) => !d.deadline || d.deadline <= d.endDate, { path: ['deadline'], message: 'deadline must be before endDate' });

const updateSchema = z
  .object({ ...baseFields, type, status })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Send at least one field to change' });

const listQuerySchema = z.object({
  status: status.optional(),
  type: type.optional(),
  organizationId: z.coerce.number().int().positive().optional(),
  organizationType: z.enum(['PRIVATE', 'EDUCATIONAL', 'GOVERNMENT']).optional(),
  mine: z.enum(['true', 'false']).optional(), // ORG_SUPERVISOR: only my organization's opportunities
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const include = { organization: true, _count: { select: { applications: true } } };

// A seat is taken by every APPROVED application (approved students are then placed with POST /assignments).
async function withSeats(list) {
  const ids = list.map((o) => o.id);
  const approved = ids.length
    ? await prisma.application.groupBy({ by: ['opportunityId'], where: { opportunityId: { in: ids }, status: 'APPROVED' }, _count: true })
    : [];
  const taken = Object.fromEntries(approved.map((r) => [r.opportunityId, r._count]));
  return list.map(({ _count, ...o }) => {
    const seatsTaken = taken[o.id] || 0;
    return { ...o, applicationsCount: _count.applications, seatsTaken, seatsAvailable: Math.max(o.seats - seatsTaken, 0) };
  });
}

async function loadOwnOpportunity(user, id) {
  const opp = await prisma.trainingOpportunity.findUnique({ where: { id }, include: { _count: { select: { applications: true } } } });
  if (!opp) throw new HttpError(404, 'Opportunity not found');
  if (user.role !== 'ADMIN') {
    const profile = await getOrgSupervisorProfile(user);
    if (profile.organizationId !== opp.organizationId) throw new HttpError(403, 'This opportunity belongs to another organization');
  }
  return opp;
}

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// GET /opportunities  -> any logged-in user
router.get(
  '/opportunities',
  authenticate,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { status: st, type: tp, organizationId, organizationType, mine, search, page, limit } = req.query;

    let ownOrgId;
    if (mine === 'true') {
      if (req.user.role !== 'ORG_SUPERVISOR') throw new HttpError(400, 'mine=true is only for training providers');
      ownOrgId = (await getOrgSupervisorProfile(req.user)).organizationId;
    }

    const where = {
      ...(st && { status: st }),
      ...(tp && { type: tp }),
      ...((ownOrgId || organizationId) && { organizationId: ownOrgId || organizationId }),
      ...(organizationType && { organization: { type: organizationType } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      prisma.trainingOpportunity.findMany({ where, include, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.trainingOpportunity.count({ where }),
    ]);

    res.json({ items: await withSeats(rows), total, page, pages: Math.ceil(total / limit) });
  })
);

// GET /opportunities/summary  -> seats overview of my organization (المقاعد التدريبية)
router.get(
  '/opportunities/summary',
  authenticate,
  requireRole('ORG_SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const where = req.user.role === 'ADMIN' ? {} : { organizationId: (await getOrgSupervisorProfile(req.user)).organizationId };
    const rows = await withSeats(await prisma.trainingOpportunity.findMany({ where, include }));
    const open = rows.filter((o) => o.status === 'OPEN');
    res.json({
      opportunities: rows.length,
      openOpportunities: open.length,
      totalSeats: open.reduce((s, o) => s + o.seats, 0),
      seatsTaken: open.reduce((s, o) => s + o.seatsTaken, 0),
      seatsAvailable: open.reduce((s, o) => s + o.seatsAvailable, 0),
      applications: rows.reduce((s, o) => s + o.applicationsCount, 0),
    });
  })
);

// POST /opportunities  -> ORG_SUPERVISOR (own organization) or ADMIN
router.post(
  '/opportunities',
  authenticate,
  requireRole('ORG_SUPERVISOR'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { organizationId: bodyOrgId, ...data } = req.body;

    let organizationId;
    if (req.user.role === 'ADMIN') {
      if (!bodyOrgId) throw new HttpError(400, 'organizationId is required for admins');
      const org = await prisma.organization.findUnique({ where: { id: bodyOrgId } });
      if (!org) throw new HttpError(404, 'Organization not found');
      organizationId = org.id;
    } else {
      organizationId = (await getOrgSupervisorProfile(req.user)).organizationId; // body value ignored
    }

    const created = await prisma.trainingOpportunity.create({ data: { ...data, organizationId }, include });

    await logAction(req.user.id, 'OPPORTUNITY_CREATED', 'TrainingOpportunity', created.id);
    res.status(201).json((await withSeats([created]))[0]);
  })
);

// GET /opportunities/:id  -> any logged-in user
router.get(
  '/opportunities/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const opp = await prisma.trainingOpportunity.findUnique({ where: { id: Number(req.params.id) }, include });
    if (!opp) throw new HttpError(404, 'Opportunity not found');
    res.json((await withSeats([opp]))[0]);
  })
);

// PATCH /opportunities/:id  -> ORG_SUPERVISOR (own organization) or ADMIN
router.patch(
  '/opportunities/:id',
  authenticate,
  requireRole('ORG_SUPERVISOR'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const opp = await loadOwnOpportunity(req.user, id);

    const start = req.body.startDate ?? opp.startDate;
    const end = req.body.endDate ?? opp.endDate;
    const deadline = req.body.deadline !== undefined ? req.body.deadline : opp.deadline;
    if (end <= start) throw new HttpError(400, 'endDate must be after startDate');
    if (deadline && deadline > end) throw new HttpError(400, 'deadline must be before endDate');

    if (req.body.seats !== undefined) {
      const taken = await prisma.application.count({ where: { opportunityId: id, status: 'APPROVED' } });
      if (req.body.seats < taken) {
        throw new HttpError(400, `Seats cannot be lower than the ${taken} student(s) already approved`);
      }
    }

    const updated = await prisma.trainingOpportunity.update({ where: { id }, data: req.body, include });

    await logAction(req.user.id, 'OPPORTUNITY_UPDATED', 'TrainingOpportunity', id, { fields: Object.keys(req.body) });
    res.json((await withSeats([updated]))[0]);
  })
);

// DELETE /opportunities/:id  -> only while nobody has applied (otherwise close it with PATCH status=CLOSED)
router.delete(
  '/opportunities/:id',
  authenticate,
  requireRole('ORG_SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const opp = await loadOwnOpportunity(req.user, id);
    if (opp._count.applications > 0) {
      throw new HttpError(409, 'Students have already applied to this opportunity. Close it instead (status CLOSED)');
    }

    await prisma.trainingOpportunity.delete({ where: { id } });
    await logAction(req.user.id, 'OPPORTUNITY_DELETED', 'TrainingOpportunity', id, { title: opp.title });
    res.status(204).end();
  })
);

module.exports = router;
