const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy_key'
});

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'your_super_secret_key_change_in_production'; // For MVP purposes

app.use(cors());
app.use(express.json());
// Serve static files from the current directory
app.use(express.static(__dirname));

// Initialize SQLite database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error("Error opening database " + err.message);
    } else {
        console.log("Connected to the SQLite database.");
        // Create tables
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                text TEXT,
                completed BOOLEAN
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS stats (
                userId INTEGER PRIMARY KEY,
                totalStudyTime INTEGER DEFAULT 0,
                sessionsCompleted INTEGER DEFAULT 0
            )`);
        });
    }
});

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
        res.json(rows.map(r => ({ id: r.id, text: r.text, completed: Boolean(r.completed) })));
    });
});

// Add a task
app.post('/api/tasks', authenticateToken, (req, res) => {
    const { text, completed } = req.body;
    const isCompleted = completed ? 1 : 0;
    
    db.run(`INSERT INTO tasks (userId, text, completed) VALUES (?, ?, ?)`, [req.user.id, text, isCompleted], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, text, completed: Boolean(isCompleted) });
    });
});

// Update a task (toggle completion)
app.put('/api/tasks/:id', authenticateToken, (req, res) => {
    const { completed } = req.body;
    const isCompleted = completed ? 1 : 0;
    
    db.run(`UPDATE tasks SET completed = ? WHERE id = ? AND userId = ?`, [isCompleted, req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Task not found" });
        res.json({ message: "Task updated" });
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
app.post('/api/chat', authenticateToken, async (req, res) => {
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
