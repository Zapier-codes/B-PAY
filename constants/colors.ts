export const colors = {
	dark: {
		background: "hsl(29, 53%, 1%)",
		foreground: "hsl(0, 0%, 98%)",
		card: "hsl(240, 10%, 3.9%)",
		cardForeground: "hsl(0, 0%, 98%)",
		popover: "hsl(240, 10%, 3.9%)",
		popoverForeground: "hsl(0, 0%, 98%)",
		primary: "hsl(0, 0%, 98%)",
		primaryForeground: "hsl(240, 5.9%, 10%)",
		secondary: "hsl(240, 3.7%, 15.9%)",
		secondaryForeground: "hsl(0, 0%, 98%)",
		muted: "hsl(36, 93.20%, 17.30%)",
		mutedForeground: "hsl(240, 5%, 64.9%)",
		accent: "hsl(240, 3.7%, 15.9%)",
		accentForeground: "hsl(0, 0%, 98%)",
		destructive: "hsl(0, 72%, 51%)",
		destructiveForeground: "hsl(0, 0%, 98%)",
		border: "hsl(240, 3.7%, 15.9%)",
		input: "hsl(240, 3.7%, 15.9%)",
		ring: "hsl(240, 4.9%, 83.9%)",
		button: "hsl(27, 52%, 17%)",
	},
	// Added this session (B-PAY Task 12 / dynamic theming work). Same brand
	// hue family as `dark` (warm amber/gold, hue ~27-40) re-lightened for a
	// light background, not a generic Material light palette — kept
	// deliberately close to the dark scheme's identity rather than treating
	// light mode as an unrelated theme.
	light: {
		background: "hsl(40, 33%, 97%)",
		foreground: "hsl(20, 14%, 8%)",
		card: "hsl(0, 0%, 100%)",
		cardForeground: "hsl(20, 14%, 8%)",
		popover: "hsl(0, 0%, 100%)",
		popoverForeground: "hsl(20, 14%, 8%)",
		primary: "hsl(20, 14%, 8%)",
		primaryForeground: "hsl(0, 0%, 98%)",
		secondary: "hsl(40, 20%, 92%)",
		secondaryForeground: "hsl(20, 14%, 8%)",
		muted: "hsl(36, 40%, 90%)",
		mutedForeground: "hsl(25, 10%, 40%)",
		accent: "hsl(40, 20%, 92%)",
		accentForeground: "hsl(20, 14%, 8%)",
		destructive: "hsl(0, 72%, 45%)",
		destructiveForeground: "hsl(0, 0%, 98%)",
		border: "hsl(36, 20%, 85%)",
		input: "hsl(36, 20%, 88%)",
		ring: "hsl(36, 93%, 30%)",
		button: "hsl(38, 92%, 50%)",
	},
};

