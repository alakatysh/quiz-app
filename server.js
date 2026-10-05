const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { User, Test, Result } = require('./models');

const app = express();

// Конфігурація
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'super-secret-quiz-key',
  resave: false,
  saveUninitialized: false
}));

// Middleware сесії
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// Перевірка доступу
const isAuthenticated = (req, res, next) => req.session.user ? next() : res.redirect('/login');
const isTeacher = (req, res, next) => (req.session.user && req.session.user.role === 'teacher') ? next() : res.status(403).send('Доступ заборонено');
const isStudent = (req, res, next) => (req.session.user && req.session.user.role === 'student') ? next() : res.status(403).send('Доступ заборонено');

// Головна
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.redirect(req.session.user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
});

// Авторизація
app.get('/login', (req, res) => res.render('auth/login', { error: null }));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render('auth/login', { error: 'Невірний логін або пароль' });
    }

    req.session.user = {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      role: user.role
    };

    res.redirect(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
  } catch (err) {
    console.error(err);
    res.render('auth/login', { error: 'Помилка сервера' });
  }
});

app.get('/register', (req, res) => res.render('auth/register', { error: null }));

app.post('/register', async (req, res) => {
  const { username, password, fullName, role } = req.body;
  try {
    if (await User.findOne({ username })) {
      return res.render('auth/register', { error: 'Логін уже зайнятий' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashedPassword, fullName, role: role || 'student' });
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.render('auth/register', { error: 'Помилка реєстрації' });
  }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// Кабінет студента
app.get('/student/dashboard', isAuthenticated, isStudent, async (req, res) => {
  try {
    const tests = await Test.find().sort({ createdAt: -1 });
    const results = await Result.find({ student: req.session.user.id }).populate('test').sort({ completedAt: -1 });
    res.render('student/dashboard', { tests, results });
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

app.get('/student/test/:id', isAuthenticated, isStudent, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).send('Тест не знайдено');

    const shuffledTest = test.toObject();
    shuffledTest.questions.sort(() => Math.random() - 0.5);
    res.render('student/test-pass', { test: shuffledTest });
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

app.post('/student/test/:id/submit', isAuthenticated, isStudent, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).send('Тест не знайдено');

    let totalScore = 0;
    let maxScore = 0;
    const reviewList = [];

    test.questions.forEach(q => {
      maxScore += q.points;
      const rawAns = req.body[`q_${q._id}`];
      let isCorrect = false;
      let userDisplayAnswer = 'Немає відповіді';

      if (rawAns) {
        if (q.type === 'single') {
          userDisplayAnswer = rawAns.trim();
          if (q.correctAnswers.includes(userDisplayAnswer)) isCorrect = true;
        } else if (q.type === 'multiple') {
          const userChoices = Array.isArray(rawAns) ? rawAns : [rawAns];
          userDisplayAnswer = userChoices.join(', ');
          if (userChoices.length === q.correctAnswers.length && userChoices.every(c => q.correctAnswers.includes(c))) {
            isCorrect = true;
          }
        } else if (q.type === 'text') {
          userDisplayAnswer = rawAns.trim();
          if (userDisplayAnswer.toLowerCase() === (q.correctAnswers[0] || '').trim().toLowerCase()) {
            isCorrect = true;
          }
        }
      }

      if (isCorrect) totalScore += q.points;

      reviewList.push({
        questionText: q.questionText,
        type: q.type,
        userAnswer: userDisplayAnswer,
        correctAnswers: q.correctAnswers.join(', '),
        isCorrect,
        points: isCorrect ? q.points : 0,
        maxPoints: q.points
      });
    });

    await Result.create({
      student: req.session.user.id,
      test: test._id,
      score: totalScore,
      maxScore
    });

    res.render('student/test-result', { testTitle: test.title, score: totalScore, maxScore, reviewList });
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

// Кабінет викладача
app.get('/teacher/dashboard', isAuthenticated, isTeacher, async (req, res) => {
  try {
    const tests = await Test.find({ author: req.session.user.id }).sort({ createdAt: -1 });
    res.render('teacher/dashboard', { tests });
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

app.get('/teacher/tests/create', isAuthenticated, isTeacher, (req, res) => res.render('teacher/test-create'));

app.post('/teacher/tests/create', isAuthenticated, isTeacher, async (req, res) => {
  const { title, description, timeLimit } = req.body;
  try {
    const newTest = await Test.create({
      title,
      description,
      timeLimit: parseInt(timeLimit) || 0,
      author: req.session.user.id,
      questions: []
    });
    res.redirect(`/teacher/tests/${newTest._id}/questions`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

app.get('/teacher/tests/:id/questions', isAuthenticated, isTeacher, async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.id, author: req.session.user.id });
    if (!test) return res.status(404).send('Тест не знайдено');
    res.render('teacher/question-add', { test });
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

app.post('/teacher/tests/:id/questions', isAuthenticated, isTeacher, async (req, res) => {
  const { questionText, type, points, option1, option2, option3, option4, choiceCorrect, textCorrect } = req.body;
  try {
    const test = await Test.findOne({ _id: req.params.id, author: req.session.user.id });
    if (!test) return res.status(404).send('Тест не знайдено');

    let options = [];
    let correctAnswers = [];

    if (type === 'text') {
      correctAnswers = [textCorrect ? textCorrect.trim() : ''];
    } else {
      options = [option1, option2, option3, option4].map(o => o?.trim()).filter(Boolean);
      correctAnswers = (choiceCorrect || '').split(',').map(a => a.trim()).filter(Boolean);
    }

    test.questions.push({
      questionText,
      type,
      options,
      correctAnswers,
      points: parseInt(points) || 1
    });

    await test.save();
    res.redirect(`/teacher/tests/${test._id}/questions`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

app.post('/teacher/tests/:testId/questions/:qId/delete', isAuthenticated, isTeacher, async (req, res) => {
  try {
    const test = await Test.findOne({ _id: req.params.testId, author: req.session.user.id });
    if (!test) return res.status(404).send('Тест не знайдено');

    test.questions = test.questions.filter(q => q._id.toString() !== req.params.qId);
    await test.save();
    res.redirect(`/teacher/tests/${test._id}/questions`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

app.post('/teacher/tests/:id/delete', isAuthenticated, isTeacher, async (req, res) => {
  try {
    await Test.deleteOne({ _id: req.params.id, author: req.session.user.id });
    res.redirect('/teacher/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

// Статистика та експорт
app.get('/teacher/stats', isAuthenticated, isTeacher, async (req, res) => {
  try {
    const teacherTests = await Test.find({ author: req.session.user.id }).select('_id');
    const testIds = teacherTests.map(t => t._id);

    const results = await Result.find({ test: { $in: testIds } })
      .populate('student', 'fullName username')
      .populate('test', 'title')
      .sort({ completedAt: -1 });

    res.render('teacher/stats', { results });
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

app.get('/teacher/stats/export', isAuthenticated, isTeacher, async (req, res) => {
  try {
    const teacherTests = await Test.find({ author: req.session.user.id }).select('_id');
    const testIds = teacherTests.map(t => t._id);

    const results = await Result.find({ test: { $in: testIds } })
      .populate('student', 'fullName username')
      .populate('test', 'title')
      .sort({ completedAt: -1 });

    let csvContent = '\uFEFF';
    csvContent += 'ПІБ Студента;Логін;Тест;Бал;Макс. Бал;Відсоток;Дата складання\n';

    results.forEach(r => {
      const studentName = r.student ? r.student.fullName : 'Видалений користувач';
      const studentLogin = r.student ? r.student.username : '-';
      const testTitle = r.test ? r.test.title : 'Видалений тест';
      const percent = Math.round((r.score / r.maxScore) * 100) + '%';
      const date = new Date(r.completedAt).toLocaleString('uk-UA');

      csvContent += `"${studentName}";"${studentLogin}";"${testTitle}";${r.score};${r.maxScore};"${percent}";"${date}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="quiz_results.csv"');
    res.send(csvContent);
  } catch (err) {
    console.error(err);
    res.status(500).send('Помилка сервера');
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Сервер запущено на http://localhost:${PORT}`));