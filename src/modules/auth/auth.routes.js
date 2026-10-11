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
const { loginLimiter } = require('../../middleware/rateLimit');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// POST /auth/login
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok || !user.isActive) throw new HttpError(401, 'Invalid email or password');

    const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
    await logAction(user.id, 'LOGIN', 'User', user.id);

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
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
        id: true, name: true, email: true, phone: true, role: true, createdAt: true,
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
