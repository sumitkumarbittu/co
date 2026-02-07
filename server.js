const express = require('express');
require('dotenv').config(); // Load environment variables
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const path = require('path');
const multer = require('multer');
const serverConfig = require('./config');

const app = express();
const port = process.env.PORT || 3000;

// --- Multi-Server Config ---
// Each server has its own tables based on server ID

// Middleware
app.set('trust proxy', 1);
app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

// Session
const isProduction = process.env.NODE_ENV === 'production';
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'secret_key_123'],
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    httpOnly: true
}));

// Upload Config (Memory storage for bytea)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- Database & Queue Strategy ---
// Aggressive SSL: Force SSL unless explicitly on localhost
const isLocalDb = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocalDb ? false : { rejectUnauthorized: false }
});

// Offline Queue - now per server
let offlineQueues = {}; // { serverId: [...tasks] }
let dbConnected = false;
let initializedServers = new Set(); // Track which server tables are initialized

// Initialize tables for a specific server
const initServerTables = async (serverId) => {
    if (!process.env.DATABASE_URL) {
        return false;
    }

    if (initializedServers.has(serverId)) {
        return true; // Already initialized
    }

    try {
        const { messages, media } = serverConfig.getTableNames(serverId);
        const client = await pool.connect();

        // Media Table for this server
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${media} (
                id SERIAL PRIMARY KEY,
                filename TEXT,
                mime_type TEXT,
                data BYTEA,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Messages Table for this server
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${messages} (
                id SERIAL PRIMARY KEY,
                content TEXT,
                media_id INTEGER REFERENCES ${media}(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        client.release();
        initializedServers.add(serverId);
        return true;
    } catch (err) {
        return false;
    }
};

// Init DB connection
const initDb = async () => {
    if (!process.env.DATABASE_URL) {
        return;
    }

    try {
        const client = await pool.connect();
        client.release();
        dbConnected = true;

        // Initialize all configured servers
        for (const serverId of serverConfig.SERVERS) {
            await initServerTables(serverId);
        }

        // Process queues for all servers
        for (const serverId of serverConfig.SERVERS) {
            processQueue(serverId);
        }
    } catch (err) {
        dbConnected = false;
    }
};

initDb();

// Queue Processor - per server
const processQueue = async (serverId) => {
    if (!offlineQueues[serverId] || offlineQueues[serverId].length === 0 || !dbConnected) return;

    const { messages, media } = serverConfig.getTableNames(serverId);
    const client = await pool.connect();

    try {
        while (offlineQueues[serverId].length > 0) {
            const task = offlineQueues[serverId][0]; // Peek

            if (task.type === 'message') {
                let mediaId = null;

                // If message has file data attached directly (from offline upload)
                if (task.file) {
                    const { buffer, originalname, mimetype } = task.file;
                    const res = await client.query(
                        `INSERT INTO ${media} (filename, mime_type, data) VALUES ($1, $2, $3) RETURNING id`,
                        [originalname, mimetype, buffer]
                    );
                    mediaId = res.rows[0].id;
                } else {
                    mediaId = task.mediaId; // If reference already existed
                }

                await client.query(
                    `INSERT INTO ${messages} (content, media_id, created_at) VALUES ($1, $2, $3)`,
                    [task.content, mediaId, task.created_at]
                );
            }

            offlineQueues[serverId].shift(); // Remove on success
        }
    } catch (err) {
        dbConnected = false; // Mark temporarily down
    } finally {
        client.release();
    }
};

// Periodic Check - process all server queues
setInterval(async () => {
    if (!dbConnected) {
        // Try reconnecting logic if needed, or initDb
        initDb();
    } else {
        // Process queues for all servers
        for (const serverId of serverConfig.SERVERS) {
            processQueue(serverId);
        }
    }
}, 10000);

// --- Helpers ---
const getTodaysPassword = () => {
    const options = { timeZone: 'Asia/Kolkata', day: '2-digit' };
    const day = new Intl.DateTimeFormat('en-IN', options).format(new Date());
    return `${day}8080`;
};

const requireAuth = (req, res, next) => {
    if (req.session && req.session.authenticated && req.session.serverId) next();
    else res.status(401).json({ error: 'Unauthorized' });
};

// --- CHAT UI ---
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
  .media-preview { margin-top: 8px; border-radius: 8px; overflow: hidden; max-width: 200px; cursor: pointer; border: 1px solid #444; position: relative; background: #000; }
  .media-icon { width: 100%; height: 100px; display: flex; align-items: center; justify-content: center; color: #aaa; background: #222; }
  
  .chat-input-wrapper { background: rgba(30,30,30,0.95); backdrop-filter: blur(10px); border-top: 1px solid #333; display: flex; flex-direction: column; flex-shrink: 0; padding-bottom: env(safe-area-inset-bottom, 0); }
  .preview-area { padding: 8px 16px 0 16px; display: none; }
  .att-badge { display: inline-flex; align-items: center; gap: 8px; background: #333; padding: 6px 12px; border-radius: 8px; font-size: 13px; color: #eee; border: 1px solid #444; }
  .att-rem { background: none; border: none; color: #aaa; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; }
  .att-rem:hover { background: #444; color: #fff; }
  
  .chat-form { padding: 12px 16px; display: flex; gap: 12px; align-items: center; width: 100%; box-sizing: border-box; }
  .chat-input { flex: 1; background: #252525; border: 1px solid #3a3a3a; padding: 12px 18px; border-radius: 24px; color: #fff; font-size: 16px; outline: none; transition: all 0.2s; -webkit-appearance: none; }
  .chat-input:focus { background: #2c2c2c; border-color: #555; }
  .icon-btn { background: transparent; border: none; color: #007aff; cursor: pointer; padding: 8px; transition: transform 0.1s; display: flex; align-items: center; justify-content: center; }
  .icon-btn:active { transform: scale(0.9); }
  .send-btn { background: linear-gradient(135deg, #007aff, #0056b3); border: none; width: 44px; height: 44px; border-radius: 50%; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,122,255,0.3); transition: transform 0.1s; flex-shrink: 0; }
  
  .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 100; justify-content: center; align-items: center; flex-direction: column; }
  .modal-content { max-width: 90%; max-height: 80%; object-fit: contain; box-shadow: 0 0 20px rgba(0,0,0,0.5); transition: transform 0.1s; cursor: grab; }
  .modal-toolbar { display: flex; gap: 20px; margin-top: 20px; z-index: 101; }
  .tool-btn { background: #333; color: white; border: 1px solid #555; padding: 8px 16px; border-radius: 20px; cursor: pointer; text-decoration: none; font-size: 14px; }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>

<div class="chat-app">
  <div class="chat-header">
     <div class="chat-title"><div class="chat-status"></div><span></span></div>
  </div>
  <div id="messages" class="chat-messages"></div>
  
  <div class="chat-input-wrapper">
      <div id="preview-area" class="preview-area"></div>
      <form id="input-form" class="chat-form">
          <button type="button" class="icon-btn" onclick="document.getElementById('g-file').click()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </button>
          <input type="text" class="chat-input" placeholder="" autocomplete="off">
          <button type="submit" class="send-btn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: -2px;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
      </form>
  </div>
</div>

<div id="preview-modal" class="modal-overlay">
    <div id="media-container" style="overflow: auto; display: flex; justify-content: center; align-items: center; width: 100%; height: 80%;">
    </div>
    <div class="modal-toolbar">
        <a id="download-btn" class="tool-btn" download></a>
        <button class="tool-btn" onclick="closeModal()"></button>
    </div>
</div>
`;

// --- Routes ---

app.post('/api/login', async (req, res) => {
    const { password } = req.body;

    // Extract server ID from password
    const serverId = serverConfig.extractServerId(password);

    if (!serverId) {
        return res.status(401).json({ error: 'Invalid password format' });
    }

    // Check if server ID is valid
    if (!serverConfig.isValidServer(serverId)) {
        return res.status(401).json({ error: 'Invalid server' });
    }

    // Check if password matches pattern DDXXXX
    const correctPassword = getTodaysPassword();
    const expectedPassword = correctPassword.slice(0, 2) + serverId; // DD + XXXX

    if (password && typeof password === 'string' && password === expectedPassword) {
        // Initialize server tables if not already done
        await initServerTables(serverId);

        req.session.authenticated = true;
        req.session.serverId = serverId;

        res.json({ success: true, ui: CHAT_UI_HTML });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Upload & Message Handler
app.post('/api/messages', requireAuth, upload.single('file'), async (req, res) => {
    const { content } = req.body;
    const file = req.file;
    const serverId = req.session.serverId;
    const { messages, media } = serverConfig.getTableNames(serverId);

    // Initialize queue for this server if needed
    if (!offlineQueues[serverId]) {
        offlineQueues[serverId] = [];
    }

    // Build Task
    const task = {
        type: 'message',
        content: content || '',
        created_at: new Date().toISOString(),
        file: file ? { // Store necessary file data for queue
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype
        } : null,
        mediaId: req.body.mediaId || null // Optional existing ID
    };

    if (dbConnected) {
        try {
            const client = await pool.connect();
            let mediaId = task.mediaId;

            // Insert Media first if present
            if (task.file) {
                const mediaRes = await client.query(
                    `INSERT INTO ${media} (filename, mime_type, data) VALUES ($1, $2, $3) RETURNING id`,
                    [task.file.originalname, task.file.mimetype, task.file.buffer]
                );
                mediaId = mediaRes.rows[0].id;
            }

            // Insert Message
            await client.query(
                `INSERT INTO ${messages} (content, media_id, created_at) VALUES ($1, $2, $3)`,
                [task.content, mediaId, task.created_at]
            );
            client.release();
            res.json({ success: true });
        } catch (err) {
            offlineQueues[serverId].push(task);
            res.json({ success: true, queued: true }); // Fake success for user
        }
    } else {
        offlineQueues[serverId].push(task);
        res.json({ success: true, queued: true });
    }
});

app.get('/api/messages', requireAuth, async (req, res) => {
    const serverId = req.session.serverId;
    const { messages, media } = serverConfig.getTableNames(serverId);

    if (!offlineQueues[serverId]) {
        offlineQueues[serverId] = [];
    }

    if (!dbConnected) {
        // Return queued messages as "local" preview
        const queuedMsgs = offlineQueues[serverId].map(t => ({
            id: 'temp-' + Date.now(),
            content: t.content,
            created_at: t.created_at,
            media_id: t.file ? 999999 : null, // fake ID for preview
            mime_type: t.file ? t.file.mimetype : null
        }));
        return res.json(queuedMsgs);
    }

    try {
        const client = await pool.connect();
        // Join to get media info but NOT data
        const result = await client.query(`
            SELECT m.id, m.content, m.created_at, m.media_id, mm.mime_type 
            FROM ${messages} m
            LEFT JOIN ${media} mm ON m.media_id = mm.id
            ORDER BY m.created_at ASC LIMIT 100
        `);
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

// Lazy Load Media
app.get('/api/media/:id', requireAuth, async (req, res) => {
    const serverId = req.session.serverId;
    const { media } = serverConfig.getTableNames(serverId);

    if (!dbConnected) return res.status(503).send('Offline');
    try {
        const client = await pool.connect();
        const result = await client.query(`SELECT data, mime_type, filename FROM ${media} WHERE id = $1`, [req.params.id]);
        client.release();

        if (result.rows.length > 0) {
            const { data, mime_type, filename } = result.rows[0];
            res.setHeader('Content-Type', mime_type);
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
            res.send(data);
        } else {
            res.status(404).send('Not Found');
        }
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.post('/api/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
});

app.get('/health', (req, res) => {
    const memory = process.memoryUsage();

    // Calculate total queue size across all servers
    const totalQueueSize = Object.values(offlineQueues).reduce((sum, queue) => sum + queue.length, 0);

    res.json({
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        node_version: process.version,
        memory: {
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
            rss: Math.round(memory.rss / 1024 / 1024) + 'MB'
        },
        database: {
            connected: dbConnected,
            totalQueueSize: totalQueueSize,
            queuesByServer: Object.fromEntries(
                Object.entries(offlineQueues).map(([id, queue]) => [id, queue.length])
            )
        },
        servers: {
            configured: serverConfig.SERVERS,
            initialized: Array.from(initializedServers)
        },
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(port, () => { });
