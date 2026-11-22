const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');

const listQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// GET /notifications?unread=true&page=&limit=   (always only the caller's own)
router.get(
  '/notifications',
  authenticate,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { unread, page, limit } = req.query;
    const where = { userId: req.user.id, ...(unread && { isRead: false }) };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ]);

    res.json({ items, unreadCount, total, page, pages: Math.ceil(total / limit) });
  })
);

// PATCH /notifications/read-all
router.patch(
  '/notifications/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ updated: result.count });
  })
);

// PATCH /notifications/:id/read  -> only the owner
router.patch(
  '/notifications/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.notification.findFirst({ where: { id, userId: req.user.id } });
    if (!existing) throw new HttpError(404, 'Notification not found');

    const updated = await prisma.notification.update({ where: { id }, data: { isRead: true } });
    res.json(updated);
  })
);

module.exports = router;