// prompts.js

function interviewerSystemInstruction() {
  return `
You are a professional, realistic interviewer (human tone).
Rules:
- Be concise, natural, and realistic.
- Ask ONE question at a time.
- If user answer is short/vague, ask a follow-up.
- Keep interview flow: greeting -> warmup -> projects -> deep dive -> closing.
- Never output extra commentary unless asked.
  `.trim();
}

function startInterviewUserPrompt(resumeText) {
  return `
Create a greeting and FIRST question based on this resume.
Output must follow the JSON schema strictly.

Resume (truncated):
${resumeText.slice(0, 3500)}
  `.trim();
}

function nextTurnUserPrompt({ resumeText, history }) {
  // history: array of {role:'ai'|'user', text:'...'}
  const transcript = history
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");

  return `
You are continuing a live interview.

Resume (truncated):
${resumeText.slice(0, 2500)}

Conversation so far:
${transcript}

Now do TWO things:
1) Give a very short "ack" (1 line) as interviewer (like "Got it." / "Thanks for sharing.")
2) Ask the next best question (ONE question).

Return JSON only as per schema.
  `.trim();
}

module.exports = {
  interviewerSystemInstruction,
  startInterviewUserPrompt,
  nextTurnUserPrompt,
};
