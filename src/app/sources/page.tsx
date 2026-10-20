import Link from "next/link";
import { SOURCES } from "@/domain/sources";
export default function SourcesPage() {
    return <main id="main" className="page detail-page"><Link href="/" className="back-link">Вернуться в реестр</Link><h1>Источники для проверки</h1>
    <p>В карточке объекта доступны проверка организации по БИН в eQurylys и автоматический поиск в публичном Homeportal: разрешения, гарантии и опубликованные предупреждения. Результаты сохраняются с датой и ссылками. Ежедневно автоматически обновляются до шести объектов, начиная с давно не проверявшихся. Остальные источники ниже пока требуют ручной проверки.</p>
    <p className="notice">Сверяйте БИН, адрес, очередь строительства, номер документа, актуальность и охват источника. Отсутствие результата поиска не доказывает отсутствие правового основания. Дополнительные сведения сами по себе не начисляют R1–R6.</p>
    {["Правовое основание", "Дополнительные сведения"].map((group) => <section key={group}><h2>{group}</h2><div className="evidence-list">{SOURCES.filter((source) => source.group === group).map((source) => <article className="evidence-item" key={source.url}><h3><a href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a></h3><p>{source.purpose}</p></article>)}</div></section>)}
  </main>;
}
