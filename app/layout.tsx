import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chess Compass - Grandmaster Repertoire & Training System',
  description: 'Transposition-aware DAG repertoire builder, FSRS-6 spaced repetition, real-game deviation detection, and OpeningTree stats.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#0B0F17] text-white">
        {children}
      </body>
    </html>
  );
}
