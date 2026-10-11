const router = require('express').Router();
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const prisma = require('../../config/prisma');
const { UPLOAD_DIR } = require('../../config/uploads');
const HttpError = require('../../utils/httpError');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/auth');

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(new HttpError(400, 'File type not allowed (PDF, Word, Excel, PowerPoint, PNG, JPG, TXT)'));
    cb(null, true);
  },
});

router.use(authenticate);

router.param('id', (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return next(new HttpError(400, 'Invalid id'));
  next();
});

// POST /attachments  (multipart/form-data, field name: "file")  -> returns the attachment to put in a message
router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded (send it in the "file" field)');

    // multer reads the filename as latin1; restore the real (e.g. Arabic) UTF-8 name
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const attachment = await prisma.attachment.create({
      data: {
        originalName,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedById: req.user.id,
      },
      select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
    });

    res.status(201).json(attachment);
  })
);

// GET /attachments/:id  -> download (uploader, sender/recipient of a message that carries it, or admin)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new HttpError(404, 'File not found');

    let allowed = req.user.role === 'ADMIN' || attachment.uploadedById === req.user.id;
    if (!allowed) {
      const linked = await prisma.message.count({
        where: { attachmentId: id, OR: [{ senderId: req.user.id }, { recipientId: req.user.id }] },
      });
      allowed = linked > 0;
    }
    if (!allowed) throw new HttpError(403, 'You do not have access to this file');

    res.download(path.join(UPLOAD_DIR, attachment.storedName), attachment.originalName, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File is missing on the server' });
    });
  })
);

module.exports = router;
