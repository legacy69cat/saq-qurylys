export const formatDate = (value: string) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(value));
export const SIGNAL_STATUS = { pending: "Ожидает проверки", confirmed: "Подтверждён", returned: "Возвращён на доработку" };
