import { describe, expect, it } from "vitest";
import { calculateRisk, classifyZone, type FactorCode, type RiskInput } from "../src/domain/risk";
const date = "2026-10-14T10:00:00.000Z";
function input(codes: FactorCode[] = []): RiskInput {
    return {
        stage: "construction",
        legalBasis: { status: "absent", type: "none", evidenceIds: ["proof"], reviewedBy: "analyst", reviewedAt: date },
        evidence: [{ id: "proof", source: "Demo record", text: "Saved evidence", capturedAt: date }],
        factors: codes.map((code) => ({ code, status: "confirmed", evidenceIds: ["proof"], reviewedBy: "analyst", reviewedAt: date })),
        progress: [
            { kind: "claimed", percent: 80, evidenceId: "proof", observedAt: date },
            { kind: "verified", percent: 50, evidenceId: "proof", observedAt: date },
        ],
    };
}
describe("case requirements", () => {
    it("A: unknown basis plus payment and advertisement = 35/yellow", () => {
        const data = input(["R1", "R2", "R3"]);
        data.legalBasis.status = "unknown";
        data.legalBasis.type = "unknown";
        expect(calculateRisk(data)).toMatchObject({ score: 35, zone: "yellow", needsReview: true });
    });
    it("B: verified absence plus deposit and advertisement = 70/red", () => {
        expect(calculateRisk(input(["R1", "R2", "R3"]))).toMatchObject({ score: 70, zone: "red" });
    });
    it("C: a guarantee prevents R1 even if a conflicting R1 is supplied", () => {
        const data = input(["R1", "R3"]);
        data.legalBasis = { ...data.legalBasis, status: "present", type: "guarantee" };
        expect(calculateRisk(data)).toMatchObject({ score: 10, zone: "green", needsReview: true });
    });
    it("65 without R1 stays yellow", () => {
        expect(calculateRisk(input(["R2", "R3", "R4", "R5", "R6"]))).toMatchObject({ score: 65, zone: "yellow" });
    });
    it("60 with R1+R2 is red", () => expect(calculateRisk(input(["R1", "R2"]))).toMatchObject({ score: 60, zone: "red" }));
    it("all factors total 100", () => expect(calculateRisk(input(["R1", "R2", "R3", "R4", "R5", "R6"])).score).toBe(100));
    it("duplicate advertisements cannot multiply a factor", () => expect(calculateRisk(input(["R2", "R2", "R3"])).score).toBe(35));
    it.each(["proposed", "rejected", "unknown"] as const)("%s factors do not count", (status) => {
        const data = input(["R2"]);
        data.factors[0].status = status;
        expect(calculateRisk(data).score).toBe(0);
    });
    it("empty factors do not invent risk", () => expect(calculateRisk(input()).score).toBe(0));
    it("input ordering does not affect the result and input is not mutated", () => {
        const data = input(["R5", "R2", "R1"]);
        const original = structuredClone(data);
        const reverse = { ...data, factors: data.factors.toReversed(), progress: data.progress.toReversed() };
        expect(calculateRisk(data)).toEqual(calculateRisk(reverse));
        expect(data).toEqual(original);
    });
});
describe("evidence safeguards", () => {
    it.each(["source", "text", "capturedAt"] as const)("rejects evidence without %s", (field) => {
        const data = input(["R2"]);
        data.evidence[0][field] = "";
        expect(calculateRisk(data)).toMatchObject({ score: 0, needsReview: true });
    });
    it.each(["reviewedBy", "reviewedAt"] as const)("requires %s", (field) => {
        const data = input(["R2"]);
        data.factors[0][field] = null;
        expect(calculateRisk(data)).toMatchObject({ score: 0, needsReview: true });
    });
    it("requires legal evidence in addition to a confirmed R1", () => {
        const data = input(["R1"]);
        data.legalBasis.evidenceIds = ["missing"];
        expect(calculateRisk(data)).toMatchObject({ score: 0, needsReview: true });
    });
    it("requires verified absence, not a failed registry request", () => {
        const data = input(["R1"]);
        data.legalBasis.reviewedBy = null;
        expect(calculateRisk(data).score).toBe(0);
    });
    it("does not count R3 after commissioning", () => {
        const data = input(["R3"]);
        data.stage = "commissioned";
        expect(calculateRisk(data).score).toBe(0);
    });
});
describe("readiness difference", () => {
    it.each([[19, 0], [20, 10], [21, 10]])("difference %i => %i points", (diff, score) => {
        const data = input(["R5"]);
        data.progress[0].percent = 50 + diff;
        expect(calculateRisk(data).score).toBe(score);
    });
    it("requires both observations", () => {
        const data = input(["R5"]);
        data.progress.pop();
        expect(calculateRisk(data)).toMatchObject({ score: 0, needsReview: true });
    });
    it("requires the observation source", () => {
        const data = input(["R5"]);
        data.progress[0].evidenceId = "missing";
        expect(calculateRisk(data).score).toBe(0);
    });
    it("does not fall back to old data when latest source is missing", () => {
        const data = input(["R5"]);
        data.progress.push({ kind: "verified", percent: 50, evidenceId: "missing", observedAt: "2026-10-15T10:00:00.000Z" });
        expect(calculateRisk(data)).toMatchObject({ score: 0, needsReview: true });
    });
    it.each([NaN, -1, 101])("rejects invalid percentage %s", (percent) => {
        const data = input(["R5"]);
        data.progress[0].percent = percent;
        expect(calculateRisk(data).score).toBe(0);
    });
});
describe("zone boundaries", () => {
    it.each([[0, "green"], [24, "green"], [25, "yellow"], [59, "yellow"], [60, "red"], [100, "red"]] as const)("%i => %s with R1+R2", (score, zone) => {
        expect(classifyZone(score, ["R1", "R2"])).toBe(zone);
    });
    it.each([[], ["R1"], ["R2"]] as FactorCode[][])("60+ needs both mandatory factors (%j)", (...codes) => {
        expect(classifyZone(100, codes)).toBe("yellow");
    });
    it.each([-1, 101, NaN, Infinity])("rejects invalid score %s", (score) => expect(() => classifyZone(score, [])).toThrow(RangeError));
});
