import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { APP_NAME, APP_SUBTITLE, APP_TAGLINE } from "@/lib/branding";
import PwaServiceWorker from "@/components/PwaServiceWorker";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

// Use system fonts as fallback - more reliable for CI/CD builds
// and reduces external dependencies
const fontVariables = "";

export const metadata: Metadata = {
  title: `${APP_NAME}, ${APP_TAGLINE}`,
  description: APP_SUBTITLE,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/branding/controlweave-emblem.svg", type: "image/svg+xml" }],
    apple: [{ url: "/branding/controlweave-emblem.svg", type: "image/svg+xml" }],
    shortcut: ["/branding/controlweave-emblem.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fontVariables} antialiased font-sans`}>
        <AuthProvider>
          <PwaServiceWorker />
          <PwaInstallPrompt />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}