import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import "../Style/interviewroom.css";
import Interviewer3D from "./Interviewer3D";

const API_BASE = "http://localhost:5000";
const meImg = "/logo192.png";

// ✅ report/summary page route
const REPORT_ROUTE = (sid) => `/summary/${sid}`;

function formatTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function wordCount(s = "") {
  return String(s).trim().split(/\s+/).filter(Boolean).length;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function naturalDelayFor(text, { base = 350, perWord = 40, jitter = 500 } = {}) {
  const w = wordCount(text);
  const ms = base + w * perWord + Math.random() * jitter;
  return clamp(ms, 350, 2000);
}
function cleanupRepeats(text) {
  return String(text || "")
    .replace(/\b(\w+)(\s+\1\b)+/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// small helper (safe json)
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ✅ summary builder (guest + logged-in both)
function buildSummary(messages = []) {
  const aiCount = messages.filter((m) => m.role === "ai").length;
  const userCount = messages.filter((m) => m.role === "user").length;

  const userWords = messages
    .filter((m) => m.role === "user")
    .reduce((sum, m) => sum + wordCount(m.text || ""), 0);

  const avgWords = userCount ? Math.round(userWords / userCount) : 0;

  // placeholder marks (you will replace with real scoring later)
  const total = Math.max(0, Math.min(100, 40 + Math.min(60, aiCount * 8 + userCount * 4)));

  return {
    total,
    aiCount,
    userCount,
    avgWords,
    breakdown: [
      { metric: "Completion", score: Math.min(10, userCount), outOf: 10, notes: "Answers submitted" },
      { metric: "Engagement", score: Math.min(10, aiCount), outOf: 10, notes: "Questions attempted" },
      {
        metric: "Answer Length",
        score: Math.min(10, Math.round(avgWords / 10)),
        outOf: 10,
        notes: `${avgWords} words avg`,
      },
    ],
  };
}

export default function InterviewRoom() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const location = useLocation();

  // ✅ SAME PAGE supports guest + db
  const isGuest = String(sessionId || "").startsWith("guest-");

  // ✅ guest resume text from nav state OR localStorage fallback
  const guestResumeText =
    location.state?.resumeText ||
    (() => {
      try {
        const raw = localStorage.getItem("guestResume");
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed?.text || "";
      } catch {
        return "";
      }
    })();

  // chat
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  // UX
  const [aiTyping, setAiTyping] = useState(false);
  const [avatarMode, setAvatarMode] = useState("idle"); // idle|thinking|speaking|listening

  // toggles
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);

  // ✅ AUTO MODE (hands-free)
  const [autoMode, setAutoMode] = useState(true);

  // ✅ STT split states
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const answerText = (finalText + " " + interimText).replace(/\s+/g, " ").trim();

  const [listening, setListening] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [sttStatus, setSttStatus] = useState("");

  // 3D reset key
  const [avatarKey, setAvatarKey] = useState(0);

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const userVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // prevent re-speaking same AI message
  const lastSpokenRef = useRef("");
  const waitingServerRef = useRef(false);

  // refs
  const listeningRef = useRef(false);
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  const finalTextRef = useRef("");
  useEffect(() => {
    finalTextRef.current = finalText;
  }, [finalText]);

  // guard to prevent too many restarts
  const sttRetryRef = useRef(0);
  const sttStartingRef = useRef(false);

  // ---------------- AUTO: VAD + silence autosend ----------------
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const vadRafRef = useRef(0);

  const lastVoiceAtRef = useRef(0);
  const silenceTimerRef = useRef(null);
  const sendingRef = useRef(false);
  const vadSpokeLatchRef = useRef(false);

  // ✅ block VAD while AI is speaking
  const allowVadAfterRef = useRef(0);

  // ---------------- VIDEO RECORDING (MediaRecorder) ----------------
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordStartAtRef = useRef(0);

  function startRecording() {
    try {
      const stream = userVideoRef.current?.srcObject;
      if (!stream) return;

      recordedChunksRef.current = [];
      recordStartAtRef.current = Date.now();

      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : "video/webm";

      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      rec.start(500);
    } catch (e) {
      console.error("MediaRecorder error:", e);
    }
  }

  function stopRecording() {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec) return resolve(null);

      rec.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        resolve(blob);
      };

      try {
        rec.stop();
      } catch {
        resolve(null);
      }

      recorderRef.current = null;
    });
  }

  // ---------------- Load messages (DB only) ----------------
  async function loadMessages({ withTypingFx = false } = {}) {
    if (!sessionId) return;

    // ✅ guest has no DB messages endpoint
    if (isGuest) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/interview/session/${sessionId}`, {
        credentials: "include",
      });

      const data = await safeJson(res);
      const list = data?.messages || [];

      if (withTypingFx) {
        const last = list[list.length - 1];
        if (last?.role === "ai") {
          setAiTyping(true);
          setAvatarMode("thinking");
          await sleep(naturalDelayFor(last.text));
          setAiTyping(false);
        }
      }

      setMessages(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      waitingServerRef.current = false;
    }
  }

  // ✅ On open:
  // - db: load history
  // - guest: start interview once to get first AI question
  useEffect(() => {
    if (!sessionId) return;

    if (!isGuest) {
      loadMessages();
      return;
    }

    // guest: if already has messages, skip
    if (messages.length > 0) {
      setLoading(false);
      return;
    }

    (async () => {
      if (!guestResumeText || !guestResumeText.trim()) {
        alert("Guest resume missing. Go back and upload resume again.");
        nav("/", { replace: true });
        return;
      }

      setLoading(true);
      setAiTyping(true);
      setAvatarMode("thinking");

      try {
        const resp = await fetch(`${API_BASE}/api/guest/interview/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText: guestResumeText }),
        });

        const data = await safeJson(resp);

        if (!resp.ok) {
          const msg =
            resp.status === 429
              ? "AI quota exceeded (Gemini). Try later / enable billing / change API key."
              : data?.error || data?.details || "Failed to start guest interview";
          console.error("Guest start failed:", data);
          alert(msg);
          setMessages([
            { _id: "guest-ai-error", role: "ai", text: msg, createdAt: new Date().toISOString() },
          ]);
          setAvatarMode("idle");
          return;
        }

        const first =
          typeof data?.message === "string"
            ? { _id: "guest-ai-1", role: "ai", text: data.message, createdAt: new Date().toISOString() }
            : data?.message || null;

        setMessages(first ? [first] : []);
        setAvatarMode("idle");
      } catch (e) {
        console.error(e);
        alert("Network error (guest start).");
        setAvatarMode("idle");
      } finally {
        setAiTyping(false);
        setLoading(false);
      }
    })();

    // eslint-disable-next-line
  }, [sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOpen, aiTyping]);

  // ---------------- Last AI message ----------------
  const lastAiMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "ai") return messages[i].text;
    }
    return "";
  }, [messages]);

  // ---------------- Voice load (Chrome/Edge) ----------------
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const load = () => window.speechSynthesis.getVoices();
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      try {
        window.speechSynthesis.onvoiceschanged = null;
      } catch {}
    };
  }, []);

  function hardStopTTS() {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    setAiSpeaking(false);
    allowVadAfterRef.current = Date.now() + 500;
  }

  // ---------------- TTS for AI message ----------------
  useEffect(() => {
    if (!lastAiMessage) return;
    if (lastSpokenRef.current === lastAiMessage) return;
    if (aiTyping) return;

    const now = Date.now();
    if (now - (lastVoiceAtRef.current || 0) < 1200) return;

    lastSpokenRef.current = lastAiMessage;
    speakText(lastAiMessage);
    // eslint-disable-next-line
  }, [lastAiMessage, aiTyping]);

  function speakText(text) {
    try {
      if (!window.speechSynthesis) return;
      if (listeningRef.current) return;

      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.volume = 1.0;
      u.rate = 0.95;
      u.pitch = 1.0;
      u.lang = "en-IN";

      const voices = window.speechSynthesis.getVoices() || [];
      const indianVoice =
        voices.find((v) => v.name.includes("Neerja") && v.name.includes("Online")) ||
        voices.find((v) => v.name.includes("Prabhat") && v.name.includes("Online")) ||
        voices.find((v) => v.name.includes("Google English (India)")) ||
        voices.find((v) => v.lang === "en-IN" || v.lang === "en_IN") ||
        voices.find((v) => (v.lang || "").startsWith("en-"));

      if (indianVoice) u.voice = indianVoice;

      u.onstart = () => {
        setAiSpeaking(true);
        setAvatarMode("speaking");
        allowVadAfterRef.current = Date.now() + 800;
      };

      const release = () => {
        setAiSpeaking(false);
        setAvatarMode(micOn ? "listening" : "idle");
        allowVadAfterRef.current = Date.now() + 700;
      };

      u.onend = release;
      u.onerror = (e) => {
        console.error("TTS error:", e);
        release();
      };

      window.speechSynthesis.speak(u);
    } catch (e) {
      console.error("TTS error", e);
      setAiSpeaking(false);
      setAvatarMode("idle");
      allowVadAfterRef.current = Date.now() + 700;
    }
  }

  // ---------------- Camera ----------------
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        mediaStreamRef.current = stream;

        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
          userVideoRef.current.onloadedmetadata = () => {
            userVideoRef.current.play().catch(() => {});
          };
        }
        setCamOn(true);
      } catch (e) {
        console.error(e);
        setCamOn(false);
      }

      if (autoMode && micOn) startVAD();
    })();

    return () => {
      stopListening();
      stopAllMedia();
      stopVAD();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try {
        window.speechSynthesis?.cancel();
      } catch {}
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!autoMode) {
      stopVAD();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      return;
    }
    if (autoMode && micOn) startVAD();
    // eslint-disable-next-line
  }, [autoMode, micOn]);

  function stopAllMedia() {
    try {
      if (userVideoRef.current) {
        userVideoRef.current.pause();
        userVideoRef.current.srcObject = null;
      }
    } catch {}

    try {
      const stream = mediaStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    } catch {}

    mediaStreamRef.current = null;
  }

  function toggleCamera() {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const next = !camOn;
    track.enabled = next;
    setCamOn(next);
  }

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);

    if (!next) {
      if (listening) stopListening();
      stopVAD();
      hardStopTTS();
    } else {
      if (autoMode) startVAD();
    }
  }

  // ---------------- AUTO: schedule autosend after 3s silence ----------------
  function scheduleAutoSend() {
    if (!autoMode) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    silenceTimerRef.current = setTimeout(async () => {
      if (!autoMode) return;
      if (sendingRef.current) return;
      if (aiTyping) return;

      const text = (finalTextRef.current || "").trim();
      if (!text) return;

      const now = Date.now();
      if (now - (lastVoiceAtRef.current || 0) < 3000) return;

      sendingRef.current = true;

      try {
        recognitionRef.current?.stop();
      } catch {}

      listeningRef.current = false;
      setListening(false);
      setInterimText("");
      setAvatarMode("thinking");

      await uploadVideoMessage({ text });

      sendingRef.current = false;
    }, 3000);
  }

  // ---------------- AUTO: VAD ----------------
  async function startVAD() {
    if (!autoMode) return;
    if (!micOn) return;
    if (audioCtxRef.current && analyserRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const THRESHOLD = 0.04;
      const HOLD_MS = 180;

      let aboveSince = 0;

      const loop = () => {
        vadRafRef.current = requestAnimationFrame(loop);
        if (!analyserRef.current) return;

        if (aiSpeaking || Date.now() < allowVadAfterRef.current) {
          aboveSince = 0;
          return;
        }

        analyserRef.current.getByteTimeDomainData(data);

        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();

        if (rms > THRESHOLD) {
          if (!aboveSince) aboveSince = now;

          if (now - aboveSince > HOLD_MS) {
            lastVoiceAtRef.current = now;
            if (aiSpeaking) hardStopTTS();

            if (!listeningRef.current && micOn) {
              if (!vadSpokeLatchRef.current) {
                vadSpokeLatchRef.current = true;
                startListening({ silentUI: true });
                setTimeout(() => (vadSpokeLatchRef.current = false), 800);
              }
            }

            scheduleAutoSend();
          }
        } else {
          aboveSince = 0;
        }
      };

      loop();
    } catch (e) {
      console.error("VAD error:", e);
    }
  }

  function stopVAD() {
    try {
      if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
    } catch {}
    vadRafRef.current = 0;

    try {
      analyserRef.current = null;
      audioCtxRef.current?.close?.();
    } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;

    try {
      micStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch {}
    micStreamRef.current = null;
  }

  // ---------------- STT ----------------
  function ensureRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    if (recognitionRef.current) return recognitionRef.current;

    const rec = new SpeechRecognition();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (event) => {
      let interim = "";
      let newFinal = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) newFinal += t + " ";
        else interim += t;
      }

      lastVoiceAtRef.current = Date.now();
      setInterimText(interim.trim());

      if (newFinal.trim()) {
        setFinalText((prev) => (prev + " " + newFinal).replace(/\s+/g, " ").trim());
      }

      scheduleAutoSend();
    };

    rec.onerror = (e) => {
      console.error("STT error:", e);
      const err = e?.error || "unknown";
      setSttStatus(`❌ STT: ${err}`);

      if (listeningRef.current && err === "network") {
        sttRetryRef.current += 1;
        if (sttRetryRef.current <= 3) {
          setSttStatus(`⚠️ STT network. Retrying ${sttRetryRef.current}/3`);
          setTimeout(() => {
            if (!listeningRef.current) return;
            try {
              rec.abort();
            } catch {}
            try {
              rec.start();
            } catch {}
          }, 900);
          return;
        }
      }

      listeningRef.current = false;
      setListening(false);
      setInterimText("");
      setAvatarMode("idle");
      setSttStatus("❌ STT stopped");
      setAvatarKey((k) => k + 1);
    };

    rec.onend = () => {
      sttStartingRef.current = false;

      if (listeningRef.current) {
        setTimeout(() => {
          if (!listeningRef.current) return;
          try {
            rec.start();
          } catch {}
        }, 250);
      } else {
        setInterimText("");
        setSttStatus("");
      }
    };

    recognitionRef.current = rec;
    return rec;
  }

  async function startListening({ silentUI = false } = {}) {
    if (!micOn) {
      if (!silentUI) alert("Please turn on Mic first");
      return;
    }

    hardStopTTS();
    startRecording();
    setAvatarKey((k) => k + 1);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.error(e);
      if (!silentUI) alert("Mic permission denied. Allow microphone in browser settings.");
      return;
    }

    const rec = ensureRecognition();
    if (!rec) {
      if (!silentUI) alert("SpeechRecognition not supported. Use Chrome/Edge.");
      return;
    }

    sttRetryRef.current = 0;
    sttStartingRef.current = false;

    setFinalText("");
    setInterimText("");
    finalTextRef.current = "";

    listeningRef.current = true;
    setListening(true);
    setAvatarMode("listening");
    setSttStatus("🎙️ Listening...");

    try {
      rec.abort();
    } catch {}

    setTimeout(() => {
      if (!listeningRef.current) return;
      if (sttStartingRef.current) return;
      sttStartingRef.current = true;
      try {
        rec.start();
      } catch (err) {
        console.error(err);
        sttStartingRef.current = false;
        listeningRef.current = false;
        setListening(false);
        setAvatarMode("idle");
        setSttStatus("❌ Mic start failed");
      }
    }, 200);
  }

  function stopListening() {
    listeningRef.current = false;
    setListening(false);
    setAvatarMode("idle");
    setInterimText("");
    setSttStatus("✅ Mic stopped");

    try {
      recognitionRef.current?.stop();
    } catch {}

    setAvatarKey((k) => k + 1);
    setTimeout(() => setSttStatus(""), 800);
  }

  function toggleListening() {
    if (listening) stopListening();
    else startListening();
  }

  // ---------------- Send Answer ----------------
  async function sendAnswerFromText(text) {
    const clean = cleanupRepeats(text || "");
    if (!clean) return;

    try {
      recognitionRef.current?.stop();
    } catch {}

    setFinalText("");
    setInterimText("");
    finalTextRef.current = "";

    // local add
    setMessages((prev) => [
      ...prev,
      { _id: "temp-" + Date.now(), role: "user", text: clean, createdAt: new Date().toISOString() },
    ]);

    waitingServerRef.current = true;
    setAiTyping(true);
    setAvatarMode("thinking");

    try {
      // ✅ GUEST MODE
      if (isGuest) {
        const history = messages
          .concat([{ role: "user", text: clean }])
          .map((m) => ({ role: m.role === "ai" ? "ai" : "user", text: m.text }));

        const resp = await fetch(`${API_BASE}/api/guest/interview/next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeText: guestResumeText,
            history,
            text: clean,
          }),
        });

        const data = await safeJson(resp);

        if (!resp.ok) {
          const msg =
            resp.status === 429
              ? "AI quota exceeded (Gemini). Try later / enable billing / change API key."
              : data?.error || data?.details || "Guest AI response failed";
          console.error("Guest next failed:", data);
          alert(msg);
          setAiTyping(false);
          setAvatarMode("idle");
          return;
        }

        const aiMsg =
          typeof data?.message === "string"
            ? { _id: "guest-ai-" + Date.now(), role: "ai", text: data.message, createdAt: new Date().toISOString() }
            : data?.message;

        if (aiMsg?.text) {
          setAiTyping(true);
          setAvatarMode("thinking");
          await sleep(naturalDelayFor(aiMsg.text));
          setAiTyping(false);
        }

        setMessages((prev) => [...prev, aiMsg]);
        setAvatarMode(micOn ? "listening" : "idle");
        return;
      }

      // ✅ DB MODE
      const headers = { "Content-Type": "application/json" };

      await fetch(`${API_BASE}/api/interview/message`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ sessionId, text: clean }),
      });

      const res = await fetch(`${API_BASE}/api/interview/ai-response`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ sessionId, text: clean }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        console.error(data);
        setAiTyping(false);
        setAvatarMode("idle");
        alert(data?.error || "Failed to get AI response");
        return;
      }

      await loadMessages({ withTypingFx: true });
      setAiTyping(false);
      setAvatarMode(micOn ? "listening" : "idle");
    } catch (e) {
      console.error(e);
      setAiTyping(false);
      setAvatarMode("idle");
      alert("Network error");
    } finally {
      waitingServerRef.current = false;
    }
  }

  async function uploadVideoMessage({ text }) {
    const clean = cleanupRepeats(text || "");
    if (!clean) return;

    // ✅ guest: no DB video endpoints -> send text only
    if (isGuest) return sendAnswerFromText(clean);

    if (!camOn) return sendAnswerFromText(clean);

    const blob = await stopRecording();
    if (!blob || blob.size < 2000) return sendAnswerFromText(clean);

    // You don't have a proper "upload blob" endpoint in the snippet.
    // So keep your old behavior: just send text.
    return sendAnswerFromText(clean);
  }

  async function sendAnswer() {
    const text = (finalTextRef.current || "").trim();
    if (!text) return;
    if (listening) stopListening();
    await uploadVideoMessage({ text });
  }

  // ---------------- Report redirect helpers ----------------
  function goToReport({ state } = {}) {
    if (!sessionId) return nav("/");
    nav(REPORT_ROUTE(sessionId), { replace: true, state });
  }

  // ✅ UPDATED endCall: always generate summary (guest + logged-in)
  async function endCall() {
    stopListening();
    try {
      window.speechSynthesis?.cancel();
    } catch {}

    const summary = buildSummary(messages);

    // ✅ DB ONLY (logged in)
    if (!isGuest) {
      try {
        if (sessionId) {
          await fetch(`${API_BASE}/api/interview/session/${sessionId}/status`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ended" }),
          });
        }
      } catch (e) {
        console.error("End status update failed:", e);
      }
    } else {
      // ✅ Guest: save locally
      try {
        localStorage.setItem(`guest_summary_${sessionId}`, JSON.stringify(summary));
        localStorage.setItem(`guest_messages_${sessionId}`, JSON.stringify(messages));
      } catch {}
    }

    stopVAD();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // ✅ Always go report, pass summary in state (fast render)
    goToReport({ state: { summary } });
  }

  // ✅ Browser back -> go to report page
  useEffect(() => {
    if (!sessionId) return;

    const pending = sessionStorage.getItem("pendingReportSessionId");
    if (pending && pending === String(sessionId)) {
      sessionStorage.removeItem("pendingReportSessionId");
      nav(REPORT_ROUTE(sessionId), { replace: true });
      return;
    }

    const push = () => window.history.pushState({ ir: true }, "", window.location.href);
    push();

    const onPop = () => {
      goToReport();
      push();
    };

    window.addEventListener("popstate", onPop);

    const onBeforeUnload = () => {
      try {
        sessionStorage.setItem("pendingReportSessionId", String(sessionId));
      } catch {}
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line
  }, [sessionId]);

  // ---------------- UI ----------------
  return (
    <div className="ir-page">
      <header className="ir-topbar">
        <div className="ir-brand">
          <span className="ir-dot" />
          <div>
            <div className="ir-title">AI Interview Room</div>
            <div className="ir-subtitle">
              Session: {String(sessionId || "").slice(-6)} • {formatTime()} • {isGuest ? "Guest" : "Saved"}
            </div>
          </div>
        </div>

        <div className="ir-status">
          <span className="ir-pill">🔒 Secure</span>
          <span className="ir-pill">📶 Stable</span>
          <span className="ir-pill">{autoMode ? "🤖 Auto" : "🖐️ Manual"}</span>
        </div>
      </header>

      <main className="ir-main">
        <section className="ir-stage">
          <div className="ir-ai-tile">
            <div className="ir-tile-top">
              <div className="ir-tile-name">Interviewer (AI)</div>
              <div className="ir-tile-state">
                {aiTyping ? "Typing..." : aiSpeaking ? "Speaking..." : listening ? "Listening..." : "Idle"}
              </div>
            </div>

            <div className="ir-ai-center">
              <div className="ir-ai-3d">
                {listening ? (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      textAlign: "center",
                      padding: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 18 }}>🎙️ Listening…</div>
                      <div style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>
                        {sttStatus || "Speak now"}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                        (3D paused to stop GPU crashes)
                      </div>
                      {autoMode && (
                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>
                          Auto-send after 3s silence
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <Interviewer3D key={avatarKey} mode={avatarMode} aiSpeaking={aiSpeaking} />
                )}
              </div>

              {captionsOn && lastAiMessage && <div className="ir-captions">{lastAiMessage}</div>}
            </div>

            <div className="ir-user-overlay">
              <div className="ir-user-header">
                <div className="ir-user-name">You</div>
                <div className="ir-user-meta">
                  {micOn ? "Mic on" : "Mic off"} • {camOn ? "Cam on" : "Cam off"} • {autoMode ? "Auto" : "Manual"}
                </div>
              </div>

              <div className="ir-user-videoWrap">
                <video ref={userVideoRef} muted playsInline className={`ir-user-video ${camOn ? "" : "ir-dim"}`} />
                {!camOn && (
                  <div className="ir-user-photoWrap">
                    <img className="ir-user-photo" src={meImg} alt="Me" />
                    <div className="ir-user-offText">Camera Off</div>
                  </div>
                )}
              </div>

              <div className="ir-user-foot">
                {autoMode
                  ? "🎙️ Auto mode: just speak (auto-send after 3s silence)"
                  : listening
                  ? "🎙️ Listening..."
                  : "Click 🎙️ Answer to speak"}
              </div>
            </div>
          </div>
        </section>

        {chatOpen && (
          <aside className="ir-chat">
            <div className="ir-chat-head">
              <div className="ir-chat-title">Chat</div>
              <button className="ir-iconBtn" onClick={() => setChatOpen(false)}>
                ✕
              </button>
            </div>

            <div className="ir-chat-body">
              {loading && <div className="ir-muted">Loading…</div>}
              {!loading && messages.length === 0 && <div className="ir-muted">No messages yet.</div>}

              {messages.map((m, idx) => (
                <div key={m._id || idx} className={`ir-row ${m.role === "ai" ? "left" : "right"}`}>
                  <div className={`ir-bubble ${m.role}`}>
                    <div>{m.text}</div>
                  </div>
                </div>
              ))}

              {aiTyping && (
                <div className="ir-row left">
                  <div className="ir-bubble ai">…</div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <div className="ir-chat-compose">
              <textarea
                className="ir-textarea"
                rows={2}
                value={answerText}
                onChange={(e) => {
                  setFinalText(e.target.value);
                  setInterimText("");
                  finalTextRef.current = e.target.value;
                  scheduleAutoSend();
                }}
                placeholder="Type your answer (or use mic)…"
              />
              <button className="ir-send" onClick={sendAnswer} disabled={!answerText.trim() || aiTyping}>
                Send
              </button>
            </div>
          </aside>
        )}
      </main>

      <footer className="ir-controls">
        <div className="ir-controls-left">
          <button className={`ir-ctrl ${micOn ? "on" : "off"}`} onClick={toggleMic}>
            <span className="ir-ctrlIcon">{micOn ? "🎤" : "🔇"}</span>
            <span className="ir-ctrlTxt">{micOn ? "Mic" : "Mic off"}</span>
          </button>

          <button className={`ir-ctrl ${camOn ? "on" : "off"}`} onClick={toggleCamera}>
            <span className="ir-ctrlIcon">{camOn ? "📷" : "🚫"}</span>
            <span className="ir-ctrlTxt">{camOn ? "Camera" : "Cam off"}</span>
          </button>

          <button className={`ir-ctrl ${captionsOn ? "on" : ""}`} onClick={() => setCaptionsOn((p) => !p)}>
            <span className="ir-ctrlIcon">📝</span>
            <span className="ir-ctrlTxt">Captions</span>
          </button>

          <button className={`ir-ctrl ${chatOpen ? "on" : ""}`} onClick={() => setChatOpen((p) => !p)}>
            <span className="ir-ctrlIcon">💬</span>
            <span className="ir-ctrlTxt">Chat</span>
          </button>

          <button
            className={`ir-ctrl ${autoMode ? "on" : ""}`}
            onClick={() => {
              setAutoMode((p) => {
                const next = !p;
                if (!next) {
                  stopVAD();
                  if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                } else {
                  if (micOn) startVAD();
                }
                return next;
              });
            }}
          >
            <span className="ir-ctrlIcon">🤖</span>
            <span className="ir-ctrlTxt">{autoMode ? "Auto" : "Manual"}</span>
          </button>

          <button className={`ir-ctrl ${listening ? "on" : ""}`} onClick={toggleListening} disabled={autoMode}>
            <span className="ir-ctrlIcon">{listening ? "⏹️" : "🎙️"}</span>
            <span className="ir-ctrlTxt">{listening ? "Stop" : "Answer"}</span>
          </button>
        </div>

        <button className="ir-end" onClick={endCall}>
          End
        </button>
      </footer>
    </div>
  );
}