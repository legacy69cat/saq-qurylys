"use client";
import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/server/actions";
export function ActionForm({ action, children, label, pendingLabel = "Сохраняем…" }: {
    action: (state: ActionState, form: FormData) => Promise<ActionState>;
    children: ReactNode;
    label: string;
    pendingLabel?: string;
}) {
    const [state, formAction, pending] = useActionState(action, {});
    return <form action={formAction} className="workflow-form" aria-label={label}>
    <fieldset disabled={pending}>{children}<button type="submit">{pending ? pendingLabel : label}</button></fieldset>
    {pending ? <p role="status">{pendingLabel}</p> : null}
    {!pending && state.error ? <p role="alert" className="form-error">{state.error}</p> : null}
    {!pending && state.message ? <p role="status" className="form-success">{state.message}</p> : null}
  </form>;
}
export function PrintButton() { return <button type="button" className="no-print" onClick={() => window.print()}>Печать / сохранить PDF</button>; }
