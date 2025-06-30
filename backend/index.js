require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');

// Models
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

// --------------------
// 🔐 Admin-only Web Auth Middleware
// --------------------
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

// --------------------
// 🖥️ Admin Web Routes (LMS)
// --------------------
app.get('/', (req, res) => res.redirect('/admin/login'));

app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (email !== process.env.ADMIN_EMAIL) {
    return res.render('login', { error: 'Access Denied: Not Admin' });
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
  res.render('dashboard', { users });
});

// --------------------
// 👤 Admin: Users CRUD
// --------------------
app.get('/admin/users', requireAdminAuth, async (req, res) => {
  const users = await User.find();
  res.render('users', { users });
});

app.post('/admin/users', requireAdminAuth, async (req, res) => {
  const { name, email, role } = req.body;
  await User.create({ name, email, role });
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/edit', requireAdminAuth, async (req, res) => {
  const { name, email, role } = req.body;
  await User.findByIdAndUpdate(req.params.id, { name, email, role });
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/delete', requireAdminAuth, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/admin/users');
});

// --------------------
// 🕓 Admin: Attendance Table + Filters
// --------------------
app.get('/admin/attendance', requireAdminAuth, async (req, res) => {
  const { name, date } = req.query;
  const query = {};

  if (name) {
    const users = await User.find({ name: new RegExp(name, 'i') });
    query.userId = { $in: users.map(u => u._id) };
  }

  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    query.date = { $gte: start, $lte: end };
  }

  const records = await Attendance.find(query).populate('userId');
  res.render('attendance', {
    records,
    filters: {
      name: name || '',
      date: date || ''
    }
  });
});

app.post('/admin/attendance/:id/delete', requireAdminAuth, async (req, res) => {
  await Attendance.findByIdAndDelete(req.params.id);
  res.redirect('/admin/attendance');
});

// --------------------
// 📱 Mobile App API Routes
// --------------------
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
    const { name, email, password } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'All fields required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });

    res.status(201).json({ message: 'User registered', userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(401).json({ message: 'Invalid email' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid password' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Login failed. Try again.' });
  }
});

app.post('/attendance', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  const alreadyMarked = await Attendance.findOne({
    userId,
    date: {
      $gte: new Date().setHours(0, 0, 0, 0),
      $lte: new Date().setHours(23, 59, 59, 999),
    },
  });

  if (alreadyMarked) {
    return res.status(400).json({ message: 'Already marked today' });
  }

  const attendance = await Attendance.create({ userId });
  res.status(201).json(attendance);
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

// --------------------
// ❌ 404 Fallback
// --------------------
app.use((req, res) => {
  res.status(404).send('<h2>404 - Page Not Found</h2><a href="/">Go Home</a>');
});

// --------------------
// ✅ Connect MongoDB and Start Server
// --------------------
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
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
