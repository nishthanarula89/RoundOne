// backend/utils/scoringEngine.js

const FILLER_WORDS = [
    "um", "uh", "like", "so", "basically", "actually",
    "you know", "kind of", "sort of", "i mean"
  ];
  
  const STAR_SIGNALS = {
    situation: ["at my", "during", "when i", "while working", "in my role", "the situation was"],
    task: ["i needed to", "my task was", "i was responsible", "the goal was", "i had to"],
    action: ["i decided", "so i", "i implemented", "i built", "i led", "i created", "first i", "then i"],
    result: ["as a result", "this led to", "ultimately", "in the end", "the outcome", "we achieved", "i improved"]
  };
  
  function countFillerWords(text) {
    const lower = text.toLowerCase();
    let count = 0;
    const found = {};
    FILLER_WORDS.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, "g");
      const matches = lower.match(regex);
      if (matches) {
        count += matches.length;
        found[word] = matches.length;
      }
    });
    return { count, breakdown: found };
  }
  
  function detectSTARStructure(text) {
    const lower = text.toLowerCase();
    const detected = {};
    let hits = 0;
  
    for (const [stage, signals] of Object.entries(STAR_SIGNALS)) {
      const found = signals.some(signal => lower.includes(signal));
      detected[stage] = found;
      if (found) hits++;
    }
  
    return {
      detected,
      stagesFound: hits,
      completeness: hits / 4 // 0 to 1
    };
  }
  
  function calculateClarityScore(text) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
  
    // Sweet spot: 60-200 words for a mock interview answer.
    // Too short = underdeveloped, too long = rambling.
    let lengthScore;
    if (wordCount < 20) lengthScore = 0.3;
    else if (wordCount < 60) lengthScore = 0.7;
    else if (wordCount <= 200) lengthScore = 1.0;
    else if (wordCount <= 300) lengthScore = 0.7;
    else lengthScore = 0.4;
  
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = wordCount / Math.max(sentences.length, 1);
    // Very long sentences hurt clarity
    const sentenceScore = avgWordsPerSentence <= 25 ? 1.0 : 0.6;
  
    return {
      wordCount,
      sentenceCount: sentences.length,
      avgWordsPerSentence: Math.round(avgWordsPerSentence),
      lengthScore,
      sentenceScore
    };
  }
  
  function calculateScore(text) {
    const fillers = countFillerWords(text);
    const star = detectSTARStructure(text);
    const clarity = calculateClarityScore(text);
  
    // Filler penalty: more than 5 fillers starts hurting the score meaningfully
    const fillerPenalty = Math.min(fillers.count * 0.05, 0.3);
  
    const structureScore = star.completeness; // 0 to 1
    const clarityScore = (clarity.lengthScore + clarity.sentenceScore) / 2;
  
    const overallScore = Math.max(
      0,
      Math.round(
        ((structureScore * 0.4) + (clarityScore * 0.4) + ((1 - fillerPenalty) * 0.2)) * 100
      )
    );
  
    return {
      overallScore,       // 0-100, use this as the headline number
      structureScore: Math.round(structureScore * 100),
      clarityScore: Math.round(clarityScore * 100),
      fillerWordCount: fillers.count,
      fillerBreakdown: fillers.breakdown,
      starAnalysis: star.detected,
      wordCount: clarity.wordCount
    };
  }
  
  module.exports = { calculateScore, countFillerWords, detectSTARStructure };