const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { corsOrigin } = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// ── API documentation (Swagger UI) ──
// Registered BEFORE helmet so its strict CSP doesn't block the Swagger UI scripts from the CDN.
app.get('/openapi.yaml', (req, res) => res.sendFile(path.join(__dirname, '..', 'openapi.yaml')));
app.get('/docs', (req, res) => {
  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Coop Training API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/openapi.yaml',
      dom_id: '#swagger-ui',
      persistAuthorization: true,
      tagsSorter: 'alpha',
      docExpansion: 'list',
    });
  </script>
</body>
</html>`);
});

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Module routes ──
app.use('/auth', require('./modules/auth/auth.routes'));
app.use('/users', require('./modules/users/users.routes'));
app.use('/organizations', require('./modules/organizations/organizations.routes'));
app.use('/assignments', require('./modules/assignments/assignments.routes'));
app.use('/logs', require('./modules/logs/logs.routes'));
app.use('/evaluations', require('./modules/evaluations/evaluations.routes'));
app.use('/visits', require('./modules/visits/visits.routes'));
app.use('/messages', require('./modules/messages/messages.routes'));
app.use('/attachments', require('./modules/attachments/attachments.routes'));

// ── Feature modules ──
// These routers are mounted at the ROOT: each route defines its full path and its own `authenticate`
// (see src/modules/_template/example.routes.js).
app.use(require('./modules/opportunities/opportunities.routes'));
app.use(require('./modules/applications/applications.routes'));   // also: /opportunities/:id/applicants, /assignments/:id/letter
app.use(require('./modules/attendance/attendance.routes'));
app.use(require('./modules/reports/reports.routes'));
app.use(require('./modules/supervision/supervision.routes'));     // notes, final grades, /supervisor/students
app.use(require('./modules/notifications/notifications.routes'));
app.use(require('./modules/stats/stats.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
