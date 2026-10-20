import {refreshRegistries} from '@/server/registries/scheduled';
import {scheduledCollection,validBearer} from '@/server/social/scheduled';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){
 if(!validBearer(request.headers.get('authorization'),process.env.CRON_SECRET))return Response.json({error:'UNAUTHORIZED'},{status:401});
 const registries=await refreshRegistries();
 const collection=await scheduledCollection();
 return Response.json({registries,collection:await collection.json()},{status:registries.failed||collection.status>=500?503:200,headers:{'Cache-Control':'no-store'}});
}
