import {test,expect} from './fixtures';
import {openDatabase} from '../../src/server/db/connection';
import {saveSubmission} from '../../src/server/telegram/inbox';
test('analyst receives and closes a Telegram submission',async({page})=>{
 const db=await openDatabase(process.env.SAQ_E2E_DB!);try{await saveSubmission(db,90001,'Учебный ЖК строится. Внесите депозит 200 000 тенге.','text');}finally{db.close();}
 await page.goto('/inbox');await expect(page.getByRole('heading',{name:'Обращения из Telegram'})).toBeVisible();const article=page.locator('#tg-90001');await expect(article).toContainText('200 000');
 const form=article.getByRole('form');await form.getByLabel('Статус').selectOption('closed');await form.getByLabel('Результат проверки').fill('Учебная проверка завершена');await form.getByLabel('Автор решения').fill('Аналитик');await form.getByRole('button').click();await expect(article).toHaveCount(0);
 await page.goto('/inbox?closed=1');await expect(page.locator('#tg-90001')).toContainText('Завершено');await expect(page.locator('#tg-90001 textarea')).toHaveValue('Учебная проверка завершена');
});
