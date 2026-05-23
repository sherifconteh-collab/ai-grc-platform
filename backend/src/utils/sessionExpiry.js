function parseDurationToSeconds(value, label) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }

  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d*\.?\d+)\s*(ms|msecs?|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|yrs?|years?)$/i);

  if (!match) {
    throw new Error(
      `[auth] Invalid ${label}="${normalized}". Use a positive jsonwebtoken/ms-style duration such as "15m", "1.5h", or "7 days".`
    );
  }

  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const millisecondsPerUnit = new Map([
    ['ms', 1],
    ['msec', 1],
    ['msecs', 1],
    ['millisecond', 1],
    ['milliseconds', 1],
    ['s', 1000],
    ['sec', 1000],
    ['secs', 1000],
    ['second', 1000],
    ['seconds', 1000],
    ['m', 60 * 1000],
    ['min', 60 * 1000],
    ['mins', 60 * 1000],
    ['minute', 60 * 1000],
    ['minutes', 60 * 1000],
    ['h', 60 * 60 * 1000],
    ['hr', 60 * 60 * 1000],
    ['hrs', 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['hours', 60 * 60 * 1000],
    ['d', 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['days', 24 * 60 * 60 * 1000],
    ['w', 7 * 24 * 60 * 60 * 1000],
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['weeks', 7 * 24 * 60 * 60 * 1000],
    ['y', 365.25 * 24 * 60 * 60 * 1000],
    ['yr', 365.25 * 24 * 60 * 60 * 1000],
    ['yrs', 365.25 * 24 * 60 * 60 * 1000],
    ['year', 365.25 * 24 * 60 * 60 * 1000],
    ['years', 365.25 * 24 * 60 * 60 * 1000]
  ]);

  const unitMilliseconds = millisecondsPerUnit.get(unit);
  const totalMilliseconds = amount * unitMilliseconds;
  if (!Number.isFinite(totalMilliseconds) || totalMilliseconds <= 0) {
    throw new Error(
      `[auth] Invalid ${label}="${normalized}". Duration must resolve to a positive time span.`
    );
  }

  return Math.max(1, Math.floor(totalMilliseconds / 1000));
}

function resolveExpiryTimestampFromNow(value, label) {
  const durationSeconds = parseDurationToSeconds(value, label);
  return new Date(Date.now() + durationSeconds * 1000).toISOString();
}

module.exports = {
  parseDurationToSeconds,
  resolveExpiryTimestampFromNow
};