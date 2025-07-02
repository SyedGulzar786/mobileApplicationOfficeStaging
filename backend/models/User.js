// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//   name: String,
//   email: String,
//   phone: String,
//   password: String,
//   role: String,
// }, { timestamps: true }); // adds createdAt & updatedAt

// module.exports = mongoose.model('User', userSchema);

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  password: String,          // ⚠️ Stores plain password
  passwordHashed: String,    // ✅ Keeps hashed password (for login)
  role: String,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);



