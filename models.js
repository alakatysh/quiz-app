const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');

// Підключення до БД
const MONGO_URI = 'mongodb+srv://project:ВАШ_ПАРОЛЬ@cluster0.yxilawf.mongodb.net/quiz_db?appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('DB error:', err.message));

// Користувачі
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  role: { type: String, enum: ['teacher', 'student'], default: 'student' }
});

// Питання та тести
const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  type: { type: String, enum: ['single', 'multiple', 'text'], required: true },
  options: [String],
  correctAnswers: [String],
  points: { type: Number, default: 1 }
});

const testSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  timeLimit: { type: Number, default: 0 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  questions: [questionSchema],
  createdAt: { type: Date, default: Date.now }
});

// Результати
const resultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  score: { type: Number, required: true },
  maxScore: { type: Number, required: true },
  completedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Test = mongoose.model('Test', testSchema);
const Result = mongoose.model('Result', resultSchema);

module.exports = { User, Test, Result };