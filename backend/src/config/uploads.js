const fs = require('fs');
const path = require('path');

// Where uploaded files are stored (never commit this folder). Override with UPLOAD_DIR in .env.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

module.exports = { UPLOAD_DIR };
