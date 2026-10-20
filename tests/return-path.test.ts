import {it,expect} from 'vitest';
import {safeReturnPath} from '../src/domain/return-path';
it('preserves the scenario and project destination across login',()=>{
 expect(safeReturnPath('/?simulation=1')).toBe('/?simulation=1');
 expect(safeReturnPath('/projects/krisha-42?simulation=1')).toBe('/projects/krisha-42?simulation=1');
});
it('rejects external, disguised and non-page destinations',()=>{
 for(const path of ['https://evil.example','//evil.example','/\\evil.example','/%2f%2fevil.example','/login?next=/','/api/health','/\nevil.example',null]) expect(safeReturnPath(path)).toBe('/');
});
