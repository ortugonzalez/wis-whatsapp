import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { RegisterServiceWorker } from "@/app/components/pwa/register-sw";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "WIS · WhatsApp",
  description: "Panel privado de WhatsApp e integraciones WIS",
  applicationName: "WIS WhatsApp",
  appleWebApp: {
    capable: true,
    title: "WIS WhatsApp",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
