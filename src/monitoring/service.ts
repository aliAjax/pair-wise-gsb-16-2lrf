// ============================================================
// 资料操作服务：页面调用的增删改编排
// 调用判定层计算结论、调用本机保存层落库，规则细节仍全部在 rules.ts。
// ============================================================

import { evaluateExam, findBaseline, validExamsOf } from "./rules";
import { uid } from "./storage";
import type {
  Audiogram,
  EarThresholds,
  Employee,
  ExamKind,
  MonitoringData,
  NoisePost,
  PostAssignment,
} from "./types";

export interface ExamDraft {
  id?: string; // 编辑已有记录时传入
  employeeId: string;
  postId: string;
  date: string;
  kind: ExamKind;
  left: EarThresholds;
  right: EarThresholds;
}

export interface SaveExamResult {
  data: MonitoringData;
  /** true 表示覆盖了该员工同日的旧记录（同一员工同一天只留一份有效记录） */
  superseded: Audiogram | null;
  saved: Audiogram;
}

/** 保存（或编辑）一份测听记录，保存时由判定层计算结论并留存前阈值 */
export function saveExam(data: MonitoringData, draft: ExamDraft): SaveExamResult {
  const exams = [...data.exams];
  let superseded: Audiogram | null = null;

  // 同一员工同一天只保留一份有效记录：非编辑保存时，同日旧记录覆盖作废
  if (!draft.id) {
    for (let i = 0; i < exams.length; i++) {
      const e = exams[i];
      if (
        e.employeeId === draft.employeeId &&
        e.date === draft.date &&
        !e.superseded
      ) {
        exams[i] = { ...e, superseded: true };
        superseded = exams[i];
      }
    }
  }

  // 取基线（排除自身，编辑基线时不拿自己当对照）
  const baseline = findBaseline(exams, draft.id);

  // 复查的前阈值记录：触发本次复查的年度测听（该员工最近一份“安排复查”的年度记录）
  const trigger = [...validExamsOf({ ...data, exams }, draft.employeeId)]
    .reverse()
    .find((e) => e.kind === "annual" && e.eval.disposition === "retest" && e.date <= draft.date);

  const before =
    draft.kind === "retest" ? trigger ?? baseline
    : draft.kind === "annual" ? baseline
    : undefined;

  const evalResult = evaluateExam({
    date: draft.date,
    kind: draft.kind,
    left: draft.left,
    right: draft.right,
    baseline: draft.kind === "baseline" ? undefined : baseline,
    trigger: draft.kind === "retest" ? trigger : undefined,
  });

  const beforeThresholds = before
    ? {
        kind: before.kind,
        date: before.date,
        left: before.left,
        right: before.right,
      }
    : undefined;

  let saved: Audiogram;
  if (draft.id) {
    const idx = exams.findIndex((e) => e.id === draft.id);
    if (idx === -1) throw new Error("待编辑的测听记录不存在");
    saved = {
      ...exams[idx],
      employeeId: draft.employeeId,
      postId: draft.postId,
      date: draft.date,
      kind: draft.kind,
      left: draft.left,
      right: draft.right,
      beforeThresholds,
      eval: evalResult,
    };
    exams[idx] = saved;
  } else {
    saved = {
      id: uid("exam"),
      employeeId: draft.employeeId,
      postId: draft.postId,
      date: draft.date,
      kind: draft.kind,
      left: draft.left,
      right: draft.right,
      beforeThresholds,
      eval: evalResult,
      createdAt: new Date().toISOString(),
    };
    exams.push(saved);
  }

  return { data: { ...data, exams }, superseded, saved };
}

export function deleteExam(data: MonitoringData, examId: string): MonitoringData {
  return { ...data, exams: data.exams.filter((e) => e.id !== examId) };
}

export interface EmployeeDraft {
  id: string;
  name: string;
  gender: Employee["gender"];
  joinedAt: string;
  currentPostId: string;
}

/** 登记新员工，同时写入首条上岗履历 */
export function addEmployee(data: MonitoringData, draft: EmployeeDraft): MonitoringData {
  if (data.employees.some((e) => e.id === draft.id)) {
    throw new Error("工号已存在");
  }
  const employee: Employee = {
    ...draft,
    createdAt: new Date().toISOString(),
  };
  const assignment: PostAssignment = {
    id: uid("asn"),
    employeeId: draft.id,
    postId: draft.currentPostId,
    date: draft.joinedAt,
    note: "上岗登记",
  };
  return {
    ...data,
    employees: [...data.employees, employee],
    assignments: [...data.assignments, assignment],
  };
}

export interface PostDraft {
  name: string;
  workshop: string;
  limitDba: number;
  protection: string;
}

/** 登记岗位噪声资料 */
export function addPost(data: MonitoringData, draft: PostDraft): { data: MonitoringData; post: NoisePost } {
  const post: NoisePost = {
    id: uid("post"),
    ...draft,
    createdAt: new Date().toISOString(),
  };
  return { data: { ...data, posts: [...data.posts, post] }, post };
}

/**
 * 换岗：写一条新到岗履历，并同步员工当前岗位。
 * 未完成的复查任务不需手工搬运——判定层 buildTasks 依据履历把任务归到新岗位。
 */
export function transferPost(
  data: MonitoringData,
  employeeId: string,
  newPostId: string,
  date: string,
  note: string
): MonitoringData {
  const employee = data.employees.find((e) => e.id === employeeId);
  if (!employee) throw new Error("员工不存在");
  if (employee.currentPostId === newPostId) {
    throw new Error("新岗位与当前岗位相同，无需换岗");
  }
  const assignment: PostAssignment = {
    id: uid("asn"),
    employeeId,
    postId: newPostId,
    date,
    note: note || undefined,
  };
  return {
    ...data,
    employees: data.employees.map((e) =>
      e.id === employeeId ? { ...e, currentPostId: newPostId } : e
    ),
    assignments: [...data.assignments, assignment],
  };
}
