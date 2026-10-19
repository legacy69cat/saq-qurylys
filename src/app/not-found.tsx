import Link from "next/link";
export default function NotFound() {
    return <main id="main" className="page"><h1>Объект не найден</h1><p>Проверьте адрес страницы или выберите объект в реестре.</p><Link href="/">Открыть реестр</Link></main>;
}
