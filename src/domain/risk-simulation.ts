import {classifyZone, FACTOR_RULES, RULES_VERSION, type FactorCode, type RiskResult} from './risk';
const scenarios: readonly (readonly FactorCode[])[] = [[], ['R3'], ['R2','R3'], ['R1'], ['R1','R2','R3'], ['R2','R3','R4','R5','R6'], ['R1','R2','R3','R4'], ['R1','R2','R3','R4','R5','R6']];
/** Display-only what-if calculation. Never used by persistence or signal generation. */
export function simulatedRisk(projectId:string):RiskResult {
 const hash=Array.from(projectId).reduce((value,c)=>(Math.imul(value,31)+c.charCodeAt(0))>>>0,0);
 const codes=scenarios[hash%scenarios.length];
 const score=codes.reduce((total,code)=>total+FACTOR_RULES[code].weight,0);
 return {score,zone:classifyZone(score,codes),rulesVersion:RULES_VERSION,needsReview:false,factors:(Object.keys(FACTOR_RULES) as FactorCode[]).map(code=>({code,...FACTOR_RULES[code],points:codes.includes(code)?FACTOR_RULES[code].weight:0,counted:codes.includes(code),needsReview:false,reason:codes.includes(code)?'Условие включено в сценарий. Не является сведением об объекте.':'Условие не включено в сценарий.',evidenceIds:[]}))};
}
