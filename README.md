# Secure Ephemeral Chat

A simple, secure, session-based chat application designed for stealthy usage. It features a blank startup screen, password protection based on the current date, and automatic inactivity locking.

## Features

- **Stealth Mode**: Starts with a blank screen. Authenticate by typing the daily password blindly.
- **Inactivity Lock**: Automatically locks and stops polling after 5 seconds of inactivity.
- **Auto-Keyboard**: Clicking anywhere on the blank screen on mobile devices opens the keyboard.
- **Session Based**: Maintains user session securely.
- **Database**: Stores messages in PostgreSQL.

## Password Logic

The password changes daily.
Format: `DD8080`
- `DD`: The current day of the month (e.g., `07` for the 7th).
- `8080`: Fixed suffix.

**Example**: On the 7th of the month, the password is `078080`.

## Deployment

This app is designed to be split into two parts (optional) or run as a monolith on Render.

### Option 1: Monolith on Render (Easiest)
1.  **Deploy to Render**:
    *   Connect repo.
    *   Runtime: `Docker`.
    *   Env Vars: `DATABASE_URL` (from Render Postgres), `SESSION_SECRET`.
2.  **Access**: Go to your Render URL.

### Option 2: Frontend on GitHub Pages + Backend on Render
1.  **Backend (Render)**:
    *   Same as Option 1.
    *   **Important**: Copy your Render Web Service URL (e.g., `https://my-app.onrender.com`).
2.  **Frontend (GitHub Pages)**:
    *   Edit `index.html` in your repo:
        *   Find `const RENDER_BACKEND_URL = ...`
        *   Replace with your Render URL.
    *   Go to GitHub Repo Settings -> Pages.
    *   Source: `Deploy from a branch`.
    *   Branch: `main`, Folder: `/(root)`.
    *   Save.
3.  **Access**: Go to your GitHub Pages URL (e.g., `https://username.github.io/repo`).

### Local Development

1.  Clone the repository.
2.  Install dependencies: `npm install`.
3.  Set up a local Postgres database (or run without for in-memory mode).
4.  Run with environment variables:
    ```bash
    export DATABASE_URL=postgres://user:pass@localhost:5432/dbname
    npm start
    ```
5.  Open `http://localhost:3000`.

## Tech Stack

- **Frontend**: Plain HTML, CSS, JavaScript (Poll implementation).
- **Backend**: Node.js (Express).
- **Database**: PostgreSQL (pg).
