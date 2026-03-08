import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:5000";

export default function HistoryPage() {
  const { id } = useParams(); // /history/:id
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const res = await fetch(`${API_BASE}/api/interview/session/${id}`, {
          credentials: "include", // ✅ MUST for session cookie
          headers: { "Content-Type": "application/json" },
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          // ✅ show real reason
          const msg = data?.error || data?.message || "Failed to load session";

          // common cases
          if (res.status === 401) {
            setErr("You are not logged in. Please login again.");
          } else if (res.status === 403) {
            setErr("Access denied. This session does not belong to your account.");
          } else if (res.status === 404) {
            setErr("Session not found.");
          } else {
            setErr(msg);
          }

          if (!ignore) setMessages([]);
          return;
        }

        if (!ignore) setMessages(Array.isArray(data?.messages) ? data.messages : []);
      } catch (e) {
        console.error("HistoryPage load error:", e);
        if (!ignore) {
          setErr("Network error. Is the server running?");
          setMessages([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [id]);

  return (
    <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button
          onClick={() => nav("/")}
          aria-label="Back"
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <div style={{ fontWeight: 800, fontSize: 18 }}>
          Session: {String(id || "").slice(-6)}
        </div>
      </div>

      {loading && <div style={{ opacity: 0.7 }}>Loading messages…</div>}

      {!loading && err && (
        <div style={{ padding: 12, border: "1px solid #f0c2c2", background: "#fff5f5", borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Couldn’t load this session</div>
          <div style={{ opacity: 0.85 }}>{err}</div>
          {err.toLowerCase().includes("login") && (
            <button
              onClick={() => nav("/")}
              style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
            >
              Go to Home / Login
            </button>
          )}
        </div>
      )}

      {!loading && !err && messages.length === 0 && (
        <div style={{ opacity: 0.7 }}>No messages found.</div>
      )}

      {!loading &&
        !err &&
        messages.map((m, idx) => {
          const isAI = m.role === "ai";
          return (
            <div
              key={m._id || idx}
              style={{
                display: "flex",
                justifyContent: isAI ? "flex-start" : "flex-end",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  maxWidth: 650,
                  padding: 12,
                  borderRadius: 14,
                  background: isAI ? "#ffffff" : "#e9eefc",
                  border: "1px solid #eee",
                  whiteSpace: "pre-wrap",
                }}
              >
                {!!m.text && <div style={{ fontSize: 14 }}>{m.text}</div>}

                {/* if you actually have a videos route, keep this */}
                {m.video?.fileId && (
                  <video
                    controls
                    style={{ width: "100%", marginTop: 10, borderRadius: 12 }}
                    src={`${API_BASE}/api/videos/${m.video.fileId}`}
                  />
                )}

                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
                  {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
