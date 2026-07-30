export type AppSurface = "pet" | "preferences" | "developer";

const knownSurfaces = new Set<AppSurface>([
  "pet",
  "preferences",
  "developer",
]);

export function resolveSurface(
  search: string,
  fallback: AppSurface,
): AppSurface {
  const requested = new URLSearchParams(search).get("surface");
  return knownSurfaces.has(requested as AppSurface)
    ? (requested as AppSurface)
    : fallback;
}
