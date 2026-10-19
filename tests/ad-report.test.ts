import {it,expect} from 'vitest';
import {buildAdReport,formatAdReport,MAX_AD_LENGTH} from '../src/domain/ad-report';
it('keeps preliminary points separate from unknown full risk',()=>{
 const text='Продаём квартиры в строящемся доме. Внесите депозит 300 000 ₸.';
 const r=buildAdReport(text,0);expect(r.assessment.score).toBe(35);expect(r.fullRisk).toBeNull();
 expect(r.missing.map(m=>m.weight)).toEqual([35,15,10,5]);
 for(const signal of r.assessment.signals)expect(text).toContain(signal.quote);
 expect(formatAdReport(r)).toContain('Полный риск объекта: не определён');
});
it('does not turn missing or absent signals into a safety verdict',()=>{
 expect(buildAdReport('https://example.com/квартиры').assessment.category).toBe('insufficient');
 expect(buildAdReport('фото').assessment.category).toBe('insufficient');
 expect(formatAdReport(buildAdReport('Продажа квартир. Дом сдан.'))).toContain('не подтверждает безопасность');
 expect(()=>buildAdReport('  ')).toThrow('Вставьте');expect(()=>buildAdReport('a'.repeat(MAX_AD_LENGTH+1))).toThrow('не больше');
});
it('produces a bounded plain text reply without chat formatting commands',()=>{
 const text='Продаём квартиры в строящемся доме. Внесите депозит 300 000 ₸. '+('Длинное описание '.repeat(900));
 const report=buildAdReport(text);expect(formatAdReport(report).length).toBeLessThan(4096);
 expect(formatAdReport(report)).toContain('0 баллов не означает отсутствие риска');
});
