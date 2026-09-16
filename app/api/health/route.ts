import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);

    return NextResponse.json({
      status: "ok",
      database: "ok",
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        database: "error",
      },
      { status: 503 },
    );
  }
}
