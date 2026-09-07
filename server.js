const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();
const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');
const { GoogleGenAI, Type } = require('@google/genai');
const dns = require('dns');

// Force Node.js to prefer IPv4 DNS resolution (avoids IPv6 ENETUNREACH errors on Render/VPS hosters)
dns.setDefaultResultOrder('ipv4first');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy_key'
});

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy_key'
});

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
    pool: true, // Enable pooling to reuse connections
    maxConnections: 5,
    maxMessages: 100,
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    family: 4,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false // Bypass self-signed certificate chain errors in TLS
    }
});

// Verify SMTP connection on startup
transporter.verify((error, success) => {
    if (error) {
        console.warn("⚠️ SMTP Transporter configuration error:", error.message);
    } else {
        console.log("✅ SMTP Transporter is ready to send emails.");
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'your_super_secret_key_change_in_production'; // For MVP purposes

app.use(cors());
app.use(express.json());
// Serve static files from the current directory
app.use(express.static(__dirname));

// Hybrid Database wrapper for local SQLite and Render Cloud PostgreSQL
class HybridDatabase {
    constructor() {
        this.isPg = !!process.env.DATABASE_URL;
        if (this.isPg) {
            const { Pool } = require('pg');
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            });
            console.log("Connected to PostgreSQL Cloud Database.");
            this.initPg();
        } else {
            this.sqliteDb = new sqlite3.Database('./database.sqlite', (err) => {
                if (err) console.error("Error opening SQLite: " + err.message);
                else console.log("Connected to the local SQLite database.");
            });
            this.initSqlite();
        }
    }

    initPg() {
        this.pool.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE,
            password VARCHAR(255)
        )`);
        this.pool.query(`CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            userId INTEGER,
            text TEXT,
            completed BOOLEAN,
            tag VARCHAR(255)
        )`);
        this.pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Medium'`, (err) => { });
        this.pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline VARCHAR(50)`, (err) => { });
        this.pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_hours DOUBLE PRECISION DEFAULT 1.0`, (err) => { });
        this.pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "missedCount" INTEGER DEFAULT 0`, (err) => { });
        this.pool.query(`CREATE TABLE IF NOT EXISTS stats (
            userId INTEGER PRIMARY KEY,
            totalStudyTime INTEGER DEFAULT 0,
            sessionsCompleted INTEGER DEFAULT 0
        )`);
        this.pool.query(`CREATE TABLE IF NOT EXISTS syllabi (
            id SERIAL PRIMARY KEY,
            userId INTEGER,
            fileName VARCHAR(255),
            fileType VARCHAR(50),
            fileSize INTEGER,
            fileData TEXT,
            uploadDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        this.pool.query(`CREATE TABLE IF NOT EXISTS otps (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE,
            otp VARCHAR(10),
            expiresAt TIMESTAMP
        )`);
    }

    initSqlite() {
        this.sqliteDb.serialize(() => {
            this.sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT
            )`);
            this.sqliteDb.run(`CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                text TEXT,
                completed BOOLEAN
            )`);
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN tag TEXT`, (err) => { });
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'Medium'`, (err) => { });
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN deadline TEXT`, (err) => { });
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN duration_hours REAL DEFAULT 1.0`, (err) => { });
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN missedCount INTEGER DEFAULT 0`, (err) => { });
            this.sqliteDb.run(`CREATE TABLE IF NOT EXISTS stats (
                userId INTEGER PRIMARY KEY,
                totalStudyTime INTEGER DEFAULT 0,
                sessionsCompleted INTEGER DEFAULT 0
            )`);
            this.sqliteDb.run(`CREATE TABLE IF NOT EXISTS syllabi (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                fileName TEXT,
                fileType TEXT,
                fileSize INTEGER,
                fileData TEXT,
                uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            this.sqliteDb.run(`CREATE TABLE IF NOT EXISTS otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                otp TEXT,
                expiresAt DATETIME
            )`);
        });
    }

    formatSql(sql) {
        if (!this.isPg) return sql;
        let index = 1;
        return sql.replace(/\?/g, () => `$${index++}`);
    }

    run(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (this.isPg) {
            const pgSql = this.formatSql(sql);
            let querySql = pgSql;
            if (sql.trim().toUpperCase().startsWith('INSERT')) {
                if (!pgSql.toUpperCase().includes('RETURNING')) {
                    querySql = pgSql + ' RETURNING id';
                }
            }
            this.pool.query(querySql, params, (err, res) => {
                if (err) {
                    if (callback) callback(err);
                    return;
                }
                const context = {
                    changes: res.rowCount,
                    lastID: (res.rows && res.rows[0]) ? res.rows[0].id : null
                };
                if (callback) callback.call(context, null);
            });
        } else {
            this.sqliteDb.run(sql, params, callback);
        }
    }

    get(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (this.isPg) {
            const pgSql = this.formatSql(sql);
            this.pool.query(pgSql, params, (err, res) => {
                if (err) {
                    if (callback) callback(err);
                    return;
                }
                if (callback) callback(null, res.rows[0] || null);
            });
        } else {
            this.sqliteDb.get(sql, params, callback);
        }
    }

    all(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        if (this.isPg) {
            const pgSql = this.formatSql(sql);
            this.pool.query(pgSql, params, (err, res) => {
                if (err) {
                    if (callback) callback(err);
                    return;
                }
                if (callback) callback(null, res.rows || []);
            });
        } else {
            this.sqliteDb.all(sql, params, callback);
        }
    }
}

const db = new HybridDatabase();

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// --- Auth Routes ---

app.post('/auth/send-otp', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    db.run(`DELETE FROM otps WHERE email = ?`, [email], (err) => {
        if (err) return res.status(500).json({ error: "Failed to clear old OTP: " + err.message });

        db.run(`INSERT INTO otps (email, otp, expiresAt) VALUES (?, ?, ?)`, [email, otp, expiresAt.toISOString()], async (insertErr) => {
            if (insertErr) return res.status(500).json({ error: "Failed to store OTP: " + insertErr.message });

            const hasEmailConfig = process.env.SMTP_USER && process.env.SMTP_PASS;

            if (hasEmailConfig) {
                const mailOptions = {
                    from: `"Smart Study Planner" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: 'Your Verification Code - Smart Study Planner',
                    html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #6366f1;">Smart Study Planner</h2>
                            <p>Hello,</p>
                            <p>Your one-time verification code is:</p>
                            <div style="font-size: 24px; font-weight: bold; padding: 10px 20px; background-color: #f3f4f6; display: inline-block; letter-spacing: 4px; border-radius: 6px; margin: 10px 0; color: #4f46e5;">
                                ${otp}
                            </div>
                            <p>This code will expire in 5 minutes.</p>
                            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">If you did not request this code, please ignore this email.</p>
                        </div>
                    `
                };

                // Send mail in the background (asynchronously) without blocking the response
                transporter.sendMail(mailOptions, (mailErr, info) => {
                    if (mailErr) {
                        console.error("❌ Background Mail Send Error:", mailErr.message);
                    } else {
                        console.log(`📧 OTP successfully sent in the background to ${email}: ${info.response}`);
                    }
                });

                // Respond immediately
                const responseData = { message: "OTP sent successfully to your email." };
                if (process.env.NODE_ENV !== 'production') {
                    responseData._dev_otp = otp;
                    responseData.smtp_active = true;
                }
                res.json(responseData);
            } else {
                console.log(`[OTP DEBUG] OTP for ${email} is: ${otp}`);
                res.json({
                    message: "OTP generated successfully (Development Mode)",
                    _dev_otp: otp,
                    smtp_active: false
                });
            }
        });
    });
});

app.post('/auth/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required" });

    db.get(`SELECT * FROM otps WHERE email = ?`, [email], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(400).json({ error: "No OTP requested for this email" });

        if (row.otp !== otp) return res.status(400).json({ error: "Incorrect verification code" });

        const now = new Date();
        const expiresAt = new Date(row.expiresAt);
        if (now > expiresAt) {
            return res.status(400).json({ error: "Verification code has expired" });
        }

        db.run(`DELETE FROM otps WHERE email = ?`, [email]);

        db.get(`SELECT * FROM users WHERE username = ?`, [email], (userErr, user) => {
            if (userErr) return res.status(500).json({ error: userErr.message });

            if (!user) {
                db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [email, 'passwordless'], function (createErr) {
                    if (createErr) return res.status(500).json({ error: "Failed to register user" });

                    const userId = this.lastID;
                    db.run(`INSERT INTO stats (userId, totalStudyTime, sessionsCompleted) VALUES (?, 0, 0)`, [userId], (statsErr) => {
                        const token = jwt.sign({ id: userId, username: email }, SECRET_KEY);
                        res.json({ token, message: "Registered and logged in successfully" });
                    });
                });
            } else {
                const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY);
                res.json({ token, message: "Logged in successfully" });
            }
        });
    });
});

app.post('/auth/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: "Username already exists" });
                }
                return res.status(500).json({ error: err.message });
            }

            const userId = this.lastID;
            // Initialize stats for new user
            db.run(`INSERT INTO stats (userId, totalStudyTime, sessionsCompleted) VALUES (?, 0, 0)`, [userId]);

            res.status(201).json({ message: "User created successfully", userId });
        });
    } catch (e) {
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: "User not found" });

        try {
            if (await bcrypt.compare(password, user.password)) {
                // Include id in token so we know which user requests belong to
                const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY);
                res.json({ token, message: "Logged in successfully" });
            } else {
                res.status(401).json({ error: "Incorrect password" });
            }
        } catch (e) {
            res.status(500).json({ error: "Server error" });
        }
    });
});

// --- Protected API Routes ---

// Get all tasks for user
app.get('/api/tasks', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM tasks WHERE userId = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => ({
            id: r.id,
            text: r.text,
            completed: Boolean(r.completed),
            tag: r.tag || '',
            priority: r.priority || 'Medium',
            deadline: r.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            duration_hours: Number(r.duration_hours !== undefined ? r.duration_hours : (r.duration_hours || 1.0)),
            missedCount: Number(r.missedCount !== undefined ? r.missedCount : (r.missedcount || 0))
        })));
    });
});

// Add a task
app.post('/api/tasks', authenticateToken, (req, res) => {
    const { text, completed, tag, priority, deadline, duration_hours } = req.body;
    const isCompleted = completed ? 1 : 0;
    const taskTag = tag || '';
    const taskPriority = priority || 'Medium';
    const defaultDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const taskDeadline = deadline || defaultDeadline;
    const taskDuration = Number(duration_hours || 1.0);

    db.run(
        `INSERT INTO tasks (userId, text, completed, tag, priority, deadline, duration_hours, missedCount) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [req.user.id, text, isCompleted, taskTag, taskPriority, taskDeadline, taskDuration],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({
                id: this.lastID,
                text,
                completed: Boolean(isCompleted),
                tag: taskTag,
                priority: taskPriority,
                deadline: taskDeadline,
                duration_hours: taskDuration,
                missedCount: 0
            });
        }
    );
});

// Update a task (flexible update support for completed, missedCount, text, tag, priority, deadline, duration_hours)
app.put('/api/tasks/:id', authenticateToken, (req, res) => {
    const { completed, missedCount, text, tag, priority, deadline, duration_hours } = req.body;

    let updates = [];
    let params = [];

    if (completed !== undefined) {
        updates.push("completed = ?");
        params.push(completed ? 1 : 0);
    }
    if (missedCount !== undefined) {
        updates.push("missedCount = ?");
        params.push(Number(missedCount));
    }
    if (text !== undefined) {
        updates.push("text = ?");
        params.push(text);
    }
    if (tag !== undefined) {
        updates.push("tag = ?");
        params.push(tag);
    }
    if (priority !== undefined) {
        updates.push("priority = ?");
        params.push(priority);
    }
    if (deadline !== undefined) {
        updates.push("deadline = ?");
        params.push(deadline);
    }
    if (duration_hours !== undefined) {
        updates.push("duration_hours = ?");
        params.push(Number(duration_hours));
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }

    const query = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND userId = ?`;
    params.push(req.params.id, req.user.id);

    db.run(query, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Task not found" });
        res.json({ message: "Task updated successfully" });
    });
});

// Delete a task
app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM tasks WHERE id = ? AND userId = ?`, [req.params.id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Task not found" });
        res.json({ message: "Task deleted" });
    });
});

// Get stats
app.get('/api/stats', authenticateToken, (req, res) => {
    db.get(`SELECT totalStudyTime, sessionsCompleted FROM stats WHERE userId = ?`, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) {
            return res.json({ totalStudyTime: 0, sessionsCompleted: 0 });
        }
        res.json(row);
    });
});

// Update stats
app.put('/api/stats', authenticateToken, (req, res) => {
    const { totalStudyTime, sessionsCompleted } = req.body;
    db.run(
        `UPDATE stats SET totalStudyTime = ?, sessionsCompleted = ? WHERE userId = ?`,
        [totalStudyTime, sessionsCompleted, req.user.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
                db.run(`INSERT INTO stats (userId, totalStudyTime, sessionsCompleted) VALUES (?, ?, ?)`,
                    [req.user.id, totalStudyTime, sessionsCompleted]);
            }
            res.json({ message: "Stats updated" });
        }
    );
});

// --- AI Chat Endpoint (FIXED) ---
app.post('/api/chat', (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        req.user = null;
        next();
    }
}, async (req, res) => {
    // 'history' is now expected from the frontend: an array of
    // { role: 'user' | 'model', text: string } from the current chat session
    const { message, userState, history } = req.body;

    // 1. FIXED SYSTEM PROMPT — now explicitly a tutor, not just a cheerleader
    let systemInstruction = `You are Nova, an AI study buddy for a student using a spaced-repetition study app.
Your two jobs, in priority order:
1. Answer the student's academic questions clearly and correctly. Explain concepts in simple terms,
   use short examples or analogies, and check if they want more detail before going deeper.
2. When relevant, connect your answer back to their study progress (streak, overdue topics) to keep them motivated.

Rules:
- If the student asks a subject/doubt-clearing question, answer it directly and substantively first.
  Do not deflect to generic encouragement instead of answering.
- Keep answers focused — a few sentences or a short list, not an essay, unless they ask for depth.
- If you don't know something for certain, say so rather than guessing.`;

    if (userState) {
        systemInstruction += `\n\nStudent Current Study State (for context, not the main topic unless asked):
- Study Streak: ${userState.streak} days.
- Total Topics: ${userState.totalTopics}.
- Mastered Topics: ${userState.masteredTopics} / ${userState.totalTopics}.
- Overdue Review Sessions: ${userState.overdueCount}.
- Overdue Topics List: ${userState.overdueList.join(', ') || 'None'}.`;
    }

    const hasGeminiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'dummy_key';
    const hasOpenAIKey = process.env.OPENAI_API_KEY && (process.env.OPENAI_API_KEY.startsWith('sk-') || process.env.OPENAI_API_KEY.startsWith('proj-'));

    // 2. FIXED — build real conversation history instead of sending message alone
    // Gemini expects: [{ role: 'user'|'model', parts: [{ text }] }, ...]
    function buildGeminiContents(history, message) {
        const contents = (history || []).map(turn => ({
            role: turn.role === 'assistant' || turn.role === 'model' ? 'model' : 'user',
            parts: [{ text: turn.text }]
        }));
        contents.push({ role: 'user', parts: [{ text: message }] });
        return contents;
    }

    // OpenAI expects: [{ role: 'system'|'user'|'assistant', content }, ...]
    function buildOpenAIMessages(history, message, systemInstruction) {
        const messages = [{ role: 'system', content: systemInstruction }];
        (history || []).forEach(turn => {
            messages.push({
                role: turn.role === 'assistant' || turn.role === 'model' ? 'assistant' : 'user',
                content: turn.text
            });
        });
        messages.push({ role: 'user', content: message });
        return messages;
    }

    if (hasGeminiKey) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: buildGeminiContents(history, message),
                config: {
                    systemInstruction: systemInstruction
                }
            });
            return res.json({ reply: response.text });
        } catch (err) {
            console.error("Gemini Chat API Error:", err.message);
            if (hasOpenAIKey) {
                try {
                    const completion = await openai.chat.completions.create({
                        messages: buildOpenAIMessages(history, message, systemInstruction),
                        model: "gpt-3.5-turbo",
                    });
                    return res.json({ reply: completion.choices[0].message.content, warning: "Gemini failed, used OpenAI fallback." });
                } catch (err2) {
                    console.error("OpenAI fallback also failed:", err2.message);
                }
            }
            const reply = getSimulatedNovaReply(message, userState);
            return res.json({ reply, warning: "AI providers unavailable. Using local simulated chat — answers will be limited." });
        }
    } else if (hasOpenAIKey) {
        try {
            const completion = await openai.chat.completions.create({
                messages: buildOpenAIMessages(history, message, systemInstruction),
                model: "gpt-3.5-turbo",
            });
            return res.json({ reply: completion.choices[0].message.content });
        } catch (err) {
            console.error("OpenAI Chat Error:", err.message);
            const reply = getSimulatedNovaReply(message, userState);
            return res.json({ reply, warning: "OpenAI call failed. Using local simulated chat." });
        }
    } else {
        // No API key configured at all — this is the actual root cause if you haven't
        // set GEMINI_API_KEY / OPENAI_API_KEY as real values in Render's environment variables.
        const reply = getSimulatedNovaReply(message, userState);
        setTimeout(() => {
            res.json({ reply, warning: "No AI API key configured — Nova cannot answer real questions until GEMINI_API_KEY or OPENAI_API_KEY is set." });
        }, 800);
    }
});

function getSimulatedNovaReply(message, userState) {
    const lowerMsg = message.toLowerCase();
    let reply = "Hey! I'm Nova, your AI study buddy. (Simulated Mode) Keep up the great work studying!";

    let streakText = "";
    let overdueText = "";
    if (userState) {
        if (userState.streak > 0) {
            streakText = ` You are on an awesome 🔥 ${userState.streak}-day study streak!`;
        } else {
            streakText = ` Let's get a study streak started today!`;
        }

        if (userState.overdueCount > 0) {
            overdueText = ` I noticed you have ${userState.overdueCount} overdue reviews in your calendar (specifically on: ${userState.overdueList.slice(0, 2).join(', ')}). We should tackle them next!`;
        } else {
            overdueText = ` Your spaced repetition calendar looks clean and caught up. Great job!`;
        }
    }

    if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
        reply = `Hey there! Nova here.${streakText}${overdueText} How can I help you study today?`;
    } else if (lowerMsg.includes('plan') || lowerMsg.includes('schedule')) {
        reply = `To help with your schedule, I suggest breaking your sessions into 25-minute Pomodoro blocks. Also, be sure to check off your reviews: ${overdueText}`;
    } else if (lowerMsg.includes('tired') || lowerMsg.includes('exhausted')) {
        reply = `Your brain needs rest to lock in your study sessions. Take a 5-10 minute stretch break, then come back!`;
    } else if (userState && userState.overdueCount > 0) {
        reply = `I'm here to support you! Since you have ${userState.overdueCount} pending reviews, let's focus on finishing them so you don't break your ${userState.streak}-day streak!`;
    }

    return reply;
}

// --- AI Quiz Master Endpoint ---
app.post('/api/quiz/generate', authenticateToken, async (req, res) => {
    const { topic } = req.body;
    if (!topic || !topic.trim()) {
        return res.status(400).json({ error: "Topic is required" });
    }

    if (process.env.OPENAI_API_KEY && (process.env.OPENAI_API_KEY.startsWith('sk-') || process.env.OPENAI_API_KEY.startsWith('proj-'))) {
        try {
            const systemPrompt = `You are an expert academic tutor and quiz generator. Your task is to generate a practice quiz about the requested topic.
Generate exactly 5 challenging, conceptually deep multiple-choice questions for the topic.
For each question, provide 4 answer options (one of which must be correct), a short hint, and a detailed explanation (rationale) for each answer option showing why it is correct or incorrect.

You must respond strictly in JSON format matching this structure:
{
  "title": "[Topic Name] Quiz",
  "questions": [
    {
      "question": "The question text here...",
      "hint": "A subtle conceptual hint...",
      "answerOptions": [
        { "text": "Option 1 text", "isCorrect": false, "rationale": "Explanation of why this option is incorrect..." },
        { "text": "Option 2 text", "isCorrect": true, "rationale": "Explanation of why this option is correct..." },
        { "text": "Option 3 text", "isCorrect": false, "rationale": "Explanation of why this option is incorrect..." },
        { "text": "Option 4 text", "isCorrect": false, "rationale": "Explanation of why this option is incorrect..." }
      ]
    }
  ]
}`;

            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Generate a quiz about the topic: "${topic}"` }
                ],
                model: "gpt-3.5-turbo",
                temperature: 0.5,
                response_format: { type: "json_object" }
            });

            let replyText = completion.choices[0].message.content.trim();
            const quizData = JSON.parse(replyText);
            return res.json(quizData);
        } catch (err) {
            console.error("OpenAI Quiz Gen Error:", err.message);
            const fallback = generateMockQuiz(topic);
            return res.json(fallback);
        }
    } else {
        const fallback = generateMockQuiz(topic);
        setTimeout(() => {
            res.json(fallback);
        }, 1500);
    }
});

// Mock Quiz Generator for simulated/offline mode
function generateMockQuiz(topic) {
    const formattedTopic = topic.charAt(0).toUpperCase() + topic.slice(1);
    return {
        title: `${formattedTopic} Practice Quiz`,
        questions: [
            {
                question: `What is the primary conceptual foundation of ${formattedTopic}?`,
                hint: "Think about the most essential definition or building block of this subject.",
                answerOptions: [
                    { text: "Option A: Core Theoretical Principles", isCorrect: true, rationale: "Correct! This represents the primary logical base that defines this concept." },
                    { text: "Option B: Secondary Implementation Details", isCorrect: false, rationale: "Incorrect. While details are important, they are built on top of the core principles rather than defining them." },
                    { text: "Option C: Edge Cases and Anomalies", isCorrect: false, rationale: "Incorrect. Edge cases represent outliers, not the core foundational theory." },
                    { text: "Option D: Extraneous Historical Context", isCorrect: false, rationale: "Incorrect. History explains origin, but does not constitute the active conceptual mechanism." }
                ]
            },
            {
                question: `Which of the following describes the most common practical application of ${formattedTopic}?`,
                hint: "How is this knowledge used by practitioners in the field?",
                answerOptions: [
                    { text: "Standardized industry workflows and problem-solving", isCorrect: true, rationale: "Correct! It is primarily used to resolve real-world challenges systematically." },
                    { text: "Academic research and publishing only", isCorrect: false, rationale: "Incorrect. This subject has robust practical utility beyond academic boundaries." },
                    { text: "Purely recreational puzzles", isCorrect: false, rationale: "Incorrect. While it can be enjoyable, its primary value is educational and professional." },
                    { text: "Legacy archival systems", isCorrect: false, rationale: "Incorrect. This topic is highly active and relevant in modern disciplines." }
                ]
            },
            {
                question: `Which common misconception is associated with learning or applying ${formattedTopic}?`,
                hint: "Consider what learners often oversimplify or confuse.",
                answerOptions: [
                    { text: "It is an static concept with no modern updates", isCorrect: false, rationale: "Incorrect. Most fields are constantly evolving with new discoveries." },
                    { text: "It requires memorization without conceptual understanding", isCorrect: true, rationale: "Correct! Memorization alone leads to failure; deep structural comprehension is essential." },
                    { text: "It is only useful for senior researchers", isCorrect: false, rationale: "Incorrect. Beginners benefit immensely from studying this foundational concept." },
                    { text: "It is entirely independent of other scientific domains", isCorrect: false, rationale: "Incorrect. It is deeply cross-disciplinary and interfaces with other areas." }
                ]
            },
            {
                question: `How does mastering ${formattedTopic} affect cognitive modeling and future study plans?`,
                hint: "Look at the downstream effects of understanding this topic.",
                answerOptions: [
                    { text: "It creates mental scaffolding that makes learning related concepts faster", isCorrect: true, rationale: "Correct! Understanding core models makes it much easier to grasp advanced topics later." },
                    { text: "It limits creative thinking to narrow boundaries", isCorrect: false, rationale: "Incorrect. Understanding principles expands cognitive options rather than narrowing them." },
                    { text: "It has no measurable impact on adjacent topics", isCorrect: false, rationale: "Incorrect. The cognitive overlap is highly significant." },
                    { text: "It causes memory overload and inhibits retention", isCorrect: false, rationale: "Incorrect. Structured knowledge actually enhances working memory capacity." }
                ]
            },
            {
                question: `What is the most recommended study method to fully master ${formattedTopic}?`,
                hint: "Think about the principles of active recall and simple explanations.",
                answerOptions: [
                    { text: "Passive re-reading of textbooks and highlight marking", isCorrect: false, rationale: "Incorrect. Passive reading has very low retention rates." },
                    { text: "Explaining it simply in your own words and taking practice tests", isCorrect: true, rationale: "Correct! The Feynman Technique combined with active testing is the gold standard of mastery." },
                    { text: "Rote memorization of flashcards without review gaps", isCorrect: false, rationale: "Incorrect. Without spaced intervals, knowledge is quickly forgotten." },
                    { text: "Listening to passive lectures in the background", isCorrect: false, rationale: "Incorrect. Active engagement is required to build structural neural pathways." }
                ]
            }
        ]
    };
}

// --- AI Feynman Evaluator Routes ---

// POST /api/feynman/evaluate
app.post('/api/feynman/evaluate', authenticateToken, async (req, res) => {
    const { topic, explanation } = req.body;

    if (!topic || !explanation) {
        return res.status(400).json({
            success: false,
            error: 'Both topic and explanation are required.'
        });
    }

    const hasGeminiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'dummy_key';

    if (hasGeminiKey) {
        try {
            const prompt = `Topic being explained: "${topic}"\nStudent Explanation: "${explanation}"`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: `You are an expert Feynman Technique evaluator. Your job is to check whether a student has explained a complex concept in simple, layman's terms.
1. Assign a clarity score (0-100%).
2. Highlight any complex technical jargon used that wasn't simplified.
3. Point out any logical gaps or key missing details.
4. Suggest a clear, intuitive real-world analogy.`,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            clarity_score: { type: Type.INTEGER },
                            jargon_spotted: { type: Type.STRING },
                            logical_gaps: { type: Type.STRING },
                            recommended_analogy: { type: Type.STRING }
                        },
                        required: ['clarity_score', 'jargon_spotted', 'logical_gaps', 'recommended_analogy']
                    }
                }
            });

            const reportData = JSON.parse(response.text);

            return res.json({
                success: true,
                report: reportData
            });
        } catch (error) {
            console.error('Feynman Evaluation API Error:', error.message);
            const fallbackReport = generateMockFeynmanEvaluation(topic, explanation);
            return res.json({
                success: true,
                report: fallbackReport,
                warning: 'Gemini API call failed. Using local fallback evaluator.'
            });
        }
    } else {
        const fallbackReport = generateMockFeynmanEvaluation(topic, explanation);
        setTimeout(() => {
            return res.json({
                success: true,
                report: fallbackReport,
                info: 'Offline mode: local fallback evaluator used.'
            });
        }, 1200);
    }
});

function generateMockFeynmanEvaluation(topic, explanation) {
    const words = explanation.split(/\s+/).length;
    let score = Math.floor(Math.random() * 15) + 70;
    if (words > 40) score += 10;
    if (words > 80) score += 5;
    score = Math.min(98, score);

    let jargon = "Detected academic expressions. Try describing it in simpler terms.";
    let gaps = "Missing some fundamental details. Expand on how " + topic + " works step-by-step.";
    let analogy = "Think of it like a train: the engine leads, the passenger cars follow, and the tracks keep it guided.";

    const lowerTopic = topic.toLowerCase();
    const lowerExpl = explanation.toLowerCase();

    if (lowerTopic.includes('biol') || lowerTopic.includes('photo') || lowerTopic.includes('cell')) {
        jargon = "Thylakoid, photophosphorylation, Calvin Cycle. Try swapping these for 'solar collectors' or 'sugar production assembly line'.";
        gaps = "Explain clearly *where* the water and carbon dioxide enter the leaf structure, and why oxygen is released as a byproduct.";
        analogy = "Think of a leaf as a tiny solar-powered kitchen: sunlight is the power stove, water and CO2 are ingredients, and glucose is the freshly baked cake.";
    } else if (lowerTopic.includes('hist') || lowerTopic.includes('soc') || lowerTopic.includes('revol')) {
        jargon = "Estates-General, Bourgeoisie, Reign of Terror. Try describing these as 'the king's assembly' or 'middle-class merchants'.";
        gaps = "Clarify the immediate economic trigger factors—such as the bread shortage and national debt—that pushed citizens to action.";
        analogy = "Imagine three roommates where two of them eat all the food and throw parties, but force the third roommate to pay 100% of the rent.";
    }

    return {
        clarity_score: score,
        jargon_spotted: jargon,
        logical_gaps: gaps,
        recommended_analogy: analogy
    };
}

// POST /api/schedule/generate
app.post('/api/schedule/generate', authenticateToken, async (req, res) => {
    const { syllabusText, startDate, targetExamDate } = req.body;

    if (!syllabusText) {
        return res.status(400).json({
            success: false,
            error: 'Syllabus text is required.'
        });
    }

    const baseDate = startDate ? new Date(startDate) : new Date();
    const formattedToday = baseDate.toISOString().split('T')[0];

    const hasGeminiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'dummy_key';

    if (hasGeminiKey) {
        try {
            const prompt = `Current Date: ${formattedToday}\nTarget Exam Date: ${targetExamDate || 'Not specified'}\n\nSyllabus Content:\n"""\n${syllabusText}\n"""`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: `You are an expert academic study planner.
1. Extract distinct, bite-sized study topics from the syllabus text.
2. Estimate the difficulty level ('Easy', 'Medium', 'Hard') and estimated study duration in minutes for each topic.
3. Calculate initial review dates using a spaced repetition model (1 day, 3 days, 7 days, and 30 days after the initial scheduled date).
4. Order the topics logically so prerequisites come first.`,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            course_summary: { type: Type.STRING },
                            total_topics: { type: Type.INTEGER },
                            topics: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        topic_title: { type: Type.STRING },
                                        unit_or_module: { type: Type.STRING },
                                        difficulty: { type: Type.STRING },
                                        estimated_minutes: { type: Type.INTEGER },
                                        initial_study_date: { type: Type.STRING },
                                        spaced_review_dates: {
                                            type: Type.ARRAY,
                                            items: { type: Type.STRING }
                                        }
                                    },
                                    required: [
                                        'topic_title',
                                        'unit_or_module',
                                        'difficulty',
                                        'estimated_minutes',
                                        'initial_study_date',
                                        'spaced_review_dates'
                                    ]
                                }
                            }
                        },
                        required: ['course_summary', 'total_topics', 'topics']
                    }
                }
            });

            const scheduleData = JSON.parse(response.text);

            return res.json({
                success: true,
                schedule: scheduleData
            });
        } catch (error) {
            console.error('Syllabus Schedule Generation API Error:', error.message);
            const fallbackSchedule = generateMockSchedule(syllabusText, baseDate, targetExamDate);
            return res.json({
                success: true,
                schedule: fallbackSchedule,
                warning: 'Gemini schedule generation failed. Using local scheduler fallback.'
            });
        }
    } else {
        const fallbackSchedule = generateMockSchedule(syllabusText, baseDate, targetExamDate);
        setTimeout(() => {
            return res.json({
                success: true,
                schedule: fallbackSchedule,
                info: 'Offline mode: local scheduler fallback used.'
            });
        }, 1500);
    }
});

function generateMockSchedule(syllabusText, baseDate, targetExamDate) {
    const lines = syllabusText.split('\n');
    const topics = [];
    let topicCount = 0;

    for (let line of lines) {
        line = line.trim();
        if (line.length > 5 && line.length < 80 && topicCount < 10) {
            const initialDate = new Date(baseDate.getTime());
            initialDate.setDate(initialDate.getDate() + topicCount * 2);
            const initialDateStr = initialDate.toISOString().split('T')[0];

            const spacedDates = [1, 3, 7, 30].map(days => {
                const d = new Date(initialDate.getTime());
                d.setDate(d.getDate() + days);
                return d.toISOString().split('T')[0];
            });

            topics.push({
                topic_title: line,
                unit_or_module: "Unit " + (Math.floor(topicCount / 3) + 1),
                difficulty: ["Easy", "Medium", "Hard"][topicCount % 3],
                estimated_minutes: [30, 45, 60, 90][topicCount % 4],
                initial_study_date: initialDateStr,
                spaced_review_dates: spacedDates
            });
            topicCount++;
        }
    }

    if (topics.length === 0) {
        const fallbacks = ["Foundational Concepts", "Core Implementations", "Advanced Techniques"];
        fallbacks.forEach((title, index) => {
            const initialDate = new Date(baseDate.getTime());
            initialDate.setDate(initialDate.getDate() + index * 2);
            const initialDateStr = initialDate.toISOString().split('T')[0];

            const spacedDates = [1, 3, 7, 30].map(days => {
                const d = new Date(initialDate.getTime());
                d.setDate(d.getDate() + days);
                return d.toISOString().split('T')[0];
            });

            topics.push({
                topic_title: title,
                unit_or_module: "Module 1",
                difficulty: "Medium",
                estimated_minutes: 45,
                initial_study_date: initialDateStr,
                spaced_review_dates: spacedDates
            });
        });
    }

    return {
        course_summary: "Automated review schedule based on syllabus.",
        total_topics: topics.length,
        topics: topics
    };
}

// --- AI Syllabus Manager Routes ---

// 1. Upload syllabus file & parse topics
app.post('/api/syllabi', authenticateToken, async (req, res) => {
    const { fileName, fileType, fileSize, fileData, extractedText } = req.body;

    if (!fileName || !fileData) {
        return res.status(400).json({ error: "fileName and fileData are required." });
    }

    db.run(
        `INSERT INTO syllabi (userId, fileName, fileType, fileSize, fileData) VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, fileName, fileType || 'application/octet-stream', fileSize || 0, fileData],
        async function (err) {
            if (err) {
                console.error("DB Save Syllabus Error:", err.message);
                return res.status(500).json({ error: "Failed to save syllabus file to database." });
            }

            const syllabusId = this.lastID;

            if (extractedText && extractedText.trim()) {
                const text = extractedText.trim();

                if (process.env.OPENAI_API_KEY && (process.env.OPENAI_API_KEY.startsWith('sk-') || process.env.OPENAI_API_KEY.startsWith('proj-'))) {
                    try {
                        const systemPrompt = `You are an expert academic coordinator and cognitive science assistant. Your task is to analyze the provided syllabus, lecture schedule, or course outline text and extract the core conceptual topics that a student needs to master.

Goal: 
Break down the text into distinct, manageable study topics perfectly optimized for Spaced Repetition and the Feynman Technique. Do not include administrative details (like grading policies, office hours, or textbook ISBNs). Focus only on the academic subjects and concepts.

Output Format:
You must respond strictly in JSON format. Do not include any conversational text, markdown formatting outside of the JSON block, or explanations. 

JSON Structure Expected:
{
  "course_name": "Name of the course or 'General Syllabus Study Plan' if undetected",
  "estimated_study_weeks": 12,
  "topics": [
    {
      "title": "Short, clear topic name (e.g., 'Photosynthesis & Light Reactions')",
      "description": "A 1-sentence overview of what the student needs to understand and explain.",
      "category": "Subject category (e.g., Biology, Calculus, History)",
      "difficulty": "Easy / Medium / Hard"
    }
  ]
}`;

                        const completion = await openai.chat.completions.create({
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: `Please parse this syllabus text:\n\n${text}` }
                            ],
                            model: "gpt-3.5-turbo",
                            temperature: 0.1
                        });

                        let replyText = completion.choices[0].message.content.trim();
                        if (replyText.startsWith('```')) {
                            replyText = replyText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
                        }

                        const parsedData = JSON.parse(replyText);
                        return res.json({ id: syllabusId, parsed: parsedData });
                    } catch (aiErr) {
                        console.error("OpenAI Syllabus Parsing Error:", aiErr.message);
                        const fallbackData = localRegexSyllabusParserV2(text);
                        return res.json({ id: syllabusId, parsed: fallbackData, warning: "OpenAI parsing failed. Used local parser." });
                    }
                } else {
                    const fallbackData = localRegexSyllabusParserV2(text);
                    return res.json({ id: syllabusId, parsed: fallbackData, info: "Offline local parser fallback used." });
                }
            } else {
                return res.json({ id: syllabusId, message: "Syllabus uploaded successfully without parsing." });
            }
        }
    );
});

// 2. Fetch list of previously uploaded syllabi metadata (exclude large fileData for speed)
app.get('/api/syllabi', authenticateToken, (req, res) => {
    db.all(
        `SELECT id, fileName, fileType, fileSize, uploadDate FROM syllabi WHERE userId = ? ORDER BY uploadDate DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) {
                console.error("DB Fetch Syllabi Error:", err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

// 3. Fetch single syllabus with file data for download
app.get('/api/syllabi/:id', authenticateToken, (req, res) => {
    db.get(
        `SELECT id, fileName, fileType, fileSize, fileData, uploadDate FROM syllabi WHERE id = ? AND userId = ?`,
        [req.params.id, req.user.id],
        (err, row) => {
            if (err) {
                console.error("DB Fetch Syllabus File Error:", err.message);
                return res.status(500).json({ error: err.message });
            }
            if (!row) {
                return res.status(404).json({ error: "Syllabus not found." });
            }
            res.json(row);
        }
    );
});

// 4. Delete syllabus
app.delete('/api/syllabi/:id', authenticateToken, (req, res) => {
    db.run(
        `DELETE FROM syllabi WHERE id = ? AND userId = ?`,
        [req.params.id, req.user.id],
        function (err) {
            if (err) {
                console.error("DB Delete Syllabus Error:", err.message);
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: "Syllabus not found." });
            }
            res.json({ message: "Syllabus deleted successfully." });
        }
    );
});

// A smart offline parsing helper (matches new schema)
function localRegexSyllabusParserV2(text) {
    const lines = text.split('\n');
    const topics = [];
    let currentSubject = "General Subject";
    let courseName = "General Syllabus Study Plan";

    for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const line = lines[i].trim();
        if (line.toLowerCase().includes('syllabus') || line.toLowerCase().includes('course') || line.toLowerCase().includes('class')) {
            courseName = line.replace(/^[#\s*]+|[:]+$/g, '').trim();
            break;
        }
    }

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const subjectHeaderMatch = line.match(/^(?:Subject|Course|Class)\s*:\s*(.+)$/i) ||
            line.match(/^#{1,4}\s+(.+)$/) ||
            (line.length < 40 && line.endsWith(':') && !line.includes('http'));

        if (subjectHeaderMatch) {
            let candidate = typeof subjectHeaderMatch === 'string' ? subjectHeaderMatch : subjectHeaderMatch[1];
            candidate = candidate.replace(/^[#\s*]+|[:]+$/g, '').trim();
            if (candidate.toLowerCase() !== 'syllabus' && candidate.toLowerCase() !== 'topics' && candidate.length > 2) {
                currentSubject = candidate;
            }
            continue;
        }

        const bulletMatch = line.match(/^[\*\-\+•]\s+(.+)$/) ||
            line.match(/^\d+\.\s+(.+)$/);

        if (bulletMatch) {
            const topicText = bulletMatch[1].trim();
            if (topicText.length > 3 && topicText.length < 120 && !topicText.toLowerCase().includes('page ')) {
                const diffs = ["Easy", "Medium", "Hard"];
                const difficulty = diffs[topics.length % 3];
                topics.push({
                    title: topicText,
                    description: `Understand the core principles and key mechanisms of ${topicText}.`,
                    category: currentSubject,
                    difficulty: difficulty
                });
            }
        }
    }

    if (topics.length === 0) {
        let count = 0;
        const diffs = ["Easy", "Medium", "Hard"];
        for (let line of lines) {
            line = line.trim();
            if (line.length > 5 && line.length < 80 && count < 10) {
                topics.push({
                    title: line,
                    description: `Review and explain the concepts relating to ${line}.`,
                    category: currentSubject,
                    difficulty: diffs[count % 3]
                });
                count++;
            }
        }
    }

    return {
        course_name: courseName,
        estimated_study_weeks: 12,
        topics: topics
    };
}

// Basic endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/feynman', (req, res) => {
    res.sendFile(path.join(__dirname, 'feynman.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
