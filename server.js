const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.set('trust proxy', 1); // crucial for secure cookies on Render/Heroku

app.use(cors({
    origin: (origin, callback) => {
        // Allow all origins, but reflected for credentials support
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
// app.use(express.static('.')); // REMOVED for security: do not expose server code


// Session configuration
const isProduction = process.env.NODE_ENV === 'production';
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'secret_key_123'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site (Render+GH Pages), 'lax' for local
    secure: isProduction,     // Must be true for sameSite: 'none'
    httpOnly: true
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

// Chat UI Template (only sent after auth)
// Chat UI Template
const CHAT_UI_HTML = `
<style>
  .chat-app { display: flex; flex-direction: column; height: 100% !important; background: #121212; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; position: relative; overflow: hidden; }
  .chat-header { padding: 15px 20px; background: rgba(30, 30, 30, 0.95); backdrop-filter: blur(10px); color: #fff; font-weight: 600; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; z-index: 10; flex-shrink: 0; }
  .chat-title { display: flex; align-items: center; gap: 10px; font-size: 16px; letter-spacing: 0.5px; }
  .chat-status { width: 8px; height: 8px; background: #00e676; border-radius: 50%; box-shadow: 0 0 8px #00e676; animation: blink 2s infinite; }
  .chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; }
  .msg-row { display: flex; flex-direction: column; animation: fadeIn 0.3s ease; width: 100%; }
  .msg-bubble { align-self: flex-start; max-width: 85%; padding: 12px 16px; background: #2c2c2c; color: #e0e0e0; border-radius: 18px; border-bottom-left-radius: 4px; font-size: 15px; line-height: 1.5; box-shadow: 0 2px 5px rgba(0,0,0,0.1); word-wrap: break-word; position: relative; }
  .msg-time { font-size: 10px; color: #888; margin-top: 6px; text-align: right; opacity: 0.7; }
  .chat-input-area { padding: 12px 16px; background: rgba(30,30,30,0.95); backdrop-filter: blur(10px); border-top: 1px solid #333; display: flex; gap: 12px; align-items: center; flex-shrink: 0; padding-bottom: env(safe-area-inset-bottom, 12px); }
  .chat-input { flex: 1; background: #252525; border: 1px solid #3a3a3a; padding: 12px 18px; border-radius: 24px; color: #fff; font-size: 16px; outline: none; transition: all 0.2s; -webkit-appearance: none; }
  .chat-input:focus { background: #2c2c2c; border-color: #555; }
  .send-btn { background: linear-gradient(135deg, #007aff, #0056b3); border: none; width: 44px; height: 44px; border-radius: 50%; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,122,255,0.3); transition: transform 0.1s; flex-shrink: 0; }
  .send-btn:active { transform: scale(0.92); }
  
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  
  /* Scrollbar Styling */
  .chat-messages::-webkit-scrollbar { width: 6px; }
  .chat-messages::-webkit-scrollbar-track { background: transparent; }
  .chat-messages::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
</style>
<div class="chat-app">
  <div class="chat-header">
     <div class="chat-title"><div class="chat-status"></div><span>Secure Channel</span></div>
  </div>
  <div id="messages" class="chat-messages"></div>
  <form id="input-form" class="chat-input-area">
      <input type="text" class="chat-input" placeholder="Type a message..." autocomplete="off">
      <button type="submit" class="send-btn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: -2px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
  </form>
</div>
`;

// 1. Login
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const correctPassword = getTodaysPassword();

    // Allow a dev backdoor or just the rigorous check? 
    // Stick to the rigorous check for "secure" apps.
    if (password === correctPassword) {
        req.session.authenticated = true;
        // Return the UI HTML only on success
        res.json({ success: true, ui: CHAT_UI_HTML });
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
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
