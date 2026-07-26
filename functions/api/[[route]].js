// ChapTrack - Complete Backend API
// Single file handling all routes for Cloudflare Pages Functions

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

// ─── Database Initialization ───────────────────────────────────

async function initDB(db) {
  // Use prepare().run() for each statement - D1's recommended approach
  
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      online_class INTEGER DEFAULT 0,
      short_notes INTEGER DEFAULT 0,
      theory_understood INTEGER DEFAULT 0,
      pyq_completed INTEGER DEFAULT 0,
      revision_count INTEGER DEFAULT 0,
      practice_count INTEGER DEFAULT 0,
      exam_count INTEGER DEFAULT 0,
      total_study_time INTEGER DEFAULT 0,
      last_studied_date TEXT,
      last_revised_date TEXT,
      last_practiced_date TEXT,
      last_exam_date TEXT,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      session_date TEXT NOT NULL,
      session_type TEXT DEFAULT 'study',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      subject_id INTEGER,
      chapter_id INTEGER,
      type TEXT DEFAULT 'Study Time',
      due_date TEXT,
      status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      scheduled_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();
}
// ─── Auth Middleware ────────────────────────────────────────────

async function getUserFromToken(db, request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  const user = await db.prepare('SELECT id, email FROM users WHERE id = ?').bind(token).first();
  return user;
}

// ─── Auth Routes ────────────────────────────────────────────────

async function handleRegister(db, body) {
  const { email, password } = body;
  if (!email || !password) return error('Email and password required');
  if (password.length < 4) return error('Password must be at least 4 characters');

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return error('Email already registered', 409);

  const result = await db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').bind(email, password).run();
  
  // Preload default syllabus
  await seedDefaultSyllabus(db, result.meta.last_row_id);

  return json({ success: true, user_id: result.meta.last_row_id, email });
}

async function handleLogin(db, body) {
  const { email, password } = body;
  if (!email || !password) return error('Email and password required');

  const user = await db.prepare('SELECT id, email FROM users WHERE email = ? AND password = ?').bind(email, password).first();
  if (!user) return error('Invalid credentials', 401);

  return json({ success: true, user_id: user.id, email: user.email });
}

// ─── Default Syllabus Seeding ───────────────────────────────────

const DEFAULT_SYLLABUS = {
  'Physics 1st Paper': [
    'Physical World and Measurement', 'Vector', 'Dynamics', 'Newtonian Mechanics',
    'Work, Energy and Power', 'Gravitation and Gravity', 'Structural Properties of Matter',
    'Periodic Motion', 'Waves', 'Ideal Gas and Kinetic Theory of Gases'
  ],
  'Physics 2nd Paper': [
    'Thermodynamics', 'Static Electricity', 'Current Electricity',
    'Magnetic Effects of Electric Current and Magnetism', 'Electromagnetic Induction and Alternating Current',
    'Geometrical Optics', 'Physical Optics', 'Introduction to Modern Physics',
    'Atomic Model and Nuclear Physics', 'Semiconductors and Electronics', 'Astronomy'
  ],
  'Chemistry 1st Paper': [
    'Safe Use of Laboratory', 'Qualitative Chemistry', 'Periodic Properties and Chemical Bonds of Elements',
    'Chemical Changes', 'Applied Chemistry'
  ],
  'Chemistry 2nd Paper': [
    'Environmental Chemistry', 'Organic Chemistry', 'Quantitative Chemistry',
    'Electrochemistry', 'Economic Chemistry'
  ],
  'Higher Mathematics 1st Paper': [
    'Matrix and Determinants', 'Vectors', 'Straight Lines', 'Circles',
    'Permutation and Combination', 'Trigonometric Ratios', 'Trigonometric Ratios of Associated and Compound Angles',
    'Functions and Graphs of Functions', 'Differentiation', 'Integration'
  ],
  'Higher Mathematics 2nd Paper': [
    'Real Numbers and Inequalities', 'Linear Programming', 'Complex Numbers',
    'Polynomial and Polynomial Equations', 'Binomial Expansion', 'Conics',
    'Inverse Trigonometric Functions and Trigonometric Equations', 'Statics',
    'Motion of Particles in a Plane', 'Measures of Dispersion and Probability'
  ],
  'Biology 1st Paper': [
    'Cell and Its Structure', 'Cell Division', 'Cell Chemistry', 'Microorganisms',
    'Algae and Fungi', 'Bryophyta and Pteridophyta', 'Gymnosperms and Angiosperms',
    'Tissue and Tissue System', 'Plant Physiology', 'Plant Reproduction',
    'Biotechnology', 'Environment, Distribution and Conservation of Organisms'
  ],
  'Biology 2nd Paper': [
    'Animal Diversity and Classification', 'Introduction to Animals',
    'Human Physiology - Digestion and Absorption', 'Human Physiology - Blood and Circulation',
    'Human Physiology - Respiration and Breathing', 'Human Physiology - Excretion and Elimination',
    'Human Physiology - Movement and Locomotion', 'Human Physiology - Coordination and Control',
    'Continuity of Human Life', 'Human Body Defense', 'Genetics and Evolution', 'Animal Behavior'
  ]
};

async function seedDefaultSyllabus(db, userId) {
  for (const [subjectName, chapters] of Object.entries(DEFAULT_SYLLABUS)) {
    const subjectResult = await db.prepare('INSERT INTO subjects (user_id, name) VALUES (?, ?)').bind(userId, subjectName).run();
    const subjectId = subjectResult.meta.last_row_id;

    const paperName = subjectName.includes('1st') ? '1st Paper' : '2nd Paper';
    const paperResult = await db.prepare('INSERT INTO papers (subject_id, user_id, name) VALUES (?, ?, ?)').bind(subjectId, userId, paperName).run();
    const paperId = paperResult.meta.last_row_id;

    for (const chapterName of chapters) {
      await db.prepare('INSERT INTO chapters (paper_id, user_id, name) VALUES (?, ?, ?)').bind(paperId, userId, chapterName).run();
    }
  }
}

// ─── Subject Routes ─────────────────────────────────────────────

async function handleGetSubjects(db, userId) {
  const subjects = await db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY name').bind(userId).all();
  return json(subjects.results);
}

async function handleCreateSubject(db, userId, body) {
  const { name } = body;
  if (!name) return error('Subject name required');
  const result = await db.prepare('INSERT INTO subjects (user_id, name) VALUES (?, ?)').bind(userId, name).run();
  return json({ id: result.meta.last_row_id, name });
}

async function handleUpdateSubject(db, userId, id, body) {
  const { name } = body;
  await db.prepare('UPDATE subjects SET name = ? WHERE id = ? AND user_id = ?').bind(name, id, userId).run();
  return json({ success: true });
}

async function handleDeleteSubject(db, userId, id) {
  await db.prepare('DELETE FROM subjects WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return json({ success: true });
}

// ─── Paper Routes ───────────────────────────────────────────────

async function handleGetPapers(db, userId, subjectId) {
  let query = 'SELECT * FROM papers WHERE user_id = ?';
  const params = [userId];
  if (subjectId) {
    query += ' AND subject_id = ?';
    params.push(subjectId);
  }
  query += ' ORDER BY name';
  const papers = await db.prepare(query).bind(...params).all();
  return json(papers.results);
}

async function handleCreatePaper(db, userId, body) {
  const { subject_id, name } = body;
  if (!subject_id || !name) return error('Subject ID and paper name required');
  const result = await db.prepare('INSERT INTO papers (subject_id, user_id, name) VALUES (?, ?, ?)').bind(subject_id, userId, name).run();
  return json({ id: result.meta.last_row_id, name });
}

async function handleUpdatePaper(db, userId, id, body) {
  const { name, subject_id } = body;
  await db.prepare('UPDATE papers SET name = ?, subject_id = ? WHERE id = ? AND user_id = ?').bind(name, subject_id, id, userId).run();
  return json({ success: true });
}

async function handleDeletePaper(db, userId, id) {
  await db.prepare('DELETE FROM papers WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return json({ success: true });
}

// ─── Chapter Routes ─────────────────────────────────────────────

async function handleGetChapters(db, userId, paperId) {
  let query = 'SELECT * FROM chapters WHERE user_id = ?';
  const params = [userId];
  if (paperId) {
    query += ' AND paper_id = ?';
    params.push(paperId);
  }
  query += ' ORDER BY id';
  const chapters = await db.prepare(query).bind(...params).all();
  return json(chapters.results);
}

async function handleGetChapter(db, userId, id) {
  const chapter = await db.prepare('SELECT * FROM chapters WHERE id = ? AND user_id = ?').bind(id, userId).first();
  if (!chapter) return error('Chapter not found', 404);
  return json(chapter);
}

async function handleCreateChapter(db, userId, body) {
  const { paper_id, name } = body;
  if (!paper_id || !name) return error('Paper ID and chapter name required');
  const result = await db.prepare('INSERT INTO chapters (paper_id, user_id, name) VALUES (?, ?, ?)').bind(paper_id, userId, name).run();
  return json({ id: result.meta.last_row_id, name });
}

async function handleUpdateChapter(db, userId, id, body) {
  const allowed = ['name', 'online_class', 'short_notes', 'theory_understood', 'pyq_completed', 
                   'revision_count', 'practice_count', 'exam_count', 'notes', 'paper_id'];
  const updates = [];
  const params = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(body[key]);
    }
  }

  if (updates.length === 0) return error('No fields to update');

  params.push(id, userId);
  await db.prepare(`UPDATE chapters SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).bind(...params).run();
  return json({ success: true });
}

async function handleDeleteChapter(db, userId, id) {
  await db.prepare('DELETE FROM chapters WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return json({ success: true });
}

// ─── Study Session Routes ───────────────────────────────────────

async function handleAddStudySession(db, userId, body) {
  const { chapter_id, duration_minutes, session_type } = body;
  if (!chapter_id || !duration_minutes) return error('Chapter ID and duration required');

  const sessionDate = new Date().toISOString();
  const sessionType = session_type || 'study';

  await db.prepare(
    'INSERT INTO study_sessions (chapter_id, user_id, duration_minutes, session_date, session_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(chapter_id, userId, duration_minutes, sessionDate, sessionType).run();

  // Update chapter totals
  const chapter = await db.prepare('SELECT * FROM chapters WHERE id = ? AND user_id = ?').bind(chapter_id, userId).first();
  if (chapter) {
    const newTotal = chapter.total_study_time + duration_minutes;
    const updates = { total_study_time: newTotal, last_studied_date: sessionDate };
    
    if (sessionType === 'revision') {
      updates.revision_count = chapter.revision_count + 1;
      updates.last_revised_date = sessionDate;
    } else if (sessionType === 'practice') {
      updates.practice_count = chapter.practice_count + 1;
      updates.last_practiced_date = sessionDate;
    } else if (sessionType === 'exam') {
      updates.exam_count = chapter.exam_count + 1;
      updates.last_exam_date = sessionDate;
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    await db.prepare(`UPDATE chapters SET ${setClauses} WHERE id = ? AND user_id = ?`).bind(...values, chapter_id, userId).run();
  }

  return json({ success: true });
}

async function handleGetStudySessions(db, userId, chapterId) {
  let query = 'SELECT * FROM study_sessions WHERE user_id = ?';
  const params = [userId];
  if (chapterId) {
    query += ' AND chapter_id = ?';
    params.push(chapterId);
  }
  query += ' ORDER BY session_date DESC LIMIT 100';
  const sessions = await db.prepare(query).bind(...params).all();
  return json(sessions.results);
}

// ─── Target Routes ──────────────────────────────────────────────

async function handleGetTargets(db, userId) {
  const targets = await db.prepare(
    `SELECT t.*, s.name as subject_name, c.name as chapter_name 
     FROM targets t 
     LEFT JOIN subjects s ON t.subject_id = s.id 
     LEFT JOIN chapters c ON t.chapter_id = c.id 
     WHERE t.user_id = ? 
     ORDER BY t.due_date ASC, t.created_at DESC`
  ).bind(userId).all();
  return json(targets.results);
}

async function handleCreateTarget(db, userId, body) {
  const { title, subject_id, chapter_id, type, due_date } = body;
  if (!title) return error('Title required');
  
  const result = await db.prepare(
    'INSERT INTO targets (user_id, title, subject_id, chapter_id, type, due_date) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, title, subject_id || null, chapter_id || null, type || 'Study Time', due_date || null).run();
  
  return json({ id: result.meta.last_row_id, title });
}

async function handleUpdateTarget(db, userId, id, body) {
  const { status } = body;
  if (status) {
    await db.prepare('UPDATE targets SET status = ? WHERE id = ? AND user_id = ?').bind(status, id, userId).run();
  }
  return json({ success: true });
}

async function handleDeleteTarget(db, userId, id) {
  await db.prepare('DELETE FROM targets WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return json({ success: true });
}

// ─── Notification Routes ────────────────────────────────────────

async function handleGetNotifications(db, userId) {
  const notifications = await db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC LIMIT 50'
  ).bind(userId).all();
  return json(notifications.results);
}

async function handleCreateNotification(db, userId, body) {
  const { title, message, scheduled_at, is_pinned } = body;
  if (!title) return error('Title required');
  
  const result = await db.prepare(
    'INSERT INTO notifications (user_id, title, message, scheduled_at, is_pinned) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, title, message || '', scheduled_at || null, is_pinned ? 1 : 0).run();
  
  return json({ id: result.meta.last_row_id, title });
}

async function handleMarkNotificationRead(db, userId, id) {
  await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return json({ success: true });
}

async function handleDeleteNotification(db, userId, id) {
  await db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return json({ success: true });
}

// ─── Dashboard / Insights ───────────────────────────────────────

async function handleGetDashboard(db, userId) {
  const subjects = await db.prepare('SELECT * FROM subjects WHERE user_id = ?').bind(userId).all();
  const papers = await db.prepare('SELECT * FROM papers WHERE user_id = ?').bind(userId).all();
  const chapters = await db.prepare('SELECT * FROM chapters WHERE user_id = ?').bind(userId).all();
  const sessions = await db.prepare(
    "SELECT * FROM study_sessions WHERE user_id = ? AND session_date >= date('now', '-30 days') ORDER BY session_date DESC"
  ).bind(userId).all();
  const targets = await db.prepare('SELECT * FROM targets WHERE user_id = ?').bind(userId).all();

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  let todayMinutes = 0, weekMinutes = 0, monthMinutes = 0;
  for (const s of sessions.results) {
    monthMinutes += s.duration_minutes;
    if (s.session_date >= weekAgo) weekMinutes += s.duration_minutes;
    if (s.session_date.startsWith(today)) todayMinutes += s.duration_minutes;
  }

  const totalChapters = chapters.results.length;
  const startedChapters = chapters.results.filter(c => 
    c.online_class || c.short_notes || c.theory_understood || c.pyq_completed || 
    c.total_study_time > 0 || c.revision_count > 0 || c.practice_count > 0 || c.exam_count > 0
  ).length;
  const completedChapters = chapters.results.filter(c => 
    c.online_class && c.short_notes && c.theory_understood && c.pyq_completed && c.revision_count >= 2
  ).length;

  return json({
    today_study_time: todayMinutes,
    weekly_study_time: weekMinutes,
    monthly_study_time: monthMinutes,
    total_chapters: totalChapters,
    started_chapters: startedChapters,
    completed_chapters: completedChapters,
    completion_percent: totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0,
    total_targets: targets.results.length,
    pending_targets: targets.results.filter(t => t.status === 'Pending').length,
    completed_targets: targets.results.filter(t => t.status === 'Completed').length,
    missed_targets: targets.results.filter(t => t.status === 'Missed').length,
  });
}

async function handleGetInsights(db, userId) {
  const chapters = await db.prepare('SELECT c.*, p.name as paper_name, s.name as subject_name FROM chapters c JOIN papers p ON c.paper_id = p.id JOIN subjects s ON p.subject_id = s.id WHERE c.user_id = ?').bind(userId).all();
  const chaps = chapters.results;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const neverStudied = chaps.filter(c => c.total_study_time === 0);
  const neverRevised = chaps.filter(c => c.revision_count === 0);
  const neverPracticed = chaps.filter(c => c.practice_count === 0);
  const neverTested = chaps.filter(c => c.exam_count === 0);

  const notStudied7d = chaps.filter(c => !c.last_studied_date || c.last_studied_date < sevenDaysAgo);
  const notStudied15d = chaps.filter(c => !c.last_studied_date || c.last_studied_date < fifteenDaysAgo);
  const notStudied30d = chaps.filter(c => !c.last_studied_date || c.last_studied_date < thirtyDaysAgo);

  const sortedByStudy = [...chaps].sort((a, b) => a.total_study_time - b.total_study_time);
  const sortedByRevision = [...chaps].sort((a, b) => a.revision_count - b.revision_count);
  const sortedByPractice = [...chaps].sort((a, b) => a.practice_count - b.practice_count);
  const sortedByExam = [...chaps].sort((a, b) => a.exam_count - b.exam_count);

  return json({
    least_studied: sortedByStudy.slice(0, 5),
    most_studied: sortedByStudy.reverse().slice(0, 5),
    least_revised: sortedByRevision.slice(0, 5),
    most_revised: sortedByRevision.reverse().slice(0, 5),
    least_practiced: sortedByPractice.slice(0, 5),
    most_practiced: sortedByPractice.reverse().slice(0, 5),
    least_tested: sortedByExam.slice(0, 5),
    most_tested: sortedByExam.reverse().slice(0, 5),
    never_studied: neverStudied.slice(0, 10),
    never_revised: neverRevised.slice(0, 10),
    never_practiced: neverPracticed.slice(0, 10),
    never_tested: neverTested.slice(0, 10),
    not_studied_7d: notStudied7d.length,
    not_studied_15d: notStudied15d.length,
    not_studied_30d: notStudied30d.length,
    avg_revision: chaps.length > 0 ? Math.round(chaps.reduce((s, c) => s + c.revision_count, 0) / chaps.length * 10) / 10 : 0,
    avg_practice: chaps.length > 0 ? Math.round(chaps.reduce((s, c) => s + c.practice_count, 0) / chaps.length * 10) / 10 : 0,
    avg_exam: chaps.length > 0 ? Math.round(chaps.reduce((s, c) => s + c.exam_count, 0) / chaps.length * 10) / 10 : 0,
  });
}

async function handleGetSubjectStats(db, userId, subjectId) {
  const subject = await db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').bind(subjectId, userId).first();
  if (!subject) return error('Subject not found', 404);

  const papers = await db.prepare('SELECT * FROM papers WHERE subject_id = ? AND user_id = ?').bind(subjectId, userId).all();
  let allChapters = [];
  for (const paper of papers.results) {
    const chapters = await db.prepare('SELECT * FROM chapters WHERE paper_id = ? AND user_id = ?').bind(paper.id, userId).all();
    allChapters = allChapters.concat(chapters.results);
  }

  const total = allChapters.length;
  const started = allChapters.filter(c => c.online_class || c.short_notes || c.theory_understood || c.total_study_time > 0).length;
  const completed = allChapters.filter(c => c.online_class && c.short_notes && c.theory_understood && c.pyq_completed && c.revision_count >= 2).length;
  const totalTime = allChapters.reduce((s, c) => s + c.total_study_time, 0);
  const totalRevisions = allChapters.reduce((s, c) => s + c.revision_count, 0);
  const totalPractice = allChapters.reduce((s, c) => s + c.practice_count, 0);
  const totalExams = allChapters.reduce((s, c) => s + c.exam_count, 0);

  return json({
    subject: subject,
    total_chapters: total,
    started_chapters: started,
    completed_chapters: completed,
    completion_percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    total_study_time: totalTime,
    total_revisions: totalRevisions,
    total_practice: totalPractice,
    total_exams: totalExams,
    papers: papers.results.map(p => ({
      ...p,
      chapter_count: allChapters.filter(c => c.paper_id === p.id).length
    }))
  });
}

// ─── Backup Routes ──────────────────────────────────────────────

async function handleExportData(db, userId, format) {
  const subjects = await db.prepare('SELECT * FROM subjects WHERE user_id = ?').bind(userId).all();
  const papers = await db.prepare('SELECT * FROM papers WHERE user_id = ?').bind(userId).all();
  const chapters = await db.prepare('SELECT * FROM chapters WHERE user_id = ?').bind(userId).all();
  const sessions = await db.prepare('SELECT * FROM study_sessions WHERE user_id = ?').bind(userId).all();
  const targets = await db.prepare('SELECT * FROM targets WHERE user_id = ?').bind(userId).all();

  const data = { subjects: subjects.results, papers: papers.results, chapters: chapters.results, sessions: sessions.results, targets: targets.results };

  if (format === 'txt') {
    let txt = 'CHAPTRACK DATA EXPORT\n====================\n\n';
    txt += 'SUBJECTS:\n---------\n';
    for (const s of subjects.results) txt += `  - ${s.name}\n`;
    txt += '\nCHAPTERS:\n---------\n';
    for (const c of chapters.results) txt += `  - ${c.name} | Study: ${c.total_study_time}min | Rev: ${c.revision_count} | Prac: ${c.practice_count} | Exam: ${c.exam_count}\n`;
    txt += '\nTARGETS:\n--------\n';
    for (const t of targets.results) txt += `  - [${t.status}] ${t.title}\n`;
    return new Response(txt, { headers: { 'Content-Type': 'text/plain', ...corsHeaders } });
  }

  return json(data);
}

// ─── Search ─────────────────────────────────────────────────────

async function handleSearch(db, userId, query) {
  const q = `%${query}%`;
  const subjects = await db.prepare('SELECT * FROM subjects WHERE user_id = ? AND name LIKE ?').bind(userId, q).all();
  const chapters = await db.prepare(
    `SELECT c.*, p.name as paper_name, s.name as subject_name 
     FROM chapters c 
     JOIN papers p ON c.paper_id = p.id 
     JOIN subjects s ON p.subject_id = s.id 
     WHERE c.user_id = ? AND c.name LIKE ?`
  ).bind(userId, q).all();
  return json({ subjects: subjects.results, chapters: chapters.results });
}

// ─── Main Router ────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await initDB(db);

    // Public routes
    if (request.method === 'POST' && path === 'auth/register') {
      return handleRegister(db, await request.json());
    }
    if (request.method === 'POST' && path === 'auth/login') {
      return handleLogin(db, await request.json());
    }

    // Protected routes
    const user = await getUserFromToken(db, request);
    if (!user) return error('Authentication required', 401);
    const userId = user.id;

    // Subjects
    if (request.method === 'GET' && path === 'subjects') return handleGetSubjects(db, userId);
    if (request.method === 'POST' && path === 'subjects') return handleCreateSubject(db, userId, await request.json());
    if (request.method === 'PUT' && path.match(/^subjects\/(\d+)$/)) return handleUpdateSubject(db, userId, path.match(/^subjects\/(\d+)$/)[1], await request.json());
    if (request.method === 'DELETE' && path.match(/^subjects\/(\d+)$/)) return handleDeleteSubject(db, userId, path.match(/^subjects\/(\d+)$/)[1]);

    // Papers
    if (request.method === 'GET' && path === 'papers') return handleGetPapers(db, userId, url.searchParams.get('subject_id'));
    if (request.method === 'POST' && path === 'papers') return handleCreatePaper(db, userId, await request.json());
    if (request.method === 'PUT' && path.match(/^papers\/(\d+)$/)) return handleUpdatePaper(db, userId, path.match(/^papers\/(\d+)$/)[1], await request.json());
    if (request.method === 'DELETE' && path.match(/^papers\/(\d+)$/)) return handleDeletePaper(db, userId, path.match(/^papers\/(\d+)$/)[1]);

    // Chapters
    if (request.method === 'GET' && path === 'chapters') return handleGetChapters(db, userId, url.searchParams.get('paper_id'));
    if (request.method === 'GET' && path.match(/^chapters\/(\d+)$/)) return handleGetChapter(db, userId, path.match(/^chapters\/(\d+)$/)[1]);
    if (request.method === 'POST' && path === 'chapters') return handleCreateChapter(db, userId, await request.json());
    if (request.method === 'PUT' && path.match(/^chapters\/(\d+)$/)) return handleUpdateChapter(db, userId, path.match(/^chapters\/(\d+)$/)[1], await request.json());
    if (request.method === 'DELETE' && path.match(/^chapters\/(\d+)$/)) return handleDeleteChapter(db, userId, path.match(/^chapters\/(\d+)$/)[1]);

    // Study Sessions
    if (request.method === 'GET' && path === 'sessions') return handleGetStudySessions(db, userId, url.searchParams.get('chapter_id'));
    if (request.method === 'POST' && path === 'sessions') return handleAddStudySession(db, userId, await request.json());

    // Targets
    if (request.method === 'GET' && path === 'targets') return handleGetTargets(db, userId);
    if (request.method === 'POST' && path === 'targets') return handleCreateTarget(db, userId, await request.json());
    if (request.method === 'PUT' && path.match(/^targets\/(\d+)$/)) return handleUpdateTarget(db, userId, path.match(/^targets\/(\d+)$/)[1], await request.json());
    if (request.method === 'DELETE' && path.match(/^targets\/(\d+)$/)) return handleDeleteTarget(db, userId, path.match(/^targets\/(\d+)$/)[1]);

    // Notifications
    if (request.method === 'GET' && path === 'notifications') return handleGetNotifications(db, userId);
    if (request.method === 'POST' && path === 'notifications') return handleCreateNotification(db, userId, await request.json());
    if (request.method === 'PUT' && path.match(/^notifications\/(\d+)\/read$/)) return handleMarkNotificationRead(db, userId, path.match(/^notifications\/(\d+)\/read$/)[1]);
    if (request.method === 'DELETE' && path.match(/^notifications\/(\d+)$/)) return handleDeleteNotification(db, userId, path.match(/^notifications\/(\d+)$/)[1]);

    // Dashboard & Insights
    if (request.method === 'GET' && path === 'dashboard') return handleGetDashboard(db, userId);
    if (request.method === 'GET' && path === 'insights') return handleGetInsights(db, userId);
    if (request.method === 'GET' && path.match(/^subjects\/(\d+)\/stats$/)) return handleGetSubjectStats(db, userId, path.match(/^subjects\/(\d+)\/stats$/)[1]);

    // Search
    if (request.method === 'GET' && path === 'search') return handleSearch(db, userId, url.searchParams.get('q'));

    // Export
    if (request.method === 'GET' && path === 'export') return handleExportData(db, userId, url.searchParams.get('format') || 'json');

    return error('Route not found', 404);

  } catch (e) {
    return error(e.message, 500);
  }
}
