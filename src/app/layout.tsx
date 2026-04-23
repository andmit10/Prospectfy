import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Providers } from '@/components/providers'
import { themeScript } from '@/components/theme/theme-provider'

// System-font stack (Arial-first). Dropping next/font/google imports removes
// the Geist/Space Grotesk network fetches and the CLS they caused on slow
// connections. Tester feedback: Arial is the familiar, trustworthy default
// for Brazilian PME audiences.

export const metadata: Metadata = {
  title: 'Ativafy — Ative sua prospecção com IA',
  description: 'Ative sua prospecção com IA. Plataforma B2B WhatsApp-first para PMEs brasileiras.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="h-full bg-background text-foreground font-sans">
        {/*
          Theme bootstrap — runs BEFORE hydration so the HTML gets the right
          `light` / `dark` class on first paint. Uses next/script with
          `strategy="beforeInteractive"` which Next.js 16 injects into the
          document head at render time. Avoids the React "script tag inside
          component" warning.
        */}
        <Script
          id="orbya-theme-bootstrap"
          strategy="beforeInteractive"
        >{themeScript}</Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
