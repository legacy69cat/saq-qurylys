import { currentUser } from "@/server/auth/access";
import { logoutAction } from "@/server/auth/actions";
import type { Metadata } from "next";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "./globals.css";
export const metadata: Metadata = {
    title: "SAQ QURYLYS — реестр объектов",
    description: "Мониторинг строительства и приоритетов проверки",
};
export default async function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) {
    const user = await currentUser();
    return (<html lang="ru">
      <body>
        <a className="skip-link" href="#main">К содержимому</a>
        <header className="app-header">
          <Link href="/" className="brand" aria-label="SAQ QURYLYS — главная">
            <svg aria-hidden="true" viewBox="0 0 32 32" width="30" height="30" fill="none"><path d="M5 27V11l11-6 11 6v16M11 27V15h10v12M3 27h26" stroke="currentColor" strokeWidth="2"/></svg>
            <span>SAQ <strong>QURYLYS</strong></span>
          </Link>
          <nav aria-label="Основная навигация"><Link href="/">Обзор</Link><Link href="/monitoring">Мониторинг</Link><Link href="/inbox">Обращения</Link><Link href="/check">Проверить объявление</Link><Link href="/drone">Снимки с дрона</Link><Link href="/analyst-guide">Как работать</Link><Link href="/sources">Источники РК</Link></nav>
          {user ? <div className="session-user"><span>{user.name}</span><form action={logoutAction}><button type="submit">Выйти</button></form></div> : null}
        </header>
        {process.env.SAQ_DEMO_MODE==='1'?<aside className="notice" aria-label="Демонстрационный режим">Демонстрационные данные: все объекты, застройщики, адреса и нарушения вымышлены. Не использовать для реальных решений.</aside>:null}
        {children}
        <footer className="app-footer">SAQ QURYLYS <span>Мониторинг строительства</span></footer>
      </body>
    </html>);
}
