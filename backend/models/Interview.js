const mongoose = require("mongoose");

const interviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: String,
  difficulty: String,
  overallScore: Number,
  questions: [
    {
      question: String,
      answer: String,
      score: Number,
      verdict: String,
      analysis: String,
      idealAnswer: String,
      technical: Number,
      communication: Number,
      clarity: Number
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Interview", interviewSchema);
