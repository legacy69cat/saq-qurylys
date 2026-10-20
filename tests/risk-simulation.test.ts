import {describe,it,expect} from 'vitest';
import {simulatedRisk} from '../src/domain/risk-simulation';
describe('display-only scoring scenarios',()=>{
 it('keeps high scores without R1 yellow and allows red only with R1/R2',()=>{
  expect(simulatedRisk('e')).toMatchObject({score:65,zone:'yellow'});
  expect(simulatedRisk('d')).toMatchObject({score:70,zone:'red'});
  expect(simulatedRisk('a')).toMatchObject({score:10,zone:'green'});
 });
 it('is stable and does not manufacture evidence for a real project',()=>{
  const result=simulatedRisk('real-project');
  expect(result).toEqual(simulatedRisk('real-project'));
  expect(result.factors.every(f=>f.evidenceIds.length===0)).toBe(true);
 });
});
