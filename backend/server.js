require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/database");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const { calculateScore } = require("./middleware/utils/scoringEngine");
const Session = require("./models/Session");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

connectDB();

// Global safety net — no single IP should be able to hammer the whole API.
// Generous enough not to bother real users, tight enough to stop abuse/scraping.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP. Please try again later." }
});
app.use(globalLimiter);

// Tighter limit on question generation and answer evaluation specifically —
// these are the two routes that cost real money/quota (Gemini calls), so
// they get their own stricter caps on top of the global one.
const geminiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // ~2 questions/answers per minute sustained — plenty for a real interview session
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're going a bit fast — please wait a few minutes before continuing." }
});

app.use("/api/auth", authRoutes);

app.get("/", (req, res) => res.send("Hello! Your backend is alive."));

const TOPIC_BUCKETS = {
  SDE: ["Data structures (arrays, strings, hashmaps)", "Algorithms (sorting, searching, recursion)", "OOP concepts and design", "System design basics", "A coding problem (medium complexity)"],
  DA: ["SQL queries and joins", "Statistics fundamentals", "Python/Pandas data manipulation", "Data visualization interpretation", "A case study on business metrics"],
  PM: ["Product sense and prioritization", "Metrics and analytics", "A case study/estimation problem", "Go-to-market strategy", "Stakeholder/tradeoff scenario"]
};

// Different phrasing/focus each time so Gemini doesn't default to the same
// "canonical" question for a given topic every time it's asked.
const ANGLES = [
  "framed as a real-world scenario the candidate might face on the job",
  "framed as a comparison between two approaches",
  "framed around a common mistake candidates make",
  "framed as a practical debugging or troubleshooting situation",
  "framed around trade-offs and edge cases",
  "framed as a 'walk me through how you'd design/solve X' style question",
  "framed around a specific concrete example rather than an abstract definition"
];

// In-memory recent-question cache so we don't repeat questions within a
// round or across rounds while the server process is alive.
// Keyed by role+difficulty+topic -> array of recently generated question strings.
const recentQuestionsCache = new Map();
const MAX_CACHE_PER_KEY = 25;

function cacheKey(role, difficulty, topic) {
  return `${role}::${difficulty}::${topic}`;
}

function getRecentQuestions(role, difficulty, topic) {
  return recentQuestionsCache.get(cacheKey(role, difficulty, topic)) || [];
}

function addRecentQuestion(role, difficulty, topic, question) {
  const key = cacheKey(role, difficulty, topic);
  const list = recentQuestionsCache.get(key) || [];
  list.push(question);
  if (list.length > MAX_CACHE_PER_KEY) list.shift();
  recentQuestionsCache.set(key, list);
}

async function callGemini(prompt, { timeoutMs = 15000, temperature = 0.7, topP = 0.95 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, topP }
        }),
        signal: controller.signal
      }
    );
    if (!r.ok) throw new Error(`Gemini API error: ${r.status}`);
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty Gemini response");
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

app.post("/generate-question", geminiLimiter, async (req, res) => {
  try {
    const { role, difficulty, questionIndex = 0 } = req.body;
    const buckets = TOPIC_BUCKETS[role] || TOPIC_BUCKETS.SDE;
    const topic = buckets[questionIndex % buckets.length];

    const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
    const recentQuestions = getRecentQuestions(role, difficulty, topic);

    const exclusionBlock = recentQuestions.length
      ? `\nDo NOT repeat or closely rephrase any of these previously asked questions:\n${recentQuestions.map(q => `- ${q}`).join("\n")}`
      : "";

    const text = await callGemini(
      `Generate one ${difficulty} difficulty interview question for a ${role} role, specifically about: ${topic}.
Phrase it ${angle}.${exclusionBlock}
Return ONLY the question, no numbering, no preamble.`,
      { temperature: 1.0, topP: 0.95 }
    );

    addRecentQuestion(role, difficulty, topic, text);

    res.json({ question: text });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Failed to generate question." });
  }
});

// Protected by authMiddleware so we know which user to save the session under.
// Frontend must send the JWT in the Authorization header.
app.post("/evaluate-answer", geminiLimiter, authMiddleware, async (req, res) => {
  const { question, answer, role, difficulty, roundId } = req.body;

  if (!roundId) {
    return res.status(400).json({ error: "Missing roundId — cannot group this answer into an interview round." });
  }

  try {
    // Step 1: rule-based scoring — runs instantly, no API call, never fails
    const ruleBasedScore = calculateScore(answer);

    // Step 2: Gemini call (now with timeout protection), given the rule-based signals
    let geminiResult;
    let geminiFailed = false;
    try {
      const text = await callGemini(
        `You are a strict but fair technical interviewer.
Question: "${question}"
Answer: "${answer}"
Rule-based signals already computed: ${JSON.stringify(ruleBasedScore)}
Respond ONLY with valid JSON, no markdown, no extra text:
{"score":<1-10>,"verdict":"<one sentence>","analysis":"<2-3 sentences on what was good/missing>","idealAnswer":"<3-5 sentence model answer showing the correct/complete solution>","technical":<1-10>,"communication":<1-10>,"clarity":<1-10>}`,
        { temperature: 0.4 }
      );
      const cleaned = text.replace(/```json|```/g, "").trim();
      try {
        geminiResult = JSON.parse(cleaned);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) geminiResult = JSON.parse(match[0]);
        else throw new Error("Could not parse AI response as JSON");
      }
      if (typeof geminiResult.score !== "number") throw new Error("Missing score in AI response");
    } catch (geminiError) {
      console.error("Gemini failed, falling back to rule-based only:", geminiError.message);
      geminiFailed = true;
      geminiResult = {
        score: Math.round(ruleBasedScore.overallScore / 10),
        verdict: "AI feedback temporarily unavailable — showing rule-based analysis only.",
        analysis: `Structure score: ${ruleBasedScore.structureScore}/100. Clarity score: ${ruleBasedScore.clarityScore}/100. Filler words used: ${ruleBasedScore.fillerWordCount}.`,
        idealAnswer: "A strong answer explains your reasoning step by step and covers the core concept the question is testing.",
        technical: null,
        communication: null,
        clarity: Math.round(ruleBasedScore.clarityScore / 10)
      };
    }

    // Step 3: merge into one score and persist
    const finalScore = geminiFailed
      ? ruleBasedScore.overallScore
      : Math.round((ruleBasedScore.overallScore + geminiResult.score * 10) / 2);

    const session = await Session.create({
      userId: req.userId,
      roundId,
      question,
      answerText: answer,
      role,
      difficulty,
      ruleBasedScore,
      geminiFeedback: geminiFailed ? null : JSON.stringify(geminiResult),
      finalScore
    });

    res.json({
      ...geminiResult,
      ruleBasedScore,
      finalScore,
      sessionId: session._id
    });
  } catch (e) {
    console.error("evaluate-answer failed completely:", e.message);
    res.status(500).json({
      score: 3,
      verdict: "Couldn't fully evaluate — something went wrong on our end.",
      analysis: "Please try submitting your answer again.",
      idealAnswer: null,
      technical: 3,
      communication: 3,
      clarity: 3
    });
  }
});

// Dashboard data — all past sessions for the logged-in user, newest first
app.get("/sessions", authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .select("question finalScore ruleBasedScore role difficulty roundId createdAt");
    res.json(sessions);
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Failed to fetch sessions." });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));