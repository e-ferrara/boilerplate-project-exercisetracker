// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/exercisetracker';
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true }
});

const exerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true }, // minutes
  date: { type: Date, required: true }
});

const User = mongoose.model('User', userSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);

// Root
app.get('/', (req, res) => {
  res.send('FCC Exercise Tracker Microservice - POST /api/users to create users');
});

/**
 * Create user
 * POST /api/users
 * body: { username }
 * returns: { username, _id }
 */
app.post('/api/users', async (req, res) => {
  const username = req.body.username;
  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    const user = new User({ username });
    const saved = await user.save();
    res.json({ username: saved.username, _id: saved._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * Get all users
 * GET /api/users
 * returns: [ { username, _id }, ... ]
 */
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username _id').exec();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * Add exercise
 * POST /api/users/:_id/exercises
 * body: { description, duration, date? }
 * returns: { _id, username, date, duration, description }
 */
app.post('/api/users/:_id/exercises', async (req, res) => {
  const userId = req.params._id;
  const { description, duration, date } = req.body;

  if (!description || !duration) {
    return res.status(400).json({ error: 'description and duration are required' });
  }

  // Parse duration to Number
  const dur = Number(duration);
  if (Number.isNaN(dur)) return res.status(400).json({ error: 'duration must be a number' });

  // Parse date (optional). If missing, use today.
  let d;
  if (!date) {
    d = new Date();
  } else {
    d = new Date(date);
    if (d.toString() === 'Invalid Date') return res.status(400).json({ error: 'invalid date' });
  }

  try {
    const user = await User.findById(userId).exec();
    if (!user) return res.status(404).json({ error: 'user not found' });

    const ex = new Exercise({
      userId: user._id,
      description,
      duration: dur,
      date: d
    });

    await ex.save();

    res.json({
      _id: user._id,
      username: user.username,
      date: ex.date.toDateString(),
      duration: ex.duration,
      description: ex.description
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

/**
 * Get logs
 * GET /api/users/:_id/logs?[from][&to][&limit]
 * returns: { _id, username, count, log: [ { description, duration, date }, ... ] }
 *
 * - from and to are optional ISO date strings (YYYY-MM-DD). Inclusive.
 * - limit is optional integer.
 */
app.get('/api/users/:_id/logs', async (req, res) => {
  const userId = req.params._id;
  const { from, to, limit } = req.query;

  try {
    const user = await User.findById(userId).exec();
    if (!user) return res.status(404).json({ error: 'user not found' });

    // Build query
    const query = { userId: user._id };
    const dateFilter = {};
    if (from) {
      const fromDate = new Date(from);
      if (fromDate.toString() === 'Invalid Date') return res.status(400).json({ error: 'invalid from date' });
      dateFilter.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (toDate.toString() === 'Invalid Date') return res.status(400).json({ error: 'invalid to date' });
      dateFilter.$lte = toDate;
    }
    if (Object.keys(dateFilter).length) {
      query.date = dateFilter;
    }

    let q = Exercise.find(query).select('description duration date -_id').sort({ date: 1 });
    if (limit) {
      const lim = Number(limit);
      if (Number.isNaN(lim) || lim <= 0) return res.status(400).json({ error: 'invalid limit' });
      q = q.limit(lim);
    }

    const exercises = await q.exec();

    const log = exercises.map(e => ({
      description: e.description,
      duration: e.duration,
      date: e.date.toDateString()
    }));

    res.json({
      _id: user._id,
      username: user.username,
      count: log.length,
      log
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Start
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
