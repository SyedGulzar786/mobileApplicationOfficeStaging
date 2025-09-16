// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//   name: String,
//   email: String,
//   phone: String,
//   password: String,
//   role: String,
// }, { timestamps: true }); // adds createdAt & updatedAt

// module.exports = mongoose.model('User', userSchema);



// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//   name: String,
//   email: String,
//   phone: String,
//   password: String,          // ⚠️ Stores plain password
//   passwordHashed: String,    // ✅ Keeps hashed password (for login)
//   role: String,
//   workingHours: {
//     type: Number,
//     default: 9, // default working hours in hours
//   },
// }, { timestamps: true });

// module.exports = mongoose.model('User', userSchema);

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  password: String,          // ⚠️ Stores plain password
  passwordHashed: String,    // ✅ Keeps hashed password (for login)
  role: String,
  workingHours: {
    type: String,            // Changed from Number to String
    default: "09:00",        // Format: HH:mm
  },
  timezone: {
    type: String,
    default: "Asia/Karachi",  // Default to Pakistan timezone
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);




