/** Only allow application pages as post-login destinations. */
export function safeReturnPath(value:unknown):string {
 if(typeof value!=='string'||value.length>2000||!value.startsWith('/')||value.startsWith('//')||(value.includes('\\')||Array.from(value).some(c=>c.charCodeAt(0)<=32||c.charCodeAt(0)===127)))return '/';
 try{
  const url=new URL(value,'https://saq.invalid');
  if(url.origin!=='https://saq.invalid'||!/^\/(?:projects\/[\w-]+|signals\/[\w-]+|monitoring(?:\/[\w-]+\/location)?|inbox|check|drone|sources|analyst-guide)?$/.test(url.pathname))return '/';
  return url.pathname+url.search+url.hash;
 }catch{return '/';}
}
