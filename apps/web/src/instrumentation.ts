// Next.js calls `register` once when a server starts and waits for it before serving requests.
export async function register() {
	// Written inline, so that the bundler removes the import from the Edge build.
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { startNodeServer } = await import("./instrumentation-node");

		await startNodeServer();
	}
}
