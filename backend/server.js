require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Hello! Your backend is alive."));

const TOPIC_BUCKETS = {
  SDE: ["Data structures (arrays, strings, hashmaps)", "Algorithms (sorting, searching, recursion)", "OOP concepts and design", "System design basics", "A coding problem (medium complexity)"],
  DA: ["SQL queries and joins", "Statistics fundamentals", "Python/Pandas data manipulation", "Data visualization interpretation", "A case study on business metrics"],
  PM: ["Product sense and prioritization", "Metrics and analytics", "A case study/estimation problem", "Go-to-market strategy", "Stakeholder/tradeoff scenario"]
};

async function callGemini(prompt, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
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

app.post("/generate-question", async (req, res) => {
  try {
    const { role, difficulty, questionIndex = 0 } = req.body;
    const buckets = TOPIC_BUCKETS[role] || TOPIC_BUCKETS.SDE;
    const topic = buckets[questionIndex % buckets.length];

    const text = await callGemini(
      `Generate one ${difficulty} difficulty interview question for a ${role} role, specifically about: ${topic}. Return ONLY the question, no numbering, no preamble.`
    );
    res.json({ question: text });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Failed to generate question." });
  }
});

app.post("/evaluate-answer", async (req, res) => {
  const { question, answer } = req.body;

  const fallback = {
    score: 3,
    verdict: "Couldn't fully evaluate — answer seemed too short or unclear to score properly.",
    analysis: "Try giving a more complete, specific answer with reasoning, not just a keyword or phrase.",
    idealAnswer: "A strong answer explains your reasoning step by step and covers the core concept the question is testing.",
    technical: 3,
    communication: 3,
    clarity: 3
  };

  try {
    const text = await callGemini(
      `You are a strict but fair technical interviewer.
Question: "${question}"
Answer: "${answer}"
Respond ONLY with valid JSON, no markdown, no extra text:
{"score":<1-10>,"verdict":"<one sentence>","analysis":"<2-3 sentences on what was good/missing>","idealAnswer":"<3-5 sentence model answer showing the correct/complete solution>","technical":<1-10>,"communication":<1-10>,"clarity":<1-10>}`
    );

    const cleaned = text.replace(/```json|```/g, "").trim();
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error("Could not parse AI response as JSON");
    }

    if (typeof result.score !== "number") throw new Error("Missing score in AI response");
    res.json(result);
  } catch (e) {
    console.error("evaluate-answer failed, using fallback:", e.message);
    res.json(fallback);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
