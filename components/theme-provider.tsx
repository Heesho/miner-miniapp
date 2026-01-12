"use client";

import { rigConfig } from "@/config/rig.config";

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider injects CSS custom properties from the rig config.
 * This allows the theme colors to be easily customized via the config file.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { colors } = rigConfig.branding;

  const style = {
    "--theme-primary": colors.primary,
    "--theme-primary-dark": colors.primaryDark,
    "--theme-primary-light": colors.primaryLight,
  } as React.CSSProperties;

  return <div style={style} className="contents">{children}</div>;
}
