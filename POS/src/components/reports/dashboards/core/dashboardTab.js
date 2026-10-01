export function resolveDashboardId(requestedId, availableIds, fallbackId) {
	const requested = Array.isArray(requestedId) ? requestedId[0] : requestedId
	if (availableIds.includes(requested)) return requested
	if (availableIds.includes(fallbackId)) return fallbackId
	return availableIds[0] || fallbackId
}
