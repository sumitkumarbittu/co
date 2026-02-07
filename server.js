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

// Initialize Database Table
const initDb = async () => {
    try {
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
        console.error('Error initializing database:', err);
    }
};

initDb();

// Password Generator Helper
const getTodaysPassword = () => {
    const date = new Date();
    // Use UTC date to be consistent across regions if needed, 
    // or local server time. The prompt example just says "today 078080". 
    // We'll use UTC date to avoid timezone confusion on the server side.
    // If the user is in a timezone far from UTC, this might be tricky, 
    // but without client timezone info, server time is standard.
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

    if (password === correctPassword) {
        req.session.authenticated = true;
        // Scope of opening: The prompt says "keeping scope of opening the webpage by multiple users once".
        // This implies just standard session tracking for multiple simultaneous users.
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// 2. Get Messages (Polling)
app.get('/api/messages', requireAuth, async (req, res) => {
    try {
        const client = await pool.connect();
        // Limit to last 50 messages to keep it lightweight
        const result = await client.query('SELECT * FROM messages ORDER BY created_at ASC LIMIT 100');
        client.release();
        res.json(result.rows);
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
        const client = await pool.connect();
        await client.query('INSERT INTO messages (content) VALUES ($1)', [content]);
        client.release();
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
