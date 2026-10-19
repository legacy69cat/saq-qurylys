import {test,expect} from './fixtures';
test('manual advertisement check explains points and marks stale results',async({page})=>{
 await page.goto('/check');await page.getByLabel('Текст объявления',{exact:true}).fill('Продаём квартиры в строящемся доме. Внесите депозит 300 000 ₸.');await page.getByRole('button',{name:'Проверить текст',exact:true}).click();
 const result=page.getByRole('region',{name:'Результат проверки объявления'});
 await expect(result).toContainText('35 баллов');await expect(result).toContainText('Полный риск объекта не определён');
 await page.getByLabel('Текст объявления',{exact:true}).fill('фото');await expect(result).toContainText('Текст изменён');
 await page.getByRole('button',{name:'Проверить текст',exact:true}).click();await expect(result).toContainText('Нет оценки');
 await expect(page.getByRole('heading',{name:'Для оценки недостаточно текста.'})).toBeVisible();
 await page.getByLabel('Текст объявления',{exact:true}).fill('https://example.com/квартиры');await page.getByRole('button',{name:'Проверить текст',exact:true}).click();await expect(result).toContainText('Нет оценки');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
