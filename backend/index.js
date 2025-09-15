require('dotenv').config();
// Use moment-timezone for timezone-aware operations
const moment = require('moment-timezone');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');

const { startOfWeek } = require("date-fns");

const User = require('./models/User');
const Attendance = require('./models/Attendance');

const app = express();

// Middleware
app.use(express.json());

// app.use(cors({
//   origin: "*"
//   // origin: 'http://localhost:8081', // your frontend origin
//   // credentials: true,              // allow cookies & headers
// }));

app.use(cors({
  origin: ["*", 'http://localhost:8081', 'http://192.168.100.174:8081'], // allowed frontend origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true // allow cookies/headers
}));

// app.use(cors({
//     origin: ['http://localhost:19006', 'exp://192.168.100.175:19000'],
//   // origin: "*",
//     // origin: ['http://localhost:8081', 'http://192.168.100.175:8081'], // allowed frontend origins
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   credentials: true
// }));

// app.use(cors({
//   origin: [
//     'exp://192.168.100.174:19000', // Expo LAN URL (adjust IP if different)
//     'http://192.168.100.174:19006', // Expo web (optional)
//     'http://192.168.100.174:5000'   // Backend API URL (mobile fetch requests)
//   ],
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   credentials: true
// }));

// app.use(cors({
//   origin: "*",
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   credentials: true
// }));

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

  if (!email || !password) {
    return res.render('login', { title: 'Admin Login', error: 'Email and password required' });
  }

  if (email !== process.env.ADMIN_EMAIL) {
    return res.render('login', { title: 'Admin Login', error: 'Access Denied: Not Admin' });
  }

  const match = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!match) {
    return res.render('login', { title: 'Admin Login', error: 'Invalid credentials' });
  }

  const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });

  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

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

// ✅ User-specific attendance view
app.get('/admin/users/:id/attendance', requireAdminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).send('User not found');
    }

    const records = await Attendance.find({ userId: user._id })
      .sort({ date: -1 });

    res.render('attendance', {
      title: `Attendance – ${user.name}`,
      records,
      users: [user], // keep structure for form dropdown
      filters: {},
      singleUser: true,
      selectedUser: user,
    });
  } catch (err) {
    console.error('Error fetching user attendance:', err);
    res.status(500).send('Server error');
  }
});

// Users CRUD
app.get('/admin/users', requireAdminAuth, async (req, res) => {
  const users = await User.find();
  res.render('users', { title: 'Users', users });
});

app.post('/admin/users', requireAdminAuth, async (req, res) => {
  const { name, email, password, role, workingHoursHours, workingHoursMinutes } = req.body;
  const safeHours = (workingHoursHours || '0').toString().padStart(2, '0');
  const safeMinutes = (workingHoursMinutes || '0').toString().padStart(2, '0');
  const formattedWorkingHours = `${safeHours}:${safeMinutes}`;


  if (!password) return res.redirect('/admin/users');

  const hashedPassword = await bcrypt.hash(password, 10);

  await User.create({
    name,
    email,
    password,
    passwordHashed: hashedPassword,
    role,
    workingHours: formattedWorkingHours,
  });

  res.redirect('/admin/users');
});

app.post('/admin/users/:id/edit', requireAdminAuth, async (req, res) => {
  const { name, email, role, password, workingHoursHours, workingHoursMinutes } = req.body;

  const safeHours = (workingHoursHours !== undefined ? workingHoursHours : '0').toString().padStart(2, '0');
  const safeMinutes = (workingHoursMinutes !== undefined ? workingHoursMinutes : '0').toString().padStart(2, '0');
  const formattedWorkingHours = `${safeHours}:${safeMinutes}`;

  const updateData = {
    name,
    email,
    role,
    workingHours: formattedWorkingHours,
  };

  if (password && password.trim()) {
    updateData.password = password;
    updateData.passwordHashed = await bcrypt.hash(password, 10);
  }

  await User.findByIdAndUpdate(req.params.id, updateData);
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/delete', requireAdminAuth, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/admin/users');
});
// 🚨 Delete All Users (except admin)
app.post('/admin/users/delete-all', requireAdminAuth, async (req, res) => {
  try {
    await User.deleteMany({ email: { $ne: process.env.ADMIN_EMAIL } });
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Error deleting all users:', err);
    res.status(500).send('Failed to delete all users');
  }
});
app.post('/admin/users/:id/working-hours', requireAdminAuth, async (req, res) => {
  const { workingHours } = req.body;
  try {
    await User.findByIdAndUpdate(req.params.id, { workingHours });
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Error updating working hours:', err);
    res.status(500).send('Error updating working hours');
  }
});

// WORKING HOURS CRUD TAB
app.get('/admin/working-hours', requireAdminAuth, async (req, res) => {
  const users = await User.find();
  res.render('working-hours', { title: 'Working Hours', users });
});

app.post('/admin/working-hours/:id/update', requireAdminAuth, async (req, res) => {
  const { workingHours } = req.body;
  await User.findByIdAndUpdate(req.params.id, { workingHours: parseFloat(workingHours) });
  res.redirect('/admin/working-hours');
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

// 🚨 Delete All Attendance Records
app.post('/admin/attendance/delete-all', requireAdminAuth, async (req, res) => {
  try {
    await Attendance.deleteMany({});
    res.redirect('/admin/attendance');
  } catch (err) {
    console.error('Error deleting all attendance records:', err);
    res.status(500).send('Failed to delete all attendance records');
  }
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
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403);

    req.user = {
      id: decoded.userId,
      name: decoded.name,
      email: decoded.email
    };

    next();
  });
}

app.post('/login', async (req, res) => {
  try {
    // Log request IP & body
    console.log('------------------------------------');
    console.log(`[LOGIN] New login attempt at ${new Date().toISOString()}`);
    console.log(`[LOGIN] Request IP: ${req.ip} (x-forwarded-for: ${req.headers['x-forwarded-for'] || 'N/A'})`);
    console.log('[LOGIN] Request body:', req.body);

    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    console.log('[LOGIN] User lookup result:', user ? `Found user: ${user.name}` : 'No user found');

    if (!user) {
      console.log('[LOGIN] Result: Invalid email');
      return res.status(401).json({ message: 'Invalid email' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.passwordHashed);
    console.log(`[LOGIN] Password match: ${isMatch}`);

    if (!isMatch) {
      console.log('[LOGIN] Result: Invalid password');
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        name: user.name,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const responsePayload = {
      token,
      user: { id: user._id, name: user.name, email: user.email }
    };

    console.log('[LOGIN] Login successful. Response payload:', responsePayload);
    console.log('------------------------------------');

    res.json(responsePayload);

  } catch (err) {
    console.error('[LOGIN] Error during login:', err.message);
    res.status(500).json({ message: 'Login failed. Try again.' });
  }
});

// ✅ Sign In (always creates a new session)
// ✅ Sign In (always creates a new session) - TIMEZONE AWARE
app.post('/attendance/signin', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Accept timezone from multiple sources (body, query, or header)
    const tz = req.body.timezone || req.query.timezone || req.headers['x-user-tz'] || req.headers['x-timezone'] || 'UTC';

    // Compute "now" in user's timezone, and the user's local midnight
    const userNow = moment.tz(tz);
    const localMidnight = userNow.clone().startOf('day');

    // Convert to JS Date objects (these represent instants in UTC that correspond to user's local times)
    const now = userNow.toDate();
    const today = localMidnight.toDate();

    // Optionally: store the user's timezone on their profile for cron checks later
    // (requires adding timezone field to User schema if you want persistence)
    try {
      await User.findByIdAndUpdate(userId, { $set: { timezone: tz } });
    } catch (e) {
      console.warn('Could not persist user timezone:', e.message || e);
    }

    // Always create a new session (no duplicate check)
    const attendance = new Attendance({
      userId,
      date: today,
      signedInAt: now,
    });

    await attendance.save();
    return res.status(201).json({ message: 'Signed in successfully', attendance });
  } catch (err) {
    console.error('Signin error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Sign Out (close the latest open session for today)
// ✅ Sign Out (close the latest open session for user's local today) - TIMEZONE AWARE
app.post('/attendance/signout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Accept timezone from body/query/header; fall back to the user's stored timezone if available
    let tz = req.body.timezone || req.query.timezone || req.headers['x-user-tz'] || req.headers['x-timezone'];
    if (!tz) {
      const userDoc = await User.findById(userId);
      tz = userDoc && userDoc.timezone ? userDoc.timezone : 'UTC';
    }

    const userNow = moment.tz(tz);
    const localMidnight = userNow.clone().startOf('day');

    const now = userNow.toDate();
    const today = localMidnight.toDate();

    // Find the latest session for the user's local "today" that is still open
    const attendance = await Attendance.findOne({
      userId,
      date: today,
      signedOutAt: null,
    }).sort({ signedInAt: -1 }); // get the latest open session

    if (!attendance) {
      return res.status(400).json({ message: 'No active session to sign out' });
    }

    attendance.signedOutAt = now;

    // calculate worked hours (in hours)
    if (attendance.signedInAt) {
      const diffMs = now - attendance.signedInAt;
      attendance.timeWorked = diffMs / (1000 * 60 * 60); // hours
    }

    await attendance.save();

    return res.status(200).json({ message: 'Signed out successfully', attendance });
  } catch (err) {
    console.error('Signout error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.get('/today', async (req, res) => {
  try {
    // Accept optional timezone (query or header). If missing, default to UTC.
    const tz = req.query.timezone || req.headers['x-user-tz'] || req.headers['x-timezone'] || 'UTC';

    // compute start/end of local day in UTC-instant form
    const startLocal = moment.tz(tz).startOf('day').toDate();
    const endLocal = moment.tz(tz).endOf('day').toDate();

    const records = await Attendance.find({
      date: { $gte: startLocal, $lte: endLocal },
    }).populate('userId');

    res.json(records);
  } catch (err) {
    console.error('Error fetching /today:', err);
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

// ✅ User-specific attendance history
app.get('/attendance/me', authMiddleware, async (req, res) => {
  try {
    const records = await Attendance.find({ userId: req.user.id })
      .sort({ date: -1 }); // latest first
    res.json(records);
  } catch (err) {
    console.error('Error fetching user attendance:', err.message);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// ✅ Weekly attendance for the logged-in user
app.get('/attendance/week', authMiddleware, async (req, res) => {
  try {
    const weekStarts = startOfWeek(new Date(), { weekStartsOn: 1 });

    const records = await Attendance.find({
      userId: req.user.id, // ✅ filter by logged-in user
      date: { $gte: weekStarts },
    }).populate('userId');

    res.json(records);
  } catch (err) {
    console.error('Error fetching weekly attendance:', err.message);
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
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is running at http://localhost:${PORT}`);
    });
    
    // 🔁 Cron Job: Mark Absent for Users Who Didn’t Sign In (timezone-aware per user)
    cron.schedule('5 0 * * *', async () => {
      try {
        const allUsers = await User.find();

        for (const user of allUsers) {
          // Determine the user's timezone. Prefer stored user.timezone; otherwise skip marking absent
          const tz = user.timezone;
          if (!tz) {
            console.log(`⏭️ Skipping absent check for ${user.name} — no timezone set. Consider collecting/storing timezone on sign-in.`);
            continue;
          }

          // Compute that user's local "today" range (midnight -> next midnight)
          const localStart = moment.tz(tz).startOf('day').toDate();
          const localEnd = moment.tz(tz).endOf('day').toDate();

          // Check if user has any attendance entry for that local date with a non-null signedInAt
          const hasSignedIn = await Attendance.exists({
            userId: user._id,
            date: { $gte: localStart, $lte: localEnd },
            signedInAt: { $ne: null }
          });

          if (!hasSignedIn) {
            // create an absent record normalized to the user's local midnight (converted to UTC instant)
            await Attendance.create({
              userId: user._id,
              date: localStart,
              signedInAt: null,
              signedOutAt: null,
              timeWorked: 0
            });

            console.log(`📌 Marked absent: ${user.name} (tz: ${tz})`);
          }
        }

        console.log('✅ Daily absence check completed.');
      } catch (err) {
        console.error('❌ Error in daily absence cron:', err.message);
      }
    });

  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
  });
