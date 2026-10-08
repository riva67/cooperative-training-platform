const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { corsOrigin } = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Module routes ──
app.use('/auth', require('./modules/auth/auth.routes'));
app.use('/users', require('./modules/users/users.routes'));

// ── Teammates: register your modules here ──
// app.use('/opportunities', require('./modules/opportunities/opportunities.routes'));
// app.use('/applications',  require('./modules/applications/applications.routes'));
// app.use('/attendance',    require('./modules/attendance/attendance.routes'));
// app.use('/reports',       require('./modules/reports/reports.routes'));
// app.use('/notes',         require('./modules/notes/notes.routes'));
// app.use('/evaluations',   require('./modules/evaluations/evaluations.routes'));
// app.use('/notifications', require('./modules/notifications/notifications.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
