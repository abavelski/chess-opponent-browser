import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-shell narrow-shell">
      <section className="panel empty-state">
        <p className="eyebrow">404</p>
        <h1>Tournament not found</h1>
        <p>The tournament may not exist, or the link may be incorrect.</p>
        <Link className="text-link" href="/">
          Return to tournaments →
        </Link>
      </section>
    </main>
  );
}
