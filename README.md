# Smart Study Planner 📚⏳

An advanced study companion designed to help students optimize their learning using active recall techniques (the Feynman Technique), spaced repetition tracking, interactive tasks, and an integrated AI Study Assistant.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/prajapatigavesha-ops/Smart-Study-Planner)

---

## 🚀 Launching on the Official Server (Render)

To deploy this application to **Render**, follow these simple steps:

### Option A: One-Click Deploy (Recommended)
1. Ensure your latest changes are pushed to your GitHub repository: `https://github.com/prajapatigavesha-ops/Smart-Study-Planner`
2. Click the button below or in the repository header:
   👉 **[Deploy to Render](https://render.com/deploy?repo=https://github.com/prajapatigavesha-ops/Smart-Study-Planner)**
3. Log in to your Render account.
4. Render will automatically detect the `render.yaml` configuration and set up the Web Service.
5. (Optional) Provide your `OPENAI_API_KEY` under the Environment Variables section in Render if you wish to activate the AI Study Assistant.

---

### Option B: Manual Setup via Render Dashboard
If you prefer setting up the web service manually:
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository: `prajapatigavesha-ops/Smart-Study-Planner`.
4. Configure the settings:
   - **Name**: `smart-study-planner`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm rebuild sqlite3 --build-from-source`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `PORT`: `3000`
   - `OPENAI_API_KEY`: *(Your OpenAI API Key for tutor suggestions)*
6. Click **Create Web Service**.

> [!WARNING]
> Render's **Free Tier** web services spin down after 15 minutes of inactivity and utilize ephemeral storage. This means your SQLite database (`database.sqlite`) will reset when the service restarts or spins down. 
> For persistent database storage in production, we recommend connecting to a cloud database (like **Render PostgreSQL** or **Neon**) and updating the server connection code.

---

## 🛠️ Local Development

To run the application locally on your computer:

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start the Server**:
   ```bash
   node server.js
   ```
3. **Open the browser**:
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## ✨ Features

- **Feynman Technique Interface**: Learn by explaining concepts, and get instant feedback.
- **Spaced Repetition System**: Automatically schedule review intervals based on difficulty rating.
- **Task Management**: Simple Pomodoro-friendly tasks tracking.
- **AI Tutor Integration**: Get contextual study plans and explanations powered by OpenAI.
