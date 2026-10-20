import { safeReturnPath } from "@/domain/return-path";
import { ActionForm } from '@/components/action-form';
import { loginAction } from '@/server/auth/actions';
export const dynamic = 'force-dynamic';
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}) { const next=safeReturnPath((await searchParams).next); return <main id="main" className="page detail-page"><h1>Вход в SAQ QURYLYS</h1><ActionForm action={loginAction} label="Войти"><input type="hidden" name="next" value={next}/><label>Логин<input name="username" required maxLength={80} autoComplete="username"/></label><label>Пароль<input name="password" type="password" required maxLength={256} autoComplete="current-password"/></label></ActionForm></main>; }
