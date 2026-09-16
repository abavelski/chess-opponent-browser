import Link from "next/link";

import { ImportForm } from "./import-form";

export default function NewImportPage() {
  return (
    <main className="app-shell">
      <Link className="back-link" href="/">
        ← Tournaments
      </Link>
      <ImportForm />
    </main>
  );
}
