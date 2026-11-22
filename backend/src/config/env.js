require('dotenv').config();

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// CORS_ORIGIN can hold several frontend addresses separated by commas,
// e.g. "http://localhost:5173,http://localhost:5174"
const origins = (process.env.CORS_ORIGIN || '*').split(',').map((o) => o.trim()).filter(Boolean);

module.exports = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  corsOrigin: origins.includes('*') ? '*' : origins,
};
