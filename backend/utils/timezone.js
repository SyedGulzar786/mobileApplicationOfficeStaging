const moment = require('moment-timezone');

function formatAttendanceRecord(record, timezone) {
  return {
    ...record.toObject(),
    signedInAt: record.signedInAt ? moment(record.signedInAt).tz(timezone).format("YYYY-MM-DD HH:mm:ss") : null,
    signedOutAt: record.signedOutAt ? moment(record.signedOutAt).tz(timezone).format("YYYY-MM-DD HH:mm:ss") : null,
    date: record.date ? moment(record.date).tz(timezone).startOf("day").format("YYYY-MM-DD") : null,
  };
}

module.exports = { formatAttendanceRecord };
