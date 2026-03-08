import { useState } from "react";
import AuthModal from "./Auth";

const API_BASE = "http://localhost:5000";

export default function Header({ user, onUserChange }) {
  const [authOpen, setAuthOpen] = useState(false);

  async function handleLogout() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Logout error:", e);
    }
    onUserChange?.(null);
  }

  return (
    <>
      <header style={styles.header}>
        <div style={styles.container}>
          <div style={styles.brand}>
            <h1 style={styles.title}>AI Interview Coach</h1>
          </div>

          <div style={styles.actions}>
            {!user?._id ? (
              <button onClick={() => setAuthOpen(true)} style={styles.loginBtn}>
                Login / Signup
              </button>
            ) : (
              <div style={styles.userSection}>
                <span style={styles.userName}>👤 {user.name || user.email}</span>
                <button onClick={handleLogout} style={styles.logoutBtn}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(data) => {
          onUserChange?.(data?.user || null);
          setAuthOpen(false);
        }}
      />
    </>
  );
}

const styles = {
  header: {
    backgroundColor: "#1a1a2e",
    color: "#fff",
    padding: "0 20px",
    borderBottom: "1px solid #16213e",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    height: "70px",
  },
  brand: { flex: 1 },
  title: { margin: 0, fontSize: "20px", fontWeight: "700", letterSpacing: "0.5px" },
  actions: { display: "flex", alignItems: "center", gap: "15px" },
  loginBtn: {
    padding: "10px 24px",
    backgroundColor: "#0f3460",
    color: "#fff",
    border: "1px solid #16a085",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
  },
  userSection: { display: "flex", alignItems: "center", gap: "15px" },
  userName: { fontSize: "14px", fontWeight: "500", color: "#e0e0e0" },
  logoutBtn: {
    padding: "8px 16px",
    backgroundColor: "#e74c3c",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "500",
    fontSize: "13px",
  },
};
