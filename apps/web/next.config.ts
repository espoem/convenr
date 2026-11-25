import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
	output: "standalone",
	// The email templates render React to MJML with react-dom/server outside the RSC bundle,
	// and standalone maintenance scripts load `pg` directly with Node.
	serverExternalPackages: ["mjml", "@faire/mjml-react", "pg"],
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
