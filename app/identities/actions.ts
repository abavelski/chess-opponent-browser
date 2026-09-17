"use server";

import { redirect } from "next/navigation";

import { normalizeAliasKey, normalizeSourceFideId } from "@/lib/identities/domain";
import {
  createPlayerAndResolveIdentity,
  resolveIdentityToExisting,
} from "@/lib/identities/repository";
import { validateOpponentInput } from "@/lib/players/validation";

function detailUrl(
  normalizedName: string,
  sourceFideId: string | null,
  error?: string,
) {
  const params = new URLSearchParams({ nameKey: normalizedName });
  if (sourceFideId) params.set("fideId", sourceFideId);
  if (error) params.set("error", error);
  return `/identities/resolve?${params.toString()}`;
}

function resultErrorMessage(status: string) {
  switch (status) {
    case "fide_conflict":
      return "Resolution blocked because the reviewed source identity conflicts with the target FIDE ID.";
    case "alias_conflict":
      return "That normalized alias already belongs to another player. Uncheck Remember alias to make a one-off resolution.";
    case "canonical_fide_conflict":
      return "That FIDE ID already belongs to another canonical player.";
    case "target_missing":
      return "The selected canonical player no longer exists.";
    case "stale":
      return "This unresolved group changed or was already resolved. Refresh the queue and review it again.";
    default:
      return "The identity could not be resolved. Refresh and try again.";
  }
}

function identityFromForm(formData: FormData) {
  const rawNameKey = formData.get("nameKey");
  const rawFideId = formData.get("sourceFideId");
  const normalizedName =
    typeof rawNameKey === "string" ? normalizeAliasKey(rawNameKey) : "";
  const sourceFideId =
    typeof rawFideId === "string" ? normalizeSourceFideId(rawFideId) : null;
  return { normalizedName, sourceFideId };
}

export async function resolveToExistingPlayer(formData: FormData) {
  const { normalizedName, sourceFideId } = identityFromForm(formData);
  const target = Number(formData.get("targetPlayerId"));
  const rememberAlias = formData.get("rememberAlias") === "on";

  if (!normalizedName || !Number.isSafeInteger(target) || target < 1) {
    redirect(detailUrl(normalizedName || "invalid", sourceFideId, "Choose a valid canonical player."));
  }

  let result: Awaited<ReturnType<typeof resolveIdentityToExisting>>;
  try {
    result = await resolveIdentityToExisting({
      normalizedName,
      sourceFideId,
      targetPlayerId: target,
      rememberAlias,
    });
  } catch (error) {
    console.error("Failed to resolve identity to existing player", error);
    redirect(detailUrl(normalizedName, sourceFideId, "The database operation failed. No partial resolution was applied."));
  }

  if (result.status !== "resolved") {
    redirect(detailUrl(normalizedName, sourceFideId, resultErrorMessage(result.status)));
  }

  redirect(`/identities?resolved=${result.updatedCount}&playerId=${result.playerId}`);
}

export async function createPlayerAndResolve(formData: FormData) {
  const { normalizedName, sourceFideId } = identityFromForm(formData);
  const rememberAlias = formData.get("rememberAlias") === "on";
  const name = formData.get("canonicalName");
  const fideId = formData.get("canonicalFideId");

  if (!normalizedName) {
    redirect("/identities?error=The unresolved identity is invalid.");
  }

  const validation = validateOpponentInput({
    name: typeof name === "string" ? name : "",
    fideId: typeof fideId === "string" ? fideId : "",
    federation: "",
    rating: "",
  });

  if (!validation.ok) {
    const message = validation.errors.name ?? validation.errors.fideId ?? "Player details are invalid.";
    redirect(detailUrl(normalizedName, sourceFideId, message));
  }

  let result: Awaited<ReturnType<typeof createPlayerAndResolveIdentity>>;
  try {
    result = await createPlayerAndResolveIdentity({
      normalizedName,
      sourceFideId,
      canonicalName: validation.data.name,
      canonicalFideId: validation.data.fideId,
      rememberAlias,
    });
  } catch (error) {
    console.error("Failed to create player during identity resolution", error);
    redirect(detailUrl(normalizedName, sourceFideId, "The database operation failed. No player or partial resolution was created."));
  }

  if (result.status !== "resolved") {
    redirect(detailUrl(normalizedName, sourceFideId, resultErrorMessage(result.status)));
  }

  redirect(`/identities?resolved=${result.updatedCount}&playerId=${result.playerId}&created=1`);
}
