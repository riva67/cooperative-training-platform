// Date helpers. "Today" is computed in the training country's time zone (default Asia/Riyadh),
// NOT the server's, so attendance works correctly when the server runs in UTC (Docker, cloud).
const TZ = process.env.APP_TIMEZONE || 'Asia/Riyadh';

/** Today's calendar date as a Date at 00:00 UTC (matches Prisma @db.Date columns). */
function todayDate(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Strip the time part of any date (UTC) so it can be compared with todayDate(). */
function dateOnly(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

module.exports = { todayDate, dateOnly };