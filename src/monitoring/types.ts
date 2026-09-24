// ============================================================
// 监护资料层：职业听力监护的数据模型
// 仅定义资料结构，不含判定规则（见 rules.ts）与存取逻辑（见 storage.ts）
// ============================================================

/** 测听频率：2、3、4 千赫 */
export const FREQ_KHZ = [2, 3, 4] as const;
export type FreqKhz = (typeof FREQ_KHZ)[number];

/** 左耳 / 右耳听阈（dB HL），键为频率千赫数，如 "2" | "3" | "4" */
export interface EarThresholds {
  2: number;
  3: number;
  4: number;
}

export const emptyEar = (): EarThresholds => ({ 2: 0, 3: 0, 4: 0 });

export type EarSide = "left" | "right";

/** 测听性质 */
export type ExamKind = "baseline" | "annual" | "retest";

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  baseline: "基线测听",
  annual: "年度测听",
  retest: "30天复查",
};

/** 判定处置（判定层写入，随资料留存作为处理依据） */
export type Disposition =
  | "baseline" // 基线建档
  | "normal" // 对照基线未见显著上移
  | "retest" // 任一耳 PTA 上移 ≥10dB，安排 30 天复查
  | "intervention" // 复查仍上移，列为需干预
  | "cleared" // 复查恢复（上移消失），解除复查
  | "no-baseline"; // 缺基线，无法对照

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  baseline: "基线建档",
  normal: "未见显著上移",
  retest: "安排30天复查",
  intervention: "需干预",
  cleared: "复查恢复",
  "no-baseline": "缺基线无法对照",
};

/**
 * 岗位噪声资料
 * limitDba：岗位 8h 等效噪声暴露水平 dB(A)，用于标注是否为噪声岗位（≥85 为噪声岗位）
 */
export interface NoisePost {
  id: string;
  name: string;
  workshop: string;
  limitDba: number;
  protection: string; // 配发护听器
  createdAt: string;
}

/** 员工资料 */
export interface Employee {
  id: string; // 工号，如 E1001
  name: string;
  gender: "男" | "女";
  joinedAt: string; // 入职日期
  currentPostId: string; // 当前岗位
  createdAt: string;
}

/**
 * 换岗履历：一个员工按日期先后排列的岗位记录
 * 首条为上岗记录，之后每一条代表一次换岗。
 * 换岗时未完成的复查任务通过本履历随员工转到新岗位。
 */
export interface PostAssignment {
  id: string;
  employeeId: string;
  postId: string;
  date: string; // 到岗日期
  note?: string;
}

/**
 * 纯音测听记录
 *
 * 同一员工同一天只保留一份有效记录：保存时若已存在同员工同日期记录，
 * 旧记录被覆盖作废，以新记录为准。
 *
 * beforeThresholds：触发本次测听/复查的前次听阈（即“前阈值”，年度测听时为基线，
 *   复查时为触发复查的年度测听），与本次 thresholds 一并保留，形成处理依据。
 * eval 快照由判定层在保存时计算并随记录留存。
 */
export interface Audiogram {
  id: string;
  employeeId: string;
  postId: string; // 测听时所在岗位（复查换岗后为新岗位）
  date: string; // 测听日期 yyyy-mm-dd
  kind: ExamKind;
  left: EarThresholds;
  right: EarThresholds;
  /** 前阈值：基线/触发记录的左右耳听阈，用于留存对照依据 */
  beforeThresholds?: {
    kind: ExamKind;
    date: string;
    left: EarThresholds;
    right: EarThresholds;
  };
  eval: ExamEvaluation;
  createdAt: string;
  superseded?: boolean; // 同日被新记录覆盖时置真，不参与判定
}

/** 判定层对单次测听的结论 */
export interface EarShift {
  /** 2、3、4kHz 平均听阈（四舍五入取整，单位 dB HL） */
  pta: number;
  beforePta: number | null;
  shift: number | null; // 相对前阈值的上移量，null 表示无前值
  shifted: boolean; // shift ≥ 10
}

export interface ExamEvaluation {
  left: EarShift;
  right: EarShift;
  disposition: Disposition;
  /** 处理依据：对照的基线/前次日期、两耳 PTA 与上移量、执行的标准条款 */
  basis: string;
  baselineDate: string | null;
}

/** 派生的复查任务（不单独保存，由判定层从全部资料推导） */
export type TaskStatus = "open" | "overdue" | "intervention" | "cleared";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "待复查",
  overdue: "复查逾期",
  intervention: "需干预",
  cleared: "已恢复",
};

export interface FollowUpTask {
  id: string;
  employeeId: string;
  /** 触发复查的年度测听 */
  triggerExamId: string;
  triggerDate: string;
  /** 触发时所在岗位；换岗后与 currentPostId 不同即表示任务已转到新岗位 */
  originPostId: string;
  currentPostId: string;
  dueDate: string; // 触发日 + 30 天
  /** 完成复查的记录（若有） */
  resolveExamId?: string;
  status: TaskStatus;
  transferred: boolean; // 换岗后任务是否已转到新岗位
  transferCount: number; // 触发后累计换岗次数
}

/** 本机保存的整库资料 */
export interface MonitoringData {
  version: number;
  posts: NoisePost[];
  employees: Employee[];
  assignments: PostAssignment[];
  exams: Audiogram[];
}
