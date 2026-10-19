if(process.env.TURSO_DATABASE_URL)throw new Error('Tests must never use a remote database');
import { openDatabase, databasePath } from '../src/server/db/connection';
import { migrate } from '../src/server/db/migrations';
import { createUser } from '../src/server/auth/core';
if (!process.env.SAQ_AUTH_TEST_DB || process.env.DATABASE_PATH !== process.env.SAQ_AUTH_TEST_DB)
    throw new Error('Requires isolated test database');
const db = (await openDatabase(databasePath(), { create: true }));
try {
    (await migrate(db));
    await createUser(db, { username: 'analyst', name: 'Test Analyst', role: 'analyst', password: 'isolated-test-password-123' });
}
finally {
    db.close();
}
