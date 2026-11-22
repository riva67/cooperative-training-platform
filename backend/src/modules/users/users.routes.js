const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { logAction } = require('../../utils/audit');

const ROLES = ['STUDENT', 'ACADEMIC_SUPERVISOR', 'ORG_SUPERVISOR', 'ADMIN'];

const createUserSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    phone: z.string().min(5).max(20).regex(/^[0-9+\-\s]+$/, 'Invalid phone number').optional(),
    role: z.enum(ROLES),
    // role-specific profile fields
    universityId: z.string().optional(), // STUDENT (required)
    major: z.string().optional(),        // STUDENT
    department: z.string().optional(),   // ACADEMIC_SUPERVISOR
    organizationId: z.number().int().optional(), // ORG_SUPERVISOR (required)
    position: z.string().optional(),     // ORG_SUPERVISOR
  })
  .superRefine((d, ctx) => {
    if (d.role === 'STUDENT' && !d.universityId)
      ctx.addIssue({ code: 'custom', path: ['universityId'], message: 'universityId is required for students' });
    if (d.role === 'ORG_SUPERVISOR' && !d.organizationId)
      ctx.addIssue({ code: 'custom', path: ['organizationId'], message: 'organizationId is required for organization supervisors' });
  });

const listQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']).optional(), // status=PENDING -> requests waiting for approval
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const roleSchema = z.object({ role: z.enum(ROLES) });
const activeSchema = z.object({ isActive: z.boolean() });
const rejectSchema = z.object({ reason: z.string().trim().max(500).optional() });

const publicFields = { id: true, name: true, email: true, phone: true, role: true, isActive: true, status: true, createdAt: true };

// All routes below are admin-only
router.use(authenticate, requireRole('ADMIN'));

// Reject non-numeric ids early (instead of letting Prisma throw a 500)
router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// POST /users  -> create account (+ role profile)
router.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const d = req.body;
    const passwordHash = await bcrypt.hash(d.password, 10);

    const profile =
      d.role === 'STUDENT'
        ? { student: { create: { universityId: d.universityId, major: d.major } } }
        : d.role === 'ACADEMIC_SUPERVISOR'
        ? { academicSupervisor: { create: { department: d.department } } }
        : d.role === 'ORG_SUPERVISOR'
        ? { orgSupervisor: { create: { organizationId: d.organizationId, position: d.position } } }
        : {};

    const user = await prisma.user.create({
      data: { name: d.name, email: d.email.toLowerCase(), phone: d.phone, passwordHash, role: d.role, ...profile },
      select: publicFields,
    });

    await logAction(req.user.id, 'USER_CREATED', 'User', user.id, { role: user.role });
    res.status(201).json(user);
  })
);

// GET /users?role=STUDENT&search=ahmed&page=1&limit=20
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { role, search, isActive, status, page, limit } = req.query;
    const where = {
      ...(role && { role }),
      ...(status && { status }),
      ...(isActive && { isActive: isActive === 'true' }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          ...publicFields,
          rejectReason: true,
          orgSupervisor: { select: { id: true, position: true, organization: { select: { id: true, name: true, type: true, sector: true, crNumber: true, contactEmail: true } } } },
          academicSupervisor: { select: { id: true, department: true } },
          student: { select: { id: true, universityId: true, major: true, gpa: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// GET /users/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        ...publicFields,
        student: true,
        academicSupervisor: true,
        orgSupervisor: { include: { organization: true } },
      },
    });
    if (!user) throw new HttpError(404, 'User not found');
    res.json(user);
  })
);

// PATCH /users/:id/role  -> permissions management
router.patch(
  '/:id/role',
  validate(roleSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { role } = req.body;
    if (id === req.user.id) throw new HttpError(400, 'You cannot change your own role');

    const target = await prisma.user.findUnique({
      where: { id },
      include: { student: true, academicSupervisor: true, orgSupervisor: true },
    });
    if (!target) throw new HttpError(404, 'User not found');

    // Every role (except ADMIN) needs its profile row, otherwise the user can do nothing.
    // An academic-supervisor profile has no required data, so it is created automatically.
    // Student / training-provider profiles need data (university ID, organization) -> create a new account instead.
    if (role === 'STUDENT' && !target.student) {
      throw new HttpError(400, 'This user has no student profile (university ID). Create a new student account instead');
    }
    if (role === 'ORG_SUPERVISOR' && !target.orgSupervisor) {
      throw new HttpError(400, 'This user is not linked to an organization. Create a new training-provider account instead');
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        role,
        ...(role === 'ACADEMIC_SUPERVISOR' && !target.academicSupervisor && { academicSupervisor: { create: {} } }),
      },
      select: publicFields,
    });
    await logAction(req.user.id, 'USER_ROLE_CHANGED', 'User', id, { newRole: req.body.role });
    res.json(user);
  })
);

// PATCH /users/:id/active  -> enable / disable account
router.patch(
  '/:id/active',
  validate(activeSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'You cannot disable your own account');

    const user = await prisma.user.update({ where: { id }, data: { isActive: req.body.isActive, status: req.body.isActive ? 'ACTIVE' : 'SUSPENDED', rejectReason: null, reviewedById: req.user.id, reviewedAt: new Date() }, select: publicFields });
    await logAction(req.user.id, req.body.isActive ? 'USER_ENABLED' : 'USER_DISABLED', 'User', id);
    res.json(user);
  })
);

// POST /users/:id/reject  -> reject a supervisor / provider registration request (only accounts still waiting for approval)
// For providers, the commercial registration number is released, so the real company can register later.
router.post(
  '/:id/reject',
  validate(rejectSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = await prisma.user.findUnique({ where: { id }, include: { orgSupervisor: true } });
    if (!target) throw new HttpError(404, 'User not found');
    if (!['ORG_SUPERVISOR', 'ACADEMIC_SUPERVISOR'].includes(target.role) || target.isActive || target.status === 'REJECTED') {
      throw new HttpError(400, 'Only pending supervisor or training-provider requests can be rejected');
    }

    const user = await prisma.$transaction(async (tx) => {
      if (target.orgSupervisor) {
        await tx.organization.update({ where: { id: target.orgSupervisor.organizationId }, data: { crNumber: null } });
      }
      return tx.user.update({
        where: { id },
        data: { status: 'REJECTED', rejectReason: req.body.reason ?? null, reviewedById: req.user.id, reviewedAt: new Date() },
        select: publicFields,
      });
    });

    await logAction(req.user.id, 'REGISTRATION_REJECTED', 'User', id, { reason: req.body.reason ?? null });
    res.json(user);
  })
);

module.exports = router;