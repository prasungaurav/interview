// gemini.js
async function geminiJSON({ systemInstruction, userPrompt, schema, model = "gemini-2.5-flash" }) {
  const { GoogleGenAI } = await import("@google/genai");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in .env");

  const ai = new GoogleGenAI({ apiKey });

  const resp = await ai.models.generateContent({
    model,
    contents: userPrompt, // simple string is fine
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.6,
      maxOutputTokens: 300,
    },
  });

  // resp.text should be JSON string because of responseMimeType
  const raw = (resp.text || "").trim();

  // Safety: remove ```json fences if model adds them (rare in JSON mode, but just in case)
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

module.exports = { geminiJSON };
