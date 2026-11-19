const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../../config/prisma');
const { jwtSecret, jwtExpiresIn } = require('../../config/env');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { logAction } = require('../../utils/audit');
const { loginLimiter, registerLimiter } = require('../../middleware/rateLimit');
const { notify } = require('../../utils/notify');
const { userIdsByRole } = require('../../utils/profiles');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});


// ── Self-registration ──
// STUDENT, ACADEMIC_SUPERVISOR and ORG_SUPERVISOR (training provider) can request an account. ADMIN never can.
//  - STUDENT: active immediately.
//  - ACADEMIC_SUPERVISOR / ORG_SUPERVISOR: created INACTIVE (status PENDING). They cannot log in until an admin
//    approves (PATCH /users/:id/active) or rejects (POST /users/:id/reject) the request.
//  - Optional: set SUPERVISOR_EMAIL_DOMAIN=university.edu.sa in .env to accept supervisor requests only from
//    university e-mail addresses.
const registerBase = {
  name: z.string().trim().min(2, 'Name is too short').max(100),
  email: z.string().trim().email('Invalid email').max(150),
  phone: z.string().trim().min(5).max(20).regex(/^[0-9+\-\s]+$/, 'Invalid phone number').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
};

const registerSchema = z.discriminatedUnion('role', [
  z.object({
    ...registerBase,
    role: z.literal('STUDENT'),
    universityId: z.string().trim().min(3, 'Invalid university ID').max(30),
    major: z.string().trim().max(100).optional(),
  }),
  z.object({
    ...registerBase,
    role: z.literal('ACADEMIC_SUPERVISOR'),
    department: z.string().trim().min(2, 'Department is required').max(100),
  }),
  z.object({
    ...registerBase,
    role: z.literal('ORG_SUPERVISOR'),
    organizationName: z.string().trim().min(2, 'Organization name is too short').max(150),
    // organization type chosen on the sign-up form: PRIVATE (منشأة) / EDUCATIONAL (تعليمية) / GOVERNMENT (حكومية)
    organizationType: z.enum(['PRIVATE', 'EDUCATIONAL', 'GOVERNMENT']),
    // second dropdown on the form (e.g. شركة, مصنع, جامعة أهلية, وزارة): stored in Organization.sector
    organizationSubtype: z.string().trim().min(1).max(100).optional(),
    // optional: government and educational bodies do not have a commercial registration number
    crNumber: z.string().trim().min(5, 'Invalid commercial registration number').max(30).optional(),
    position: z.string().trim().max(100).optional(),
  }),
]);

const publicUser = { id: true, name: true, email: true, role: true, isActive: true, status: true };

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
}

// POST /auth/register  (public)
router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const d = req.body;
    const email = d.email.toLowerCase();
    const needsApproval = d.role !== 'STUDENT';

    const supervisorDomain = (process.env.SUPERVISOR_EMAIL_DOMAIN || '').trim().toLowerCase();
    if (d.role === 'ACADEMIC_SUPERVISOR' && supervisorDomain && !email.endsWith('@' + supervisorDomain)) {
      throw new HttpError(400, `Academic supervisors must register with a @${supervisorDomain} email address`);
    }

    // friendly duplicate messages (the database also enforces these)
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new HttpError(409, 'This email is already registered');
    }
    if (d.role === 'STUDENT' && (await prisma.student.findUnique({ where: { universityId: d.universityId } }))) {
      throw new HttpError(409, 'This university ID is already registered');
    }
    if (d.role === 'ORG_SUPERVISOR' && d.crNumber && (await prisma.organization.findUnique({ where: { crNumber: d.crNumber } }))) {
      throw new HttpError(409, 'This commercial registration number is already registered. Contact the administration to join an existing organization.');
    }

    const passwordHash = await bcrypt.hash(d.password, 10);

    const user = await prisma.$transaction(async (tx) => {
      let profile;
      if (d.role === 'STUDENT') {
        profile = { student: { create: { universityId: d.universityId, major: d.major } } };
      } else if (d.role === 'ACADEMIC_SUPERVISOR') {
        profile = { academicSupervisor: { create: { department: d.department } } };
      } else {
        const org = await tx.organization.create({
          data: { name: d.organizationName, type: d.organizationType, sector: d.organizationSubtype, crNumber: d.crNumber || null, contactEmail: email, phone: d.phone },
        });
        profile = { orgSupervisor: { create: { organizationId: org.id, position: d.position } } };
      }

      return tx.user.create({
        data: { name: d.name, email, phone: d.phone, passwordHash, role: d.role, isActive: !needsApproval, status: needsApproval ? 'PENDING' : 'ACTIVE', ...profile },
        select: publicUser,
      });
    });

    await logAction(user.id, 'USER_REGISTERED', 'User', user.id, { role: user.role, pendingApproval: needsApproval });

    if (needsApproval) {
      const admins = await userIdsByRole('ADMIN');
      await Promise.all(admins.map((id) => notify(id, `New ${user.role} registration waiting for approval: ${user.name} (${user.email})`)));
      return res.status(201).json({
        pending: true,
        user,
        message: 'Your request was received. You can log in after the administration approves your account.',
      });
    }

    res.status(201).json({ pending: false, token: signToken(user), user });
  })
);

// POST /auth/login
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { orgSupervisor: { include: { organization: { select: { id: true, name: true, type: true, sector: true } } } } },
    });

    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Invalid email or password');
    // only reached with the correct password, so this does not reveal which emails exist
    if (!user.isActive) {
      // `code` lets the frontend show its own Arabic message: PENDING | REJECTED | SUSPENDED
      if (user.status === 'REJECTED') {
        throw new HttpError(403, 'Your registration request was rejected by the administration.', undefined, { code: 'REJECTED', reason: user.rejectReason });
      }
      if (user.status === 'SUSPENDED') {
        throw new HttpError(403, 'Your account has been disabled. Please contact the administration.', undefined, { code: 'SUSPENDED' });
      }
      throw new HttpError(403, 'Your account is not active yet. If you just registered, please wait for the administration to approve it.', undefined, { code: 'PENDING' });
    }

    const token = signToken(user);
    await logAction(user.id, 'LOGIN', 'User', user.id);

    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role, status: user.status,
        // training providers: the portal shows opportunities by organization type (PRIVATE / EDUCATIONAL / GOVERNMENT)
        organization: user.orgSupervisor ? user.orgSupervisor.organization : null,
      },
    });
  })
);

// GET /auth/me  -> current user + role profile
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true,
        student: true,
        academicSupervisor: true,
        orgSupervisor: { include: { organization: true } },
      },
    });
    res.json(user);
  })
);

// PATCH /auth/password
router.patch(
  '/password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const ok = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
    if (!ok) throw new HttpError(400, 'Current password is incorrect');

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(req.body.newPassword, 10) },
    });
    await logAction(user.id, 'PASSWORD_CHANGED', 'User', user.id);
    res.json({ message: 'Password updated' });
  })
);

const profileSchema = z
  .object({
    name: z.string().min(2).optional(),
    phone: z.string().min(5).max(20).regex(/^[0-9+\-\s]+$/, 'Invalid phone number').optional(),
  })
  .refine((d) => d.name !== undefined || d.phone !== undefined, { message: 'Send name and/or phone' });

// PATCH /auth/profile  -> update my own name / phone (the phone shows in the field-visits table)
router.patch(
  '/profile',
  authenticate,
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: req.body,
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    await logAction(req.user.id, 'PROFILE_UPDATED', 'User', req.user.id);
    res.json(user);
  })
);

module.exports = router;