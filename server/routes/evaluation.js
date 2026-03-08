const express = require("express");
const router = express.Router();

function buildPrompt(transcript) {
  return `
You are an expert interview evaluator.

Evaluate the candidate only on communication and answer quality from this interview transcript.

Important scoring rules:
- Score based on communication skill, clarity, relevance, confidence, completeness, and professionalism.
- Focus mainly on USER answers. Use AI questions only for context.
- Do NOT score based only on message count or length.
- Be fair. If the candidate gives short but relevant answers, do not over-penalize.
- If the answer is vague, unclear, off-topic, repetitive, or weak, reduce marks.
- Return STRICT JSON only. No markdown. No explanation outside JSON.

Required JSON format:
{
  "total": number,
  "breakdown": [
    { "metric": "Clarity", "score": number, "outOf": 10, "notes": "..." },
    { "metric": "Relevance", "score": number, "outOf": 10, "notes": "..." },
    { "metric": "Confidence", "score": number, "outOf": 10, "notes": "..." },
    { "metric": "Completeness", "score": number, "outOf": 10, "notes": "..." },
    { "metric": "Professional Communication", "score": number, "outOf": 10, "notes": "..." }
  ],
  "feedback": {
    "strengths": ["...", "...", "..."],
    "improvements": ["...", "...", "..."],
    "finalVerdict": "..."
  }
}

Scoring conversion:
- Sum of 5 metrics is out of 50
- Convert to total out of 100

Transcript:
${transcript}
`;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error("Messages are required");
    err.status = 400;
    throw err;
  }

  const cleanedMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "ai"))
    .map((m) => ({
      role: m.role,
      text: String(m.text || "").trim(),
    }))
    .filter((m) => m.text.length > 0);

  if (!cleanedMessages.length) {
    const err = new Error("No valid messages found");
    err.status = 400;
    throw err;
  }

  return cleanedMessages;
}

async function callGemini(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  console.log("Gemini raw response:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    console.error("Gemini error:", data);
    const err = new Error(data?.error?.message || "Gemini API failed");
    err.status = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw err;
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) {
    const err = new Error("Empty Gemini response");
    err.status = 502;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error("JSON parse error:", text);
    const err = new Error("Invalid JSON returned by Gemini");
    err.status = 502;
    throw err;
  }

  return parsed;
}

async function generateEvaluation(messages, sessionId = null) {
  const cleanedMessages = normalizeMessages(messages);

  const transcript = cleanedMessages
    .map((m, i) => `${i + 1}. ${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");

  const prompt = buildPrompt(transcript);
  const parsed = await callGemini(prompt);

  const breakdown = Array.isArray(parsed.breakdown) ? parsed.breakdown : [];
  const totalFromBreakdown = breakdown.reduce(
    (sum, item) => sum + (Number(item.score) || 0),
    0
  );

  return {
    sessionId,
    total:
      typeof parsed.total === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.total)))
        : Math.max(0, Math.min(100, Math.round((totalFromBreakdown / 50) * 100))),
    breakdown: breakdown.map((b) => ({
      metric: b.metric || "Unknown",
      score: Math.max(0, Math.min(10, Number(b.score) || 0)),
      outOf: Number(b.outOf) || 10,
      notes: b.notes || "",
    })),
    feedback: {
      strengths: Array.isArray(parsed?.feedback?.strengths)
        ? parsed.feedback.strengths
        : [],
      improvements: Array.isArray(parsed?.feedback?.improvements)
        ? parsed.feedback.improvements
        : [],
      finalVerdict: parsed?.feedback?.finalVerdict || "",
    },
    messages: cleanedMessages,
  };
}

// Logged-in / normal route
router.post("/evaluate-summary", async (req, res) => {
  try {
    const { sessionId, messages } = req.body || {};
    const result = await generateEvaluation(messages, sessionId || null);
    return res.json(result);
  } catch (err) {
    console.error("Evaluate summary error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error while evaluating interview",
    });
  }
});

// Guest route
router.post("/guest-evaluate-summary", async (req, res) => {
  try {
    const { messages } = req.body || {};
    const result = await generateEvaluation(messages, null);
    return res.json(result);
  } catch (err) {
    console.error("Guest evaluate summary error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error while evaluating guest interview",
    });
  }
});

module.exports = router;