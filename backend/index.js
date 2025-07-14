require('dotenv').config();
const moment = require('moment');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

const User = require('./models/User');
const Attendance = require('./models/Attendance');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// EJS Layouts
const expressLayouts = require('express-ejs-layouts');
app.use(expressLayouts);
app.set('layout', 'layout');

// Admin-only middleware
function requireAdminAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/admin/login');

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err || decoded.email !== process.env.ADMIN_EMAIL) {
      return res.redirect('/admin/login');
    }
    next();
  });
}

// Routes
app.get('/', (req, res) => res.redirect('/admin/login'));

app.get('/admin/login', (req, res) => {
  res.render('login', { title: 'Admin Login', error: null });
});

app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (email !== process.env.ADMIN_EMAIL) {
    return res.render('login', { title: 'Admin Login', error: 'Access Denied: Not Admin' });
  }

  const match = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!match) return res.render('login', { error: 'Invalid credentials' });

  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.cookie('token', token, { httpOnly: true });
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/admin/login');
});

app.get('/dashboard', requireAdminAuth, async (req, res) => {
  const users = await User.find();
  res.render('dashboard', { title: 'Dashboard', users });
});

// Users CRUD
app.get('/admin/users', requireAdminAuth, async (req, res) => {
  const users = await User.find();
  res.render('users', { title: 'Users', users });
});

app.post('/admin/users', requireAdminAuth, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!password) return res.redirect('/admin/users');

  const hashedPassword = await bcrypt.hash(password, 10);

  await User.create({
    name,
    email,
    password,               // plain password
    passwordHashed: hashedPassword,
    role,
  });

  res.redirect('/admin/users');
});

app.post('/admin/users/:id/edit', requireAdminAuth, async (req, res) => {
  const { name, email, role, password } = req.body;
  const updateData = { name, email, role };

  if (password && password.trim()) {
    updateData.password = password; // ✅ plain
    updateData.passwordHashed = await bcrypt.hash(password, 10); // ✅ hashed
  }

  await User.findByIdAndUpdate(req.params.id, updateData);
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/delete', requireAdminAuth, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/admin/users');
});

// Attendance with filters
app.get('/admin/attendance', requireAdminAuth, async (req, res) => {
  const { name, date, range } = req.query;
  const query = {};

  if (name) {
    const usersByName = await User.find({ name: new RegExp(name, 'i') });
    query.userId = { $in: usersByName.map(u => u._id) };
  }

  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    query.date = { $gte: start, $lte: end };
  } else if (range === 'today') {
    const start = moment().startOf('day').toDate();
    const end = moment().endOf('day').toDate();
    query.date = { $gte: start, $lte: end };
  } else if (range === 'week') {
    const start = moment().subtract(7, 'days').startOf('day').toDate();
    const end = moment().endOf('day').toDate();
    query.date = { $gte: start, $lte: end };
  } else if (range === 'month') {
    const start = moment().subtract(30, 'days').startOf('day').toDate();
    const end = moment().endOf('day').toDate();
    query.date = { $gte: start, $lte: end };
  }

  const records = await Attendance.find(query)
  .sort({ date: -1 })  // Sort by latest first
  .populate('userId');
  const users = await User.find(); // ✅ REQUIRED
  res.render('attendance', {
    title: 'Attendance',
    records,
    users, // ✅ Pass to EJS
    filters: {
      name: name || '',
      date: date || '',
      range: range || ''
    }
  });
});

app.post('/admin/attendance/:id/delete', requireAdminAuth, async (req, res) => {
  await Attendance.findByIdAndDelete(req.params.id);
  res.redirect('/admin/attendance');
});

app.post('/admin/attendance/:id/edit', requireAdminAuth, async (req, res) => {
  const { date, signedInAt, signedOutAt } = req.body;

  try {
    await Attendance.findByIdAndUpdate(req.params.id, {
      date: new Date(date),
      signedInAt: signedInAt ? new Date(signedInAt) : null,
      signedOutAt: signedOutAt ? new Date(signedOutAt) : null
    });

    res.redirect('/admin/attendance');
  } catch (err) {
    console.error('Edit error:', err);
    res.redirect('/admin/attendance');
  }
});

app.post('/admin/attendance/mark', requireAdminAuth, async (req, res) => {
  const { userId, date, action } = req.body;

  if (!userId || !date || !action) {
    return res.redirect('/admin/attendance');
  }

  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0); // Normalize to 00:00:00

  const dateWithTime = new Date(date); // keeps original time from admin

  try {
    let existing = await Attendance.findOne({ userId, date: selectedDate });

    if (existing) {
      // Only update what's missing
      if (action === 'signin' && !existing.signedInAt) {
        existing.signedInAt = dateWithTime;
      }
      if (action === 'signout' && !existing.signedOutAt) {
        existing.signedOutAt = dateWithTime;
      }
      await existing.save();
    } else {
      await Attendance.create({
        userId,
        date: selectedDate,
        signedInAt: action === 'signin' ? dateWithTime : undefined,
        signedOutAt: action === 'signout' ? dateWithTime : undefined
      });
    }

    res.redirect('/admin/attendance');
  } catch (err) {
    console.error('Attendance marking error:', err);
    res.redirect('/admin/attendance');
  }
});

app.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'Email and password (6+ chars) required' });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: 'Email not found. Please register first.' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  await User.findByIdAndUpdate(user._id, {
    password: newPassword,           // plain password for admin UI only
    passwordHashed: hashed           // hashed for login
  });

  return res.json({ message: 'Password reset successful' });
});

// Mobile APIs
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

app.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      name, 
      email, 
      password,             // plain text (for admin panel UI only)
      passwordHashed: hashedPassword,
      role: role || 'staff' // ✅ Default to 'staff' if not provided
    });

    res.status(201).json({ message: 'User registered', userId: user._id });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid email' });

    // const isMatch = await bcrypt.compare(password, user.password);
    const isMatch = await bcrypt.compare(password, user.passwordHashed);
    if (!isMatch) return res.status(401).json({ message: 'Invalid password' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Login failed. Try again.' });
  }
});

// app.post('/attendance', authMiddleware, async (req, res) => {
//   const userId = req.user.id;

//   const alreadyMarked = await Attendance.findOne({
//     userId,
//     date: {
//       $gte: new Date().setHours(0, 0, 0, 0),
//       $lte: new Date().setHours(23, 59, 59, 999),
//     },
//   });

//   if (alreadyMarked) {
//     return res.status(400).json({ message: 'Already marked today' });
//   }

//   const attendance = await Attendance.create({ userId });
//   res.status(201).json(attendance);
// });

app.post('/attendance/signin', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const existing = await Attendance.findOne({
    userId,
    date: { $gte: start, $lte: end }
  });

  if (existing) {
    if (existing.signedInAt) {
      return res.status(400).json({ message: 'Already signed in today' });
    } else {
      existing.signedInAt = new Date(); // current time
      await existing.save();
      return res.status(200).json({ message: 'Sign in time recorded' });
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // normalize

  await Attendance.create({
    userId,
    date: today, // ✅ fixed
    signedInAt: new Date()
  });

  return res.status(201).json({ message: 'Signed in successfully' });
});

app.post('/attendance/signout', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  // Normalize today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await Attendance.findOne({
    userId,
    date: today  // ✅ search by normalized date
  });

  if (!existing || !existing.signedInAt) {
    return res.status(400).json({ message: 'You must sign in first before signing out' });
  }

  if (existing.signedOutAt) {
    return res.status(400).json({ message: 'Already signed out today' });
  }

  existing.signedOutAt = new Date();
  await existing.save();
  return res.status(200).json({ message: 'Signed out successfully' });
});

app.get('/today', async (req, res) => {
  try {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayEnd = new Date().setHours(23, 59, 59, 999);

    const records = await Attendance.find({
      date: { $gte: todayStart, $lte: todayEnd },
    }).populate('userId');

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/attendance', async (req, res) => {
  try {
    const records = await Attendance.find().populate('userId');
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

app.use((req, res) => {
  res.status(404).send('<h2>404 - Page Not Found</h2><a href="/">Go Home</a>');
});

// Connect Mongo
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server is running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
  });
