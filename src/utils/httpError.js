class HttpError extends Error {
  /**
   * @param {number} status  HTTP status
   * @param {string} message error text
   * @param {Array}  [details] validation details
   * @param {object} [extra]   extra fields merged into the JSON body, e.g. { code: 'PENDING' }
   */
  constructor(status, message, details, extra) {
    super(message);
    this.status = status;
    this.details = details;
    this.extra = extra;
  }
}

module.exports = HttpError;
