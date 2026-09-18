/**
 * DyPOS Date Bounds — sargable ranges for billions-scale reports.
 *
 * `date(created_at) = ?` applies a function to the column, defeating the
 * idx_invoices_created index (full scan per report). ISO-8601 datetimes sort
 * lexicographically, so `created_at >= 'YYYY-MM-DD' AND created_at < next`
 * is semantically identical AND index-seekable on both SQLite and Postgres.
 */
export function dayAfter(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Bounds for a single calendar day: [dayStart, nextDayStart). */
export function dayRange(dateStr) {
  const day = String(dateStr).slice(0, 10);
  return { from: day, to: dayAfter(day) };
}

/** Bounds for an inclusive range: [from, dayAfter(to)). */
export function rangeBounds(from, to) {
  return { from: String(from).slice(0, 10), to: dayAfter(String(to).slice(0, 10)) };
}

export default { dayAfter, dayRange, rangeBounds };
