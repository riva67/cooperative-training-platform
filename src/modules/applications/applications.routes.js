
const router = require('express').Router();
const { z } = require('zod');
const HttpError = require('../../utils/httpError');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const controller = require('./applications.controller');
const { generateTrainingLetter } = require('./letter.controller');

const statusEnum = z.enum(['PENDING', 'NOMINATED', 'APPROVED', 'REJECTED']);


const createSchema = z.object({ opportunityId: z.number().int().positive() });
const statusSchema = z.object({ status: z.enum(['NOMINATED', 'APPROVED', 'REJECTED']) });
const listQuerySchema = z.object({
  status: statusEnum.optional(),
  opportunityId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const applicantsQuerySchema = z.object({ status: statusEnum.optional() });

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// Routers are mounted at the root in app.js, so every route has its full path + its own authenticate.
router.post('/applications', authenticate, requireRole('STUDENT'), validate(createSchema), controller.createApplication);
router.get('/applications', authenticate, validate(listQuerySchema, 'query'), controller.listApplications);
router.patch(
  '/applications/:id/status',
  authenticate,
  requireRole('ACADEMIC_SUPERVISOR', 'ORG_SUPERVISOR'),
  validate(statusSchema),
  controller.updateStatus
);

// Applicants of one opportunity, sorted by GPA
router.get(
  '/opportunities/:id/applicants',
  authenticate,
  requireRole('ACADEMIC_SUPERVISOR', 'ORG_SUPERVISOR'),
  validate(applicantsQuerySchema, 'query'),
  controller.getApplicantsForOpportunity
);

// Official training letter of an assignment
router.get('/assignments/:id/letter', authenticate, generateTrainingLetter);

module.exports = router;