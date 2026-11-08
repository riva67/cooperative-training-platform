const prisma = require('../config/prisma');
const HttpError = require('./httpError');

/** Student profile of the logged-in user (403 if the user has none). */
async function getStudentProfile(user) {
  const p = await prisma.student.findUnique({ where: { userId: user.id } });
  if (!p) throw new HttpError(403, 'Only students can do this');
  return p;
}

/** Organization-supervisor profile of the logged-in user (403 if none). */
async function getOrgSupervisorProfile(user) {
  const p = await prisma.orgSupervisor.findUnique({ where: { userId: user.id } });
  if (!p) throw new HttpError(403, 'No organization profile is linked to this account');
  return p;
}

/** User ids of all active users with the given role (used to notify admins, etc.). */
async function userIdsByRole(role) {
  const users = await prisma.user.findMany({ where: { role, isActive: true }, select: { id: true } });
  return users.map((u) => u.id);
}

module.exports = { getStudentProfile, getOrgSupervisorProfile, userIdsByRole };