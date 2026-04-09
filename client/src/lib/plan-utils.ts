/** True when the user's assigned plan is the Free tier (by name). */
export function isFreePlanUser(
  user: { plan?: { name?: string | null } | null } | null | undefined,
): boolean {
  return user?.plan?.name?.toLowerCase() === "free";
}
