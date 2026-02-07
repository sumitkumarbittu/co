# Multi-Server Setup Guide

## Overview

This application now supports multiple isolated servers, each with its own database tables for messages and media. Users access different servers by entering different passwords.

## Password Format

**Pattern:** `DDXXXX`

- `DD` = Current day of the month (2 digits)
- `XXXX` = 4-digit server ID

### Examples

If today is **February 8th, 2026** (day = `08`):

- `081234` → Access server `1234`
- `085678` → Access server `5678`
- `089999` → Access server `9999`

Each server is completely isolated with its own:
- Message table: `messages_XXXX`
- Media table: `media_XXXX`

## Managing Servers

### Adding a New Server

1. Open `config.js`
2. Add the 4-digit server ID to the `SERVERS` array:

```javascript
const SERVERS = [
    '1234',
    '5678',
    '9999',
    '7777'  // New server added
];
```

3. Restart the application
4. Users can now access with password `DD7777` (where DD is today's day)

### Removing a Server

1. Open `config.js`
2. Remove the server ID from the `SERVERS` array
3. Restart the application

**Note:** Removing a server from the config does NOT delete its database tables. The data remains in the database but becomes inaccessible through the application.

### Permanently Deleting Server Data

If you want to completely remove a server's data from the database:

```sql
-- Replace XXXX with the actual server ID
DROP TABLE IF EXISTS messages_XXXX CASCADE;
DROP TABLE IF EXISTS media_XXXX CASCADE;
```

## How It Works

### Authentication Flow

1. User enters password (e.g., `081234`)
2. System extracts server ID (`1234`) from the last 4 digits
3. System validates:
   - Is the server ID in the configured list?
   - Does the password match today's pattern (`DD` + server ID)?
4. If valid, user is authenticated to that specific server
5. Session stores the server ID for all subsequent requests

### Database Tables

Each server gets two tables:

**Messages Table:** `messages_XXXX`
```sql
CREATE TABLE messages_XXXX (
    id SERIAL PRIMARY KEY,
    content TEXT,
    media_id INTEGER REFERENCES media_XXXX(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Media Table:** `media_XXXX`
```sql
CREATE TABLE media_XXXX (
    id SERIAL PRIMARY KEY,
    filename TEXT,
    mime_type TEXT,
    data BYTEA,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Session Management

Each user session tracks:
- `authenticated`: Boolean indicating if user is logged in
- `serverId`: The 4-digit server ID they're connected to

All API requests use the `serverId` from the session to query the correct tables.

## Frontend

**No changes required!** The frontend remains completely dynamic and automatically works with any server. It doesn't need to know which server it's connected to - the backend handles all routing based on the session.

## Health Check

The `/health` endpoint now provides multi-server information:

```json
{
  "status": "ok",
  "database": {
    "connected": true,
    "totalQueueSize": 0,
    "queuesByServer": {
      "1234": 0,
      "5678": 0,
      "9999": 0
    }
  },
  "servers": {
    "configured": ["1234", "5678", "9999"],
    "initialized": ["1234", "5678", "9999"]
  }
}
```

## Offline Queue

Each server has its own offline queue. If the database is temporarily unavailable:
- Messages are queued per server
- When connection is restored, each server's queue is processed independently
- No cross-contamination between servers

## Security Considerations

1. **Isolation:** Servers are completely isolated - users on one server cannot access data from another
2. **Password Pattern:** The daily password rotation (`DD`) applies to all servers
3. **Session Security:** Server ID is stored in encrypted session cookies
4. **No Cross-Server Access:** Even if a user knows multiple server IDs, they can only access one at a time per session

## Example Usage

### Scenario: Three Teams

You want three isolated chat environments:

1. **Team Alpha** → Server `1000`
2. **Team Beta** → Server `2000`
3. **Team Gamma** → Server `3000`

**config.js:**
```javascript
const SERVERS = ['1000', '2000', '3000'];
```

**On February 8th:**
- Team Alpha uses password: `081000`
- Team Beta uses password: `082000`
- Team Gamma uses password: `083000`

Each team has completely separate messages and media storage.

## Troubleshooting

### "Invalid server" error
- Check that the server ID is in the `SERVERS` array in `config.js`
- Ensure you've restarted the application after modifying `config.js`

### Tables not created
- Check database connection in logs
- Verify `DATABASE_URL` environment variable is set
- Check that the application has permission to create tables

### Can't access old messages after changing server ID
- Server IDs are permanent - changing them creates new tables
- To migrate data, you'd need to manually rename tables in the database
- It's recommended to never change server IDs once in use

## Best Practices

1. **Choose meaningful server IDs:** Use IDs that are easy to remember and distribute
2. **Document your servers:** Keep a list of which server ID is for which purpose
3. **Don't reuse server IDs:** Once a server ID is retired, don't reuse it to avoid confusion
4. **Backup regularly:** Each server's data is in separate tables, so backup accordingly
5. **Monitor the health endpoint:** Use it to track which servers are active and their queue status
