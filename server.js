const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const XLSX = require('xlsx');

const app = express();

// ═══════════════════════════════════════════════════════════════
//  CLOUD DEPLOYMENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const DEFAULT_PORT = 3000;
const PORT = process.env.PORT || DEFAULT_PORT;
const HOST = process.env.HOST || '0.0.0.0';

// Deployment mode detection
// - 'local': running on developer's machine/LAN (shows local IP)
// - 'cloud': running on cloud host (shows PUBLIC_URL or auto-detected URL)
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || (process.env.PUBLIC_URL ? 'cloud' : 'auto');
const PUBLIC_URL = process.env.PUBLIC_URL || null; // e.g., https://myapp.railway.app

// Teacher password (default: can be changed)
// Password is stored in data/config.json for persistence
const DEFAULT_PASSWORD = 'Villa_584672913';

// Config file path
const isPkg = typeof process.pkg !== 'undefined';
const APP_DIR = isPkg ? path.dirname(process.execPath) : __dirname;
const DATA_DIR = path.join(APP_DIR, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Load config or create default
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            // Ensure deployment-related fields exist
            if (typeof config.deploymentMode === 'undefined') config.deploymentMode = 'auto';
            if (typeof config.publicUrl === 'undefined') config.publicUrl = '';
            if (typeof config.serverName === 'undefined') config.serverName = '';
            return config;
        }
    } catch (e) {
        console.error('Error loading config:', e);
    }
    // Default config
    return {
        teacherPassword: DEFAULT_PASSWORD,
        deploymentMode: 'auto',
        publicUrl: '',
        serverName: ''
    };
}

// Save config
function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Get current teacher password
function getTeacherPassword() {
    return loadConfig().teacherPassword || DEFAULT_PASSWORD;
}

// Set teacher password
function setTeacherPassword(newPassword) {
    const config = loadConfig();
    config.teacherPassword = newPassword;
    saveConfig(config);
}

// Security middleware
const helmet = require('helmet');
app.use(helmet({
    contentSecurityPolicy: false, // We'll set custom CSP if needed
}));

app.use(express.json());
app.use(express.text({ type: '*/*' })); // for sendBeacon (text/plain)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: function (res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Root → Student portal
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'student', 'index.html'));
});

// Teacher route
app.get('/teacher', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.sendFile(path.join(__dirname, 'public', 'teacher', 'index.html'));
});

// Teacher login API
app.post('/api/teacher/login', (req, res) => {
    const { password } = req.body;
    if (password === getTeacherPassword()) {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

// Change teacher password API
app.post('/api/teacher/change-password', (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (currentPassword !== getTeacherPassword()) {
        return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }
    if (!newPassword || newPassword.length < 3) {
        return res.status(400).json({ success: false, error: 'New password must be at least 3 characters' });
    }
    // Save the new password to config file for persistence
    setTeacherPassword(newPassword);
    res.json({ success: true, message: 'Password changed successfully and saved permanently.' });
});

// ─────────────────────────────────────────
//  DATA SETUP
// ─────────────────────────────────────────
// When running as a pkg .exe, __dirname is inside the read-only snapshot.
// Writable data files must live next to the .exe on the real filesystem.
// Note: isPkg and DATA_DIR are already defined at the top of the file
const EXAMS_FILE = path.join(DATA_DIR, 'exams.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EXAMS_FILE)) fs.writeFileSync(EXAMS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(SUBMISSIONS_FILE)) fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ATTENDANCE_FILE)) fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify([], null, 2));

const readExams = () => JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
const writeExams = (data) => fs.writeFileSync(EXAMS_FILE, JSON.stringify(data, null, 2));
const readSubmissions = () => JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
const writeSubmissions = (data) => fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(data, null, 2));
const readAttendance = () => JSON.parse(fs.readFileSync(ATTENDANCE_FILE, 'utf8'));
const writeAttendance = (data) => fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(data, null, 2));

// In-memory live students: { examId: { studentId: {...} } }
let liveStudents = {};

// In-memory violations: { `${examId}_${studentId}`: { ...info, status: 'pending'|'allowed'|'force_submit' } }
let pendingViolations = {};

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// Get the display URL based on deployment mode and configuration
function getDisplayUrl() {
    const config = loadConfig();

    // If PUBLIC_URL env var is set, use it directly
    if (PUBLIC_URL) {
        return PUBLIC_URL.replace(/\/$/, ''); // Remove trailing slash
    }

    // If config has a custom publicUrl, use it
    if (config.publicUrl && config.publicUrl.trim()) {
        return config.publicUrl.replace(/\/$/, '');
    }

    // Auto-detect cloud platforms via common environment variables
    const isCloudEnv =
        process.env.RAILWAY_SERVICE_ID ||
        process.env.RENDER_SERVICE_ID ||
        process.env.VERCEL_URL ||
        process.env.NITRO_PRESET ||
        process.env.HEROKU_APP_NAME ||
        process.env.FLY_APP_NAME;

    if (DEPLOYMENT_MODE === 'cloud' || (DEPLOYMENT_MODE === 'auto' && isCloudEnv)) {
        // In cloud mode, try to construct URL from cloud-provided env vars
        if (process.env.VERCEL_URL) {
            return `https://${process.env.VERCEL_URL}`;
        }
        if (process.env.RAILWAY_PUBLIC_DOMAIN) {
            return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
        }
        if (process.env.RENDER_EXTERNAL_URL) {
            return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
        }
        if (process.env.HEROKU_APP_NAME) {
            return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
        }
        if (process.env.FLY_APP_NAME && process.env.FLY_REGION) {
            return `https://${process.env.FLY_APP_NAME}.${process.env.FLY_REGION}.fly.dev`;
        }
        // Generic fallback: show localhost with note
        return `http://localhost:${PORT} (configure PUBLIC_URL for proper cloud access)`;
    }

    // Local mode: show local IP
    const localIP = getLocalIP();
    return `http://${localIP}:${PORT}`;
}

// Health check endpoint for cloud platforms
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mode: DEPLOYMENT_MODE === 'cloud' || (DEPLOYMENT_MODE === 'auto' && (process.env.RAILWAY_SERVICE_ID || process.env.RENDER_SERVICE_ID || process.env.VERCEL_URL))
            ? 'cloud' : 'local'
    });
});

// API endpoint to get server info (display URL, mode, etc.)
app.get('/api/server-info', (req, res) => {
    const config = loadConfig();
    const displayUrl = getDisplayUrl();
    const isCloud = DEPLOYMENT_MODE === 'cloud' || (DEPLOYMENT_MODE === 'auto' && (process.env.RAILWAY_SERVICE_ID || process.env.RENDER_SERVICE_ID || process.env.VERCEL_URL));

    res.json({
        displayUrl: displayUrl,
        mode: isCloud ? 'cloud' : 'local',
        port: PORT,
        publicUrl: PUBLIC_URL || config.publicUrl || null,
        deploymentMode: DEPLOYMENT_MODE,
        serverName: config.serverName || ''
    });
});

// Graceful shutdown
let server;
function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    if (server) {
        server.close(() => {
            console.log('Server closed. Goodbye!');
            process.exit(0);
        });
        // Force shutdown after 10 seconds
        setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─────────────────────────────────────────
//  SHUFFLE HELPER (Fisher-Yates)
// ─────────────────────────────────────────
function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ─────────────────────────────────────────
//  GRADING HELPER
//  answerMap (optional): [{ question, type, answer }] — used when questions were shuffled
// ─────────────────────────────────────────
function gradeExam(exam, answers, answerMap) {
    let score = 0;
    const questions = answerMap || exam.questions.map(q => ({ question: q.question, type: q.type, answer: q.answer }));
    const gradedAnswers = questions.map((q, i) => {
        const studentAnswer = (answers[i] !== undefined && answers[i] !== null)
            ? String(answers[i]).trim() : '';
        let correct = false;
        if (q.type === 'identification') {
            // Support multiple accepted answers (array) or single answer (string)
            const acceptedAnswers = Array.isArray(q.answer)
                ? q.answer.map(a => String(a).trim().toLowerCase()).filter(a => a !== '')
                : [String(q.answer).trim().toLowerCase()];
            correct = acceptedAnswers.includes(studentAnswer.toLowerCase());
        } else if (q.type === 'truefalse') {
            correct = studentAnswer.toLowerCase() === String(q.answer).trim().toLowerCase();
        } else {
            correct = studentAnswer === String(q.answer).trim();
        }
        if (correct) score++;
        // For display: show all accepted answers joined by " / "
        const correctAnswerDisplay = Array.isArray(q.answer)
            ? q.answer.filter(a => String(a).trim() !== '').join(' / ')
            : q.answer;
        return { question: q.question, type: q.type, studentAnswer, correctAnswer: correctAnswerDisplay, correct };
    });
    const totalItems = questions.length;
    const percentage = totalItems > 0 ? Math.round((score / totalItems) * 100) : 0;
    return { score, totalItems, percentage, gradedAnswers };
}

// ─────────────────────────────────────────
//  TEACHER API — EXAMS
// ─────────────────────────────────────────

// Get all exams
app.get('/api/exams', (req, res) => {
    const exams = readExams();
    const submissions = readSubmissions();
    const result = exams.map(e => {
        const examSubmissions = submissions.filter(s => s.examId === e.id);
        return {
            ...e,
            submissionCount: examSubmissions.length,
            liveCount: Object.keys(liveStudents[e.id] || {}).length,
            maxStudents: e.maxStudents || 0, // 0 means no limit
            remainingSlots: e.maxStudents > 0 ? Math.max(0, e.maxStudents - examSubmissions.length) : null
        };
    });
    res.json(result);
});

// Get single exam (with answers) for teacher editing
app.get('/api/exams/:id', (req, res) => {
    const exam = readExams().find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    res.json(exam);
});

// Create new exam
app.post('/api/exam/create', (req, res) => {
    const { title, timeLimit, questions, maxStudents, questionMode, timePerQuestion } = req.body;
    if (!title || !questions || questions.length === 0)
        return res.status(400).json({ error: 'Exam title and at least one question are required.' });

    const exams = readExams();
    if (exams.find(e => e.title.toLowerCase() === title.trim().toLowerCase()))
        return res.status(400).json({ error: 'An exam with this code already exists. Use a different title.' });

    const newExam = {
        id: Date.now().toString(),
        title: title.trim(),
        timeLimit: parseInt(timeLimit) || 60,
        maxStudents: parseInt(maxStudents) || 0, // 0 means no limit
        questionMode: questionMode || 'scroll',          // 'scroll' | 'one-by-one'
        timePerQuestion: parseInt(timePerQuestion) || 30, // seconds per question (one-by-one mode)
        questions,
        active: false,
        createdAt: new Date().toISOString()
    };
    exams.push(newExam);
    writeExams(exams);
    res.json({ success: true, message: `Exam "${newExam.title}" created! Activate it so students can access it.`, exam: newExam });
});

// Duplicate exam
app.post('/api/exams/:id/duplicate', (req, res) => {
    const exams = readExams();
    const exam = exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    // Generate a unique title: "Title (Copy)", "Title (Copy 2)", etc.
    let newTitle = exam.title + ' (Copy)';
    let counter = 2;
    while (exams.find(e => e.title.toLowerCase() === newTitle.toLowerCase())) {
        newTitle = exam.title + ' (Copy ' + counter + ')';
        counter++;
    }

    const duplicate = {
        id: Date.now().toString(),
        title: newTitle,
        timeLimit: exam.timeLimit,
        maxStudents: exam.maxStudents || 0,
        questionMode: exam.questionMode || 'scroll',
        timePerQuestion: exam.timePerQuestion || 30,
        questions: JSON.parse(JSON.stringify(exam.questions)), // deep copy
        active: false,
        createdAt: new Date().toISOString()
    };
    exams.push(duplicate);
    writeExams(exams);
    res.json({ success: true, message: `Exam duplicated as "${newTitle}". You can rename and edit it.`, exam: duplicate });
});

// Toggle exam active/inactive
app.post('/api/exams/:id/toggle', (req, res) => {
    const exams = readExams();
    const idx = exams.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Exam not found.' });
    exams[idx].active = !exams[idx].active;
    writeExams(exams);
    const status = exams[idx].active ? 'ACTIVE' : 'INACTIVE';
    res.json({ success: true, active: exams[idx].active, message: `Exam is now ${status}.` });
});

// Update existing exam
app.put('/api/exams/:id', (req, res) => {
    const { title, timeLimit, questions, maxStudents, questionMode, timePerQuestion } = req.body;
    if (!title || !questions || questions.length === 0)
        return res.status(400).json({ error: 'Exam title and at least one question are required.' });

    const exams = readExams();
    const idx = exams.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Exam not found.' });

    const dup = exams.find((e, i) => i !== idx && e.title.toLowerCase() === title.trim().toLowerCase());
    if (dup) return res.status(400).json({ error: 'Another exam with this code already exists.' });

    exams[idx] = { 
        ...exams[idx], 
        title: title.trim(), 
        timeLimit: parseInt(timeLimit) || 60, 
        maxStudents: parseInt(maxStudents) || 0,
        questionMode: questionMode || 'scroll',
        timePerQuestion: parseInt(timePerQuestion) || 30,
        questions, 
        updatedAt: new Date().toISOString() 
    };
    writeExams(exams);
    res.json({ success: true, message: 'Exam updated successfully!' });
});

// Delete exam
app.delete('/api/exams/:id', (req, res) => {
    const exams = readExams();
    const idx = exams.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Exam not found.' });
    exams.splice(idx, 1);
    writeExams(exams);
    const submissions = readSubmissions();
    writeSubmissions(submissions.filter(s => s.examId !== req.params.id));
    delete liveStudents[req.params.id];
    res.json({ success: true, message: 'Exam deleted.' });
});

// ─────────────────────────────────────────
//  TEACHER API — RESULTS
// ─────────────────────────────────────────

app.get('/api/results', (req, res) => {
    let subs = readSubmissions();
    if (req.query.examId) subs = subs.filter(s => s.examId === req.query.examId);
    subs.sort((a, b) => a.lastName.toLowerCase().localeCompare(b.lastName.toLowerCase()));
    res.json(subs);
});

// Delete a single submission by id
app.delete('/api/results/:id', (req, res) => {
    let subs = readSubmissions();
    const idx = subs.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Submission not found.' });
    subs.splice(idx, 1);
    writeSubmissions(subs);
    res.json({ success: true, message: 'Result deleted.' });
});

app.post('/api/results/clear', (req, res) => {
    const { examId } = req.body;
    let subs = readSubmissions();
    if (examId) subs = subs.filter(s => s.examId !== examId);
    else subs = [];
    writeSubmissions(subs);
    res.json({ success: true, message: 'Results cleared.' });
});

app.get('/api/export', (req, res) => {
    let subs = readSubmissions();
    const exams = readExams();
    if (req.query.examId) subs = subs.filter(s => s.examId === req.query.examId);
    if (subs.length === 0) return res.status(400).json({ error: 'No submissions to export.' });

    subs.sort((a, b) => a.lastName.toLowerCase().localeCompare(b.lastName.toLowerCase()));

    const wb = XLSX.utils.book_new();

    const summaryData = subs.map((s, i) => ({
        'No.': i + 1,
        'Last Name': s.lastName,
        'First Name': s.firstName,
        'Student ID': s.studentId,
        'Exam Code': s.examTitle || '',
        'Score': s.score,
        'Total Items': s.totalItems,
        'Percentage': `${s.percentage}%`,
        'Violation': s.violation ? '⚠️ YES' : 'No',
        'Auto-Submitted': s.autoSubmitted ? 'Yes (exited)' : 'No',
        'Submitted At': new Date(s.submittedAt).toLocaleString()
    }));
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    const detailRows = [];
    subs.forEach(s => {
        s.answers.forEach((a, i) => {
            detailRows.push({
                'Student': `${s.lastName}, ${s.firstName}`,
                'Student ID': s.studentId,
                'Exam': s.examTitle || '',
                'Q#': i + 1,
                'Type': a.type.toUpperCase(),
                'Question': a.question,
                'Student Answer': a.studentAnswer,
                'Correct Answer': a.correctAnswer,
                'Result': a.correct ? 'CORRECT' : 'WRONG'
            });
        });
    });
    const ws2 = XLSX.utils.json_to_sheet(detailRows);
    ws2['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 18 }, { wch: 5 }, { wch: 15 }, { wch: 40 }, { wch: 25 }, { wch: 25 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Detailed Answers');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const examTitle = req.query.examId ? (exams.find(e => e.id === req.query.examId) || {}).title || 'Exam' : 'All_Exams';
    const filename = `${examTitle.replace(/[^a-z0-9]/gi, '_')}_Results_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

// ─────────────────────────────────────────
//  VIOLATION API
// ─────────────────────────────────────────

// Student reports a violation
app.post('/api/violations/report', (req, res) => {
    const { studentId, firstName, lastName, examId, violationType } = req.body;
    if (!studentId || !examId) return res.status(400).json({ error: 'Missing info.' });
    const exams = readExams();
    const exam = exams.find(e => e.id === examId);
    const key = `${examId}_${studentId}`;
    if (!pendingViolations[key]) {
        pendingViolations[key] = {
            studentId, firstName, lastName, examId,
            examTitle: exam ? exam.title : '',
            violationType: violationType || 'unknown',
            violationCount: 1,
            timestamp: new Date().toISOString(),
            status: 'pending'
        };
    } else {
        pendingViolations[key].violationCount++;
        pendingViolations[key].violationType = violationType || pendingViolations[key].violationType;
        pendingViolations[key].timestamp = new Date().toISOString();
        pendingViolations[key].status = 'pending'; // reset to pending for teacher to re-decide
    }
    res.json({ success: true });
});

// Teacher gets all pending violations
app.get('/api/violations/pending', (req, res) => {
    const list = Object.values(pendingViolations).filter(v => v.status === 'pending');
    res.json(list);
});

// Teacher resolves a violation: action = 'allow' | 'force_submit'
app.post('/api/violations/resolve', (req, res) => {
    const { studentId, examId, action } = req.body;
    const key = `${examId}_${studentId}`;
    if (!pendingViolations[key]) return res.status(404).json({ error: 'Violation not found.' });
    pendingViolations[key].status = action === 'allow' ? 'allowed' : 'force_submit';
    res.json({ success: true, action, studentId, examId });
});

// Student polls for teacher's decision
app.get('/api/violations/check', (req, res) => {
    const { studentId, examId } = req.query;
    const key = `${examId}_${studentId}`;
    const v = pendingViolations[key];
    if (!v) return res.json({ status: 'none' });
    res.json({ status: v.status });
});

app.get('/api/students/live', (req, res) => {
    const examId = req.query.examId;
    if (examId) return res.json(Object.values(liveStudents[examId] || {}));
    const all = [];
    Object.values(liveStudents).forEach(g => all.push(...Object.values(g)));
    res.json(all);
});

// ─────────────────────────────────────────
//  STUDENT API
// ─────────────────────────────────────────

// Get exam by code (exam title, case-insensitive)
app.get('/api/exam/code/:code', (req, res) => {
    const exams = readExams();
    const exam = exams.find(e => e.title.toLowerCase() === decodeURIComponent(req.params.code).toLowerCase().trim());
    if (!exam) return res.status(404).json({ error: 'Invalid exam code. Please check and try again.' });
    if (exam.active === false) return res.status(403).json({ error: 'This exam is not active yet. Please wait for your teacher to activate it.' });
    
    // Check online student limit (liveStudents count, not submissions)
    const currentOnline = Object.keys(liveStudents[exam.id] || {}).length;
    if (exam.maxStudents > 0 && currentOnline >= exam.maxStudents) {
        return res.status(403).json({
            error: 'capacity_exceeded',
            maxStudents: exam.maxStudents,
            currentOnline: currentOnline,
            message: `This exam is currently full (${currentOnline}/${exam.maxStudents} students online). Please go to your teacher to increase the student limit.`
        });
    }
    
    // Shuffle questions so each student gets a different order
    const shuffled = shuffleArray(exam.questions).map((q, i) => ({
        id: i, type: q.type, question: q.question, options: q.options ? shuffleArray(q.options) : null, _origAnswer: q.answer
    }));

    // Re-map MCQ answer letter to match shuffled options
    const questionsForStudent = shuffled.map(q => {
        if (q.type === 'mcq' && q.options && q._origAnswer) {
            // Find which new index the correct option is at
            const origOptions = exam.questions.find(orig => orig.question === q.question).options;
            const correctText = origOptions[['A','B','C','D'].indexOf(q._origAnswer)];
            const newIdx = q.options.indexOf(correctText);
            const newAnswer = ['A','B','C','D'][newIdx];
            return { id: q.id, type: q.type, question: q.question, options: q.options, _answer: newAnswer };
        }
        return { id: q.id, type: q.type, question: q.question, options: q.options, _answer: q._origAnswer };
    });

    res.json({
        id: exam.id,
        title: exam.title,
        timeLimit: exam.timeLimit,
        totalQuestions: exam.questions.length,
        maxStudents: exam.maxStudents,
        currentOnline: currentOnline,
        remainingSlots: exam.maxStudents > 0 ? Math.max(0, exam.maxStudents - currentOnline) : null,
        questionMode: exam.questionMode || 'scroll',
        timePerQuestion: exam.timePerQuestion || 30,
        questions: questionsForStudent.map(q => ({ id: q.id, type: q.type, question: q.question, options: q.options || null })),
        // _answerMap: full details for server-side grading after shuffle
        _answerMap: questionsForStudent.map(q => ({ question: q.question, type: q.type, answer: q._answer }))
    });
});

// Student joins
app.post('/api/students/join', (req, res) => {
    const { studentId, firstName, lastName, examId } = req.body;
    if (!studentId || !firstName || !lastName || !examId)
        return res.status(400).json({ error: 'Missing student information.' });

    const exams = readExams();
    const exam = exams.find(e => e.id === examId);

    // Check if student already submitted this exam (server-side, cross-device enforcement)
    const submissions = readSubmissions();
    const alreadySubmitted = submissions.find(s =>
        s.examId === examId &&
        s.firstName.toLowerCase() === firstName.toLowerCase() &&
        s.lastName.toLowerCase() === lastName.toLowerCase()
    );
    if (alreadySubmitted) {
        return res.status(400).json({
            error: 'already_submitted',
            message: 'You have already submitted this exam.',
            examTitle: alreadySubmitted.examTitle || '',
            studentName: alreadySubmitted.lastName + ', ' + alreadySubmitted.firstName,
            submittedAt: new Date(alreadySubmitted.submittedAt).toLocaleString()
        });
    }

    // Check online student limit (liveStudents count)
    if (exam && exam.maxStudents > 0) {
        const currentOnline = Object.keys(liveStudents[examId] || {}).length;
        if (currentOnline >= exam.maxStudents) {
            return res.status(403).json({
                error: 'capacity_exceeded',
                maxStudents: exam.maxStudents,
                currentOnline: currentOnline,
                message: `This exam is currently full (${currentOnline}/${exam.maxStudents} students online). Please go to your teacher to increase the student limit.`
            });
        }
    }

    if (!liveStudents[examId]) liveStudents[examId] = {};
    liveStudents[examId][studentId] = {
        studentId,
        name: `${lastName}, ${firstName}`,
        firstName,
        lastName,
        examId,
        examTitle: exam ? exam.title : '',
        platform: req.body.platform || 'browser', // 'app' | 'browser'
        joinedAt: new Date().toISOString()
    };
    res.json({ success: true });
});

// Student leaves
app.post('/api/students/leave', (req, res) => {
    const { studentId, examId } = req.body;
    if (examId && liveStudents[examId]) delete liveStudents[examId][studentId];
    res.json({ success: true });
});

// Submit exam
app.post('/api/submit', (req, res) => {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'Invalid data.' }); } }

    const { firstName, lastName, studentId, examId, answers, answerMap, autoSubmitted, violation } = body;
    if (!firstName || !lastName || !studentId || !examId)
        return res.status(400).json({ error: 'Missing student information.' });

    const exams = readExams();
    const exam = exams.find(e => e.id === examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const submissions = readSubmissions();
    if (submissions.find(s => s.studentId === studentId && s.examId === examId))
        return res.status(400).json({ error: 'You have already submitted this exam.' });

    // Check student limit one more time
    if (exam.maxStudents > 0 && submissions.filter(s => s.examId === examId).length >= exam.maxStudents) {
        return res.status(403).json({ error: `This exam has reached its maximum capacity of ${exam.maxStudents} students.` });
    }

    // Use answerMap if provided (questions were shuffled for this student)
    const { score, totalItems, percentage, gradedAnswers } = gradeExam(exam, answers || [], answerMap || null);

    submissions.push({
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
        examId: exam.id, examTitle: exam.title,
        firstName: firstName.trim(), lastName: lastName.trim(), studentId: studentId.trim(),
        score, totalItems, percentage, answers: gradedAnswers,
        autoSubmitted: autoSubmitted === true,
        violation: violation === true,
        platform: body.platform || 'browser',  // 'app' | 'browser'
        submittedAt: new Date().toISOString()
    });
    writeSubmissions(submissions);
    if (liveStudents[examId]) delete liveStudents[examId][studentId];
    res.json({ success: true, message: 'Exam submitted successfully!' });
});

// Beacon submit (auto-submit on page exit — sendBeacon sends text/plain)
app.post('/api/submit/beacon', (req, res) => {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).end(); } }

    const { firstName, lastName, studentId, examId, answers, answerMap, violation } = body;
    if (!firstName || !lastName || !studentId || !examId) return res.status(400).end();

    const exams = readExams();
    const exam = exams.find(e => e.id === examId);
    if (!exam) return res.status(404).end();

    const submissions = readSubmissions();
    if (submissions.find(s => s.studentId === studentId && s.examId === examId)) return res.status(200).end();
    
    // Check student limit
    if (exam.maxStudents > 0 && submissions.filter(s => s.examId === examId).length >= exam.maxStudents) {
        return res.status(200).end(); // Don't save if limit reached
    }

    // Use answerMap if provided (questions were shuffled for this student)
    const { score, totalItems, percentage, gradedAnswers } = gradeExam(exam, answers || [], answerMap || null);
    submissions.push({
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
        examId: exam.id, examTitle: exam.title,
        firstName: firstName.trim(), lastName: lastName.trim(), studentId: studentId.trim(),
        score, totalItems, percentage, answers: gradedAnswers,
        autoSubmitted: true,
        violation: violation === true,
        platform: body.platform || 'browser',
        submittedAt: new Date().toISOString()
    });
    writeSubmissions(submissions);
    if (liveStudents[examId]) delete liveStudents[examId][studentId];
    res.status(200).end();
});

// ─────────────────────────────────────────
//  ATTENDANCE API
// ─────────────────────────────────────────

// Generate a random 6-char uppercase code
function generateAttendanceCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// Format duration between two ISO timestamps
function formatDuration(timeIn, timeOut) {
    const ms = new Date(timeOut) - new Date(timeIn);
    if (ms < 0) return '—';
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// Create attendance session
app.post('/api/attendance/create', (req, res) => {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Session title is required.' });
    const sessions = readAttendance();
    // Ensure unique code
    let code;
    do { code = generateAttendanceCode(); } while (sessions.find(s => s.code === code));
    const session = {
        id: Date.now().toString(),
        title: title.trim(),
        code,
        active: true,
        createdAt: new Date().toISOString(),
        records: []
    };
    sessions.push(session);
    writeAttendance(sessions);
    res.json({ success: true, message: `Session created! Code: ${code}`, session });
});

// Get all sessions (summary)
app.get('/api/attendance', (req, res) => {
    const sessions = readAttendance();
    res.json(sessions.map(s => ({
        id: s.id,
        title: s.title,
        code: s.code,
        active: s.active,
        createdAt: s.createdAt,
        totalIn: s.records.length,
        totalOut: s.records.filter(r => r.timeOut).length
    })));
});

// Get single session with full records
app.get('/api/attendance/:id', (req, res) => {
    const sessions = readAttendance();
    const session = sessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    res.json(session);
});

// Toggle session active/inactive
app.post('/api/attendance/:id/toggle', (req, res) => {
    const sessions = readAttendance();
    const idx = sessions.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Session not found.' });
    sessions[idx].active = !sessions[idx].active;
    writeAttendance(sessions);
    res.json({ success: true, active: sessions[idx].active, message: `Session is now ${sessions[idx].active ? 'ACTIVE' : 'INACTIVE'}.` });
});

// Delete session
app.delete('/api/attendance/:id', (req, res) => {
    const sessions = readAttendance();
    const idx = sessions.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Session not found.' });
    sessions.splice(idx, 1);
    writeAttendance(sessions);
    res.json({ success: true, message: 'Session deleted.' });
});

// Delete a single attendance record
app.delete('/api/attendance/:sessionId/records/:recordId', (req, res) => {
    const sessions = readAttendance();
    const sIdx = sessions.findIndex(s => s.id === req.params.sessionId);
    if (sIdx === -1) return res.status(404).json({ error: 'Session not found.' });
    const rIdx = sessions[sIdx].records.findIndex(r => r.id === req.params.recordId);
    if (rIdx === -1) return res.status(404).json({ error: 'Record not found.' });
    sessions[sIdx].records.splice(rIdx, 1);
    writeAttendance(sessions);
    res.json({ success: true, message: 'Record deleted.' });
});

// Student Time In
app.post('/api/attendance/timein', (req, res) => {
    const { firstName, lastName, code, platform } = req.body;
    if (!firstName || !lastName || !code)
        return res.status(400).json({ error: 'First name, last name, and session code are required.' });

    const sessions = readAttendance();
    const idx = sessions.findIndex(s => s.code === code.trim().toUpperCase());
    if (idx === -1) return res.status(404).json({ error: 'Invalid session code. Please check with your teacher.' });
    if (!sessions[idx].active) return res.status(403).json({ error: 'This attendance session is not active. Please ask your teacher to activate it.' });

    const fn = firstName.trim().toUpperCase();
    const ln = lastName.trim().toUpperCase();
    const deviceId = req.body.deviceId || null;

    // Anti-double-entry check 1: same device ID (prevents using a different name)
    if (deviceId) {
        const existingDevice = sessions[idx].records.find(r => r.deviceId === deviceId);
        if (existingDevice) {
            if (!existingDevice.timeOut) {
                return res.json({
                    success: false,
                    status: 'already_checked_in',
                    message: 'This device is already checked in to this session.',
                    record: existingDevice,
                    sessionTitle: sessions[idx].title,
                    sessionId: sessions[idx].id
                });
            } else {
                return res.json({
                    success: false,
                    status: 'already_completed',
                    message: 'This device has already completed attendance for this session.',
                    record: existingDevice,
                    sessionTitle: sessions[idx].title
                });
            }
        }
    }

    // Anti-double-entry check 2: same name (prevents same person on different device)
    const existingName = sessions[idx].records.find(
        r => r.firstName.toUpperCase() === fn && r.lastName.toUpperCase() === ln
    );
    if (existingName) {
        if (!existingName.timeOut) {
            return res.json({
                success: false,
                status: 'already_checked_in',
                message: 'You are already checked in to this session.',
                record: existingName,
                sessionTitle: sessions[idx].title,
                sessionId: sessions[idx].id
            });
        } else {
            return res.json({
                success: false,
                status: 'already_completed',
                message: 'You have already completed attendance for this session.',
                record: existingName,
                sessionTitle: sessions[idx].title
            });
        }
    }

    const record = {
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
        firstName: fn,
        lastName: ln,
        deviceId: deviceId || null,
        timeIn: new Date().toISOString(),
        timeOut: null,
        learningSummary: null,
        duration: null,
        platform: platform || 'browser'
    };
    sessions[idx].records.push(record);
    writeAttendance(sessions);
    res.json({ success: true, status: 'checked_in', record, sessionTitle: sessions[idx].title, sessionId: sessions[idx].id });
});

// Student Time Out
app.post('/api/attendance/timeout', (req, res) => {
    const { sessionId, recordId, learningSummary } = req.body;
    if (!sessionId || !recordId) return res.status(400).json({ error: 'Missing session or record ID.' });

    const sessions = readAttendance();
    const sIdx = sessions.findIndex(s => s.id === sessionId);
    if (sIdx === -1) return res.status(404).json({ error: 'Session not found.' });

    const rIdx = sessions[sIdx].records.findIndex(r => r.id === recordId);
    if (rIdx === -1) return res.status(404).json({ error: 'Record not found.' });

    const record = sessions[sIdx].records[rIdx];
    if (record.timeOut) return res.status(400).json({ error: 'You have already timed out.' });

    const timeOut = new Date().toISOString();
    record.timeOut = timeOut;
    record.learningSummary = (learningSummary || '').trim();
    record.duration = formatDuration(record.timeIn, timeOut);
    sessions[sIdx].records[rIdx] = record;
    writeAttendance(sessions);
    res.json({ success: true, record, sessionTitle: sessions[sIdx].title });
});

// Export attendance to Excel
app.get('/api/attendance/export/:id', (req, res) => {
    const sessions = readAttendance();
    const session = sessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    if (session.records.length === 0) return res.status(400).json({ error: 'No records to export.' });

    const wb = XLSX.utils.book_new();
    const rows = session.records.map((r, i) => ({
        'No.': i + 1,
        'Last Name': r.lastName,
        'First Name': r.firstName,
        'Platform': r.platform === 'app' ? '📱 App' : '🌐 Browser',
        'Time In': r.timeIn ? new Date(r.timeIn).toLocaleString() : '—',
        'Time Out': r.timeOut ? new Date(r.timeOut).toLocaleString() : '(not yet)',
        'Duration': r.duration || '(in progress)',
        'Learning Summary': r.learningSummary || '(none)'
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
        { wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 12 },
        { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 50 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Attendance_${session.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

// ─────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────
const config = loadConfig();
app.listen(PORT, HOST, () => {
    const displayUrl = getDisplayUrl();
    const isCloud = DEPLOYMENT_MODE === 'cloud' || (DEPLOYMENT_MODE === 'auto' && (process.env.RAILWAY_SERVICE_ID || process.env.RENDER_SERVICE_ID || process.env.VERCEL_URL));

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║       OFFLINE EXAM SYSTEM - RUNNING      ║');
    console.log('╚══════════════════════════════════════════╝\n');

    if (isCloud) {
        console.log(`  ☁️  Cloud Mode Detected!`);
        console.log(`  🌐 Public URL       : ${displayUrl}`);
    } else {
        console.log(`  🌐 Local Network    : ${displayUrl}`);
    }

    console.log(`  📋 Teacher Dashboard : ${displayUrl}/teacher`);
    console.log(`  📱 Student Portal   : ${displayUrl}\n`);
    console.log(`  🔐 Teacher Password : ${config.teacherPassword || 'teacher123'}\n`);
    console.log('  Press Ctrl+C to stop.\n');
});
