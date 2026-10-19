export async function telegram<T>(method:string,body:Record<string,unknown>):Promise<T>{
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('Telegram not configured');
 try{const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok||!data.ok)throw new Error();return data.result as T;}catch{throw new Error('Telegram request failed');}
}
export async function sendText(chatId:number,text:string){
 // Plain text: untrusted advertisements never become Telegram HTML/Markdown.
 for(let offset=0;offset<text.length;offset+=3500)await telegram('sendMessage',{chat_id:chatId,text:text.slice(offset,offset+3500),link_preview_options:{is_disabled:true}});
}
export async function downloadPhoto(fileId:string){
 const file=await telegram<{file_path?:string;file_size?:number}>('getFile',{file_id:fileId});
 if(!file.file_path||!/^photos\/[a-zA-Z0-9_.-]+$/.test(file.file_path)||(file.file_size??0)>5_000_000)throw new Error('Unsupported photo');
 try{const r=await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!r.ok||!r.body)throw new Error();const reader=r.body.getReader();let size=0;const parts:Uint8Array[]=[];while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>5_000_000){await reader.cancel();throw new Error();}parts.push(p.value);}return Buffer.concat(parts);}catch{throw new Error('Photo download failed');}
}
