import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:5000";

export default function ProgressPage() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/progress`);
        const data = await res.json();
        setPoints(Array.isArray(data?.points) ? data.points.filter(p => p.score != null) : []);
      } catch (e) {
        console.error(e);
        setPoints([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const chart = useMemo(() => makeChart(points), [points]);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontWeight: 900, fontSize: 20 }}>Lifetime Progress</div>
      <div style={{ opacity: 0.7, marginTop: 4 }}>Marks trend over time</div>

      {loading && <div style={{ marginTop: 14, opacity: 0.7 }}>Loading…</div>}

      {!loading && points.length === 0 && (
        <div style={{ marginTop: 14, opacity: 0.7 }}>
          No scores yet. Finish an interview to generate marks.
        </div>
      )}

      {!loading && points.length > 0 && (
        <div
          style={{
            marginTop: 14,
            background: "white",
            border: "1px solid #eee",
            borderRadius: 16,
            padding: 12,
          }}
        >
          <svg width="100%" height="260" viewBox="0 0 900 260">
            {/* axes */}
            <line x1="40" y1="20" x2="40" y2="220" stroke="#ddd" />
            <line x1="40" y1="220" x2="880" y2="220" stroke="#ddd" />

            {/* labels */}
            <text x="40" y="245" fontSize="12" fill="#666">Old → New</text>
            <text x="5" y="25" fontSize="12" fill="#666">100</text>
            <text x="10" y="220" fontSize="12" fill="#666">0</text>

            {/* path */}
            <path d={chart.path} fill="none" stroke="#4f46e5" strokeWidth="3" />

            {/* dots */}
            {chart.dots.map((d, i) => (
              <g key={i}>
                <circle cx={d.x} cy={d.y} r="5" fill="#4f46e5" />
                <text x={d.x - 10} y={d.y - 10} fontSize="11" fill="#111">
                  {d.score}
                </text>
              </g>
            ))}
          </svg>

          {/* Table list below */}
          <div style={{ marginTop: 10 }}>
            {points.slice().reverse().slice(0, 8).map((p) => (
              <div key={p.sessionId} style={{ padding: "8px 6px", borderTop: "1px solid #f2f2f2" }}>
                <b>{p.score}/100</b> — {new Date(p.date).toLocaleDateString()} — {p.title || "Interview"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function makeChart(points) {
  const W = 900, H = 260;
  const left = 40, right = 880, top = 20, bottom = 220;

  const n = points.length;
  const xs = points.map((_, i) => left + (i * (right - left)) / Math.max(1, n - 1));
  const ys = points.map((p) => {
    const v = clamp(Number(p.score || 0), 0, 100);
    return bottom - (v / 100) * (bottom - top);
  });

  let path = "";
  for (let i = 0; i < n; i++) {
    path += (i === 0 ? "M " : " L ") + xs[i].toFixed(1) + " " + ys[i].toFixed(1);
  }

  const dots = points.map((p, i) => ({ x: xs[i], y: ys[i], score: p.score }));
  return { path, dots };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
