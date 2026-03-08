import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

const API_BASE = "http://localhost:5000";

function safeJsonParse(v, fallback = null) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export default function SummaryPage({ embedded = false }) {
  const params = useParams();
  const nav = useNavigate();
  const loc = useLocation();

  const sid = params.sessionId || params.id || "";
  const isGuest = String(sid).startsWith("guest-");

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState("");

  const historyLink = useMemo(() => (sid ? `/history/${sid}` : "/history"), [sid]);
  const isInsideHistory = loc.pathname.startsWith("/history/");

  useEffect(() => {
    if (!sid) {
      setLoading(false);
      setErr("Missing session id");
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      const passed = loc.state?.summary;
      if (passed && Array.isArray(passed.messages) && passed.messages.length) {
        return { summary: passed, messages: passed.messages };
      }

      if (isGuest) {
        const storedSummary = safeJsonParse(localStorage.getItem(`guest_summary_${sid}`), null);
        const storedMessages = safeJsonParse(localStorage.getItem(`guest_messages_${sid}`), []);

        if (
          storedSummary &&
          Array.isArray(storedSummary.messages) &&
          storedSummary.messages.length
        ) {
          return { summary: storedSummary, messages: storedSummary.messages };
        }

        if (Array.isArray(storedMessages) && storedMessages.length) {
          return { summary: null, messages: storedMessages };
        }

        return { summary: null, messages: [] };
      }

      const res = await fetch(`${API_BASE}/api/interview/session/${sid}`, {
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        throw new Error("Please login to see your report.");
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load session");
      }

      const messages = Array.isArray(data?.messages) ? data.messages : [];
      return { summary: null, messages };
    }

    async function evaluateWithGemini(messages) {
      const url = isGuest
        ? `${API_BASE}/api/interview/guest-evaluate-summary`
        : `${API_BASE}/api/interview/evaluate-summary`;

      const body = isGuest ? { messages } : { sessionId: sid, messages };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate AI report");
      }

      return data;
    }

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { summary: localSummary, messages } = await loadMessages();
        if (cancelled) return;

        if (!Array.isArray(messages) || !messages.length) {
          setSummary(null);
          setErr("No interview messages found for this session.");
          return;
        }

        if (
          localSummary &&
          typeof localSummary.total === "number" &&
          Array.isArray(localSummary.breakdown) &&
          localSummary.feedback
        ) {
          setSummary(localSummary);
          return;
        }

        const aiSummary = await evaluateWithGemini(messages);
        if (cancelled) return;

        if (isGuest) {
          localStorage.setItem(`guest_summary_${sid}`, JSON.stringify(aiSummary));
        }

        setSummary(aiSummary);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setErr(e.message || "Network error");
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sid, isGuest, loc.state]);

  const total = summary?.total ?? 0;
  const breakdown = Array.isArray(summary?.breakdown) ? summary.breakdown : [];
  const feedback = summary?.feedback || {};
  const strengths = Array.isArray(feedback?.strengths) ? feedback.strengths : [];
  const improvements = Array.isArray(feedback?.improvements) ? feedback.improvements : [];
  const finalVerdict = feedback?.finalVerdict || "";

  const pageWrapStyle = embedded
    ? { padding: 0, background: "transparent" }
    : { minHeight: "100vh", background: "#f6f7fb", padding: 18 };

  const cardStyle = embedded
    ? { background: "white", border: "1px solid #eee", borderRadius: 14, padding: 14 }
    : { background: "white", border: "1px solid #eee", borderRadius: 16, padding: 18 };

  const titleSize = embedded ? 18 : 22;
  const scoreSize = embedded ? 32 : 42;

  return (
    <div style={pageWrapStyle}>
      <div style={{ maxWidth: embedded ? "100%" : 980, margin: "0 auto" }}>
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: titleSize, fontWeight: 900 }}>Interview Report</div>
              <div style={{ opacity: 0.7, marginTop: 4 }}>
                Session: {String(sid || "").slice(-6)} • {isGuest ? "Guest" : "Saved"}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: scoreSize, fontWeight: 900, lineHeight: 1 }}>
                {total}
                <span style={{ fontSize: embedded ? 14 : 16, opacity: 0.6 }}> / 100</span>
              </div>
              {!embedded && (
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  AI-evaluated communication score
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {loading && <div style={{ opacity: 0.7 }}>Generating AI report…</div>}

            {!loading && err && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "#fff5f5",
                  border: "1px solid #ffd6d6",
                }}
              >
                <b>Error:</b> {err}
              </div>
            )}

            {!loading && !err && (
              <>
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left" }}>
                        <th style={th}>Category</th>
                        <th style={th}>Marks</th>
                        <th style={th}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.length > 0 ? (
                        breakdown.map((row, i) => (
                          <tr key={i}>
                            <td style={tdStrong}>{row.metric}</td>
                            <td style={td}>
                              <b>{row.score}</b> / {row.outOf}
                            </td>
                            <td style={tdMuted}>{row.notes}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td style={tdMuted} colSpan={3}>
                            No breakdown available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 18 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Strengths</div>
                  {strengths.length ? (
                    <ul style={{ marginTop: 0, paddingLeft: 18 }}>
                      {strengths.map((item, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ opacity: 0.75 }}>No strengths available.</div>
                  )}
                </div>

                <div style={{ marginTop: 18 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Areas to Improve</div>
                  {improvements.length ? (
                    <ul style={{ marginTop: 0, paddingLeft: 18 }}>
                      {improvements.map((item, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ opacity: 0.75 }}>No improvement points available.</div>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    padding: 14,
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Final Verdict</div>
                  <div style={{ opacity: 0.9 }}>{finalVerdict || "No final verdict available."}</div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button style={embedded ? btnSmall : btn} onClick={() => nav(historyLink)}>
                    View Full History
                  </button>

                  <button style={embedded ? btnSmall2 : btn2} onClick={() => nav(`/summary/${sid}`)}>
                    Open Full Report
                  </button>

                  <button style={btn2} onClick={() => nav("/", { replace: true })}>
                    Go Home
                  </button>

                  {!embedded && !isInsideHistory && sid && (
                    <button style={btn2} onClick={() => nav(`/history/${sid}`)}>
                      Open in History Layout
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const th = {
  padding: "12px 10px",
  borderBottom: "1px solid #eee",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  opacity: 0.7,
};

const td = {
  padding: "12px 10px",
  borderBottom: "1px solid #f1f1f1",
  fontSize: 14,
};

const tdStrong = { ...td, fontWeight: 800 };
const tdMuted = { ...td, opacity: 0.85 };

const btn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #cbd5ff",
  background: "#eef2ff",
  cursor: "pointer",
  fontWeight: 800,
};

const btn2 = {
  ...btn,
  border: "1px solid #eee",
  background: "#fff",
};

const btnSmall = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid #cbd5ff",
  background: "#eef2ff",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
};

const btnSmall2 = {
  ...btnSmall,
  border: "1px solid #eee",
  background: "#fff",
};