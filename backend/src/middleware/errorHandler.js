const HttpError = require('../utils/httpError');

function notFound(req, res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // File upload errors (multer)
  if (err.name === 'MulterError') {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : err.message,
    });
  }

  // Prisma known errors -> friendly responses
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Duplicate value', fields: err.meta?.target });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'A related record does not exist' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err);

  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
    ...(err.details && { details: err.details }),
    ...(status !== 500 && err.extra),
  });
}

module.exports = { notFound, errorHandler };
