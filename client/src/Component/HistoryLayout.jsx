import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import HistorySidebar from "./HistorySidebar";
import SummaryPage from "./Summarypage";

const API_BASE = "http://localhost:5000";

export default function HistoryLayout() {
  const [sessions, setSessions] = useState([]);
  const [user, setUser] = useState(null);
  const { id } = useParams(); // session id from /history/:id

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 1) Who am I? (session cookie)
        const meRes = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: "include",
        });
        const meData = await meRes.json().catch(() => ({}));
        const me = meData?.user || null;

        if (!alive) return;
        setUser(me);

        // if not logged in -> no sessions
        if (!me) {
          setSessions([]);
          return;
        }

        // 2) Load sessions (session cookie)
        const sRes = await fetch(`${API_BASE}/api/interview/sessions`, {
          credentials: "include",
        });
        const sData = await sRes.json().catch(() => ({}));

        if (!alive) return;
        setSessions(Array.isArray(sData?.sessions) ? sData.sessions : []);
      } catch (e) {
        console.error("HistoryLayout load error:", e);
        if (!alive) return;
        setSessions([]);
        setUser(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f6f7fb" }}>
      <HistorySidebar sessions={sessions} user={user} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* ✅ TOP SUMMARY ALWAYS WHEN id EXISTS */}
        {id && (
          <div
            style={{
              borderBottom: "1px solid #e5e7eb",
              background: "#ffffff",
              padding: 12,
              maxHeight: 260,
              overflow: "auto",
            }}
          >
            <SummaryPage embedded />
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
