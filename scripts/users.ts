import { openDatabase, databasePath } from '../src/server/db/connection';
import { createUser } from '../src/server/auth/core';
const [command, username, name, role] = process.argv.slice(2);
const db = (await openDatabase(databasePath()));
try {
    if (command === 'create') {
        if (process.stdin.isTTY)
            throw new Error('Передайте пароль через stdin; не указывайте его в аргументах команды.');
        let password = '';
        for await (const chunk of process.stdin) {
            password += chunk;
            if (password.length > 258)
                throw new Error('Пароль слишком длинный');
        }
        await createUser(db, { username, name, role, password: password.replace(/\r?\n$/, '') });
        console.log('Пользователь создан');
    }
    else if (command === 'disable') {
        (await db.exec('BEGIN IMMEDIATE'));
        (await db.prepare('UPDATE auth_users SET disabled=1 WHERE username=?').run(username));
        (await db.prepare('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE username=?)').run(username));
        (await db.exec('COMMIT'));
        console.log('Доступ отозван');
    }
    else
        throw new Error('users.ts create LOGIN NAME admin|analyst|viewer (пароль stdin); users.ts disable LOGIN');
}
finally {
    db.close();
}
