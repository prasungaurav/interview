import { useRef, useState } from "react";

const API_BASE = "http://localhost:5000";

export default function ResumeCard({
  mode = "db",               // "db" | "quick"
  resume,
  onUploaded,                // db: refresh resumes list
  onQuickLoaded,             // quick: (r) => setGuestResume({filename,text})
}) {
  const fileRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    // validate PDF
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setError("Only PDF resume is allowed.");
      e.target.value = "";
      return;
    }

    // 15MB limit
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("File too large. Max size is 15MB.");
      e.target.value = "";
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // ✅ choose endpoint based on mode
      const url =
        mode === "quick"
          ? `${API_BASE}/api/guest/resume/parse`   // ✅ guest: NO DB
          : `${API_BASE}/api/resume/upload`;       // ✅ logged-in: DB

      const res = await fetch(url, {
        method: "POST",
        // ✅ cookies only needed for DB upload
        ...(mode === "db" ? { credentials: "include" } : {}),
        body: formData,
        // ✅ IMPORTANT: no custom headers, no x-user-id, and don't set Content-Type for FormData
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.details || "Upload failed");
      }

      setSuccess(mode === "quick" ? "Resume loaded (guest) ✅" : "Resume uploaded ✅");

      if (mode === "quick") {
        // backend returns: { resume: { filename, text } }
        const r = data?.resume;
        if (!r?.text) throw new Error("Failed to read resume text from PDF.");

        onQuickLoaded?.({ filename: r.filename || file.name, text: r.text });
      } else {
        // backend returns: { resume: { _id, filename, createdAt } }
        onUploaded?.();
      }
    } catch (err) {
      setError(err?.message || "Failed to upload resume");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function triggerPick() {
    setError("");
    setSuccess("");
    fileRef.current?.click();
  }

  const title = mode === "quick" ? "Resume (Guest)" : "Resume";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 20,
        maxWidth: 560,
        background: "#ffffff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{title}</h3>

        <button
          type="button"
          onClick={triggerPick}
          disabled={uploading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: uploading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {resume ? "Re-upload" : "Upload"}
        </button>
      </div>

      {!resume && (
        <p style={{ fontSize: 14, opacity: 0.75, marginTop: 8 }}>
          {mode === "quick"
            ? "Upload your resume PDF to use in guest mode (not saved)."
            : "Upload your resume to start interview."}
        </p>
      )}

      {resume && (
        <div
          style={{
            background: "#f9fafb",
            padding: 12,
            borderRadius: 10,
            marginTop: 12,
            border: "1px solid #eef2f7",
          }}
        >
          <div style={{ fontWeight: 700 }}>
            📄 {resume.filename || "Resume.pdf"}
          </div>

          {resume.createdAt && (
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
              Uploaded: {new Date(resume.createdAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* hidden input */}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        disabled={uploading}
        style={{ display: "none" }}
      />

      {uploading && (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
          Uploading resume... please wait
        </div>
      )}

      {success && (
        <div style={{ marginTop: 10, color: "green", fontSize: 13 }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, color: "red", fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}
