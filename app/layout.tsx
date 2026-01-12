import "@/app/globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { rigConfig } from "@/config/rig.config";

const appDomain = `https://${rigConfig.farcaster.domain}`;
const heroImageUrl = `${appDomain}/media/hero.png`;
const splashImageUrl = `${appDomain}/media/splash.png`;

const miniAppEmbed = {
  version: "1",
  imageUrl: heroImageUrl,
  button: {
    title: rigConfig.farcaster.buttonTitle,
    action: {
      type: "launch_miniapp" as const,
      name: rigConfig.farcaster.appName,
      url: appDomain,
      splashImageUrl,
      splashBackgroundColor: "#000000",
    },
  },
};

export const metadata: Metadata = {
  title: rigConfig.branding.appName,
  description: rigConfig.branding.tagline,
  openGraph: {
    title: rigConfig.branding.appName,
    description: rigConfig.branding.tagline,
    url: appDomain,
    images: [
      {
        url: heroImageUrl,
      },
    ],
  },
  other: {
    "fc:miniapp": JSON.stringify(miniAppEmbed),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
