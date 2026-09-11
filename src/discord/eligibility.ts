// Position-based exam gate: a member qualifies if they hold any role ranked at or above the
// anchor role's Discord position. @everyone sits at position 0, below any real anchor, so it
// never qualifies on its own.
export function meetsMinRole(memberRolePositions: number[], anchorPosition: number): boolean {
	return memberRolePositions.some((position) => position >= anchorPosition)
}
