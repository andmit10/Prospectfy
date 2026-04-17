import type { Metadata } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { themeScript } from '@/components/theme/theme-provider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Prospectfy — Prospecção Inteligente',
  description: 'Plataforma de prospecção B2B WhatsApp-first para PMEs brasileiras',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full bg-background text-foreground">
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
