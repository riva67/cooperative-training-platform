const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');

const querySchema = z.object({
  userId: z.coerce.number().int().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /logs?userId=&action=&entity=&from=&to=&page=&limit=   (admin only)
router.get(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { userId, action, entity, from, to, page, limit } = req.query;

    const where = {
      ...(userId && { userId }),
      ...(action && { action }),
      ...(entity && { entity }),
      ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  })
);

// PUT /logs/checkout
router.put(
  '/checkout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { logId, checkoutTime } = req.body;

    // استخدام موديل Attendance والقلب إلى id بدلاً من log_id
    const log = await prisma.attendance.findUnique({
      where: { id: parseInt(logId) }
    });

    if (!log) {
      return res.status(404).json({ success: false, error: "سجل الحضور غير موجود" });
    }

    const checkIn = new Date(log.date);
    const checkOut = new Date(checkoutTime);
    const hoursWorked = (checkOut - checkIn) / (1000 * 60 * 60);

    let warningNote = null;
    if (hoursWorked < 5) {
      warningNote = 'تنبيه: تم تسجيل الانصراف قبل إتمام 5 ساعات عمل';
    }

    const updatedLog = await prisma.attendance.update({
      where: { id: parseInt(logId) },
      data: {
        checkOut: checkOut,
        // تأكدي من توافق اسم الحقل مع جدول الـ Attendance في الـ schema لديكِ
        // hoursCompleted: parseFloat(hoursWorked.toFixed(2)), 
        // notes: warningNote ? warningNote : log.notes
      }
    });

    res.status(200).json({
      success: true,
      data: updatedLog,
      warning: warningNote
    });
  })
);

module.exports = router;