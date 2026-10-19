import { readFileSync } from "node:fs";
import { analyzeAdvertisement, aiConfigured } from "../src/server/ai/analyze";
if (!aiConfigured()) {
    console.error("Настройте AI_GATEWAY_API_KEY и AI_GATEWAY_MODEL в .env.local. Живые запросы не выполнялись.");
    process.exit(1);
}
const cases = JSON.parse(readFileSync(new URL("../tests/fixtures/ai-evaluation.json", import.meta.url), "utf8")) as {
    name: string;
    text: string;
    expected: string[];
}[];
let passed = 0;
for (const item of cases) {
    try {
        const output = await analyzeAdvertisement(item.text, "Контур 07");
        const codes = output.suggestions.map((s) => s.code).sort();
        const ok = JSON.stringify(codes) === JSON.stringify(item.expected.toSorted());
        if (ok)
            passed++;
        console.log(JSON.stringify({ case: item.name, ok, expected: item.expected, actual: codes, output }));
    }
    catch {
        console.log(JSON.stringify({ case: item.name, ok: false, error: "Запрос или проверка ответа не завершены" }));
    }
}
console.log(JSON.stringify({ model: process.env.AI_GATEWAY_MODEL, passed, total: cases.length, note: "Малый учебный набор; не оценка точности на реальных данных" }));
if (passed !== cases.length)
    process.exitCode = 1;
