const prisma = require('../config/prisma');

/**
 * Create an in-app notification. Teammates call this from their modules, e.g.
 *   await notify(student.userId, 'Your application was approved');
 */
async function notify(userId, message) {
  try {
    return await prisma.notification.create({ data: { userId, message } });
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

module.exports = { notify };
