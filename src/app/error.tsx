"use client";
export default function ErrorPage({ reset }: {
    reset: () => void;
}) {
    return <main id="main" className="page"><h1>Не удалось загрузить данные</h1><p>Проверьте доступность локальной базы. Если это первый запуск, выполните npm run db:setup.</p><button onClick={reset}>Повторить загрузку</button></main>;
}
