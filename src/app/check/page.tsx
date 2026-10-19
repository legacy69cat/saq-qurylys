import {requireAccess} from '@/server/auth/access';
import {AdChecker} from '@/components/ad-checker';
export const dynamic='force-dynamic';
export default async function CheckPage(){await requireAccess();return <main id="main" className="page detail-page"><h1>Проверить объявление</h1><p>Вставьте текст и получите предварительную оценку с цитатами и объяснением баллов. Проверка не создаёт объект, сигнал или подтверждённый фактор в реестре.</p><AdChecker/></main>;}
