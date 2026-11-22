const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../../config/prisma');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
const { logAction } = require('../../utils/audit');

/**
 * WHO CAN MESSAGE WHOM
 *   academic supervisor <-> their students, and <-> their organization supervisors
 *   (people linked through a training assignment). ADMIN can message anyone.
 * Chat and "email-style" messages are the same thing: a message may have a subject and an attachment.
 */
const attachmentSelect = { id: true, originalName: true, mimeType: true, size: true };
const personSelect = { id: true, name: true, role: true };

const sendSchema = z.object({
  recipientId: z.number().int().positive(),
  subject: z.string().max(200).optional(),
  body: z.string().trim().min(1, 'Message cannot be empty').max(5000),
  attachmentId: z.number().int().positive().optional(),
});

const broadcastSchema = z.object({
  audience: z.enum(['MY_STUDENTS', 'MY_ORGANIZATIONS', 'BOTH']),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  attachmentId: z.number().int().positive().optional(),
});

const threadQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

async function canMessage(sender, recipientId) {
  if (sender.id === recipientId) return false;
  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { isActive: true } });
  if (!recipient || !recipient.isActive) return false;
  if (sender.role === 'ADMIN') return true;

  let where;
  if (sender.role === 'ACADEMIC_SUPERVISOR') {
    where = {
      academicSupervisor: { userId: sender.id },
      OR: [{ student: { userId: recipientId } }, { orgSupervisor: { userId: recipientId } }],
    };
  } else if (sender.role === 'STUDENT') {
    where = { student: { userId: sender.id }, academicSupervisor: { userId: recipientId } };
  } else if (sender.role === 'ORG_SUPERVISOR') {
    where = { orgSupervisor: { userId: sender.id }, academicSupervisor: { userId: recipientId } };
  } else {
    return false;
  }
  return (await prisma.trainingAssignment.count({ where })) > 0;
}

async function checkAttachmentOwner(user, attachmentId) {
  if (!attachmentId) return;
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) throw new HttpError(404, 'Attachment not found');
  if (att.uploadedById !== user.id) throw new HttpError(403, 'You can only attach files you uploaded');
}

router.use(authenticate);

router.param('userId', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// GET /messages/contacts -> people I am allowed to message
router.get(
  '/contacts',
  asyncHandler(async (req, res) => {
    const user = req.user;
    const userSel = { select: personSelect };

    if (user.role === 'ADMIN') {
      const users = await prisma.user.findMany({
        where: { isActive: true, id: { not: user.id } }, select: personSelect, orderBy: { name: 'asc' },
      });
      return res.json(users);
    }

    const scope =
      user.role === 'ACADEMIC_SUPERVISOR' ? { academicSupervisor: { userId: user.id } }
      : user.role === 'STUDENT' ? { student: { userId: user.id } }
      : { orgSupervisor: { userId: user.id } };

    const assignments = await prisma.trainingAssignment.findMany({
      where: scope,
      select: {
        student: { select: { user: userSel } },
        academicSupervisor: { select: { user: userSel } },
        orgSupervisor: { select: { user: { select: personSelect }, organization: { select: { name: true } } } },
      },
    });

    const map = new Map();
    for (const a of assignments) {
      const people = user.role === 'ACADEMIC_SUPERVISOR'
        ? [a.student.user, a.orgSupervisor.user]
        : [a.academicSupervisor.user];
      for (const p of people) {
        const orgName = p.role === 'ORG_SUPERVISOR' ? a.orgSupervisor.organization.name : undefined;
        if (!map.has(p.id)) map.set(p.id, { ...p, ...(orgName && { organizationName: orgName }) });
      }
    }
    res.json([...map.values()].sort((x, y) => x.name.localeCompare(y.name)));
  })
);

// GET /messages/unread-count -> for the badge
router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const count = await prisma.message.count({ where: { recipientId: req.user.id, readAt: null } });
    res.json({ count });
  })
);

// GET /messages/conversations -> inbox: one row per person, with the last message and unread count
router.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const me = req.user.id;
    const recent = await prisma.message.findMany({
      where: { OR: [{ senderId: me }, { recipientId: me }] },
      orderBy: { id: 'desc' },
      take: 1000,
      include: { attachment: { select: attachmentSelect } },
    });

    const lastByPerson = new Map();
    for (const m of recent) {
      const other = m.senderId === me ? m.recipientId : m.senderId;
      if (!lastByPerson.has(other)) lastByPerson.set(other, m);
    }

    const unread = await prisma.message.groupBy({
      by: ['senderId'], where: { recipientId: me, readAt: null }, _count: { _all: true },
    });
    const unreadMap = new Map(unread.map((u) => [u.senderId, u._count._all]));

    const people = await prisma.user.findMany({
      where: { id: { in: [...lastByPerson.keys()] } }, select: personSelect,
    });
    const personMap = new Map(people.map((p) => [p.id, p]));

    res.json(
      [...lastByPerson.entries()].map(([otherId, lastMessage]) => ({
        user: personMap.get(otherId),
        lastMessage,
        unreadCount: unreadMap.get(otherId) || 0,
      }))
    );
  })
);

// GET /messages/with/:userId?before=&limit= -> the conversation (oldest first). Marks their messages as read.
router.get(
  '/with/:userId',
  validate(threadQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const me = req.user.id;
    const other = Number(req.params.userId);
    if (!(await canMessage(req.user, other))) throw new HttpError(403, 'You cannot message this user');

    const { before, limit } = req.query;
    const rows = await prisma.message.findMany({
      where: {
        OR: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }],
        ...(before && { id: { lt: before } }),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: { attachment: { select: attachmentSelect } },
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).reverse();

    await prisma.message.updateMany({
      where: { senderId: other, recipientId: me, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ items, hasMore });
  })
);

// POST /messages -> send one message (chat line or email-style with subject/attachment)
router.post(
  '/',
  validate(sendSchema),
  asyncHandler(async (req, res) => {
    const { recipientId, subject, body, attachmentId } = req.body;
    if (!(await canMessage(req.user, recipientId))) throw new HttpError(403, 'You cannot message this user');
    await checkAttachmentOwner(req.user, attachmentId);

    const message = await prisma.message.create({
      data: { senderId: req.user.id, recipientId, subject, body, attachmentId },
      include: { attachment: { select: attachmentSelect } },
    });
    res.status(201).json(message);
  })
);

// POST /messages/broadcast -> academic supervisor sends one message (e.g. a form) to all their students and/or organizations
router.post(
  '/broadcast',
  requireRole('ACADEMIC_SUPERVISOR'),
  validate(broadcastSchema),
  asyncHandler(async (req, res) => {
    const { audience, subject, body, attachmentId } = req.body;
    await checkAttachmentOwner(req.user, attachmentId);

    const assignments = await prisma.trainingAssignment.findMany({
      where: { academicSupervisor: { userId: req.user.id }, status: 'ACTIVE' },
      select: { student: { select: { userId: true } }, orgSupervisor: { select: { userId: true } } },
    });

    const recipients = new Set();
    for (const a of assignments) {
      if (audience !== 'MY_ORGANIZATIONS') recipients.add(a.student.userId);
      if (audience !== 'MY_STUDENTS') recipients.add(a.orgSupervisor.userId);
    }
    if (recipients.size === 0) throw new HttpError(400, 'You have no active trainees to send to');

    await prisma.message.createMany({
      data: [...recipients].map((recipientId) => ({ senderId: req.user.id, recipientId, subject, body, attachmentId })),
    });
    await logAction(req.user.id, 'MESSAGE_BROADCAST', 'Message', null, { audience, recipients: recipients.size });

    res.status(201).json({ sent: recipients.size });
  })
);

module.exports = router;
