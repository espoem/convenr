import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
	output: "standalone",
	// The email templates render React to MJML with react-dom/server, which runs as plain Node
	// code outside the server component bundle.
	serverExternalPackages: ["mjml", "@faire/mjml-react"],
	turbopack: {
		rules: {
			"*.css": {
				loaders: ["@tailwindcss/turbopack"],
				as: "*.css",
			},
		},
	},
};

export default withNextIntl(nextConfig);
