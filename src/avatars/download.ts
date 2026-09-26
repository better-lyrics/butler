export async function fetchImageBytes(
	url: string,
	doFetch: typeof fetch = fetch
): Promise<Buffer | null> {
	try {
		const res = await doFetch(url)
		if (!res.ok) return null
		return Buffer.from(await res.arrayBuffer())
	} catch {
		return null
	}
}

const MIME_EXTENSION: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
}

export function normalizeMime(contentType: string | null): string {
	return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
}

export function imageFileName(id: string, contentType: string | null): string {
	return `${id}.${MIME_EXTENSION[normalizeMime(contentType)] ?? "webp"}`
}
