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

// Training organizations (جهات التدريب).
// Created automatically when a training provider registers (POST /auth/register),
// or by an admin here (e.g. to add a second supervisor to an existing organization with POST /users).
const orgType = z.enum(['PRIVATE', 'EDUCATIONAL', 'GOVERNMENT']);
const phone = z.string().trim().min(5).max(20).regex(/^[0-9+\-\s]+$/, 'Invalid phone number');

const fields = {
  name: z.string().trim().min(2).max(150),
  type: orgType,
  sector: z.string().trim().max(100).nullable(),
  city: z.string().trim().max(100).nullable(),
  contactEmail: z.string().trim().email().max(150).nullable(),
  phone: phone.nullable(),
  crNumber: z.string().trim().min(5).max(30).nullable(),
};

const createSchema = z.object(fields).partial().required({ name: true, type: true });
const updateSchema = z
  .object(fields)
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Send at least one field to change' });

const listQuerySchema = z.object({
  type: orgType.optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const withCounts = { _count: { select: { opportunities: true, supervisors: true } } };

router.use(authenticate);

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// GET /organizations?type=&search=  -> any logged-in user (filters, opportunity pages, visits)
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { type, search, page, limit } = req.query;
    const where = {
      ...(type && { type }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };

    const [items, total] = await Promise.all([
      prisma.organization.findMany({ where, include: withCounts, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
      prisma.organization.count({ where }),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// GET /organizations/:id  -> organization + its supervisors (contact details)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        ...withCounts,
        supervisors: {
          where: { user: { isActive: true } },
          select: { id: true, position: true, user: { select: { id: true, name: true, email: true, phone: true } } },
        },
      },
    });
    if (!org) throw new HttpError(404, 'Organization not found');
    res.json(org);
  })
);

// POST /organizations  -> admin only
router.post(
  '/',
  requireRole('ADMIN'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.create({ data: req.body, include: withCounts });
    await logAction(req.user.id, 'ORGANIZATION_CREATED', 'Organization', org.id);
    res.status(201).json(org);
  })
);

// PATCH /organizations/:id  -> admin, or a supervisor of that organization (except the CR number)
router.patch(
  '/:id',
  requireRole('ORG_SUPERVISOR'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (req.user.role !== 'ADMIN') {
      const profile = await getOrgSupervisorProfile(req.user);
      if (profile.organizationId !== id) throw new HttpError(403, 'You can only edit your own organization');
      if (req.body.crNumber !== undefined) {
        throw new HttpError(403, 'The commercial registration number can only be changed by the administration');
      }
    }

    const org = await prisma.organization.update({ where: { id }, data: req.body, include: withCounts });
    await logAction(req.user.id, 'ORGANIZATION_UPDATED', 'Organization', id, { fields: Object.keys(req.body) });
    res.json(org);
  })
);

module.exports = router;
