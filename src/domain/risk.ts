export const RULES_VERSION = "saq-1.0";
export const FACTOR_RULES = {
  R1: { weight: 35, title: "Установлено отсутствие правового основания" },
  R2: { weight: 25, title: "Прямое предложение внести деньги" },
  R3: { weight: 10, title: "Реклама строящегося жилья" },
  R4: { weight: 15, title: "Подтверждённое коллективное обращение" },
  R5: { weight: 10, title: "Расхождение готовности от 20 п.п." },
  R6: { weight: 5, title: "Документированный простой или просрочка" },
} as const;

export type FactorCode = keyof typeof FACTOR_RULES;
export type Zone = "green" | "yellow" | "red";
export type FactorStatus = "unknown" | "proposed" | "confirmed" | "rejected";
export type LegalStatus = "unknown" | "present" | "absent";

export interface Evidence {
  id: string;
  source: string;
  text: string;
  capturedAt: string;
}

export interface Review {
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface Factor extends Review {
  code: FactorCode;
  status: FactorStatus;
  evidenceIds: string[];
}

export interface LegalBasis extends Review {
  status: LegalStatus;
  type: "unknown" | "guarantee" | "mio_permission" | "other" | "none";
  evidenceIds: string[];
}

export interface ProgressObservation {
  kind: "claimed" | "verified";
  percent: number;
  evidenceId: string;
  observedAt: string;
}

export interface RiskInput {
  stage: "construction" | "commissioned";
  legalBasis: LegalBasis;
  evidence: Evidence[];
  factors: Factor[];
  progress: ProgressObservation[];
}

export interface FactorResult {
  code: FactorCode;
  title: string;
  weight: number;
  points: number;
  counted: boolean;
  needsReview: boolean;
  reason: string;
  evidenceIds: string[];
}

export interface RiskResult {
  score: number;
  zone: Zone;
  rulesVersion: string;
  factors: FactorResult[];
  needsReview: boolean;
}

const validDate = (value: string | null) => !!value && Number.isFinite(Date.parse(value));
const reviewed = (value: Review) => !!value.reviewedBy?.trim() && validDate(value.reviewedAt);

export function classifyZone(score: number, codes: readonly FactorCode[]): Zone {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError("Risk score must be between 0 and 100");
  }
  if (score < 25) return "green";
  return score >= 60 && codes.includes("R1") && codes.includes("R2") ? "red" : "yellow";
}

/** Pure deterministic calculation. Proposed AI output never counts as a fact. */
export function calculateRisk(input: RiskInput): RiskResult {
  const evidence = new Map(input.evidence.map((item) => [item.id, item]));
  const hasEvidence = (ids: string[]) => ids.length > 0 && ids.every((id) => {
    const item = evidence.get(id);
    return item && item.source.trim() && item.text.trim() && validDate(item.capturedAt);
  });

  const factors = (Object.keys(FACTOR_RULES) as FactorCode[]).map((code): FactorResult => {
    const candidates = input.factors.filter((factor) => factor.code === code);
    const confirmed = candidates.filter((factor) => factor.status === "confirmed");
    const accepted = confirmed.filter((factor) => reviewed(factor) && hasEvidence(factor.evidenceIds));
    let counted = accepted.length > 0;
    let needsReview = candidates.some((factor) => ["proposed", "unknown"].includes(factor.status));
    let reason = counted ? "Подтверждено аналитиком, источники сохранены" : "Нет подтверждённого фактора";
    if (!counted && candidates.some((factor) => factor.status === "proposed")) reason = "Гипотеза: требуется подтверждение аналитика";
    if (confirmed.length > accepted.length) {
      needsReview = true;
      if (!counted) reason = "Не хватает источника, автора или даты проверки";
    }
    let ids = accepted.flatMap((factor) => factor.evidenceIds);

    if (code === "R1") {
      const legal = input.legalBasis;
      if (legal.status === "unknown") {
        counted = false;
        needsReview = true;
        reason = "Основание не проверено: неизвестность не повышает риск";
      } else if (legal.status === "present") {
        counted = false;
        needsReview = confirmed.length > 0 || !reviewed(legal) || !hasEvidence(legal.evidenceIds);
        reason = needsReview ? "Данные об основании требуют проверки; R1 не начислен" : "Правовое основание подтверждено";
      } else if (!reviewed(legal) || !hasEvidence(legal.evidenceIds) || legal.type !== "none") {
        counted = false;
        needsReview = true;
        reason = "Отсутствие основания не подтверждено проверенными источниками";
      } else if (counted) {
        ids = [...ids, ...legal.evidenceIds];
      }
    }

    if (code === "R3" && input.stage === "commissioned") {
      counted = false;
      needsReview ||= confirmed.length > 0;
      reason = "Объект введён: реклама не относится к строящемуся жилью";
    }

    if (code === "R5" && counted) {
      // Compare the latest of each kind; tie-break by evidence id for stable ordering.
      const timestamp = (item: ProgressObservation) => validDate(item.observedAt) ? Date.parse(item.observedAt) : Infinity;
      const latest = (kind: ProgressObservation["kind"]) => input.progress
        .filter((item) => item.kind === kind)
        .toSorted((a, b) => timestamp(b) - timestamp(a) || a.evidenceId.localeCompare(b.evidenceId))[0];
      const claimed = latest("claimed");
      const verified = latest("verified");
      const valid = (item: ProgressObservation | undefined): item is ProgressObservation => !!item
        && Number.isFinite(item.percent) && item.percent >= 0 && item.percent <= 100
        && validDate(item.observedAt) && hasEvidence([item.evidenceId]);
      if (!valid(claimed) || !valid(verified)) {
        counted = false;
        needsReview = true;
        reason = "Нужны обе оценки готовности с источниками и датами";
      } else {
        const difference = Math.abs(claimed.percent - verified.percent);
        counted = difference >= 20;
        reason = `Расхождение готовности: ${difference} п.п. (порог 20 п.п.)`;
        ids = [...ids, claimed.evidenceId, verified.evidenceId];
      }
    }

    return {
      code, ...FACTOR_RULES[code], counted, needsReview, reason,
      points: counted ? FACTOR_RULES[code].weight : 0,
      evidenceIds: [...new Set(ids)].sort(),
    };
  });
  const score = Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0));
  return {
    score, zone: classifyZone(score, factors.filter((factor) => factor.counted).map((factor) => factor.code)),
    rulesVersion: RULES_VERSION, factors, needsReview: factors.some((factor) => factor.needsReview),
  };
}
