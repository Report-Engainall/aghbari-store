import type { CSSProperties } from "react";

const frame: CSSProperties = {
  minHeight: "100svh",
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
  padding: "clamp(1rem, 4vw, 2.5rem)",
  background: "#f5f4ed",
  color: "#163d30",
  fontFamily: "inherit",
};

const panel: CSSProperties = {
  width: "min(100%, 28rem)",
  boxSizing: "border-box",
  display: "grid",
  justifyItems: "center",
  gap: "1rem",
  padding: "clamp(1.5rem, 5vw, 2.5rem)",
  border: "1px solid #e1e8df",
  borderRadius: "1.5rem",
  background: "#ffffff",
  boxShadow: "0 18px 48px rgba(22, 61, 48, 0.08)",
  textAlign: "center",
};

export function AdminRouteFallback() {
  return (
    <main dir="rtl" lang="ar" style={frame}>
      <section
        role="status"
        aria-label="جارٍ تجهيز لوحة الإدارة"
        aria-live="polite"
        aria-busy="true"
        style={panel}
      >
        <span
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            width: "3.5rem",
            height: "3.5rem",
            borderRadius: "1.1rem",
            background: "#163d30",
            color: "#e4c36c",
            fontSize: "1.75rem",
            fontWeight: 800,
          }}
        >
          أ
        </span>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <p style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
            جارٍ تجهيز لوحة الإدارة
          </p>
          <p style={{ margin: 0, color: "#64756b", fontSize: "0.9rem", lineHeight: 1.8 }}>
            يتم تحميل بيانات الشاشة والتحقق من صلاحيات الوصول.
          </p>
        </div>
        <div
          aria-hidden="true"
          style={{
            display: "grid",
            width: "100%",
            gap: "0.55rem",
            paddingTop: "0.35rem",
          }}
        >
          <span style={{ display: "block", height: "0.65rem", width: "100%", borderRadius: "999px", background: "#edf1ec" }} />
          <span style={{ display: "block", height: "0.65rem", width: "76%", borderRadius: "999px", background: "#edf1ec" }} />
          <span style={{ display: "block", height: "0.65rem", width: "54%", borderRadius: "999px", background: "#edf1ec" }} />
        </div>
      </section>
    </main>
  );
}
