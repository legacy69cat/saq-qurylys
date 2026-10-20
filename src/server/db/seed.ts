import type {Database as DatabaseSync} from './connection';
import type { FactorCode, FactorStatus, LegalBasis } from "../../domain/risk";
const date = "2026-10-14T10:00:00.000Z";
const reviewer = "demo-reviewer";
type DemoProject = {
    id: string;
    name: string;
    scenario: string;
    legal: LegalBasis["status"];
    basis: LegalBasis["type"];
    factors: Partial<Record<FactorCode, FactorStatus>>;
    claimed: number;
    verified: number;
    texts: string[];
};
export const DEMO_PROJECTS: DemoProject[] = [
    {
        id: "demo-a", name: "Контур 01", scenario: "A · основание не проверено, платная бронь", legal: "unknown", basis: "unknown",
        factors: { R2: "confirmed", R3: "confirmed" }, claimed: 40, verified: 35,
        texts: ["ЖК Контур 01 строится. Закрепите квартиру: платная бронь 100 000 ₸.", "Контур 01: строительство продолжается, открыты продажи квартир."],
    },
    {
        id: "demo-b", name: "Контур 02", scenario: "B · отсутствие основания подтверждено, депозит", legal: "absent", basis: "none",
        factors: { R1: "confirmed", R2: "confirmed", R3: "confirmed" }, claimed: 60, verified: 55,
        texts: ["ЖК Контур 02 строится. Внесите депозит 500 000 ₸ для фиксации цены квартиры.", "Контур 02: квартиры в строящемся доме. Продажи открыты."],
    },
    {
        id: "demo-c", name: "Контур 03", scenario: "C · гарантия подтверждена, обычная реклама", legal: "present", basis: "guarantee",
        factors: { R3: "confirmed" }, claimed: 70, verified: 70,
        texts: ["ЖК Контур 03: познакомьтесь с планировками строящегося дома.", "Контур 03: новые фотографии хода строительства. Запись на бесплатную консультацию."],
    },
    {
        id: "demo-d", name: "Контур 04", scenario: "65 баллов без R1: остаётся жёлтым", legal: "present", basis: "mio_permission",
        factors: { R2: "confirmed", R3: "confirmed", R4: "confirmed", R5: "confirmed", R6: "confirmed" }, claimed: 80, verified: 50,
        texts: ["ЖК Контур 04 строится. Первоначальный взнос 20% для покупки квартиры.", "Контур 04: в рекламном отчёте указана готовность 80%."],
    },
    {
        id: "demo-e", name: "Контур 05", scenario: "Гипотеза не влияет на балл", legal: "unknown", basis: "unknown",
        factors: { R2: "proposed", R3: "proposed" }, claimed: 20, verified: 20,
        texts: ["ЖК Контур 05: обсуждаем условия бронирования строящихся квартир индивидуально."],
    },
    {
        id: "demo-f", name: "Контур 06", scenario: "Все шесть факторов: 100 баллов", legal: "absent", basis: "none",
        factors: { R1: "confirmed", R2: "confirmed", R3: "confirmed", R4: "confirmed", R5: "confirmed", R6: "confirmed" }, claimed: 75, verified: 35,
        texts: ["ЖК Контур 06 строится. Оплатите бронь 250 000 ₸. Заявленная готовность — 75%."],
    },
    {
        id: "demo-g", name: "Контур 07", scenario: "Только R1: исходная точка для будущего демо", legal: "absent", basis: "none",
        factors: { R1: "confirmed", R3: "proposed" }, claimed: 30, verified: 30,
        texts: ["ЖК Контур 07: информация о проекте строящегося дома. Публикация ожидает проверки."],
    },
    {
        id: "demo-h", name: "Контур 08", scenario: "Расхождение 19 п.п.: R5 не начисляется", legal: "present", basis: "guarantee",
        factors: { R3: "confirmed", R5: "confirmed" }, claimed: 69, verified: 50,
        texts: ["ЖК Контур 08: планировки и ход строительства. Заявленная готовность — 69%."],
    },
];
// Synthetic display positions; these are not real construction-site locations.
export const DEMO_LOCATIONS: Record<string, [number, number]> = {
    'demo-a': [49.976, 82.602], 'demo-b': [49.968, 82.638],
    'demo-c': [49.957, 82.664], 'demo-d': [49.943, 82.676],
    'demo-e': [49.929, 82.653], 'demo-f': [49.922, 82.619],
    'demo-g': [49.940, 82.593], 'demo-h': [49.958, 82.583],
};
/** Inserts only missing demo records. Existing analyst edits are never overwritten. */
export async function seedDemo(db: DatabaseSync): Promise<void> {
    (await db.exec("BEGIN IMMEDIATE"));
    try {
        (await db.prepare("INSERT INTO reviewers VALUES (?, ?, 1) ON CONFLICT(id) DO NOTHING").run(reviewer, "Демо-аналитик"));
        const insertEvidence = db.prepare("INSERT INTO evidence (id, project_id, kind, source, url, text, captured_at, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO NOTHING");
        for (const [index, project] of DEMO_PROJECTS.entries()) {
            const developerId = `demo-developer-${index + 1}`;
            (await db.prepare("INSERT INTO developers VALUES (?, ?, ?, 1) ON CONFLICT(id) DO NOTHING")
                .run(developerId, `Учебный застройщик ${index + 1}`, `DEMO-${String(index + 1).padStart(6, "0")}`));
            (await db.prepare("INSERT INTO projects (id, name, address, developer_id, stage, scenario, is_demo, created_at) VALUES (?, ?, ?, ?, 'construction', ?, 1, ?) ON CONFLICT(id) DO NOTHING")
                .run(project.id, project.name, `Демонстрационный квартал, участок ${index + 1} (вымышленный адрес)`, developerId, project.scenario, date));
            const [latitude, longitude] = DEMO_LOCATIONS[project.id];
            await db.prepare("UPDATE projects SET latitude=?,longitude=? WHERE id=? AND is_demo=1 AND latitude IS NULL AND longitude IS NULL")
                .run(latitude, longitude, project.id);
            const legalEvidence = `${project.id}-legal`;
            (await insertEvidence.run(legalEvidence, project.id, "legal", "Учебная справка о правовом основании", null, project.legal === "absent" ? "Демонстрационная проверка: отсутствие всех применимых оснований установлено аналитиком. Не является сведением из реального реестра."
                : project.legal === "present" ? `Демонстрационная проверка: основание ${project.basis === "guarantee" ? "гарантия Единого оператора" : "разрешение МИО"} подтверждено. Реального запроса к реестру не было.`
                    : "Сведений для проверки основания пока нет. Его отсутствие не установлено.", date));
            const checked = project.legal !== "unknown";
            (await db.prepare("INSERT INTO legal_checks VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id) DO NOTHING")
                .run(project.id, project.basis, project.legal, checked ? legalEvidence : null, checked ? reviewer : null, checked ? date : null));
            for (const [i, text] of project.texts.entries()) {
                const id = `${project.id}-ad-${i + 1}`;
                (await insertEvidence.run(id, project.id, "publication", "Учебная рекламная публикация", `https://example.invalid/${id}`, `${text}\n\nДемонстрационный пример. Все сведения вымышлены.`, date));
                (await db.prepare("INSERT INTO publications VALUES (?, ?, ?, ?, ?, ?, 'confirmed') ON CONFLICT(id) DO NOTHING")
                    .run(id, project.id, id, "Демо-площадка", `demo_account_${index + 1}`, date));
            }
            for (const kind of ["claimed", "verified"] as const) {
                const id = `${project.id}-progress-${kind}`;
                (await insertEvidence.run(id, project.id, "progress", kind === "claimed" ? "Учебный отчёт застройщика" : "Учебный акт осмотра", null, `Демонстрационная ${kind === "claimed" ? "заявленная" : "подтверждённая"} готовность: ${project[kind]}%.`, date));
                (await db.prepare("INSERT INTO progress_observations VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
                    .run(id, project.id, kind, project[kind], id, date));
            }
            if (project.factors.R4)
                (await insertEvidence.run(`${project.id}-complaint`, project.id, "complaint", "Учебное коллективное обращение", null, "Вымышленное коллективное обращение о привлечении средств. Проверка выполнена демо-аналитиком. Персональные данные отсутствуют.", date));
            if (project.factors.R6)
                (await insertEvidence.run(`${project.id}-delay`, project.id, "delay", "Учебный акт о простое", null, "Демонстрационный акт: зафиксирован длительный простой 90 дней. Существенность отклонения подтверждена демо-аналитиком для этого примера.", date));
            for (const [code, status] of Object.entries(project.factors)) {
                const factorId = `${project.id}-${code}`;
                (await db.prepare("INSERT INTO factors VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
                    .run(factorId, project.id, code, status, status === "confirmed" ? reviewer : null, status === "confirmed" ? date : null));
                const ids = code === "R1" ? [legalEvidence] : code === "R4" ? [`${project.id}-complaint`] : code === "R6" ? [`${project.id}-delay`]
                    : code === "R5" ? [`${project.id}-progress-claimed`, `${project.id}-progress-verified`] : [`${project.id}-ad-1`];
                for (const id of ids)
                    (await db.prepare("INSERT INTO factor_evidence VALUES (?, ?, ?) ON CONFLICT(factor_id, evidence_id) DO NOTHING").run(factorId, id, project.id));
            }
        }
        (await db.exec("COMMIT"));
    }
    catch (error) {
        (await db.exec("ROLLBACK"));
        throw error;
    }
}
