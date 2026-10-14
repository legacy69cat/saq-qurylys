import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAQ QURYLYS — реестр объектов",
  description: "Демонстрационный мониторинг рисков в долевом жилищном строительстве",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#main">К содержимому</a>
        <header className="app-header">
          <Link href="/" className="brand" aria-label="SAQ QURYLYS — главная">
            <svg aria-hidden="true" viewBox="0 0 32 32" width="30" height="30" fill="none"><path d="M5 27V11l11-6 11 6v16M11 27V15h10v12M3 27h26" stroke="currentColor" strokeWidth="2" /></svg>
            <span>SAQ <strong>QURYLYS</strong></span>
          </Link>
          <span className="demo-label">Демонстрационные данные</span>
        </header>
        {children}
        <footer className="app-footer">SAQ QURYLYS · Codemasters 8.0 <span>Все объекты и источники вымышлены.</span></footer>
      </body>
    </html>
  );
}
