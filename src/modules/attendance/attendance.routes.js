const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { getAccessibleAssignment } = require('../../utils/access');
const { todayDate, dateOnly } = require('../../utils/dates');
const { logAction } = require('../../utils/audit');
const { notify } = require('../../utils/notify');

// Leaving before this many hours produces a warning in the check-out response (set MIN_WORK_HOURS in .env).
const MIN_WORK_HOURS = Number(process.env.MIN_WORK_HOURS) || 5;

const assignmentBody = z.object({ assignmentId: z.number().int().positive() });
const statusSchema = z.object({ status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']) });

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// Loads the student's OWN assignment and checks that it is ACTIVE and that today is inside the training period.
async function loadOwnActiveAssignment(user, assignmentId) {
  if (user.role !== 'STUDENT') throw new HttpError(403, 'Only students can record attendance');
  const assignment = await getAccessibleAssignment(user, assignmentId, { roles: ['STUDENT'] });
  if (assignment.status !== 'ACTIVE') throw new HttpError(400, 'This assignment is not ACTIVE');

  const today = todayDate();
  if (today < dateOnly(assignment.startDate)) throw new HttpError(400, 'Your training has not started yet');
  if (today > dateOnly(assignment.endDate)) throw new HttpError(400, 'Your training period has ended');
  return { assignment, today };
}

// POST /attendance/check-in
router.post(
  '/attendance/check-in',
  authenticate,
  requireRole('STUDENT'),
  validate(assignmentBody),
  asyncHandler(async (req, res) => {
    const { assignment, today } = await loadOwnActiveAssignment(req.user, req.body.assignmentId);

    const existing = await prisma.attendance.findUnique({
      where: { assignmentId_date: { assignmentId: assignment.id, date: today } },
    });
    if (existing) throw new HttpError(409, 'You have already checked in today');

    let record;
    try {
      record = await prisma.attendance.create({
        data: { assignmentId: assignment.id, date: today, checkIn: new Date(), status: 'PRESENT' },
      });
    } catch (err) {
      if (err.code === 'P2002') throw new HttpError(409, 'You have already checked in today'); // double-tap race
      throw err;
    }

    res.status(201).json(record);
  })
);

// POST /attendance/check-out
router.post(
  '/attendance/check-out',
  authenticate,
  requireRole('STUDENT'),
  validate(assignmentBody),
  asyncHandler(async (req, res) => {
    const { assignment, today } = await loadOwnActiveAssignment(req.user, req.body.assignmentId);

    const record = await prisma.attendance.findUnique({
      where: { assignmentId_date: { assignmentId: assignment.id, date: today } },
    });
    if (!record) throw new HttpError(404, 'No check-in found for today. Check in first');
    if (record.checkOut) throw new HttpError(409, 'You have already checked out today');

    const checkOut = new Date();
    const updated = await prisma.attendance.update({ where: { id: record.id }, data: { checkOut } });

    // Early-leave warning (the check-out is still recorded)
    const hoursWorked = record.checkIn ? (checkOut - record.checkIn) / 36e5 : null;
    const warning =
      hoursWorked !== null && hoursWorked < MIN_WORK_HOURS
        ? `تنبيه: تم تسجيل الانصراف قبل إتمام ${MIN_WORK_HOURS} ساعات عمل`
        : null;

    res.json({ ...updated, ...(warning && { warning }) });
  })
);

// PATCH /attendance/:id  -> ORG_SUPERVISOR of that trainee (or ADMIN) corrects the status
router.patch(
  '/attendance/:id',
  authenticate,
  requireRole('ORG_SUPERVISOR'),
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const record = await prisma.attendance.findUnique({ where: { id: Number(req.params.id) } });
    if (!record) throw new HttpError(404, 'Attendance record not found');

    const assignment = await getAccessibleAssignment(req.user, record.assignmentId, {
      include: { student: true },
      roles: ['ORG_SUPERVISOR'],
    });

    const updated = await prisma.attendance.update({ where: { id: record.id }, data: { status: req.body.status } });

    await logAction(req.user.id, 'ATTENDANCE_UPDATED', 'Attendance', record.id, { from: record.status, to: req.body.status });
    if (record.status !== req.body.status) {
      const day = record.date.toISOString().split('T')[0];
      await notify(assignment.student.userId, `Your attendance on ${day} was marked ${req.body.status}`);
    }

    res.json(updated);
  })
);

// GET /assignments/:id/attendance
router.get(
  '/assignments/:id/attendance',
  authenticate,
  asyncHandler(async (req, res) => {
    const assignment = await getAccessibleAssignment(req.user, req.params.id);
    const items = await prisma.attendance.findMany({
      where: { assignmentId: assignment.id },
      orderBy: { date: 'desc' },
    });

    const summary = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of items) summary[r.status.toLowerCase()] += 1;

    res.json({ items, summary });
  })
);

module.exports = router;