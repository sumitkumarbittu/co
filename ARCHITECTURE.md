# Multi-Server Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                         (index.html)                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Stealth Input: "Computing..."                           │  │
│  │  User types: DD1234, DD5678, or DD9999                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION LAYER                         │
│                      (server.js)                                │
│                                                                 │
│  1. Extract server ID from password (last 4 digits)            │
│  2. Validate server ID against config.js                       │
│  3. Verify password format: DD + ServerID                      │
│  4. Store serverId in session                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER CONFIGURATION                         │
│                        (config.js)                              │
│                                                                 │
│  const SERVERS = ['1234', '5678', '9999'];                     │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ Server   │  │ Server   │  │ Server   │                     │
│  │  1234    │  │  5678    │  │  9999    │                     │
│  └──────────┘  └──────────┘  └──────────┘                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                               │
│                    (PostgreSQL)                                 │
│                                                                 │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────┐│
│  │   Server 1234     │  │   Server 5678     │  │ Server 9999 ││
│  ├───────────────────┤  ├───────────────────┤  ├─────────────┤│
│  │ messages_1234     │  │ messages_5678     │  │messages_9999││
│  │ ├─ id             │  │ ├─ id             │  │├─ id        ││
│  │ ├─ content        │  │ ├─ content        │  │├─ content   ││
│  │ ├─ media_id       │  │ ├─ media_id       │  │├─ media_id  ││
│  │ └─ created_at     │  │ └─ created_at     │  │└─ created_at││
│  │                   │  │                   │  │             ││
│  │ media_1234        │  │ media_5678        │  │media_9999   ││
│  │ ├─ id             │  │ ├─ id             │  │├─ id        ││
│  │ ├─ filename       │  │ ├─ filename       │  │├─ filename  ││
│  │ ├─ mime_type      │  │ ├─ mime_type      │  │├─ mime_type ││
│  │ ├─ data (bytea)   │  │ ├─ data (bytea)   │  │├─ data      ││
│  │ └─ created_at     │  │ └─ created_at     │  │└─ created_at││
│  └───────────────────┘  └───────────────────┘  └─────────────┘│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    REQUEST FLOW EXAMPLE                         │
└─────────────────────────────────────────────────────────────────┘

User A enters: "081234"
    │
    ├─► Authenticated to Server 1234
    │
    ├─► Session: { authenticated: true, serverId: '1234' }
    │
    ├─► POST /api/messages → Writes to messages_1234
    │
    └─► GET /api/messages → Reads from messages_1234

User B enters: "085678"
    │
    ├─► Authenticated to Server 5678
    │
    ├─► Session: { authenticated: true, serverId: '5678' }
    │
    ├─► POST /api/messages → Writes to messages_5678
    │
    └─► GET /api/messages → Reads from messages_5678

┌─────────────────────────────────────────────────────────────────┐
│                    DATA ISOLATION                               │
└─────────────────────────────────────────────────────────────────┘

User A (Server 1234)          User B (Server 5678)
       │                              │
       │                              │
       ▼                              ▼
┌──────────────┐              ┌──────────────┐
│ messages_1234│              │ messages_5678│
│ media_1234   │              │ media_5678   │
└──────────────┘              └──────────────┘
       │                              │
       │                              │
       └──────────────────────────────┘
              NO CROSS ACCESS
           (Complete Isolation)

┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE QUEUE SYSTEM                         │
└─────────────────────────────────────────────────────────────────┘

offlineQueues = {
    '1234': [task1, task2, task3],
    '5678': [task1],
    '9999': []
}

When DB reconnects:
    ├─► Process queue for 1234
    ├─► Process queue for 5678
    └─► Process queue for 9999

Each server's queue is independent!

┌─────────────────────────────────────────────────────────────────┐
│                    ADDING A NEW SERVER                          │
└─────────────────────────────────────────────────────────────────┘

Step 1: Edit config.js
    const SERVERS = ['1234', '5678', '9999', '7777'];
                                              ^^^^^^
                                              NEW!

Step 2: Restart application
    npm start

Step 3: Tables auto-created on first login
    User enters: DD7777
        │
        └─► Creates: messages_7777, media_7777

Step 4: Done! Server 7777 is live.

┌─────────────────────────────────────────────────────────────────┐
│                    HEALTH MONITORING                            │
└─────────────────────────────────────────────────────────────────┘

GET /health returns:
{
    "servers": {
        "configured": ["1234", "5678", "9999"],
        "initialized": ["1234", "5678", "9999"]
    },
    "database": {
        "connected": true,
        "queuesByServer": {
            "1234": 0,
            "5678": 0,
            "9999": 0
        }
    }
}
```
