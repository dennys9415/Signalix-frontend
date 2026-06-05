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
      <body className="bg-[#f2f2f7] dark:bg-[#0c0c12] text-[#1d1d1f] dark:text-[#f5f5f7] antialiased">
        {children}
      </body>
    </html>
  );
}
