"use client";
export default function ErrorPage({ reset }: {
    reset: () => void;
}) {
    return <main id="main" className="page"><h1>Не удалось загрузить данные</h1><p>Повторите попытку. Если ошибка сохраняется, обратитесь к администратору.</p><button onClick={reset}>Повторить загрузку</button></main>;
}
