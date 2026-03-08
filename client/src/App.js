import "./App.css";
import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Header from "./Component/Header";
import Dashboard from "./Component/Dashboard";
import InterviewRoom from "./Component/InterviewRoom";
import HistoryLayout from "./Component/HistoryLayout";
import HistoryPage from "./Component/Histroypage.jsx";
import SummaryPage from "./Component/Summarypage.jsx";
import ProgressPage from "./Component/Progess.jsx";

const API_BASE = "http://localhost:5000";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include",
      });
      const data = await res.json();
      setUser(data?.user || null);
    } catch (e) {
      console.error("Load user error:", e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="App">
      <Header user={user} onUserChange={setUser} />

      {!loading && (
        <Routes>
          <Route path="/" element={<Dashboard user={user} onUserChange={setUser} />} />
          <Route path="/interview/:sessionId" element={<InterviewRoom />} />
          <Route path="/history" element={<HistoryLayout />}>
            <Route path=":id" element={<HistoryPage />} />
            <Route path=":id/summary" element={<SummaryPage />} />
          </Route>
          <Route path="/summary/:sessionId" element={<SummaryPage />} />
          <Route path="/progress" element={<ProgressPage />} />
        </Routes>
      )}
    </div>
  );
}

export default App;
