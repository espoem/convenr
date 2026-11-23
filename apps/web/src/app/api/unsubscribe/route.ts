// One-click unsubscribing (RFC 8058): a mail client posts `List-Unsubscribe=One-Click` to the
// address in the email's `List-Unsubscribe` header. The signed value names what to turn off.
import { unsubscribe } from "@/server/notifications";

export async function POST(request: Request) {
	const value = new URL(request.url).searchParams.get("value") ?? "";
	const result = await unsubscribe(value);

	return new Response(null, { status: result.status === "unsubscribed" ? 204 : 400 });
}
