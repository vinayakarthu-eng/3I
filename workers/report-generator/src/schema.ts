import * as z from "zod/v4";

/** Structure of an After-Action Report stored in drill_reports.content. */
export const AarSchema = z.object({
  executiveSummary: z.string().describe("2-3 paragraphs separated by blank lines"),
  timeline: z
    .array(
      z.object({
        tPlusMinutes: z.number().describe("Minutes since drill start"),
        actor: z.string(),
        event: z.string().describe("What happened, quoting the message where useful"),
        annotation: z.string().describe("Why this moment mattered for the response"),
      }),
    )
    .describe("Minute-by-minute timeline of key moments, oldest first"),
  objectivesAnalysis: z.array(
    z.object({
      objectiveId: z.string(),
      objective: z.string(),
      score: z.number().nullable(),
      evidence: z.string(),
      assessment: z.string(),
    }),
  ),
  strengths: z
    .array(z.object({ title: z.string(), detail: z.string(), tPlusMinutes: z.number().nullable() }))
    .describe("3-5 specific things that went well"),
  improvements: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      severity: z.enum(["P1", "P2", "P3", "P4"]),
    }),
  ),
  rootCauses: z.array(z.object({ gap: z.string(), cause: z.string() })),
  correctiveActions: z.array(
    z.object({
      gap: z.string(),
      action: z.string().describe("Specific, verifiable action"),
      category: z.enum(["process", "tooling", "knowledge", "staffing", "design"]),
      severity: z.enum(["P1", "P2", "P3", "P4"]),
      owner: z.string().describe("Name of a drill participant who should own this"),
      dueInDays: z.number().int(),
      verificationMethod: z.string(),
    }),
  ),
});

export type AarSections = z.infer<typeof AarSchema>;

/** What we persist: the sections plus generation metadata. */
export interface AarContent extends AarSections {
  meta: {
    drillName: string;
    compositeScore: number | null;
    passed: boolean | null;
    passThreshold: number;
    durationMinutes: number | null;
    generator: "claude" | "template";
    model?: string;
    /** improvement_actions.id per corrective action index, once created. */
    actionIds: Record<string, string>;
  };
}
