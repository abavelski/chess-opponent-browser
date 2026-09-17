import { asc } from "drizzle-orm";
import Link from "next/link";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

type NewImportPageProps = {
  searchParams: Promise<{ tournamentId?: string | string[] }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export default async function NewImportPage({ searchParams }: NewImportPageProps) {
  const rawSearchParams = await searchParams;
  const requestedTournamentId = parsePositiveId(first(rawSearchParams.tournamentId));
  const tournamentOptions = await getDb()
    .select({ id: tournaments.id, name: tournaments.name })
    .from(tournaments)
    .orderBy(asc(tournaments.name), asc(tournaments.id));

  const selectedTournament = requestedTournamentId
    ? tournamentOptions.find((tournament) => tournament.id === requestedTournamentId)
    : undefined;
  const visibleOptions = selectedTournament ? [selectedTournament] : tournamentOptions;

  return (
    <main className="app-shell">
      <Link
        className="back-link"
        href={selectedTournament ? `/tournaments/${selectedTournament.id}` : "/"}
      >
        ← {selectedTournament ? selectedTournament.name : "Preparation"}
      </Link>
      <ImportForm tournaments={visibleOptions} />
    </main>
  );
}
