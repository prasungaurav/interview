require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");

// ✅ Session
const session = require("express-session");
const connectMongo = require("connect-mongo");
const MongoStore = connectMongo?.default || connectMongo;

// Models (DB mode)
const User = require("./models/User");
const Resume = require("./models/Resume");
const SessionModel = require("./models/Session");
const Message = require("./models/Message");


// Routes
const authRouter = require("./routes/auth");
const evaluationRouter = require("./routes/evaluation.js");


// Gemini + prompts
const { geminiJSON } = require("./gemini");
const {
  interviewerSystemInstruction,
  startInterviewUserPrompt,
  nextTurnUserPrompt,
} = require("./prompts");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ai_interview_coach";

// ------------------- helpers -------------------
const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));
const toObjectId = (v) => new mongoose.Types.ObjectId(String(v));

// ------------------- middleware -------------------
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    // ✅ allow common headers (NO x-user-id needed)
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});


app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// For proxy environments (safe even locally)
app.set("trust proxy", 1);

// ✅ Session store
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "dev_secret_change_this",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      collectionName: "auth_sessions",
      ttl: 14 * 24 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // http localhost
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  })
);

// ✅ ONLY session-based auth
const authMiddleware = (req, res, next) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!isValidObjectId(userId)) return res.status(401).json({ error: "Invalid session userId" });
  req.userId = String(userId);
  next();
};

// ------------------- upload (memory) -------------------
const uploadPdf = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files allowed"));
  },
});

// ------------------- routes -------------------
app.get("/", (req, res) => res.json({ message: "Server is running" }));

app.use("/api/auth", authRouter);
app.use("/api/interview", evaluationRouter);

// ✅ login persistence
app.get("/api/auth/me", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId || !isValidObjectId(userId)) return res.json({ user: null });
    const user = await User.findById(userId).select("_id name email").lean();
    return res.json({ user: user || null });
  } catch (e) {
    console.error("me error:", e);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

/* =========================================================
   ✅ GUEST MODE (NO LOGIN, NO DB SAVE)
   ========================================================= */

// 1) Guest resume parse (PDF -> text) ✅ no DB
app.post("/api/guest/resume/parse", uploadPdf.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = (pdfData?.text || "").trim();

    if (!resumeText) return res.status(400).json({ error: "Could not extract text from PDF" });

    return res.json({
      resume: {
        filename: req.file.originalname,
        text: resumeText,
      },
    });
  } catch (e) {
    console.error("guest resume parse error:", e);
    return res.status(500).json({ error: "Failed to parse resume", details: e?.message });
  }
});

// 2) Guest interview start ✅ no DB
app.post("/api/guest/interview/start", async (req, res) => {
  try {
    const { resumeText } = req.body || {};
    if (!resumeText || !String(resumeText).trim()) {
      return res.status(400).json({ error: "resumeText required" });
    }

    const userPrompt = startInterviewUserPrompt(String(resumeText));

    const schema = {
      type: "object",
      properties: { greeting: { type: "string" }, question: { type: "string" } },
      required: ["greeting", "question"],
    };

    const aiResult = await geminiJSON({
      systemInstruction: interviewerSystemInstruction(),
      userPrompt,
      schema,
    });

    const fullResponse = `${aiResult.greeting}\n\n${aiResult.question}`;

    // ✅ return a "message" shape like your UI expects
    return res.json({
      message: {
        _id: "guest_ai_1",
        role: "ai",
        text: fullResponse,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("guest start error:", e);
    return res.status(500).json({ error: "Failed to start guest interview", details: e?.message });
  }
});

// 3) Guest next turn ✅ no DB
app.post("/api/guest/interview/next", async (req, res) => {
  try {
    const { resumeText, history, text } = req.body || {};

    if (!resumeText || !String(resumeText).trim()) {
      return res.status(400).json({ error: "resumeText required" });
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "text required" });
    }

    // history format expected:
    // [{ role: "user"|"ai", text: "..." }, ...]
    const safeHistory = Array.isArray(history) ? history : [];

    const userPrompt = nextTurnUserPrompt({
      resumeText: String(resumeText),
      history: safeHistory,
    });

    const schema = {
      type: "object",
      properties: { ack: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    };

    const aiResult = await geminiJSON({
      systemInstruction: interviewerSystemInstruction(),
      userPrompt,
      schema,
    });

    const fullResponse = aiResult.ack
      ? `${aiResult.ack}\n\n${aiResult.question}`
      : aiResult.question;

    return res.json({
      message: {
        _id: `guest_ai_${Date.now()}`,
        role: "ai",
        text: fullResponse,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("guest next error:", e);
    return res.status(500).json({ error: "Failed to generate guest response", details: e?.message });
  }
});

/* =========================================================
   ✅ LOGGED-IN MODE (SESSION AUTH + DB SAVE)
   ========================================================= */

// ✅ active session
app.get("/api/interview/active", authMiddleware, async (req, res) => {
  try {
    const ownerId = toObjectId(req.userId);
    const active = await SessionModel.findOne({
      ownerId,
      status: { $in: ["active", "paused"] },
    })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ session: active || null });
  } catch (e) {
    console.error("active session error:", e);
    return res.status(500).json({ error: "Failed to fetch active session" });
  }
});

// ✅ create session (DB)
app.post("/api/interview/create", authMiddleware, async (req, res) => {
  try {
    const { resumeId, title = "Interview Session" } = req.body || {};
    const ownerId = toObjectId(req.userId);

    const ownerKey =
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    let validResumeId = null;
    if (resumeId) {
      if (!isValidObjectId(resumeId)) return res.status(400).json({ error: "Invalid resumeId" });
      const resume = await Resume.findById(resumeId).lean();
      if (!resume) return res.status(404).json({ error: "Resume not found" });
      validResumeId = resume._id;
    }

    const sessionDoc = await SessionModel.create({
      resumeId: validResumeId,
      title,
      ownerId,
      ownerKey,
      status: "active",
    });

    return res.json({
      session: {
        _id: sessionDoc._id,
        title: sessionDoc.title,
        ownerKey: sessionDoc.ownerKey,
        ownerId: sessionDoc.ownerId,
        status: sessionDoc.status,
        createdAt: sessionDoc.createdAt,
        updatedAt: sessionDoc.updatedAt,
      },
    });
  } catch (e) {
    console.error("Session creation error:", e);
    return res.status(500).json({ error: "Failed to create session", details: e?.message });
  }
});

// ✅ sessions list (DB)
app.get("/api/interview/sessions", authMiddleware, async (req, res) => {
  try {
    const ownerId = toObjectId(req.userId);
    const sessions = await SessionModel.find({ ownerId }).sort({ updatedAt: -1 }).lean();
    return res.json({ sessions });
  } catch (e) {
    console.error("Get sessions error:", e);
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// ✅ get single session + messages (DB)
app.get("/api/interview/session/:sessionId", authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(sessionId)) return res.status(400).json({ error: "Invalid sessionId" });

    const sessionDoc = await SessionModel.findById(sessionId)
      .populate("resumeId")
      .populate("ownerId", "name email");

    if (!sessionDoc) return res.status(404).json({ error: "Session not found" });
    if (String(sessionDoc.ownerId?._id) !== String(userId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const messages = await Message.find({ sessionId }).sort({ createdAt: 1 }).lean();

    return res.json({
      session: {
        _id: sessionDoc._id,
        title: sessionDoc.title,
        status: sessionDoc.status,
        resume: sessionDoc.resumeId,
        owner: sessionDoc.ownerId,
        createdAt: sessionDoc.createdAt,
        updatedAt: sessionDoc.updatedAt,
      },
      messages,
    });
  } catch (e) {
    console.error("Get session error:", e);
    return res.status(500).json({ error: "Failed to fetch session" });
  }
});

// ✅ start interview (DB) -> saves first AI message
app.post("/api/interview/start", authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const userId = req.userId;

    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    if (!isValidObjectId(sessionId)) return res.status(400).json({ error: "Invalid sessionId" });

    const sessionDoc = await SessionModel.findById(sessionId).populate("resumeId");
    if (!sessionDoc) return res.status(404).json({ error: "Session not found" });
    if (String(sessionDoc.ownerId) !== String(userId)) return res.status(403).json({ error: "Access denied" });

    const existing = await Message.findOne({ sessionId }).lean();
    if (existing) return res.status(400).json({ error: "Interview already started" });

    const resumeText = sessionDoc.resumeId?.text || "No resume provided";
    const userPrompt = startInterviewUserPrompt(resumeText);

    const schema = {
      type: "object",
      properties: { greeting: { type: "string" }, question: { type: "string" } },
      required: ["greeting", "question"],
    };

    const aiResult = await geminiJSON({
      systemInstruction: interviewerSystemInstruction(),
      userPrompt,
      schema,
    });

    const fullResponse = `${aiResult.greeting}\n\n${aiResult.question}`;

    const aiMessage = await Message.create({ sessionId, role: "ai", text: fullResponse });

    return res.json({
      message: aiMessage,
      session: { _id: sessionDoc._id, title: sessionDoc.title, status: sessionDoc.status },
    });
  } catch (e) {
    console.error("Start interview error:", e);
    return res.status(500).json({ error: "Failed to start interview", details: e?.message });
  }
});

// ✅ save user msg (DB)
app.post("/api/interview/message", authMiddleware, async (req, res) => {
  try {
    const { sessionId, text } = req.body || {};
    const userId = req.userId;

    if (!sessionId || !text) return res.status(400).json({ error: "sessionId and text required" });
    if (!isValidObjectId(sessionId)) return res.status(400).json({ error: "Invalid sessionId" });

    const sessionDoc = await SessionModel.findById(sessionId).lean();
    if (!sessionDoc) return res.status(404).json({ error: "Session not found" });
    if (String(sessionDoc.ownerId) !== String(userId)) return res.status(403).json({ error: "Access denied" });

    const userMessage = await Message.create({ sessionId, role: "user", text });
    return res.json({ message: userMessage });
  } catch (e) {
    console.error("Message save error:", e);
    return res.status(500).json({ error: "Failed to save message", details: e?.message });
  }
});

// ✅ AI response (DB) -> saves AI message
app.post("/api/interview/ai-response", authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const userId = req.userId;

    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    if (!isValidObjectId(sessionId)) return res.status(400).json({ error: "Invalid sessionId" });

    const sessionDoc = await SessionModel.findById(sessionId).populate("resumeId");
    if (!sessionDoc) return res.status(404).json({ error: "Session not found" });
    if (String(sessionDoc.ownerId) !== String(userId)) return res.status(403).json({ error: "Access denied" });

    const resumeText = sessionDoc.resumeId?.text || "No resume provided";

    const history = await Message.find({ sessionId }).sort({ createdAt: 1 }).lean();
    const conversationHistory = history.map((m) => ({
      role: m.role === "user" ? "user" : "ai",
      text: m.text,
    }));

    const userPrompt = nextTurnUserPrompt({ resumeText, history: conversationHistory });

    const schema = {
      type: "object",
      properties: { ack: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    };

    const aiResult = await geminiJSON({
      systemInstruction: interviewerSystemInstruction(),
      userPrompt,
      schema,
    });

    const fullResponse = aiResult.ack
      ? `${aiResult.ack}\n\n${aiResult.question}`
      : aiResult.question;

    const aiMessage = await Message.create({ sessionId, role: "ai", text: fullResponse });
    return res.json({ message: aiMessage });
  } catch (e) {
    console.error("AI response error:", e);
    return res.status(500).json({ error: "Failed to generate AI response", details: e?.message });
  }
});

/* ------------------- resume (DB, logged-in only) ------------------- */

// ✅ logged-in resume upload -> saves in DB
app.post("/api/resume/upload", authMiddleware, uploadPdf.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const userId = req.userId;
    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text;

    const resume = await Resume.create({
      userId: toObjectId(userId),
      filename: req.file.originalname,
      text: resumeText,
    });

    return res.json({
      resume: { _id: resume._id, filename: resume.filename, createdAt: resume.createdAt },
    });
  } catch (e) {
    console.error("Resume upload error:", e);
    return res.status(500).json({ error: "Failed to upload resume", details: e?.message });
  }
});

// ✅ logged-in resume list -> DB
app.get("/api/resume/list", authMiddleware, async (req, res) => {
  try {
    const userId = toObjectId(req.userId);

    const resumes = await Resume.find({ userId })
      .select("_id filename createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ resumes });
  } catch (e) {
    console.error("Get resumes error:", e);
    return res.status(500).json({ error: "Failed to fetch resumes", details: e?.message });
  }
});

// ------------------- DB -------------------
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Global error handler
app.use((err, req, res, next) => {
  console.error("Express Error:", err);
  return res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

module.exports = app;
