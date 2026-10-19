export function extractAddresses(text: string): string[] {
    const patterns = [/(?:улица|ул\.|проспект|пр-т|пр\.|микрорайон|мкр\.?|переулок|пер\.)\s*[\p{L}\d][\p{L}\d .-]{1,65}?\s*,?\s+(?:дом\s*|д\.\s*)?\d{1,4}(?:\s*[а-яa-z])?(?:[/-]\d{1,3})?(?!\d)/giu, /[\p{L}][\p{L} .-]{1,50}\s+(?:көшесі|даңғылы)\s*,?\s*\d{1,4}(?:[а-яa-z])?(?:[/-]\d{1,3})?/giu];
    return [...new Set(patterns.flatMap(pattern => [...text.matchAll(pattern)].map(m => m[0].trim().replace(/\s+/g, ' '))))].slice(0, 5);
}
export function mentionedCity(text: string): string {
    if (/усть[\s-]?каменогорск|өскемен/iu.test(text))
        return 'Усть-Каменогорск';
    return '';
}
export const normalizeAddress = (address: string) => address.normalize('NFKC').toLowerCase().replace(/өскемен|усть[\s-]?каменогорск/gu, 'усткаменогорск').replace(/улица|ул\.|дом|д\./gu, '').replace(/ё/gu, 'е').replace(/[^\p{L}\p{N}]/gu, '');
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) { const rad = Math.PI / 180; const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2; return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
