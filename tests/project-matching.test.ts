import { expect, it } from 'vitest';
import { projectCandidates } from '../src/domain/project-matching';
const projects = [{ id: '1', name: 'Престиж', address: 'Адрес 1', developer: 'Компания 1' }, { id: '2', name: 'Viva Life', address: 'Адрес 2', developer: 'Компания 2' }, { id: '3', name: 'Престиж', address: 'Адрес 3', developer: 'Компания 3' }];
it('keeps ambiguous same-name candidates rather than choosing a company', () => expect(projectCandidates('Продажа квартир в ЖК «Престиж».', projects).map(p => p.id)).toEqual(['1', '3']));
it('normalizes punctuation and case', () => expect(projectCandidates('ЖК “VIVA-LIFE”: квартиры', projects).map(p => p.id)).toEqual(['2']));
it.each(['Престиж и комфорт в каждой квартире', 'ЖК Престижный: старт продаж', 'Поиск новостроек', 'ЖК Viva Lifestyle'])('does not infer identity from generic or partial name: %s', text => expect(projectCandidates(text, projects)).toEqual([]));
