import {requireAccess} from '@/server/auth/access';
import {droneConfigured} from '@/server/drone/analyze';
import {DroneInspector} from '@/components/drone-inspector';
export const dynamic='force-dynamic';
export default async function DronePage(){await requireAccess('write');return <main id="main" className="page detail-page"><h1>Осмотр стройплощадки</h1><p>Загрузите обзорные снимки с дрона и крупные планы, чтобы проверить видимые элементы площадки.</p><p className="notice">Это визуальный осмотр, а не проверка разрешения на строительство. Перечень — рабочий чек-лист, не исчерпывающий перечень нормативных требований. Применимость норм к объекту и разрешительные документы проверяются отдельно. По снимкам нельзя подтвердить высоту, прочность ограждения или безопасность площадки.</p><DroneInspector configured={droneConfigured()}/></main>;}
