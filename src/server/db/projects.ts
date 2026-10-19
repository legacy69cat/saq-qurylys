import type {Database as DatabaseSync} from './connection';
import { calculateRisk, type Evidence, type Factor, type LegalBasis, type ProgressObservation, type RiskInput, type RiskResult } from "../../domain/risk";
import { DatabaseNotReadyError } from "./connection";
export interface Project {
    id: string;
    name: string;
    address: string;
    developer: string;
    bin: string;
    latitude: number | null;
    longitude: number | null;
    source: {
        source: string;
        url: string;
        capturedAt: string;
    } | null;
    stage: RiskInput["stage"];
    scenario: string;
    isDemo: boolean;
    legalBasis: LegalBasis;
    evidence: (Evidence & {
        url: string | null;
    })[];
    publications: {
        id: string;
        platform: string;
        account: string;
        publishedAt: string;
        evidenceId: string;
    }[];
    progress: ProgressObservation[];
    factors: Factor[];
    risk: RiskResult;
}
type ProjectRow = {
    latitude: number | null;
    longitude: number | null;
    id: string;
    name: string;
    address: string;
    developer: string;
    bin: string;
    stage: RiskInput["stage"];
    scenario: string;
    isDemo: number;
};
export async function listProjects(db: DatabaseSync): Promise<Project[]> {
    const schema = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get());
    if (!schema || !(await db.prepare("SELECT version FROM schema_migrations WHERE version = 4").get()) || !(await db.prepare("SELECT version FROM schema_migrations WHERE version = 2").get()))
        throw new DatabaseNotReadyError();
    const rows = (await db.prepare(`SELECT p.id, p.name, p.address, p.latitude, p.longitude, d.name AS developer, d.bin, p.stage, p.scenario, p.is_demo AS isDemo
    FROM projects p JOIN developers d ON p.developer_id = d.id ORDER BY p.id`).all()) as ProjectRow[];
    // Fetch each relation once: network round trips must not grow with object count.
    async function related<T>(sql:string){return await db.prepare(sql).all() as unknown as (T&{projectId:string})[];}
    const evidenceRows=await related<Project['evidence'][number]>("SELECT project_id AS projectId,id,source,text,url,captured_at AS capturedAt FROM evidence ORDER BY id");
    const legalRows=await related<Omit<LegalBasis,'evidenceIds'>&{evidenceId:string|null}>("SELECT project_id AS projectId,basis_type AS type,status,evidence_id AS evidenceId,reviewed_by AS reviewedBy,reviewed_at AS reviewedAt FROM legal_checks");
    const factorRows=await related<Omit<Factor,'evidenceIds'>&{id:string}>("SELECT project_id AS projectId,id,code,status,reviewed_by AS reviewedBy,reviewed_at AS reviewedAt FROM factors ORDER BY code");
    const factorEvidence=await db.prepare("SELECT factor_id,evidence_id FROM factor_evidence ORDER BY evidence_id").all() as {factor_id:string;evidence_id:string}[];
    const pendingRows=await related<{code:Factor['code'];evidenceId:string}>("SELECT p.project_id AS projectId,s.code,p.evidence_id AS evidenceId FROM suggestions s JOIN publications p ON p.id=s.publication_id WHERE s.status='proposed' ORDER BY s.id");
    const progressRows=await related<ProgressObservation>("SELECT project_id AS projectId,kind,percent,evidence_id AS evidenceId,observed_at AS observedAt FROM progress_observations ORDER BY observed_at,id");
    const publicationRows=await related<Project['publications'][number]>("SELECT project_id AS projectId,id,platform,account,published_at AS publishedAt,evidence_id AS evidenceId FROM publications ORDER BY id");
    const sources=await related<NonNullable<Project['source']>>("SELECT project_id AS projectId,source,url,captured_at AS capturedAt FROM project_sources");
    function select<T extends {projectId:string}>(items:T[],id:string){return items.filter(x=>x.projectId===id).map(({projectId,...rest})=>{void projectId;return rest;});}
    return rows.map(row=>{
        const evidence=select(evidenceRows,row.id);
        const legalRow=select(legalRows,row.id)[0];
        const legalBasis:LegalBasis=legalRow?{...legalRow,evidenceIds:legalRow.evidenceId?[legalRow.evidenceId]:[]}:{type:'unknown',status:'unknown',reviewedBy:null,reviewedAt:null,evidenceIds:[]};
        const factors:Factor[]=select(factorRows,row.id).map(f=>({...f,evidenceIds:factorEvidence.filter(e=>e.factor_id===f.id).map(e=>e.evidence_id)}));
        factors.push(...select(pendingRows,row.id).map((item):Factor=>({code:item.code,status:'proposed',evidenceIds:[item.evidenceId],reviewedBy:null,reviewedAt:null})));
        const progress=select(progressRows,row.id),publications=select(publicationRows,row.id),source=select(sources,row.id)[0]||null;
        return {...row,bin:row.bin.startsWith('unknown:')?'Не установлен':row.bin,source,isDemo:row.isDemo===1,legalBasis,evidence,progress,publications,factors,risk:calculateRisk({stage:row.stage,legalBasis,evidence,factors,progress})};
    });
}
