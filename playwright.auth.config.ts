import {defineConfig} from '@playwright/test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const database=join(mkdtempSync(join(tmpdir(),'saq-auth-test-')),'test.sqlite');
export default defineConfig({testDir:'./tests/security',workers:1,use:{baseURL:'http://127.0.0.1:3200',channel:process.env.PLAYWRIGHT_CHANNEL},webServer:{command:'node --import tsx scripts/setup-auth-test.ts && npm run start -- --port 3200',url:'http://127.0.0.1:3200/api/liveness',env:{TURSO_DATABASE_URL:"",TURSO_AUTH_TOKEN:"",VERCEL:"",VERCEL_OIDC_TOKEN:"",DRONE_AI_MODEL:"",TELEGRAM_BOT_TOKEN:"",TELEGRAM_WEBHOOK_SECRET:"",APP_URL:"http://127.0.0.1:3200",SAQ_AUTH_TEST_DB:database,DATABASE_PATH:database,APP_ENV:'test',SAQ_AUTH_MODE:'session',SAQ_DEMO_MODE:'0',APIFY_TOKEN:'',AI_GATEWAY_API_KEY:''},reuseExistingServer:false}});
