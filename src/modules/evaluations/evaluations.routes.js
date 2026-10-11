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
const { CRITERIA, MAX_TOTAL } = require('./criteria');

// ── validation: every criterion is required, score 0..max, optional note ──
const scoreShape = {};
for (const c of CRITERIA) {
  scoreShape[c.key] = z
    .object({ score: z.number().min(0).max(c.max), notes: z.string().max(500).optional() })
    .strict();
}

const createSchema = z
  .object({
    assignmentId: z.number().int().positive(),
    scores: z.object(scoreShape).strict(),
    wouldHire: z.boolean(),
    noHireReason: z.string().max(1000).optional(),
    comments: z.string().max(2000).optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.wouldHire && !(d.noHireReason && d.noHireReason.trim())) {
      ctx.addIssue({ code: 'custom', path: ['noHireReason'], message: 'A reason is required when wouldHire is false' });
    }
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const formInclude = {
  assignment: {
    include: {
      student: { include: { user: { select: { id: true, name: true } } } },
      opportunity: { include: { organization: true } },
    },
  },
  evaluator: { select: { id: true, name: true, orgSupervisor: { select: { position: true } } } },
};

// Shape that mirrors the paper form, so the frontend can render/print it directly.
function toForm(ev) {
  const a = ev.assignment;
  return {
    id: ev.id,
    assignmentId: ev.assignmentId,
    semester: a.semester,
    academicYear: a.academicYear,
    trainee: { name: a.student.user.name, universityId: a.student.universityId, major: a.student.major },
    organization: { id: a.opportunity.organization.id, name: a.opportunity.organization.name },
    scores: ev.scores,
    totalScore: ev.totalScore,
    maxScore: MAX_TOTAL,
    wouldHire: ev.wouldHire,
    noHireReason: ev.noHireReason,
    comments: ev.comments,
    evaluator: { id: ev.evaluator.id, name: ev.evaluator.name, jobTitle: ev.evaluator.orgSupervisor?.position ?? null },
    evaluatedAt: ev.createdAt,
  };
}

// Students do not see the organization's evaluation (supervisors and admin only)
const viewers = requireRole('ACADEMIC_SUPERVISOR', 'ORG_SUPERVISOR');

router.use(authenticate);

// GET /evaluations/criteria -> the form's rows (label + max) so the UI can build the form
router.get('/criteria', (req, res) => {
  res.json({ criteria: CRITERIA, maxTotal: MAX_TOTAL });
});

// POST /evaluations  -> the organization supervisor fills the form
router.post(
  '/',
  requireRole('ORG_SUPERVISOR'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { assignmentId, scores, wouldHire, noHireReason, comments } = req.body;

    const assignment = await getAccessibleAssignment(req.user, assignmentId, {
      include: { student: { include: { user: { select: { name: true } } } }, academicSupervisor: true },
      roles: ['ORG_SUPERVISOR'],
    });
    if (assignment.status === 'CANCELLED') throw new HttpError(400, 'Cannot evaluate a cancelled assignment');

    const existing = await prisma.evaluation.findUnique({ where: { assignmentId } });
    if (existing) throw new HttpError(409, 'This trainee has already been evaluated');

    const totalScore = CRITERIA.reduce((sum, c) => sum + scores[c.key].score, 0);

    const created = await prisma.evaluation.create({
      data: {
        assignmentId,
        evaluatorId: req.user.id,
        scores,
        totalScore,
        wouldHire,
        noHireReason: wouldHire ? null : noHireReason.trim(),
        comments,
      },
      include: formInclude,
    });

    await logAction(req.user.id, 'EVALUATION_SUBMITTED', 'Evaluation', created.id, { assignmentId, totalScore });
    await notify(assignment.academicSupervisor.userId, `تم تقييم المتدرب ${assignment.student.user.name} من جهة التدريب (${totalScore}/${MAX_TOTAL})`);

    res.status(201).json(toForm(created));
  })
);

// GET /evaluations  -> evaluations of the assignments I can access
router.get(
  '/',
  viewers,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const where = { assignment: assignmentAccessWhere(req.user) };

    const [rows, total] = await Promise.all([
      prisma.evaluation.findMany({ where, include: formInclude, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.evaluation.count({ where }),
    ]);

    res.json({ items: rows.map(toForm), total, page, pages: Math.ceil(total / limit) });
  })
);

// GET /evaluations/:assignmentId
router.get(
  '/:assignmentId',
  viewers,
  asyncHandler(async (req, res) => {
    const assignment = await getAccessibleAssignment(req.user, req.params.assignmentId);
    const ev = await prisma.evaluation.findUnique({ where: { assignmentId: assignment.id }, include: formInclude });
    if (!ev) throw new HttpError(404, 'This trainee has not been evaluated yet');
    res.json(toForm(ev));
  })
);

module.exports = router;
