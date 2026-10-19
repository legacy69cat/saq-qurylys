import {telegram} from '../src/server/telegram/api';
const url=process.env.APP_URL,secret=process.env.TELEGRAM_WEBHOOK_SECRET;
if(!url?.startsWith('https://')||!secret||!/^[\w-]{20,256}$/.test(secret)||!process.env.TELEGRAM_BOT_TOKEN)throw new Error('Set APP_URL (HTTPS), TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET first');
try{
 const me=await telegram<{username:string}>('getMe',{});
 await telegram('setMyCommands',{commands:[{command:'start',description:'Проверить объявление о жилье'},{command:'help',description:'Как отправить текст или скриншот'},{command:'privacy',description:'Как обрабатываются данные'}]});
 await telegram('setWebhook',{url:new URL('/api/webhooks/telegram',url).href,secret_token:secret,allowed_updates:['message'],max_connections:1});
 const info=await telegram<{url:string;pending_update_count:number}>('getWebhookInfo',{});
 console.log(JSON.stringify({bot:`https://t.me/${me.username}`,webhook:info.url,pendingUpdates:info.pending_update_count}));
}catch{console.error('Telegram setup failed. Check bot token and production settings.');process.exitCode=1;}
