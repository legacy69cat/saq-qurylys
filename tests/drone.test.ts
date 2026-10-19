import {it,expect} from 'vitest';
import sharp from 'sharp';
import {DRONE_ITEMS,parseDrone} from '../src/domain/drone';
import {normalizeDroneImage} from '../src/server/drone/analyze';
const findings=DRONE_ITEMS.map(i=>({id:i.id,status:'unclear',description:'Участок закрыт ракурсом',image:null}));
it('rejects invented absence, missing evidence and non-existing image numbers',()=>{
 expect(parseDrone({findings},2)).toHaveLength(5);
 for(const patch of [{status:'absent'},{status:'visible',image:null},{status:'visible',image:3},{description:''}])expect(()=>parseDrone({findings:[{...findings[0],...patch},...findings.slice(1)]},2)).toThrow();
 expect(()=>parseDrone({findings:[findings[0],findings[0],...findings.slice(2)]},2)).toThrow();
 expect(parseDrone({findings:[{...findings[0],status:'visible',image:1},...findings.slice(1)]},2)[0].image).toBe(1);
});
it('decodes and normalizes actual raster data and rejects malformed uploads',async()=>{
 const input=await sharp({create:{width:1800,height:900,channels:3,background:'#fff'}}).png().toBuffer();
 const output=await normalizeDroneImage(input);expect(await sharp(output).metadata()).toMatchObject({format:'jpeg',width:1600,height:800});
 await expect(normalizeDroneImage(Buffer.from('<svg></svg>'))).rejects.toThrow();
 await expect(normalizeDroneImage(Buffer.from('not an image'))).rejects.toThrow();
});
