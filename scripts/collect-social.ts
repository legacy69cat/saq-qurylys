import { randomUUID } from "node:crypto";
import { claimWorker, renewWorker, releaseWorker } from "../src/server/db/worker-lease";
import { setTimeout } from "node:timers/promises";
import { databasePath, openDatabase } from "../src/server/db/connection";
import { migrate } from "../src/server/db/migrations";
import { collectTick } from "../src/server/social/collector";
import { apifyConfigured } from "../src/server/social/apify";
if (!apifyConfigured()) {
    console.error("APIFY_TOKEN не настроен в .env.local.");
    process.exit(1);
}
const db = (await openDatabase(databasePath()));
(await migrate(db));
const owner = randomUUID();
if (!(await claimWorker(db, owner))) {
    db.close();
    throw new Error("Другой сборщик уже работает. Повторите после его остановки или истечения блокировки.");
}
const heartbeat = setInterval(async () => {
    try {
        if ((await renewWorker(db, owner)))
            return;
    }
    catch { /* Failure to renew must stop collection. */ }
    console.error("Блокировка сборщика потеряна; процесс остановлен.");
    process.exit(1);
}, 30000);
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
console.log("Сборщик SAQ запущен. Бюджет: $0.50 TikTok / $0.20 остальные, $1 за 24 часа. Ctrl+C — остановить.");
try {
    do {
        try {
            await collectTick(db);
        }
        catch {
            console.error("Ошибка цикла сбора; проверьте БД. Токен и ответы провайдера не выводятся.");
        }
        if (process.argv.includes("--once") || stopped)
            break;
        await setTimeout(15000);
    } while (!stopped);
}
finally {
    clearInterval(heartbeat);
    (await releaseWorker(db, owner));
    db.close();
}
