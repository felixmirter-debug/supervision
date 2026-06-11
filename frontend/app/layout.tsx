import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'CV SaaS — Computer Vision Services',
  description:
    'Professional computer vision: zone counting, object tracking, PPE detection, traffic analysis, quality control.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="es"
      data-accent-theme="blue"
      data-color-mode="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark`}
    >
      <body className="min-h-screen text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
