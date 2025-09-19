require('dotenv').config();
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

    // Use user's timezone if present, otherwise default to UTC
    const timezone = user.timezone || 'UTC';

    const records = await Attendance.find({ userId: user._id })
      .sort({ date: -1 });

    // Map mongoose docs -> plain objects and add _local fields for display
    const localized = records.map(r => {
      const obj = r.toObject();

      obj._local = {
        // date as YYYY-MM-DD for date pickers/inputs
        dateISO: obj.date ? moment.tz(obj.date, timezone).format('YYYY-MM-DD') : null,
        // friendly human date
        datePretty: obj.date ? moment.tz(obj.date, timezone).format('ddd - MMM D, YYYY') : null,
        // signed in/out in local timezone (readable)
        signedInAt: obj.signedInAt ? moment.tz(obj.signedInAt, timezone).format('hh:mm A') : null,
        signedInAtISO: obj.signedInAt ? moment.tz(obj.signedInAt, timezone).format('YYYY-MM-DDTHH:mm:ss') : null,
        signedOutAt: obj.signedOutAt ? moment.tz(obj.signedOutAt, timezone).format('hh:mm A') : null,
        signedOutAtISO: obj.signedOutAt ? moment.tz(obj.signedOutAt, timezone).format('YYYY-MM-DDTHH:mm:ss') : null,
      };

      return obj;
    });

    res.render('attendance', {
      title: `Attendance – ${user.name}`,
      records: localized,          // pass localized records to EJS
      users: [user],               // keep structure for form dropdown
      filters: {},
      singleUser: true,
      selectedUser: user,
      userTimezone: timezone       // expose timezone if template needs it
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
  const { name, email, password, role, workingHoursHours, workingHoursMinutes, timezone } = req.body;

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
    timezone: timezone || 'UTC',
  });

  res.redirect('/admin/users');
});

app.post('/admin/users/:id/edit', requireAdminAuth, async (req, res) => {
  const { name, email, role, password, workingHoursHours, workingHoursMinutes, timezone } = req.body;

  const safeHours = (workingHoursHours !== undefined ? workingHoursHours : '0').toString().padStart(2, '0');
  const safeMinutes = (workingHoursMinutes !== undefined ? workingHoursMinutes : '0').toString().padStart(2, '0');
  const formattedWorkingHours = `${safeHours}:${safeMinutes}`;

  const updateData = {
    name,
    email,
    role,
    workingHours: formattedWorkingHours,
    timezone: timezone || 'UTC',
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
    .sort({ date: -1 })
    .populate('userId');
  const users = await User.find();

  // Localize each record based on its user's timezone
  const localized = records.map(r => {
    const obj = r.toObject();
    const tz = obj.userId?.timezone || 'UTC';

    obj._local = {
      dateISO: obj.date ? moment.tz(obj.date, tz).format('YYYY-MM-DD') : null,
      datePretty: obj.date ? moment.tz(obj.date, tz).format('ddd - MMM D, YYYY') : null,
      signedInAt: obj.signedInAt ? moment.tz(obj.signedInAt, tz).format('hh:mm A') : null,
      signedInAtISO: obj.signedInAt ? moment.tz(obj.signedInAt, tz).format('YYYY-MM-DDTHH:mm:ss') : null,
      signedOutAt: obj.signedOutAt ? moment.tz(obj.signedOutAt, tz).format('hh:mm A') : null,
      signedOutAtISO: obj.signedOutAt ? moment.tz(obj.signedOutAt, tz).format('YYYY-MM-DDTHH:mm:ss') : null,
    };

    return obj;
  });

  res.render('attendance', {
    title: 'Attendance',
    records: localized,
    users,
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
app.post('/attendance/signin', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // normalize date to midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
app.post('/attendance/signout', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // normalize date to midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the latest session for today that is still open
    const attendance = await Attendance.findOne({
      userId,
      date: today,
      signedOutAt: null,
    }).sort({ signedInAt: -1 }); // get the latest open session

    if (!attendance) {
      return res.status(400).json({ message: 'No active session to sign out' });
    }

    attendance.signedOutAt = now;

    // calculate worked hours
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
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayEnd = new Date().setHours(23, 59, 59, 999);

    const records = await Attendance.find({
      date: { $gte: todayStart, $lte: todayEnd },
    }).populate('userId');

    // Add localized fields for each record based on user's timezone
    const localized = records.map(r => {
      const obj = r.toObject();
      const tz = obj.userId?.timezone || 'UTC';

      obj._local = {
        dateISO: obj.date ? moment.tz(obj.date, tz).format('YYYY-MM-DD') : null,
        datePretty: obj.date ? moment.tz(obj.date, tz).format('ddd - MMM D, YYYY') : null,
        signedInAt: obj.signedInAt ? moment.tz(obj.signedInAt, tz).format('hh:mm A') : null,
        signedOutAt: obj.signedOutAt ? moment.tz(obj.signedOutAt, tz).format('hh:mm A') : null,
      };

      return obj;
    });

    res.json(localized);
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

    // Localize each record using the user's timezone
    const localized = records.map(r => {
      const obj = r.toObject();
      const tz = obj.userId?.timezone || 'UTC';

      obj._local = {
        dateISO: obj.date ? moment.tz(obj.date, tz).format('YYYY-MM-DD') : null,
        datePretty: obj.date ? moment.tz(obj.date, tz).format('ddd - MMM D, YYYY') : null,
        signedInAt: obj.signedInAt ? moment.tz(obj.signedInAt, tz).format('hh:mm A') : null,
        signedOutAt: obj.signedOutAt ? moment.tz(obj.signedOutAt, tz).format('hh:mm A') : null,
      };

      return obj;
    });

    res.json(localized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// ✅ User-specific attendance history
app.get('/attendance/me', authMiddleware, async (req, res) => {
  try {
    const records = await Attendance.find({ userId: req.user.id })
      .sort({ date: -1 });

    // Determine the logged-in user's timezone
    const user = await User.findById(req.user.id);
    const tz = user?.timezone || 'UTC';

    const localized = records.map(r => {
      const obj = r.toObject();

      obj._local = {
        dateISO: obj.date ? moment.tz(obj.date, tz).format('YYYY-MM-DD') : null,
        datePretty: obj.date ? moment.tz(obj.date, tz).format('ddd - MMM D, YYYY') : null,
        signedInAt: obj.signedInAt ? moment.tz(obj.signedInAt, tz).format('hh:mm A') : null,
        signedOutAt: obj.signedOutAt ? moment.tz(obj.signedOutAt, tz).format('hh:mm A') : null,
      };

      return obj;
    });

    res.json(localized);
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
      userId: req.user.id,
      date: { $gte: weekStarts },
    }).populate('userId');

    // Determine the logged-in user's timezone
    const user = await User.findById(req.user.id);
    const tz = user?.timezone || 'UTC';

    const localized = records.map(r => {
      const obj = r.toObject();

      obj._local = {
        dateISO: obj.date ? moment.tz(obj.date, tz).format('YYYY-MM-DD') : null,
        datePretty: obj.date ? moment.tz(obj.date, tz).format('ddd - MMM D, YYYY') : null,
        signedInAt: obj.signedInAt ? moment.tz(obj.signedInAt, tz).format('hh:mm A') : null,
        signedOutAt: obj.signedOutAt ? moment.tz(obj.signedOutAt, tz).format('hh:mm A') : null,
      };

      return obj;
    });

    res.json(localized);
  } catch (err) {
    console.error('Error fetching weekly attendance:', err.message);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

app.use((req, res) => {
  res.status(404).send('<h2>404 - Page Not Found</h2><a href="/">Go Home</a>');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});

// Connect Mongo
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    // 🔁 Cron Job: Mark Absent for Users Who Didn’t Sign In
    cron.schedule('5 0 * * *', async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day

        const allUsers = await User.find();

        for (const user of allUsers) {
          // ✅ Check if user has signed in at least once today
          const hasSignedIn = await Attendance.exists({
            userId: user._id,
            date: today,
            signedInAt: { $ne: null }
          });

          if (!hasSignedIn) {
            await Attendance.create({
              userId: user._id,
              date: today,
              signedInAt: null,
              signedOutAt: null,
              timeWorked: 0
            });

            console.log(`📌 Marked absent: ${user.name}`);
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
