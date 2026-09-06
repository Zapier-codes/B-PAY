import { useTheme } from "@/context/theme-context";
import { colors } from "@/constants/colors";

/**
 * Added this session (B-PAY dynamic-theming work, see handover.md
 * "Architecture decisions C" / Task 12). Thin convenience wrapper around
 * `useTheme()` — screens should read colors through this hook rather than
 * hardcoding hex/hsl literals, so switching schemes actually changes what
 * renders. `useTheme()` itself already existed and is already mounted via
 * `ThemeProvider` in `app/(app)/_layout.tsx`; this hook doesn't replace it,
 * it just makes the common case (get the active palette + a boolean) a
 * one-line call instead of importing `colors` and indexing by
 * `colorScheme` in every screen.
 *
 * NOTE: this hook alone does not make any screen theme-aware — a screen
 * only responds to theme changes once it actually calls this hook and uses
 * `colors.xxx` in its styles instead of a hardcoded literal. As of this
 * session, ~73 files under app/ and components/ still hardcode colors
 * directly (see handover.md) and have not been migrated yet.
 */
export function useThemeColors() {
  const { colorScheme, setCustomColorScheme } = useTheme();
  const active = colors[colorScheme] ?? colors.dark;

  return {
    colors: active,
    colorScheme,
    isDark: colorScheme === "dark",
    setColorScheme: setCustomColorScheme,
  };
}
