// 职业听力监护 · 判定层
// 纯函数：阈值平均、与基线对照、复查/干预判定、处理依据文本。
// 不读写本机存储，不依赖 React。

import {
  Audiogram,
  EarSide,
  EarThresholds,
  Exam,
  ExamKind,
  FREQUENCIES,
  Verdict,
} from "./types";

/** 职业听力监护标准性听阈位移（STS）判定阈值：任一耳 2/3/4 kHz 平均上移 10 dB */
export const SHIFT_THRESHOLD_DB = 10;
/** 复查期限：30 天 */
export const RETEST_DUE_DAYS = 30;

export function earPta(ear: EarThresholds): number {
  const sum = FREQUENCIES.reduce((acc, f) => acc + ear[f], 0);
  return Math.round((sum / FREQUENCIES.length) * 10) / 10;
}

export function shiftOf(current: EarThresholds, baseline: EarThresholds): number {
  return Math.round((earPta(current) - earPta(baseline)) * 10) / 10;
}

/** 左右耳相对基线的平均上移量（dB，正数为听力下降方向） */
export function shiftsAgainst(current: Audiogram, baseline: Audiogram) {
  return {
    left: shiftOf(current.left, baseline.left),
    right: shiftOf(current.right, baseline.right),
  };
}

export function earHasShift(shift: number): boolean {
  return shift >= SHIFT_THRESHOLD_DB;
}

export function shiftedEars(shifts: { left: number; right: number }): EarSide[] {
  const ears: EarSide[] = [];
  if (earHasShift(shifts.left)) ears.push("left");
  if (earHasShift(shifts.right)) ears.push("right");
  return ears;
}

export const EAR_LABEL: Record<EarSide, string> = { left: "左耳", right: "右耳" };

export function fmtAudiogram(a: Audiogram): string {
  return `左 ${a.left[2000]}/${a.left[3000]}/${a.left[4000]} dB，右 ${a.right[2000]}/${a.right[3000]}/${a.right[4000]} dB（2/3/4kHz）`;
}

function fmtShift(shifts: { left: number; right: number }): string {
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return `左耳平均上移 ${signed(shifts.left)} dB，右耳 ${signed(shifts.right)} dB`;
}

export interface JudgeInput {
  kind: ExamKind;
  audiogram: Audiogram;
  baseline?: Audiogram;
  /** 本次若是 30 天复查，传入触发复查的原年度测听 */
  triggerExam?: Exam;
}

export interface JudgeResult {
  verdict: Verdict;
  shifts?: { left: number; right: number };
  basis: string;
}

/**
 * 判定规则：
 * 1. 基线测听直接登记，不判定位移。
 * 2. 年度测听对照基线：任一耳 2/3/4kHz 平均上移 ≥10dB → 30天复查。
 * 3. 30天复查仍对照同一基线：仍有耳上移 ≥10dB → 需干预；否则复查恢复。
 */
export function judgeExam(input: JudgeInput): JudgeResult {
  const { kind, audiogram, baseline } = input;

  if (kind === "baseline" || !baseline) {
    return {
      verdict: "baseline",
      basis: `上岗基线测听：${fmtAudiogram(audiogram)}，作为以后年度测听与复查的对照基准。`,
    };
  }

  const shifts = shiftsAgainst(audiogram, baseline);
  const ears = shiftedEars(shifts);
  const earText = ears.map((e) => EAR_LABEL[e]).join("、") || "双耳均未";

  if (kind === "annual") {
    if (ears.length > 0) {
      return {
        verdict: "retest",
        shifts,
        basis:
          `年度测听 ${fmtAudiogram(audiogram)}；对照基线，${fmtShift(shifts)}。` +
          `${earText}2/3/4kHz 平均上移达到 ${SHIFT_THRESHOLD_DB} dB，` +
          `按规范于 ${RETEST_DUE_DAYS} 天内安排复查测听，复查前加强护耳与岗位噪声控制。`,
      };
    }
    return {
      verdict: "normal",
      shifts,
      basis: `年度测听 ${fmtAudiogram(audiogram)}；对照基线，${fmtShift(shifts)}，双耳上移均不足 ${SHIFT_THRESHOLD_DB} dB，继续常规年度监护。`,
    };
  }

  // retest
  if (ears.length > 0) {
    return {
      verdict: "intervene",
      shifts,
      basis:
        `30天复查 ${fmtAudiogram(audiogram)}；对照同一基线，${fmtShift(shifts)}。` +
        `${earText}复查后平均上移仍 ≥ ${SHIFT_THRESHOLD_DB} dB，判定为需干预：` +
        `脱离或降低噪声暴露、医学复查与听力保护评估，并按疑似职业性噪声聋流程上报。`,
    };
  }
  return {
    verdict: "recovered",
    shifts,
    basis:
      `30天复查 ${fmtAudiogram(audiogram)}；对照同一基线，${fmtShift(shifts)}。` +
      `双耳上移均已回落至 ${SHIFT_THRESHOLD_DB} dB 以内，判定为复查恢复，关闭复查任务，继续常规年度监护。`,
  };
}

/** 触发日 +30 天，返回 YYYY-MM-DD */
export function retestDueDate(triggerDate: string): string {
  const d = new Date(triggerDate + "T00:00:00");
  d.setDate(d.getDate() + RETEST_DUE_DAYS);
  return d.toISOString().slice(0, 10);
}

/** 同一员工同一天只允许一份有效记录，按日期判断是否重复（排除自身） */
export function findDuplicateDate(exams: Exam[], employeeId: string, date: string, selfId?: string): Exam | undefined {
  return exams.find((e) => e.employeeId === employeeId && e.date === date && e.id !== selfId);
}
