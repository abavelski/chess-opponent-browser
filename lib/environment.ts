export type EnvironmentLabel = "Development" | "Preview" | "Production";

export function getEnvironmentLabel(
  vercelEnvironment?: string,
  nodeEnvironment?: string,
): EnvironmentLabel {
  if (vercelEnvironment === "production") {
    return "Production";
  }

  if (vercelEnvironment === "preview") {
    return "Preview";
  }

  if (nodeEnvironment === "production") {
    return "Production";
  }

  return "Development";
}
