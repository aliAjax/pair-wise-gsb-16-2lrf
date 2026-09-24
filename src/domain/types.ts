// 职业听力监护 · 监护资料层
// 只定义数据结构，不做判定、不碰存储、不渲染页面。

/** 测听频率：2、3、4 千赫 */
export const FREQUENCIES = [2000, 3000, 4000] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** 单侧耳 2/3/4 kHz 听阈（dB HL） */
export type EarThresholds = Record<Frequency, number>;

/** 双耳听阈 */
export interface Audiogram {
  left: EarThresholds;
  right: EarThresholds;
}

export type EarSide = "left" | "right";

/** 测听类型：上岗基线 / 年度测听 / 30天复查 */
export type ExamKind = "baseline" | "annual" | "retest";

/** 判定结论 */
export type Verdict =
  | "baseline" // 基线，登记用
  | "normal" // 未见显著上移
  | "retest" // 任一耳平均上移≥10dB，安排30天复查
  | "recovered" // 复查恢复，无需干预
  | "intervene"; // 复查仍上移，需干预

export interface FollowUp {
  /** 触发本次复查的测听记录 id */
  sourceExamId: string;
  /** 应完成日期（触发日 +30 天） */
  dueDate: string; // YYYY-MM-DD
  status: "pending" | "closed";
  /** 关闭原因说明，例如已复查恢复、仍上移转干预、被新测听替代、换岗结转 */
  closedReason?: string;
}

export interface Employee {
  id: string;
  code: string; // 工号
  name: string;
  department: string; // 部门
  postName: string; // 当前岗位
  noiseLevel: string; // 岗位噪声暴露，如 "92 dB(A)"
  exposureHours: number; // 日接触小时
  currentVerdict: Verdict;
  createdAt: string;
}

export interface Exam {
  id: string;
  employeeId: string;
  /** 测听当时的岗位与噪声快照，换岗后仍可追溯 */
  postName: string;
  noiseLevel: string;
  date: string; // YYYY-MM-DD，同一员工同一天仅一份有效记录
  kind: ExamKind;
  audiogram: Audiogram;
  verdict: Verdict;
  /** 对照的基线记录 id（基线自身为空） */
  baselineId?: string;
  /** 与基线相比，左右耳 2/3/4k 平均上移量（dB），正数为上移 */
  shifts?: { left: number; right: number };
  /** 若是复查，对应原年度测听 id */
  retestOf?: string;
  /** 处理依据：阈值、上移量、判定与处理意见 */
  basis: string;
  createdAt: string;
}

export interface Transfer {
  id: string;
  employeeId: string;
  date: string;
  fromPost: string;
  fromNoiseLevel: string;
  toPost: string;
  toNoiseLevel: string;
  toExposureHours: number;
  /** 结转的未完成复查来源测听 id；无则为空 */
  carriedExamId?: string;
  /** 结转时保留的原岗位最近测听阈值 */
  carriedThresholds?: Audiogram;
  /** 处理依据 */
  basis: string;
  createdAt: string;
}

export interface DataStore {
  version: 1;
  employees: Employee[];
  exams: Exam[];
  transfers: Transfer[];
  followUps: FollowUp[];
  seeded: boolean;
}

export const VERDICT_META: Record<
  Verdict,
  { label: string; tone: "neutral" | "ok" | "watch" | "danger" }
> = {
  baseline: { label: "基线", tone: "neutral" },
  normal: { label: "未见上移", tone: "ok" },
  retest: { label: "30天复查", tone: "watch" },
  recovered: { label: "复查恢复", tone: "ok" },
  intervene: { label: "需干预", tone: "danger" },
};

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  baseline: "上岗基线",
  annual: "年度测听",
  retest: "30天复查",
};
