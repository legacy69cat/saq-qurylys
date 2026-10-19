import {it,expect,vi,afterEach} from 'vitest';
import {validBearer} from '../src/server/social/scheduled';
import {ApifyClient} from '../src/server/social/apify';
afterEach(()=>vi.unstubAllEnvs());
it('requires a configured secret and rejects malformed authorization',()=>{
 const secret='x'.repeat(40);expect(validBearer(`Bearer ${secret}`,secret)).toBe(true);
 for(const value of [null,'',secret,`Bearer ${'y'.repeat(40)}`,`Bearer ${secret}extra`])expect(validBearer(value,secret)).toBe(false);
 expect(validBearer('Bearer short','short')).toBe(false);expect(validBearer('Bearer x',undefined)).toBe(false);
});
it('attaches completion webhooks using an authorization header',async()=>{
 vi.stubEnv('APP_URL','https://saq.example.com');vi.stubEnv('APIFY_WEBHOOK_SECRET','x'.repeat(40));
 const transport=vi.fn(async()=>Response.json({data:{id:'run1',status:'RUNNING',defaultDatasetId:'dataset1'}}));
 await new ApifyClient('token',transport as typeof fetch).start({city:'Өскемен',keywords:'новостройки',platform:'tiktok',resultLimit:5,intervalHours:24});
 const [url]=transport.mock.calls[0] as unknown as [string];const encoded=new URL(url).searchParams.get('webhooks')!;
 const hook=JSON.parse(Buffer.from(encoded,'base64').toString())[0];
 expect(hook.requestUrl).toBe('https://saq.example.com/api/webhooks/apify');
 expect(JSON.parse(hook.headersTemplate).Authorization).toBe(`Bearer ${'x'.repeat(40)}`);
 expect(hook.eventTypes).toContain('ACTOR.RUN.FAILED');
});
