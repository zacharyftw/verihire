import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { SWRProvider } from '@/lib/swr-provider';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'VeriHire - AI-Powered Skill Certification',
  description: 'Verify your skills with AI-powered assessments and blockchain-backed certificates',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <SWRProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </SWRProvider>
      </body>
    </html>
  );
}
