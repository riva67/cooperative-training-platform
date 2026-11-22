const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { jwtSecret } = require('../config/env');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Verifies the Bearer token and attaches req.user = { id, name, email, role }.
 * Use on every protected route.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) throw new HttpError(401, 'Account not found or disabled');

  req.user = user;
  next();
});

module.exports = { authenticate };
