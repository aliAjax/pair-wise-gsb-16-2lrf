// ============================================================
// 判定层：职业噪声聋听力监护判定规则（纯函数，不读写存储、不依赖页面）
//
// 规则：
//  1. 对照指标：左/右耳 2、3、4 kHz 纯音听阈均值 PTA。
//  2. 年度测听与本人基线比较，任一耳 PTA 平均上移 ≥ 10 dB 即判定为
//     标准阈移（STS），安排 30 天内复查。
//  3. 30 天复查仍 ≥ 10 dB（复查仍上移）才列为“需干预”；
//     复查上移消失则解除复查。
//  4. 换岗时未完成的复查随员工转到新岗位（由岗位履历推导）。
//  依据 GBZ 188《职业健康监护技术规范》对噪声作业听力监护的要求。
// ============================================================

import type {
  Audiogram,
  EarShift,
  EarThresholds,
  Employee,
  ExamEvaluation,
  ExamKind,
  FollowUpTask,
  MonitoringData,
  PostAssignment,
} from "./types";
import { FREQ_KHZ } from "./types";

/** 触发复查的上移阈值（dB）：任一耳 PTA 平均上移 10 分贝 */
export const STS_SHIFT_DB = 10;

/** 复查期限：30 天 */
export const RETEST_DAYS = 30;

/** 8h 等效噪声 ≥85 dB(A) 的岗位为噪声作业岗位 */
export const NOISE_POST_LIMIT = 85;

/** 2、3、4 kHz 平均听阈，四舍五入取整 */
export function pta(t: EarThresholds): number {
  const sum = FREQ_KHZ.reduce((acc, f) => acc + t[f], 0);
  return Math.round(sum / FREQ_KHZ.length);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isOverdue(dueDate: string, today: string): boolean {
  return dueDate < today;
}

export function isNoisePost(limitDba: number): boolean {
  return limitDba >= NOISE_POST_LIMIT;
}

function earShift(current: EarThresholds, before: EarThresholds | null): EarShift {
  const cur = pta(current);
  if (!before) {
    return { pta: cur, beforePta: null, shift: null, shifted: false };
  }
  const base = pta(before);
  const shift = cur - base;
  return { pta: cur, beforePta: base, shift, shifted: shift >= STS_SHIFT_DB };
}

export interface EvaluateInput {
  date: string;
  kind: ExamKind;
  left: EarThresholds;
  right: EarThresholds;
  /** 该员工的基线记录（无则无法对照） */
  baseline?: Audiogram;
  /** 复查时：触发本次复查的年度测听 */
  trigger?: Audiogram;
  /** 复查时实际对照的前阈值记录（通常即 trigger；编辑场景可缺省） */
  before?: Audiogram;
}

function fmtShift(s: EarShift, earName: string): string {
  if (s.shift === null || s.beforePta === null) {
    return `${earName}PTA ${s.pta}dB`;
  }
  return `${earName}PTA ${s.beforePta}→${s.pta}dB（上移${s.shift}dB${
    s.shifted ? "≥10" : "<10"
  }）`;
}

/**
 * 判定单次测听：对照基线/前阈值，给出处置与处理依据。
 * 保存记录时调用一次，结果作为 eval 快照随资料留存。
 */
export function evaluateExam(input: EvaluateInput): ExamEvaluation {
  const { date, kind, left, right, baseline, trigger } = input;

  // 基线测听：建档，无对照
  if (kind === "baseline" || !baseline) {
    const result: ExamEvaluation = {
      left: earShift(left, null),
      right: earShift(right, null),
      disposition: kind === "baseline" ? "baseline" : "no-baseline",
      baselineDate: baseline?.date ?? null,
      basis:
        kind === "baseline"
          ? `建立听力基线：左耳PTA ${pta(left)}dB，右耳PTA ${pta(
              right
            )}dB（2/3/4kHz均值），作为以后年度测听对照依据。`
          : "该员工尚无基线测听，无法对照判定标准阈移；先补做基线测听。",
    };
    return result;
  }

  if (kind === "annual") {
    const ls = earShift(left, baseline.left);
    const rs = earShift(right, baseline.right);
    const sts = ls.shifted || rs.shifted;
    const shiftedEars = [ls.shifted ? "左耳" : "", rs.shifted ? "右耳" : ""]
      .filter(Boolean)
      .join("、");
    const due = addDays(date, RETEST_DAYS);
    return {
      left: ls,
      right: rs,
      disposition: sts ? "retest" : "normal",
      baselineDate: baseline.date,
      basis: sts
        ? `对照${baseline.date}基线，${fmtShift(ls, "左耳")}；${fmtShift(
            rs,
            "右耳"
          )}。${shiftedEars}2/3/4kHz平均上移≥10dB，判定标准阈移（STS），依据GBZ 188须在${due}（30天）前完成复查。`
        : `对照${baseline.date}基线，${fmtShift(ls, "左耳")}；${fmtShift(
            rs,
            "右耳"
          )}。两耳PTA上移均<10dB，未见标准阈移，按年度监护继续观察。`,
    };
  }

  // retest：是否“仍上移”以基线为准（任一耳相对基线 PTA 上移仍 ≥10dB）；
  // 触发复查的年度测听作为“前阈值”随记录留存，依据中同时列出两者。
  const ls = earShift(left, baseline.left);
  const rs = earShift(right, baseline.right);
  const still = ls.shifted || rs.shifted;
  const shiftedEars = [ls.shifted ? "左耳" : "", rs.shifted ? "右耳" : ""]
    .filter(Boolean)
    .join("、");
  const refNote = trigger
    ? `前次为${trigger.date}年度测听（左耳PTA ${pta(trigger.left)}dB、右耳PTA ${pta(
        trigger.right
      )}dB，触发30天复查）；`
    : "";
  return {
    left: ls,
    right: rs,
    disposition: still ? "intervention" : "cleared",
    baselineDate: baseline.date,
    basis: still
      ? `${refNote}复查对照${baseline.date}基线，${fmtShift(ls, "左耳")}；${fmtShift(
          rs,
          "右耳"
        )}。${shiftedEars}相对基线平均上移仍≥10dB，复查仍上移，依据GBZ 188列为需干预对象，安排职业健康进一步检查与噪声防护处置。`
      : `${refNote}复查对照${baseline.date}基线，${fmtShift(ls, "左耳")}；${fmtShift(
          rs,
          "右耳"
        )}。两耳相对基线上移均<10dB，阈移恢复，解除复查、按年度监护继续观察。`,
  };
}

// ------------------------------------------------------------
// 资料查询辅助
// ------------------------------------------------------------

/** 员工有效（未被同日覆盖）的测听记录，按日期升序 */
export function validExamsOf(data: MonitoringData, employeeId: string): Audiogram[] {
  return data.exams
    .filter((e) => e.employeeId === employeeId && !e.superseded)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 基线：该员工最近一次基线性质记录（无基线则无法对照，判 no-baseline） */
export function findBaseline(
  exams: Audiogram[],
  excludeId?: string
): Audiogram | undefined {
  return exams
    .filter((e) => !e.superseded && e.id !== excludeId && e.kind === "baseline")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .pop();
}

/** 某日期时员工所在岗位（由换岗履历推导） */
export function postAtDate(
  assignments: PostAssignment[],
  employeeId: string,
  date: string
): string | undefined {
  const mine = assignments
    .filter((a) => a.employeeId === employeeId && a.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return mine[0]?.postId;
}

export function currentPost(
  assignments: PostAssignment[],
  employee: Employee,
  today: string
): string {
  return (
    postAtDate(assignments, employee.id, today) ?? employee.currentPostId
  );
}

// ------------------------------------------------------------
// 复查任务推导：
//  年度测听判定 retest 即开出 30 天复查任务；
//  该员工在到期前的最早一次复查记录关闭任务：
//    复查仍上移 → 需干预；上移消失 → 已恢复；
//  到期仍无复查 → 待复查（逾期）；
//  换岗后任务随人转到新岗位。
// ------------------------------------------------------------

export function buildTasks(
  data: MonitoringData,
  today: string
): FollowUpTask[] {
  const tasks: FollowUpTask[] = [];

  for (const employee of data.employees) {
    const exams = validExamsOf(data, employee.id);

    for (const trigger of exams) {
      if (trigger.kind !== "annual" || trigger.eval.disposition !== "retest") {
        continue;
      }

      // FIFO：该触发记录之后的最早一次复查关闭本任务
      const resolve = exams.find(
        (e) => e.kind === "retest" && e.date >= trigger.date && e.id !== trigger.id
      );

      const dueDate = addDays(trigger.date, RETEST_DAYS);
      const curPost = currentPost(data.assignments, employee, today);

      // 触发后换岗次数（到岗日期晚于触发日期的履历，去重相邻同岗）
      const laterAssignments = data.assignments
        .filter((a) => a.employeeId === employee.id && a.date > trigger.date)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      const transferCount = laterAssignments.length;
      const transferred =
        transferCount > 0 && curPost !== trigger.postId;

      let status: FollowUpTask["status"];
      if (resolve) {
        status = resolve.eval.disposition === "intervention" ? "intervention" : "cleared";
      } else {
        status = isOverdue(dueDate, today) ? "overdue" : "open";
      }

      tasks.push({
        id: `${employee.id}-${trigger.date}`,
        employeeId: employee.id,
        triggerExamId: trigger.id,
        triggerDate: trigger.date,
        originPostId: trigger.postId,
        currentPostId: curPost,
        dueDate,
        resolveExamId: resolve?.id,
        status,
        transferred,
        transferCount,
      });
    }
  }

  // 逾期在前，其次待复查、需干预、已恢复
  const order: Record<FollowUpTask["status"], number> = {
    overdue: 0,
    open: 1,
    intervention: 2,
    cleared: 3,
  };
  return tasks.sort(
    (a, b) => order[a.status] - order[b.status] || (a.dueDate < b.dueDate ? -1 : 1)
  );
}

/** 员工监护状态（看板/名册用） */
export type EmployeeStatus = "intervention" | "overdue" | "open" | "normal" | "no-baseline";

export function employeeStatus(
  data: MonitoringData,
  employeeId: string,
  today: string
): EmployeeStatus {
  const exams = validExamsOf(data, employeeId);
  if (exams.length === 0) return "no-baseline";
  const tasks = buildTasks(data, today).filter((t) => t.employeeId === employeeId);
  if (tasks.some((t) => t.status === "intervention")) return "intervention";
  if (tasks.some((t) => t.status === "overdue")) return "overdue";
  if (tasks.some((t) => t.status === "open")) return "open";
  if (!exams.some((e) => e.kind === "baseline")) return "no-baseline";
  return "normal";
}

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  intervention: "需干预",
  overdue: "复查逾期",
  open: "待复查",
  normal: "监护中",
  "no-baseline": "缺基线",
};
