import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({user:{id:'u',role:'analyst'} as {id:string;role:string}|null,configured:false}));
vi.mock('../src/server/auth/access',()=>({currentUser:async()=>state.user}));
vi.mock('../src/server/auth/core',()=>({authEnabled:()=>true,hasRole:(u:{role:string})=>u.role!=='viewer'}));
vi.mock('../src/server/drone/analyze',()=>({droneConfigured:()=>state.configured,normalizeDroneImage:vi.fn(),analyzeDrone:vi.fn()}));
import {POST} from '../src/app/api/drone/route';
beforeEach(()=>{state.user={id:'u',role:'analyst'};state.configured=false;vi.stubEnv('APP_URL','https://site.example');});
afterEach(()=>vi.unstubAllEnvs());
const request=(headers:Record<string,string>={})=>new Request('https://site.example/api/drone',{method:'POST',headers:{origin:'https://site.example',...headers}});
it('protects image analysis before parsing uploads or charging a provider',async()=>{
 state.user=null;expect((await POST(request())).status).toBe(401);
 state.user={id:'v',role:'viewer'};expect((await POST(request())).status).toBe(403);
 state.user={id:'u',role:'analyst'};expect((await POST(request({origin:'https://other.example'}))).status).toBe(403);
 expect((await POST(request())).status).toBe(503);
 state.configured=true;expect((await POST(request({'content-length':'4000000'}))).status).toBe(413);
 expect((await POST(request())).status).toBe(400);
});
