import { backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { databasePath, openDatabase } from '../src/server/db/connection';
const directory = resolve(process.env.BACKUP_DIR || 'data/backups');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const target = resolve(directory, `saq-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`);
const db = (await openDatabase(databasePath(), { readOnly: true }));
try {
    if(!db.local)throw new Error('Use Turso export/backup for a remote database');
    await backup(db.local, target);
    chmodSync(target, 0o600);
    const copy = (await openDatabase(target, { readOnly: true }));
    try {
        if ((await copy.prepare('PRAGMA integrity_check').get())?.integrity_check !== 'ok')
            throw new Error('Backup integrity check failed');
    }
    finally {
        copy.close();
    }
    console.log(target);
}
finally {
    db.close();
}
