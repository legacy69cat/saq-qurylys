export type MatchableProject = {
    id: string;
    name: string;
    address: string;
    developer: string;
};
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Name mentions are candidates only. They do not establish address or developer identity. */
export function projectCandidates(text: string, projects: MatchableProject[]): MatchableProject[] {
    const words = ` ${normalize(text)} `;
    return projects.filter(project => {
        const name = normalize(project.name).replace(/^(?:жк|жилой комплекс) /, '');
        if (name.length < 3)
            return false;
        // A name must have an explicit residential-complex prefix, preventing generic-word matches.
        return [` жк ${name} `, ` жилой комплекс ${name} `, ` жилом комплексе ${name} `, ` тұрғын үй кешені ${name} `].some(phrase => words.includes(phrase));
    });
}
