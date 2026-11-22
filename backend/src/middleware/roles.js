const HttpError = require('../utils/httpError');

/**
 * Role-based access control. Must run AFTER authenticate().
 *
 * Usage: router.post('/notes', authenticate, requireRole('ACADEMIC_SUPERVISOR'), handler)
 *        router.get('/x', authenticate, requireRole('ADMIN', 'ACADEMIC_SUPERVISOR'), handler)
 * ADMIN is always allowed.
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (req.user.role === 'ADMIN' || roles.includes(req.user.role)) return next();
  return next(new HttpError(403, 'You do not have permission to perform this action'));
};

module.exports = { requireRole };
