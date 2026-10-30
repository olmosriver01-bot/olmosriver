import {
  BLOCKS,
  BLOCK_STATUS_THRESHOLDS,
  MATURITY_LEVELS,
  MAX_SCORE_PER_BLOCK,
  MAX_TOTAL_SCORE,
  QUESTIONS_PER_BLOCK,
  TOTAL_QUESTIONS,
  type BlockStatusKey,
} from "./kpi-data";

export type AnswerMap = Record<number, { score: number | null; comment?: string | null }>;

export type BlockResult = {
  blockId: number;
  title: string;
  score: number; // javob berilgan savollar yig'indisi (0 ball ham, javobsiz ham 0 sifatida qo'shiladi, lekin pastda answered bilan farqlanadi)
  maxScore: number; // 18
  answeredCount: number; // shu blokda javob berilgan savollar soni (0..6)
  percent: number; // score / maxScore, faqat ko'rsatish uchun; to'liqlik uchun answeredCount tekshiriladi
  status: BlockStatusKey;
  statusLabel: string;
  isComplete: boolean; // shu blokning barcha 6 savoliga javob berilganmi
  weakRecommendation: string | null; // faqat percent < 0.6 bo'lsa va blok to'liq bo'lsa
  zeroScoreQuestionIds: number[];
  oneScoreQuestionIds: number[];
};

export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

export type AuditResult = {
  totalScore: number;
  maxTotalScore: number;
  percent: number; // 0..1
  percentDisplay: number; // 0..100, 2 xona
  answeredCount: number;
  totalQuestions: number;
  isComplete: boolean; // answeredCount === TOTAL_QUESTIONS
  maturity: MaturityLevel | null; // faqat isComplete bo'lsa to'ldiriladi
  blocks: BlockResult[];
  strongestBlock: BlockResult | null; // faqat isComplete
  weakestBlock: BlockResult | null; // faqat isComplete
  bottleneckText: string | null;
  zeroScoreQuestionIds: number[];
  oneScoreQuestionIds: number[];
};

function blockStatusFor(percent: number): { key: BlockStatusKey; label: string } {
  if (percent < BLOCK_STATUS_THRESHOLDS.unsatisfactory) return { key: "UNSATISFACTORY", label: "Қониқарсиз" };
  if (percent < BLOCK_STATUS_THRESHOLDS.weak) return { key: "WEAK", label: "Заиф" };
  if (percent < BLOCK_STATUS_THRESHOLDS.good) return { key: "GOOD", label: "Яхши" };
  return { key: "STRONG", label: "Кучли" };
}

function maturityFor(percent: number): MaturityLevel {
  return MATURITY_LEVELS.find((m) => percent <= m.max) ?? MATURITY_LEVELS[MATURITY_LEVELS.length - 1];
}

/**
 * Excel "Аудит" va "Натижа" varaqlaridagi barcha formulalarni aks ettiradi:
 *  - Blok жами = SUM(6 savol balli), max 18
 *  - Umumiy ball = 7 blok yig'indisi, max 126
 *  - Foiz = ball / max
 *  - Yetuklik darajasi / blok holati / tavsiyalar — yuqoridagi bo'sag'alar bo'yicha
 *
 * MUHIM FARQ (foydalanuvchi talabiga ko'ra, Excel'dan ataylab chetga chiqilgan joy):
 * Excel'da bo'sh katak SUM ichida avtomatik 0 deb hisoblanadi. Bu dasturda esa
 * javobsiz savol ball=null bilan alohida saqlanadi va umumiy audit "isComplete"
 * bo'lmaguncha (ya'ni barcha 42 savolga javob berilmaguncha) yakuniy foiz,
 * yetuklik darajasi, blok holati va bottleneck KO'RSATILMAYDI — faqat
 * "nechta savolga javob berildi" progressi ko'rsatiladi.
 */
export function computeAuditResult(answers: AnswerMap): AuditResult {
  const blocks: BlockResult[] = BLOCKS.map((block) => {
    let score = 0;
    let answeredCount = 0;
    const zeroScoreQuestionIds: number[] = [];
    const oneScoreQuestionIds: number[] = [];

    for (const q of block.questions) {
      const a = answers[q.id];
      const s = a?.score ?? null;
      if (s !== null && s !== undefined) {
        answeredCount += 1;
        score += s;
        if (s === 0) zeroScoreQuestionIds.push(q.id);
        if (s === 1) oneScoreQuestionIds.push(q.id);
      }
    }

    const percent = score / MAX_SCORE_PER_BLOCK;
    const isComplete = answeredCount === QUESTIONS_PER_BLOCK;
    const { key, label } = blockStatusFor(percent);

    return {
      blockId: block.id,
      title: block.title,
      score,
      maxScore: MAX_SCORE_PER_BLOCK,
      answeredCount,
      percent,
      status: key,
      statusLabel: label,
      isComplete,
      weakRecommendation: isComplete && percent < BLOCK_STATUS_THRESHOLDS.weak ? block.weakRecommendation : null,
      zeroScoreQuestionIds,
      oneScoreQuestionIds,
    };
  });

  const totalScore = blocks.reduce((sum, b) => sum + b.score, 0);
  const answeredCount = blocks.reduce((sum, b) => sum + b.answeredCount, 0);
  const isComplete = answeredCount === TOTAL_QUESTIONS;
  const percent = totalScore / MAX_TOTAL_SCORE;

  const zeroScoreQuestionIds = blocks.flatMap((b) => b.zeroScoreQuestionIds);
  const oneScoreQuestionIds = blocks.flatMap((b) => b.oneScoreQuestionIds);

  let maturity: MaturityLevel | null = null;
  let strongestBlock: BlockResult | null = null;
  let weakestBlock: BlockResult | null = null;
  let bottleneckText: string | null = null;

  if (isComplete) {
    maturity = maturityFor(percent);
    weakestBlock = blocks.reduce((min, b) => (b.percent < min.percent ? b : min), blocks[0]);
    strongestBlock = blocks.reduce((max, b) => (b.percent > max.percent ? b : max), blocks[0]);
    bottleneckText = `Энг паст натижа: ${weakestBlock.title} (${Math.round(weakestBlock.percent * 100)}%). Тизимлаштиришни шу блокдан бошланг — у бутун KPI тизимининг самарасини чеклаб турибди.`;
  }

  return {
    totalScore,
    maxTotalScore: MAX_TOTAL_SCORE,
    percent,
    percentDisplay: Math.round(percent * 10000) / 100,
    answeredCount,
    totalQuestions: TOTAL_QUESTIONS,
    isComplete,
    maturity,
    blocks,
    strongestBlock,
    weakestBlock,
    bottleneckText,
    zeroScoreQuestionIds,
    oneScoreQuestionIds,
  };
}

export type PrioritizedIssue = {
  questionId: number;
  blockId: number;
  blockTitle: string;
  questionText: string;
  score: 0 | 1;
  priority: "CRITICAL" | "HIGH";
};

/**
 * Muammolarni ustuvorlik bo'yicha saralaydi: 0 ball (CRITICAL) > 1 ball (HIGH),
 * har ikki guruh ichida eng zaif blokdan boshlab.
 */
export function prioritizeIssues(result: AuditResult): PrioritizedIssue[] {
  const blockPercentById = new Map(result.blocks.map((b) => [b.blockId, b.percent]));
  const issues: PrioritizedIssue[] = [];

  for (const block of BLOCKS) {
    for (const q of block.questions) {
      const blockResult = result.blocks.find((b) => b.blockId === block.id)!;
      if (blockResult.zeroScoreQuestionIds.includes(q.id)) {
        issues.push({ questionId: q.id, blockId: block.id, blockTitle: block.title, questionText: q.text, score: 0, priority: "CRITICAL" });
      } else if (blockResult.oneScoreQuestionIds.includes(q.id)) {
        issues.push({ questionId: q.id, blockId: block.id, blockTitle: block.title, questionText: q.text, score: 1, priority: "HIGH" });
      }
    }
  }

  return issues.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "CRITICAL" ? -1 : 1;
    const pa = blockPercentById.get(a.blockId) ?? 0;
    const pb = blockPercentById.get(b.blockId) ?? 0;
    return pa - pb;
  });
}

export function compareAudits(previous: AuditResult, current: AuditResult) {
  const blockDeltas = current.blocks.map((cb) => {
    const pb = previous.blocks.find((b) => b.blockId === cb.blockId);
    return {
      blockId: cb.blockId,
      title: cb.title,
      previousPercent: pb?.percent ?? null,
      currentPercent: cb.percent,
      deltaPercent: pb ? cb.percent - pb.percent : null,
    };
  });

  return {
    overallDeltaPercent: previous.isComplete && current.isComplete ? current.percent - previous.percent : null,
    blockDeltas,
  };
}
