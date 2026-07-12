# RoundOne — AI Mock Interview Coach

An AI-powered mock interview platform that generates role-specific interview questions, scores your answers in real time, and shows you the ideal answer you should have given — so you actually improve, not just get told "good job."

**Live demo:** https://nishthanarula89.github.io/RoundOne/frontend/index.html

---

## What it does

- Pick a role (SDE, Data Analyst, or Product Manager) and a difficulty level
- Answer 5 AI-generated interview questions — type or use voice input
- Get scored 1-10 per question with a breakdown across **technical depth, communication, and clarity**
- See the **ideal answer** for every question, not just feedback on what you got wrong
- Full session report with a score-by-question chart, performance-split doughnut chart, and a skill radar chart
- Dashboard tracks your average score, best score, day streak, and recent sessions across visits

## Why I built it

Most interview prep tools either give a static question bank or a generic "great answer!" with no substance. I wanted something that behaves like an actual interviewer — pointed feedback, a real benchmark answer, and visible progress over time.

## Tech stack

**Frontend:** HTML, CSS, vanilla JavaScript, Chart.js
**Backend:** Node.js, Express
**AI:** Google Gemini API (2.5 Flash) for question generation and answer evaluation
**Deployment:** Frontend on GitHub Pages, backend on Render

## How the scoring works

Each answer is sent to Gemini with a structured prompt that returns:
```json
{
  "score": 8,
  "verdict": "one-line summary",
  "analysis": "what was good or missing",
  "idealAnswer": "a model answer for this exact question",
  "technical": 8,
  "communication": 7,
  "clarity": 8
}
```

Questions are pulled from role-specific topic buckets (e.g., for SDE: data structures, algorithms, OOP, system design, and a coding problem) so each of the 5 questions in a session covers a genuinely different area instead of the AI repeating similar topics.

## Running it locally

```bash
# Backend
cd backend
npm install
# create a .env file with PORT, MONGO_URI, GEMINI_API_KEY, JWT_SECRET
node server.js

# Frontend
cd frontend
# open index.html with a live server (e.g. VS Code Live Server extension)
```

## Roadmap

- [ ] Real authentication (MongoDB + JWT) replacing local session state
- [ ] Persisted interview history across devices, not just localStorage
- [ ] Adaptive difficulty based on running performance within a session
- [ ] PDF export of session reports

