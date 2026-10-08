const HttpError = require('../utils/httpError');

/**
 * Validates req.body / req.query / req.params with a Zod schema.
 * Usage: router.post('/', validate(schema), handler)             // body
 *        router.get('/', validate(schema, 'query'), handler)     // query
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new HttpError(400, 'Validation failed', details));
  }
  req[source] = result.data;
  next();
};

module.exports = { validate };
