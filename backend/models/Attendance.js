// const mongoose = require('mongoose');

// const attendanceSchema = new mongoose.Schema({
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//   },
//   date: {
//     type: Date,
//     default: Date.now,
//   },
// });

// module.exports = mongoose.model('Attendance', attendanceSchema);

const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  date: {
    type: Date,
    required: true,
  },
  signedInAt: {
    type: Date,
    default: null,
  },
  signedOutAt: {
    type: Date,
    default: null,
  },
  timeWorked: {
    type: Number, // Time worked in hours
    default: 0,
  }
});

// ✅ Normalize "date" to start of the day (00:00:00)
attendanceSchema.pre('save', function (next) {
  if (this.date) {
    this.date.setHours(0, 0, 0, 0);
  }
  next();
});

// ❌ Remove unique index (we now allow multiple sign-ins per day)
// attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
