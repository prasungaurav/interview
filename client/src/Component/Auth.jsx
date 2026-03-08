import { useEffect, useMemo, useState } from "react";

export default function AuthModal({ open, onClose, onSuccess }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  useEffect(() => {
    if (!open) return;
    setErr("");
    setLoading(false);

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const title = useMemo(
    () => (mode === "login" ? "Welcome back" : "Create your account"),
    [mode]
  );

  function update(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");

    if (!form.email || !form.password) {
      setErr("Email and password are required.");
      return;
    }
    if (mode === "signup" && !form.name) {
      setErr("Name is required for signup.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const payload =
        mode === "login"
          ? { email: form.email, password: form.password }
          : { name: form.name, email: form.email, password: form.password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || "Authentication failed");
      }

      onSuccess?.(data);
      onClose?.();
      try {
        if (data?.user?._id) {
          localStorage.setItem("userId", data.user._id);
        }
      } catch {}
    } catch (e2) {
      setErr(e2.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => {
        // outside click close
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={styles.backdrop}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={styles.title}>{title}</div>
            <div style={styles.subTitle}>
              {mode === "login"
                ? "Login to continue your interview."
                : "Signup to save sessions and resume."}
            </div>
          </div>

          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            onClick={() => setMode("login")}
            style={{
              ...styles.tabBtn,
              ...(mode === "login" ? styles.tabActive : {}),
            }}
          >
            Login
          </button>
          <button
            onClick={() => setMode("signup")}
            style={{
              ...styles.tabBtn,
              ...(mode === "signup" ? styles.tabActive : {}),
            }}
          >
            Signup
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{ marginTop: 14 }}>
          {mode === "signup" && (
            <div style={styles.field}>
              <label style={styles.label}>Name</label>
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Your name"
                style={styles.input}
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@example.com"
              type="email"
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="••••••••"
              type="password"
              style={styles.input}
            />
          </div>

          {err && <div style={styles.error}>{err}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.primaryBtn, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
          </button>

          <div style={styles.footerText}>
            {mode === "login" ? (
              <>
                No account?{" "}
                <span style={styles.link} onClick={() => setMode("signup")}>
                  Signup
                </span>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <span style={styles.link} onClick={() => setMode("login")}>
                  Login
                </span>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },
  modal: {
    width: "100%",
    maxWidth: 420,
    background: "#0b1220",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 18,
    color: "white",
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
  },
  header: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: 0.2 },
  subTitle: { fontSize: 13, opacity: 0.75, marginTop: 4 },
  closeBtn: {
    border: "none",
    background: "transparent",
    color: "white",
    fontSize: 18,
    cursor: "pointer",
    opacity: 0.8,
  },
  tabs: {
    marginTop: 14,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 4,
    display: "flex",
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: "transparent",
    color: "white",
    opacity: 0.75,
    fontWeight: 700,
  },
  tabActive: {
    background: "rgba(255,255,255,0.12)",
    opacity: 1,
  },
  field: { marginTop: 12, display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, opacity: 0.85 },
  input: {
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
    fontSize: 14,
  },
  error: {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255, 60, 60, 0.15)",
    border: "1px solid rgba(255, 60, 60, 0.25)",
    color: "#ffb3b3",
    fontSize: 13,
  },
  primaryBtn: {
    marginTop: 14,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "white",
    color: "#0b1220",
    fontWeight: 900,
    fontSize: 14,
  },
  footerText: {
    marginTop: 12,
    fontSize: 13,
    opacity: 0.8,
    textAlign: "center",
  },
  link: {
    cursor: "pointer",
    fontWeight: 800,
    textDecoration: "underline",
  },
};
