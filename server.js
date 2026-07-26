const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();
const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');
const dns = require('dns');

// Force Node.js to prefer IPv4 DNS resolution (avoids IPv6 ENETUNREACH errors on Render/VPS hosters)
dns.setDefaultResultOrder('ipv4first');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy_key'
});

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
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
        this.pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Medium'`, (err) => {});
        this.pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline VARCHAR(50)`, (err) => {});
        this.pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_hours DOUBLE PRECISION DEFAULT 1.0`, (err) => {});
        this.pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "missedCount" INTEGER DEFAULT 0`, (err) => {});
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
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN tag TEXT`, (err) => {});
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'Medium'`, (err) => {});
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN deadline TEXT`, (err) => {});
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN duration_hours REAL DEFAULT 1.0`, (err) => {});
            this.sqliteDb.run(`ALTER TABLE tasks ADD COLUMN missedCount INTEGER DEFAULT 0`, (err) => {});
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

                transporter.sendMail(mailOptions, (mailErr, info) => {
                    if (mailErr) {
                        console.error("Mail Send Error:", mailErr.message);
                        if (process.env.NODE_ENV !== 'production') {
                            return res.status(200).json({ 
                                message: "OTP generated (dev mode fallback)", 
                                _dev_otp: otp,
                                warning: "SMTP failed: " + mailErr.message
                            });
                        }
                        return res.status(500).json({ error: "Failed to send OTP email: " + mailErr.message });
                    }
                    res.json({ message: "OTP sent successfully to your email." });
                });
            } else {
                console.log(`[OTP DEBUG] OTP for ${email} is: ${otp}`);
                res.json({ 
                    message: "OTP generated successfully (Development Mode)", 
                    _dev_otp: otp 
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
                db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [email, 'passwordless'], function(createErr) {
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
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function(err) {
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
        function(err) {
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
    
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Task not found" });
        res.json({ message: "Task updated successfully" });
    });
});

// Delete a task
app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    db.run(`DELETE FROM tasks WHERE id = ? AND userId = ?`, [req.params.id, req.user.id], function(err) {
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
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
                db.run(`INSERT INTO stats (userId, totalStudyTime, sessionsCompleted) VALUES (?, ?, ?)`,
                [req.user.id, totalStudyTime, sessionsCompleted]);
            }
            res.json({ message: "Stats updated" });
        }
    );
});

// --- AI Chat Endpoint ---
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
    const { message } = req.body;
    
    if (process.env.OPENAI_API_KEY && (process.env.OPENAI_API_KEY.startsWith('sk-') || process.env.OPENAI_API_KEY.startsWith('proj-'))) {
        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: "You are an expert academic AI tutor designed for students. Your role is to suggest study content, recommend resources, explain complex topics, and provide actionable study plans to help students excel." },
                    { role: "user", content: message }
                ],
                model: "gpt-3.5-turbo",
            });
            res.json({ reply: completion.choices[0].message.content });
        } catch (err) {
            console.error("OpenAI Error:", err.message);
            
            // Graceful Fallback to Simulated AI
            const lowerMsg = message.toLowerCase();
            let reply = `(Simulated AI) I temporarily stepped in because your API key hit a billing error: ${err.message}. Keep up the great work studying!`;
            if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
                reply = "(Simulated AI) Hello there! I'm here because your API key hit its quota limit. How can I help?";
            } else if (lowerMsg.includes('plan') || lowerMsg.includes('schedule')) {
                reply = "(Simulated AI) Try breaking your tasks into 25-minute Pomodoro sessions!";
            }
            res.json({ reply });
        }
    } else {
        const lowerMsg = message.toLowerCase();
        let reply = "I am your simulated AI Assistant! Provide a real OpenAI API key via .env to unlock actual intelligence. You are doing great!";
        if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
            reply = "Hello there! How can I help you plan your studies today?";
        } else if (lowerMsg.includes('plan') || lowerMsg.includes('schedule')) {
            reply = "I suggest breaking your study sessions into 25-minute Pomodoro blocks. Add a task on the left and let's get started!";
        } else if (lowerMsg.includes('tired') || lowerMsg.includes('exhausted')) {
            reply = "Take a short break! Your brain needs time to consolidate information. You've got this.";
        }
        
        setTimeout(() => {
            res.json({ reply });
        }, 800);
    }
});

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
        async function(err) {
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
        function(err) {
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
