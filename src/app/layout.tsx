import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Timely CRM — Every inquiry, in view', description: 'A connected workspace for leads, websites, and follow-ups.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
