const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Session configuration
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'secret_key_123'],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// --- Database & Storage Strategy ---
let useInMemory = false;
let localMessages = [];
let dbClient = null; // reused if we want to hold a client, but pool is better. 
// We will stick to pool usually, but for fallback we allow bypassing it.

const initDb = async () => {
    try {
        if (!process.env.DATABASE_URL) {
            console.log('No DATABASE_URL found. Using in-memory storage (messages will be lost on restart).');
            useInMemory = true;
            return;
        }
        const client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        client.release();
        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Error connecting to database (fallback to in-memory):', err.message);
        useInMemory = true;
    }
};

initDb();

// Password Generator Helper
const getTodaysPassword = () => {
    const date = new Date();
    const day = date.getDate().toString().padStart(2, '0');
    return `${day}8080`;
};

// Check Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.authenticated) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
};

// Routes

// 1. Login
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const correctPassword = getTodaysPassword();

    // Allow a dev backdoor or just the rigorous check? 
    // Stick to the rigorous check for "secure" apps.
    if (password === correctPassword) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// 2. Get Messages (Polling)
app.get('/api/messages', requireAuth, async (req, res) => {
    try {
        let rows = [];
        if (useInMemory) {
            rows = localMessages.slice(-100);
        } else {
            const client = await pool.connect();
            const result = await client.query('SELECT * FROM messages ORDER BY created_at ASC LIMIT 100');
            client.release();
            rows = result.rows;
        }
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 3. Post Message
app.post('/api/messages', requireAuth, async (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });

    try {
        if (useInMemory) {
            const msg = {
                id: localMessages.length + 1,
                content,
                created_at: new Date().toISOString()
            };
            localMessages.push(msg);
            if (localMessages.length > 200) localMessages.shift(); // simple cleanup
        } else {
            const client = await pool.connect();
            await client.query('INSERT INTO messages (content) VALUES ($1)', [content]);
            client.release();
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 4. Logout / Session Check
app.post('/api/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
