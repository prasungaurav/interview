import { Link, useLocation } from "react-router-dom";

export default function HistorySidebar({ sessions = [] }) {
  const loc = useLocation();

  return (
    <div
      style={{
        width: 320,
        borderRight: "1px solid #ddd",
        padding: 12,
        overflow: "auto",
        background: "#fafafa",
      }}
    >
      <Link
        to="/progress"
        style={{
          display: "block",
          padding: "10px 10px",
          marginBottom: 6,
          borderRadius: 10,
          textDecoration: "none",
          color: "#111",
          background: "#f0f0f0",
        }}
      >
        📈 Progress
      </Link>

      <div style={{ fontWeight: 800, marginBottom: 10 }}>History</div>

      {sessions.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No interviews yet</div>
      ) : (
        sessions.map((s) => {
          const active = loc.pathname.includes(String(s._id));

          const when = s.updatedAt
            ? new Date(s.updatedAt).toLocaleString()
            : s.createdAt
            ? new Date(s.createdAt).toLocaleString()
            : "";

          return (
            <Link
              key={s._id}
              to={`/history/${s._id}`}
              style={{
                display: "block",
                padding: "10px 10px",
                marginBottom: 6,
                borderRadius: 10,
                textDecoration: "none",
                color: "#111",
                background: active ? "#e9eefc" : "white",
                border: "1px solid #eee",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {s.title?.trim() ? s.title : "Interview"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{when}</div>
            </Link>
          );
        })
      )}
    </div>
  );
}
