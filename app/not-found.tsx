import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, background: "#030404", color: "#f0f1f1", fontFamily: 'Inter, "Segoe UI", sans-serif' }}>
      <section style={{ textAlign: "center" }}>
        <small style={{ color: "#92989a", letterSpacing: ".12em" }}>AEGIS</small>
        <h1 style={{ margin: "10px 0", fontSize: 26 }}>Command route not found</h1>
        <Link href="/" style={{ color: "#e8eaea" }}>Return to operations</Link>
      </section>
    </main>
  );
}
