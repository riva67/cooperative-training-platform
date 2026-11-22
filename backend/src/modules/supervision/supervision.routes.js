const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { assignmentAccessWhere, getAccessibleAssignment } = require('../../utils/access');
const { logAction } = require('../../utils/audit');
const { notify } = require('../../utils/notify');

const userSelect = { id: true, name: true, email: true };
const fullInclude = {
  student: { include: { user: { select: userSelect } } },
  opportunity: { include: { organization: true } },
  academicSupervisor: { include: { user: { select: userSelect } } },
  orgSupervisor: { include: { user: { select: userSelect } } },
};

const noteSchema = z.object({
  assignmentId: z.number().int().positive(),
  note: z.string().trim().min(1).max(5000),
});
const gradeSchema = z.object({
  assignmentId: z.number().int().positive(),
  grade: z.number().min(0).max(100),
});

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});
router.param('assignmentId', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

const round1 = (n) => Math.round(n * 10) / 10;

// ───────── Monitoring list ─────────
// GET /supervisor/students
router.get(
  '/supervisor/students',
  authenticate,
  requireRole('ACADEMIC_SUPERVISOR', 'ORG_SUPERVISOR'),
  asyncHandler(async (req, res) => {
    const rows = await prisma.trainingAssignment.findMany({
      where: assignmentAccessWhere(req.user),
      include: {
        ...fullInclude,
        attendance: { select: { status: true } },
        reports: { select: { type: true, status: true } },
        evaluation: { select: { id: true } },
        finalGrade: { select: { grade: true } },
      },
      orderBy: { id: 'desc' },
    });

    const result = rows.map(({ attendance, reports, evaluation, finalGrade, ...assignment }) => {
      const attended = attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
      return {
        assignment,
        attendanceRate: attendance.length ? round1((attended / attendance.length) * 100) : null,
        reportsSubmitted: reports.filter((r) => (r.type === 'WEEKLY' || r.type === 'FINAL') && r.status !== 'DRAFT').length,
        absenceWarnings: reports.filter((r) => r.type === 'ABSENCE_WARNING').length,
        hasEvaluation: Boolean(evaluation),
        finalGrade: finalGrade ? finalGrade.grade : null,
      };
    });

    res.json(result);
  })
);

// ───────── Notes ─────────
// POST /notes
router.post(
  '/notes',
  authenticate,
  requireRole('ACADEMIC_SUPERVISOR'),
  validate(noteSchema),
  asyncHandler(async (req, res) => {
    const assignment = await getAccessibleAssignment(req.user, req.body.assignmentId, {
      include: { student: true },
      roles: ['ACADEMIC_SUPERVISOR'],
    });

    const note = await prisma.supervisorNote.create({
      data: { assignmentId: assignment.id, supervisorId: req.user.id, note: req.body.note },
    });

    await logAction(req.user.id, 'NOTE_CREATED', 'SupervisorNote', note.id, { assignmentId: assignment.id });
    await notify(assignment.student.userId, 'Your academic supervisor added a note about your training');

    res.status(201).json(note);
  })
);

// GET /assignments/:id/notes
router.get(
  '/assignments/:id/notes',
  authenticate,
  asyncHandler(async (req, res) => {
    const assignment = await getAccessibleAssignment(req.user, req.params.id);
    const notes = await prisma.supervisorNote.findMany({
      where: { assignmentId: assignment.id },
      include: { supervisor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(notes);
  })
);

// ───────── Final grade ─────────
// POST /final-grades  -> also marks the assignment COMPLETED
router.post(
  '/final-grades',
  authenticate,
  requireRole('ACADEMIC_SUPERVISOR'),
  validate(gradeSchema),
  asyncHandler(async (req, res) => {
    const { assignmentId, grade } = req.body;
    const assignment = await getAccessibleAssignment(req.user, assignmentId, {
      include: { student: true },
      roles: ['ACADEMIC_SUPERVISOR'],
    });
    if (assignment.status === 'CANCELLED') throw new HttpError(400, 'Cannot grade a cancelled assignment');

    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.finalGrade.findUnique({ where: { assignmentId: assignment.id } });
      if (existing) throw new HttpError(409, 'A final grade already exists for this assignment');

      const fg = await tx.finalGrade.create({
        data: { assignmentId: assignment.id, grade, finalizedById: req.user.id },
      });
      await tx.trainingAssignment.update({ where: { id: assignment.id }, data: { status: 'COMPLETED' } });
      return fg;
    });

    await logAction(req.user.id, 'FINAL_GRADE_SET', 'FinalGrade', created.id, { assignmentId: assignment.id, grade });
    await notify(assignment.student.userId, `Your final training grade has been published: ${grade}/100`);

    res.status(201).json(created);
  })
);

// GET /final-grades/:assignmentId
router.get(
  '/final-grades/:assignmentId',
  authenticate,
  asyncHandler(async (req, res) => {
    const assignment = await getAccessibleAssignment(req.user, req.params.assignmentId);
    const fg = await prisma.finalGrade.findUnique({ where: { assignmentId: assignment.id } });
    if (!fg) throw new HttpError(404, 'No final grade has been set for this assignment yet');
    res.json(fg);
  })
);

module.exports = router;