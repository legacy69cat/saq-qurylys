import {defineConfig} from '@playwright/test';
// Explicit opt-in command only; never included in offline CI or the normal E2E suite.
if(!process.env.AI_GATEWAY_API_KEY||!process.env.AI_GATEWAY_MODEL)throw new Error('Configure AI Gateway before running the paid live case acceptance');
export default defineConfig({testDir:'./tests/live',workers:1,retries:0,timeout:120000,outputDir:'test-results/live-case',use:{baseURL:'http://127.0.0.1:3300',channel:process.env.PLAYWRIGHT_CHANNEL,viewport:{width:1440,height:1000},video:'on',trace:'off'},webServer:{command:'npm run demo -- --ai',url:'http://127.0.0.1:3300/api/liveness',reuseExistingServer:false,timeout:60000}});
