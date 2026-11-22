/**
 * TEMPLATE for Members B and C: copy this file into your own module folder
 * (e.g. src/modules/attendance/attendance.routes.js) and rename things.
 * This file is NOT registered in app.js.
 *
 * HOW MODULES ARE MOUNTED
 * Module routers are mounted at the ROOT in app.js:   app.use(require('./modules/x/x.routes'));
 * so write the FULL path in each route ('/attendance/check-in', '/assignments/:id/attendance').
 * Because of that, put `authenticate` on EACH route. Do NOT use router.use(authenticate)
 * here, or every unknown URL would answer 401 instead of 404.
 */
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const asyncHandler = require('../../utils/asyncHandler');
const HttpError = require('../../utils/httpError');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { getAccessibleAssignment } = require('../../utils/access');
const { logAction } = require('../../utils/audit');
const { notify } = require('../../utils/notify');

const createSchema = z.object({
  assignmentId: z.number().int().positive(),
  note: z.string().min(1),
});

// Example: an academic supervisor adds something to an assignment they supervise.
router.post(
  '/example',
  authenticate,
  requireRole('ACADEMIC_SUPERVISOR'),            // ADMIN always passes
  validate(createSchema),
  asyncHandler(async (req, res) => {
    // 400 invalid id / 403 not your assignment / 404 missing  -> thrown for you
    const assignment = await getAccessibleAssignment(req.user, req.body.assignmentId, {
      include: { student: true },
      roles: ['ACADEMIC_SUPERVISOR'],
    });

    const created = await prisma.supervisorNote.create({
      data: { assignmentId: assignment.id, supervisorId: req.user.id, note: req.body.note },
    });

    await logAction(req.user.id, 'NOTE_CREATED', 'SupervisorNote', created.id);
    await notify(assignment.student.userId, 'Your supervisor added a note');

    res.status(201).json(created);
  })
);

// Example: nested route with the assignment id in the URL.
router.get(
  '/assignments/:id/example',
  authenticate,
  asyncHandler(async (req, res) => {
    const assignment = await getAccessibleAssignment(req.user, req.params.id);
    res.json({ assignmentId: assignment.id });
  })
);

module.exports = router;
