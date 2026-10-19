import {scheduledCollection,validBearer} from '@/server/social/scheduled';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request:Request){
 if(!validBearer(request.headers.get('authorization'),process.env.APIFY_WEBHOOK_SECRET))return Response.json({error:'UNAUTHORIZED'},{status:401});
 // Never trust webhook content as evidence: query Apify using the saved run ID.
 return scheduledCollection();
}
