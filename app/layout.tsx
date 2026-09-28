import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { AmbientSky } from "@/components/AmbientSky";
import { Precalentar } from "@/components/Precalentar";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ToastProvider } from "@/components/ui/Toast";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/** Serif de titulares: le da caracter a la marca y a los titulos. */
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  // Para que en el iPhone se abra como una app y no dentro de Safari.
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: {
    // Next escribe la etiqueta estandar (mobile-web-app-capable), pero Safari
    // en iPhone sigue mirando la suya para abrir sin barra de direcciones.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b12",
  // La app ocupa toda la pantalla, tambien bajo la muesca del telefono.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} ${display.variable} font-sans antialiased`}>
        <AmbientSky />
        <ServiceWorker />
        <Precalentar />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
