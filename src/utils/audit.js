const prisma = require('../config/prisma');

/**
 * Record an action in the audit log (the "LOGS" box in the architecture diagram).
 * Never throws: a logging failure must not break the main request.
 *
 * Usage: await logAction(req.user.id, 'USER_CREATED', 'User', newUser.id, { role: 'STUDENT' });
 */
async function logAction(userId, action, entity, entityId = null, meta = null) {
  try {
    await prisma.auditLog.create({ data: { userId, action, entity, entityId, meta } });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAction };
