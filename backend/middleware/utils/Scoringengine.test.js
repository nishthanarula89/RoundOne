// backend/middleware/utils/scoringEngine.test.js
const { calculateScore, countFillerWords, detectSTARStructure } = require("./scoringEngine");

describe("countFillerWords", () => {
  test("counts each filler word occurrence and returns a breakdown", () => {
    const text = "So, um, I think this is like, basically the best solution, you know?";
    const result = countFillerWords(text);

    expect(result.count).toBe(5);
    expect(result.breakdown).toEqual({
      so: 1,
      um: 1,
      like: 1,
      basically: 1,
      "you know": 1
    });
  });

  test("is case-insensitive", () => {
    const result = countFillerWords("UM, this is SO obvious, LIKE really.");
    expect(result.count).toBe(3);
  });

  test("does not match filler words embedded inside other words (word boundaries)", () => {
    // "dislike" contains "like" as a substring but should NOT count as the filler "like"
    const result = countFillerWords("I completely dislike this option.");
    expect(result.count).toBe(0);
  });

  test("returns zero count for text with no filler words", () => {
    const result = countFillerWords("The algorithm runs in O(n log n) time complexity.");
    expect(result.count).toBe(0);
    expect(result.breakdown).toEqual({});
  });

  test("matches multi-word fillers like 'you know' and 'kind of'", () => {
    const result = countFillerWords("It's kind of hard to explain, you know?");
    expect(result.breakdown["kind of"]).toBe(1);
    expect(result.breakdown["you know"]).toBe(1);
  });
});

describe("detectSTARStructure", () => {
  test("detects all four STAR stages when present", () => {
    const text = `At my last internship, I noticed our API was returning slow responses.
      I needed to reduce latency without breaking existing consumers.
      First I profiled the endpoints, then I added a caching layer.
      As a result, average response time dropped by 45%.`;
    const result = detectSTARStructure(text);

    expect(result.detected.situation).toBe(true);
    expect(result.detected.task).toBe(true);
    expect(result.detected.action).toBe(true);
    expect(result.detected.result).toBe(true);
    expect(result.stagesFound).toBe(4);
    expect(result.completeness).toBe(1);
  });

  test("returns zero completeness when no STAR signals are present", () => {
    const result = detectSTARStructure("Good.");
    expect(result.stagesFound).toBe(0);
    expect(result.completeness).toBe(0);
  });

  test("partially detects STAR stages and reports correct completeness fraction", () => {
    // Only situation + result signals present, no task/action language
    const text = "During my internship, we struggled with slow queries. As a result, we upgraded the database.";
    const result = detectSTARStructure(text);

    expect(result.detected.situation).toBe(true);
    expect(result.detected.result).toBe(true);
    expect(result.stagesFound).toBe(2);
    expect(result.completeness).toBe(0.5);
  });
});

describe("calculateScore (integration)", () => {
  test("returns an object with all expected fields", () => {
    const result = calculateScore("This is a test answer with reasonable length and no fillers at all.");
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("structureScore");
    expect(result).toHaveProperty("clarityScore");
    expect(result).toHaveProperty("fillerWordCount");
    expect(result).toHaveProperty("fillerBreakdown");
    expect(result).toHaveProperty("starAnalysis");
    expect(result).toHaveProperty("wordCount");
  });

  test("overallScore is always between 0 and 100", () => {
    const samples = [
      "Good.",
      "",
      "Um, so, like, I think, kind of, sort of, you know, basically, actually, um, so, like.",
      "At my last internship, I noticed our API was returning slow responses under load. I needed to reduce latency without breaking existing consumers. First I profiled the endpoints to find the bottleneck, then I added caching. As a result, response time dropped by 45%."
    ];
    samples.forEach(text => {
      const result = calculateScore(text);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });
  });

  test("a well-structured, filler-free answer scores meaningfully higher than a filler-heavy version of the same answer", () => {
    const base = `At my last internship, I noticed our API was returning slow responses under load.
      I needed to reduce latency without breaking existing consumers.
      First I profiled the endpoints to find the bottleneck, then I added an in-memory cache for
      repeated queries and introduced pagination for large result sets.
      As a result, average response time dropped by 45% and timeout errors fell to near zero
      within the first week of deployment.`;

    // Same content, same structure, same approximate length — just with filler words
    // sprinkled in. Word count stays within the 60-200 "sweet spot" bucket either way,
    // so the only meaningful difference driving the score gap is the filler penalty.
    const withFillers = `At my last internship, um, I noticed our API was, like, returning slow responses under load.
      I needed to, basically, reduce latency without breaking existing consumers.
      So first I, um, profiled the endpoints to find the bottleneck, then I, actually, added an
      in-memory cache for repeated queries and introduced pagination for large result sets.
      As a result, you know, average response time dropped by 45% and timeout errors fell to
      near zero within the first week of deployment.`;

    const cleanScore = calculateScore(base);
    const fillerScore = calculateScore(withFillers);

    expect(fillerScore.overallScore).toBeLessThan(cleanScore.overallScore);
    // fillerPenalty caps at 0.3, contributing up to a 6-point swing in overallScore
    // (0.2 weight * 0.3 penalty * 100). Allow some tolerance for word-count drift.
    const delta = cleanScore.overallScore - fillerScore.overallScore;
    expect(delta).toBeGreaterThanOrEqual(2);
    expect(delta).toBeLessThanOrEqual(8);
  });

  test("a very short answer scores low overall despite no grammar penalty (documents known scoring behavior)", () => {
    // Known quirk (flagged previously): a one-word answer like "good" gets a
    // deceptively OK clarity sub-score (short sentence, technically not a run-on),
    // but the overall score still lands low because structureScore (STAR detection)
    // is 0 for content this short — the weighted formula catches it even though
    // the clarity sub-metric alone would not.
    const result = calculateScore("good");
    expect(result.structureScore).toBe(0);
    expect(result.overallScore).toBeLessThan(50);
  });

  test("a very long, rambling answer scores lower on clarity than a well-sized answer", () => {
    const sweetSpot = "First I identified the root cause of the memory leak by profiling heap snapshots over time, then I patched the reference cycle causing objects to persist, and verified the fix by monitoring memory usage in staging for 48 hours before shipping to production.";
    const rambling = Array(15).fill("This is a very long rambling answer that keeps going and going without really getting to the point which makes it hard to follow along and understand what is actually being said here").join(". ");

    const sweetSpotScore = calculateScore(sweetSpot);
    const ramblingScore = calculateScore(rambling);

    expect(ramblingScore.clarityScore).toBeLessThan(sweetSpotScore.clarityScore);
  });

  test("filler word count and word count are reported accurately", () => {
    const result = calculateScore("So, um, this is like a test, you know.");
    expect(result.fillerWordCount).toBe(4); // so, um, like, you know
    expect(result.wordCount).toBeGreaterThan(0);
  });
});