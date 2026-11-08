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

const status = z.enum(['OPEN', 'CLOSED']);

const createSchema = z
  .object({
    organizationId: z.number().int().positive().optional(), // ADMIN only
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(1).max(5000),
    seats: z.number().int().min(1).max(1000),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((d) => d.endDate > d.startDate, { path: ['endDate'], message: 'endDate must be after startDate' });

const updateSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(1).max(5000),
    seats: z.number().int().min(1).max(1000),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    status,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Send at least one field to change' });

const listQuerySchema = z.object({
  status: status.optional(),
  organizationId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

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
    const { status: st, organizationId, search, page, limit } = req.query;
    const where = {
      ...(st && { status: st }),
      ...(organizationId && { organizationId }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.trainingOpportunity.findMany({
        where,
        include: { organization: true },
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trainingOpportunity.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
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

    const created = await prisma.trainingOpportunity.create({
      data: { ...data, organizationId },
      include: { organization: true },
    });

    await logAction(req.user.id, 'OPPORTUNITY_CREATED', 'TrainingOpportunity', created.id);
    res.status(201).json(created);
  })
);

// GET /opportunities/:id  -> any logged-in user
router.get(
  '/opportunities/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const opp = await prisma.trainingOpportunity.findUnique({
      where: { id: Number(req.params.id) },
      include: { organization: true },
    });
    if (!opp) throw new HttpError(404, 'Opportunity not found');
    res.json(opp);
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
    const opp = await prisma.trainingOpportunity.findUnique({ where: { id } });
    if (!opp) throw new HttpError(404, 'Opportunity not found');

    if (req.user.role !== 'ADMIN') {
      const profile = await getOrgSupervisorProfile(req.user);
      if (profile.organizationId !== opp.organizationId) {
        throw new HttpError(403, 'This opportunity belongs to another organization');
      }
    }

    const start = req.body.startDate ?? opp.startDate;
    const end = req.body.endDate ?? opp.endDate;
    if (end <= start) throw new HttpError(400, 'endDate must be after startDate');

    if (req.body.seats !== undefined) {
      const taken = await prisma.trainingAssignment.count({
        where: { opportunityId: id, status: { not: 'CANCELLED' } },
      });
      if (req.body.seats < taken) {
        throw new HttpError(400, `Seats cannot be lower than the ${taken} trainee(s) already placed`);
      }
    }

    const updated = await prisma.trainingOpportunity.update({
      where: { id },
      data: req.body,
      include: { organization: true },
    });

    await logAction(req.user.id, 'OPPORTUNITY_UPDATED', 'TrainingOpportunity', id, { fields: Object.keys(req.body) });
    res.json(updated);
  })
);

module.exports = router;