const prisma = require('../config/prisma');
const HttpError = require('./httpError');

/**
 * Prisma "where" filter that limits TrainingAssignment rows to the ones
 * the given user is allowed to see:
 *   STUDENT             -> only their own assignments
 *   ACADEMIC_SUPERVISOR -> assignments they supervise
 *   ORG_SUPERVISOR      -> assignments of trainees at their organization (assigned to them)
 *   ADMIN               -> everything
 *
 * Usage: prisma.trainingAssignment.findMany({ where: assignmentAccessWhere(req.user) })
 */
function assignmentAccessWhere(user) {
  switch (user.role) {
    case 'ADMIN': return {};
    case 'STUDENT': return { student: { userId: user.id } };
    case 'ACADEMIC_SUPERVISOR': return { academicSupervisor: { userId: user.id } };
    case 'ORG_SUPERVISOR': return { orgSupervisor: { userId: user.id } };
    default: return { id: -1 }; // unknown role sees nothing
  }
}

/**
 * Loads an assignment ONLY if the user may access it. Throws:
 *   400 invalid id | 403 no access (or wrong role) | 404 does not exist
 *
 * Options:
 *   include: Prisma include object
 *   roles:   restrict who may act, e.g. ['ACADEMIC_SUPERVISOR'] (ADMIN always allowed)
 *
 * Usage in a route:
 *   const a = await getAccessibleAssignment(req.user, req.params.id, { roles: ['ORG_SUPERVISOR'] });
 */
async function getAccessibleAssignment(user, rawId, { include, roles } = {}) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid assignment id');

  if (roles && user.role !== 'ADMIN' && !roles.includes(user.role)) {
    throw new HttpError(403, 'You do not have permission to perform this action');
  }

  const assignment = await prisma.trainingAssignment.findFirst({
    where: { id, ...assignmentAccessWhere(user) },
    ...(include && { include }),
  });
  if (assignment) return assignment;

  const exists = await prisma.trainingAssignment.count({ where: { id } });
  throw exists
    ? new HttpError(403, 'You do not have access to this assignment')
    : new HttpError(404, 'Assignment not found');
}

module.exports = { assignmentAccessWhere, getAccessibleAssignment };
