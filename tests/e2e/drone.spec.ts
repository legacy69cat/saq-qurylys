import {test,expect} from './fixtures';
test('drone uploads, manual observations and download work without claiming AI results',async({page})=>{
 await page.goto('/drone');
 await page.getByLabel('Снимки с дрона',{exact:true}).setInputFiles({name:'site.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
 await expect(page.getByRole('img',{name:'Снимок 1: site.png'})).toBeVisible();
 await expect(page.getByText('Автоматический анализ недоступен:',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Анализировать снимки'})).toBeDisabled();
 await page.getByLabel('Наблюдение аналитика: Ограждение площадки',{exact:true}).selectOption('concern');
 await page.getByLabel('Комментарий и номер снимка: Ограждение площадки',{exact:true}).fill('Проверить периметр на дополнительном ракурсе');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать отчёт JSON'}).click();expect((await download).suggestedFilename()).toBe('site-inspection.json');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
