import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import HistorySidebar from "./HistorySidebar";
import ResumeCard from "./ResumeCard";
import "../Style/Dashboard.css";

const API_BASE = "http://localhost:5000";

export default function Dashboard({ user }) {
  const nav = useNavigate();
  const isLoggedIn = !!user?._id;

  const [sessions, setSessions] = useState([]);
  const [resume, setResume] = useState(null);

  const [guestResume, setGuestResume] = useState(() => {
    try {
      const raw = localStorage.getItem("guestResume");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);

  // ------------------- DB loaders -------------------
  const loadSessions = useCallback(async () => {
    if (!isLoggedIn) {
      setSessions([]);
      return;
    }

    const data = await fetch(`${API_BASE}/api/interview/sessions`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .catch(() => ({ sessions: [] }));

    setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
  }, [isLoggedIn]);

  const loadResumes = useCallback(async () => {
    if (!isLoggedIn) {
      setResume(null);
      return;
    }

    const data = await fetch(`${API_BASE}/api/resume/list`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { resumes: [] }))
      .catch(() => ({ resumes: [] }));

    setResume(Array.isArray(data?.resumes) ? data.resumes[0] || null : null);
  }, [isLoggedIn]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isLoggedIn) {
        await Promise.all([loadSessions(), loadResumes()]);
      } else {
        setSessions([]);
        setResume(null);

        try {
          const raw = localStorage.getItem("guestResume");
          setGuestResume(raw ? JSON.parse(raw) : null);
        } catch {
          setGuestResume(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, loadSessions, loadResumes]);

  useEffect(() => {
    load();
  }, [load]);

  // ------------------- START INTERVIEW (DB) -------------------
  async function startInterviewLoggedIn() {
    if (!isLoggedIn) return alert("Please login first.");
    if (!resume?._id) return alert("Please upload resume first.");

    try {
      const createResp = await fetch(`${API_BASE}/api/interview/create`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: resume._id,
          title: "Interview Session",
        }),
      });

      const createRes = await createResp.json().catch(() => ({}));
      if (!createResp.ok) {
        return alert(createRes?.error || "Failed to create session");
      }

      const sessionId = createRes?.session?._id;
      if (!sessionId) return alert("Failed to create session");

      const startResp = await fetch(`${API_BASE}/api/interview/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const startRes = await startResp.json().catch(() => ({}));

      if (!startResp.ok) {
        nav(`/interview/${sessionId}`, {
          state: {
            mode: "db",
            startError: {
              status: startResp.status,
              message: startRes?.error || "Failed to start interview",
            },
          },
        });
        return;
      }

      await loadSessions();
      nav(`/interview/${sessionId}`, { state: { mode: "db" } });
    } catch (e) {
      console.error(e);
      alert("Failed to start interview");
    }
  }

  // ------------------- START INTERVIEW (GUEST) -------------------
  async function startInterviewGuest() {
    if (!guestResume?.text?.trim())
      return alert("Upload resume first (guest mode).");

    const guestSessionId = `guest-${Date.now()}`;

    nav(`/interview/${guestSessionId}`, {
      state: {
        mode: "guest",
        resumeText: guestResume.text,
        filename: guestResume.filename,
      },
    });
  }

  return (
    <div className="dashboard-main">
      {isLoggedIn && sessions.length > 0 && (
        <HistorySidebar sessions={sessions} />
      )}

      <div className="dashboard-content">

        {/* HERO SECTION */}
        <div className="hero-section">
          <h1 className="dashboard-title">
            AI Interviewer
          </h1>
          <p className="dashboard-subtitle">
            Practice real interview scenarios powered by AI.
            Upload your resume and start a personalized mock interview.
          </p>
        </div>

        {isLoggedIn ? (
          <div className="dashboard-welcome">
            Welcome, <b>{user.name || user.email}</b>! Ready to practice?
          </div>
        ) : (
          <div className="dashboard-welcome">
            Guest mode: Resume + chat won’t be saved.
          </div>
        )}

        <h2 className="section-title">Dashboard</h2>

        {/* Resume Upload */}
        <ResumeCard
          mode={isLoggedIn ? "db" : "quick"}
          resume={
            isLoggedIn
              ? resume
              : guestResume
              ? { filename: guestResume.filename }
              : null
          }
          onUploaded={loadResumes}
          onQuickLoaded={(r) => {
            setGuestResume(r);
            localStorage.setItem("guestResume", JSON.stringify(r));
          }}
        />

        {/* Buttons */}
        <div className="dashboard-actions">
          {isLoggedIn ? (
            <button
              onClick={startInterviewLoggedIn}
              className="dashboard-btn primary"
              disabled={!resume?._id}
            >
              Start Interview
            </button>
          ) : (
            <>
              <button
                onClick={startInterviewGuest}
                className="dashboard-btn primary"
                disabled={!guestResume?.text?.trim()}
              >
                Start Interview (Guest)
              </button>

              {guestResume && (
                <button
                  onClick={() => {
                    setGuestResume(null);
                    localStorage.removeItem("guestResume");
                  }}
                  className="dashboard-btn secondary"
                >
                  Clear Guest Resume
                </button>
              )}
            </>
          )}
        </div>

        {loading && <p className="loading-text">Loading...</p>}

        {/* ABOUT SECTION */}
        <div className="about-section">
          <p className="about-description">
            AI Interviewer helps you prepare for job interviews by
            simulating real interview conversations. The AI analyzes
            your resume and asks relevant technical and behavioral
            questions to help you improve your confidence.
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <h4 className="feature-title">AI Generated Questions</h4>
              <p className="feature-desc">Interview questions based on your resume skills.</p>
            </div>

            <div className="feature-card">
              <h4 className="feature-title">Real Interview Simulation</h4>
              <p className="feature-desc">Practice interviews like real recruiter conversations.</p>
            </div>

            <div className="feature-card">
              <h4 className="feature-title">Unlimited Practice</h4>
              <p className="feature-desc">Improve confidence by practicing anytime.</p>
            </div>

            <div className="feature-card">
              <h4 className="feature-title">Resume Based</h4>
              <p className="feature-desc">Questions tailored to your experience and projects.</p>
            </div>
          </div>
        </div>

        {!isLoggedIn && (
          <p className="guest-note">
            Login to save history and resume in database.
          </p>
        )}
      </div>
    </div>
  );
}