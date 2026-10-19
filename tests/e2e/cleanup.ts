import { rmSync } from "node:fs";
import { dirname, basename } from "node:path";
export default function cleanup() {
    const path = process.env.SAQ_E2E_DB;
    if (path && basename(dirname(path)).startsWith("saq-e2e-"))
        rmSync(dirname(path), { recursive: true, force: true });
}
