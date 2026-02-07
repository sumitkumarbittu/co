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

## Deployment on Render

This application is ready for deployment on render.com (Free Tier).

### Prerequisites

1.  A [Render](https://render.com) account.
2.  Connect your GitHub repository containing this code to Render.

### Steps

1.  **Create a PostgreSQL Database**:
    *   Go to New + -> PostgreSQL.
    *   Name it `chat-db`.
    *   Choose the Free Plan.
    *   After creation, copy the **Internal Database URL**.

2.  **Create a Web Service**:
    *   Go to New + -> Web Service.
    *   Connect this repository.
    *   **Runtime**: `Docker`.
    *   **Instance Type**: Free.
    *   **Environment Variables**: Add the following:
        *   `DATABASE_URL`: Paste the Internal Database URL from step 1.
        *   `SESSION_SECRET`: (Optional) A random string for session security.
    *   Click **Create Web Service**.

### Local Development

1.  Clone the repository.
2.  Install dependencies: `npm install`.
3.  Set up a local Postgres database.
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
