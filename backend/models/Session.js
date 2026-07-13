// backend/models/Session.js
const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
    role: { type: String },
    difficulty: { type: String }
  },
  question: {
    type: String,
    required: true
  },
  answerText: {
    type: String,
    required: true
  },
  ruleBasedScore: {
    overallScore: Number,
    structureScore: Number,
    clarityScore: Number,
    fillerWordCount: Number,
    fillerBreakdown: mongoose.Schema.Types.Mixed,
    starAnalysis: mongoose.Schema.Types.Mixed,
    wordCount: Number
  },
  geminiFeedback: {
    type: String,
    default: null
  },
  finalScore: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model("Session", sessionSchema);