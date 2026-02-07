# 🚀 Quick Start: Multi-Server Setup

## TL;DR
Your chat app now supports **multiple isolated servers**. Users access different servers by entering different passwords.

**Password Format:** `DDXXXX`
- `DD` = Today's day (e.g., `08` for February 8th)
- `XXXX` = 4-digit server ID

**Example:** On Feb 8th, password `081234` accesses server `1234`

---

## ⚡ 5-Minute Setup

### 1. Configure Your Servers
Edit `config.js`:
```javascript
const SERVERS = [
    '1234',  // Your first server
    '5678',  // Your second server
    '9999'   // Your third server
];
```

### 2. Start the Application
```bash
npm install
npm start
```

### 3. Access Different Servers
**Today is February 8th:**
- Server 1234: Enter `081234`
- Server 5678: Enter `085678`
- Server 9999: Enter `089999`

**Tomorrow (February 9th):**
- Server 1234: Enter `091234`
- Server 5678: Enter `095678`
- Server 9999: Enter `099999`

### 4. Verify It Works
```bash
# Run the test script
./test_multiserver.sh

# Or check health endpoint
curl http://localhost:3000/health | python3 -m json.tool
```

---

## 📋 What You Get

### Complete Isolation
```
Server 1234                Server 5678                Server 9999
├── messages_1234         ├── messages_5678         ├── messages_9999
└── media_1234            └── media_5678            └── media_9999

❌ No cross-server access
✅ Complete data separation
```

### Zero Frontend Changes
The frontend (`index.html`) works dynamically with **any** server. No modifications needed!

### Automatic Table Creation
Tables are created automatically when a user first logs into a server.

---

## 🎯 Common Tasks

### Add a New Server
1. Edit `config.js`: Add `'7777'` to the array
2. Restart: `npm start`
3. Done! Users can now access with `DD7777`

### Remove a Server
1. Edit `config.js`: Remove the server ID
2. Restart: `npm start`
3. Done! (Data remains in DB but is inaccessible)

### Check Active Servers
```bash
curl http://localhost:3000/health
```

Look for:
```json
{
  "servers": {
    "configured": ["1234", "5678", "9999"],
    "initialized": ["1234", "5678", "9999"]
  }
}
```

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| `README.md` | Main project documentation |
| `MULTI_SERVER_GUIDE.md` | Detailed multi-server setup guide |
| `ARCHITECTURE.md` | Visual architecture diagrams |
| `USE_CASES.md` | Real-world usage examples |
| `IMPLEMENTATION_SUMMARY.md` | Technical implementation details |

---

## 🧪 Testing

### Automated Test
```bash
./test_multiserver.sh
```

Expected output:
```
✓ Successfully logged into server 1234
✓ Successfully logged into server 5678
✓ Correctly rejected invalid server
✓ Message sent to server 1234
✓ Message sent to server 5678
✓ Server 1234 only sees its own messages
✓ Server 5678 only sees its own messages
```

### Manual Test
1. Open browser to `http://localhost:3000`
2. Type password `081234` (for Feb 8th, server 1234)
3. Chat interface should load
4. Send a message
5. Open new incognito window
6. Type password `085678` (for Feb 8th, server 5678)
7. Verify you see a different, empty chat

---

## 🔧 Troubleshooting

### "Invalid server" error
**Problem:** Server ID not in config  
**Solution:** Add the server ID to `SERVERS` array in `config.js`

### Tables not created
**Problem:** Database connection issue  
**Solution:** Check `DATABASE_URL` in `.env` file

### Wrong password
**Problem:** Using yesterday's day code  
**Solution:** Password changes daily! Use today's day (DD)

### Can't see messages
**Problem:** Logged into wrong server  
**Solution:** Check which server ID you used in password

---

## 💡 Pro Tips

### 1. Organize Server IDs
```javascript
const SERVERS = [
    // Teams
    '1000', '1001', '1002',
    
    // Clients  
    '2000', '2001', '2002',
    
    // Projects
    '3000', '3001', '3002'
];
```

### 2. Document Your Servers
Keep a separate file tracking what each server is for:
```
1000 = Engineering Team
1001 = Marketing Team
2000 = Client Alpha
2001 = Client Beta
```

### 3. Monitor Usage
```bash
# Check which servers have queued messages
curl http://localhost:3000/health | grep -A 5 queuesByServer
```

### 4. Backup Strategy
Each server has separate tables, so backup accordingly:
```bash
# Backup specific server
pg_dump -t messages_1234 -t media_1234 > server_1234_backup.sql
```

---

## 🎉 You're Ready!

The multi-server setup is complete and production-ready. 

**Key Points:**
- ✅ Add/remove servers by editing one array
- ✅ Frontend works automatically with any server
- ✅ Complete data isolation between servers
- ✅ Tables created automatically on first use
- ✅ Daily password rotation built-in

**Next Steps:**
1. Configure your servers in `config.js`
2. Distribute passwords to users
3. Monitor via `/health` endpoint
4. Scale as needed!

---

## 📞 Need Help?

- **Architecture:** See `ARCHITECTURE.md`
- **Use Cases:** See `USE_CASES.md`
- **Detailed Guide:** See `MULTI_SERVER_GUIDE.md`
- **Implementation:** See `IMPLEMENTATION_SUMMARY.md`

Happy chatting! 🚀
