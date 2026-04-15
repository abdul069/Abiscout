import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'CarScout — Vind elke dag de beste autodeals.',
  description:
    'AI-platform voor Belgische autohandelaars. Automatische scan van 2dehands en AutoScout24, ' +
    'met Telegram alerts wanneer een goede deal voorbijkomt.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
