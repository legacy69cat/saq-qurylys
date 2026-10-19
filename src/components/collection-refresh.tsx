"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
export function CollectionRefresh() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === "visible" && !document.querySelector("form:focus-within"))
                startTransition(() => router.refresh());
        }, 15000);
        return () => clearInterval(timer);
    }, [router]);
    return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Обновляем…" : "Обновить ленту"}</button>;
}
