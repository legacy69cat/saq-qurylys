import type {Database as DatabaseSync} from './connection';
import { InputError, required } from "../../domain/analysis";
import { SEARCH_PACKS } from "../../domain/search-packs";
import { createSearch, enableSearch } from "./social";
export async function installSearchPacks(db: DatabaseSync, cityInput: unknown, ids: string[], enabled: boolean): Promise<number> {
    const city = required(cityInput, "Город", 80);
    const selected = SEARCH_PACKS.filter(p => ids.includes(p.id));
    if (!selected.length || ids.some(id => !SEARCH_PACKS.some(p => p.id === id)))
        throw new InputError("Выберите хотя бы один набор.");
    (await db.exec("BEGIN IMMEDIATE"));
    try {
        for (const pack of selected)
            for (const platform of ["tiktok", "facebook", "instagram"]) {
                const id = (await createSearch(db, { city, keywords: pack.terms.join(" | "), platform, resultLimit: 40, intervalHours: 168 }));
                if (enabled)
                    (await enableSearch(db, id, true));
            }
        (await db.exec("COMMIT"));
    }
    catch (error) {
        (await db.exec("ROLLBACK"));
        throw error;
    }
    return selected.length * 3;
}
