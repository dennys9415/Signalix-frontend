import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Signalix',
  description: 'Secure messaging',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Apply stored theme before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else if(t==='system'&&!window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.classList.remove('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
