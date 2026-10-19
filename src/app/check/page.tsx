import {requireAccess} from '@/server/auth/access';
import {hasRole} from '@/server/auth/core';
import {ocrConfigured} from '@/server/ai/ocr';
import {AdChecker} from '@/components/ad-checker';
export const dynamic='force-dynamic';
export default async function CheckPage(){const user=await requireAccess();return <main id="main" className="page detail-page"><h1>Проверить объявление</h1><p>Вставьте текст или загрузите скриншот и получите предварительную оценку с цитатами и объяснением баллов. Проверка не создаёт объект, сигнал или подтверждённый фактор в реестре.</p><AdChecker ocrEnabled={ocrConfigured()&&(!user||hasRole(user,'write'))}/></main>;}
