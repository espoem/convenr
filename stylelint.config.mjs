const config = {
	plugins: ["stylelint-high-performance-animation"],
	ignoreFiles: ["**/tokens.css"],
	rules: {
		"plugin/no-low-performance-animation-properties": true,
		"at-rule-property-required-list": { "font-face": ["font-display"] },
		"declaration-property-value-disallowed-list": { "font-display": ["auto", "block"] },
		"font-family-no-duplicate-names": true,
		"font-family-no-missing-generic-family-keyword": true,
		"function-url-scheme-disallowed-list": ["http", "https"],
	},
};

export default config;
