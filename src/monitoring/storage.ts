// ============================================================
// 本机保存层：监护资料的本机持久化（localStorage）
// 与判定、页面解耦：这里只负责整库读写、增删改与示例数据，
// 判定结论由判定层计算后随记录保存，不依赖任何 UI。
// ============================================================

import type {
  Audiogram,
  EarThresholds,
  MonitoringData,
} from "./types";
import { evaluateExam } from "./rules";

const STORAGE_KEY = "ohsm-data-v1";
const DATA_VERSION = 1;

export const uid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const nowIso = (): string => new Date().toISOString();

/** 本机今日日期 yyyy-mm-dd */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// ------------------------------------------------------------
// 示例数据（相对今天构造，保证看板能看到逾期/待复查/已转移等状态）
// ------------------------------------------------------------

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const ear = (v2: number, v3: number, v4: number): EarThresholds => ({
  2: v2,
  3: v3,
  4: v4,
});

export function seedData(): MonitoringData {
  // 岗位噪声
  const posts = [
    {
      id: "P01",
      name: "冲压工",
      workshop: "冲压车间",
      limitDba: 92,
      protection: "3M 1110 慢回弹耳塞（SNR 37dB）",
    },
    {
      id: "P02",
      name: "纺织细纱挡车工",
      workshop: "纺织车间",
      limitDba: 90,
      protection: "防噪耳罩 X4A",
    },
    {
      id: "P03",
      name: "空压站值守",
      workshop: "动力车间",
      limitDba: 87,
      protection: "预成型耳塞（SNR 32dB）",
    },
    {
      id: "P04",
      name: "装配检验员",
      workshop: "总装车间",
      limitDba: 78,
      protection: "无（非噪声岗位）",
    },
  ].map((p) => ({ ...p, createdAt: nowIso() }));

  const employees = [
    { id: "E1001", name: "王建国", gender: "男" as const, joinedAt: "2019-03-11", currentPostId: "P01" },
    { id: "E1002", name: "李桂兰", gender: "女" as const, joinedAt: "2017-07-01", currentPostId: "P02" },
    { id: "E1003", name: "张志强", gender: "男" as const, joinedAt: "2021-05-20", currentPostId: "P03" },
    { id: "E1004", name: "赵海涛", gender: "男" as const, joinedAt: "2018-09-02", currentPostId: "P03" },
    { id: "E1005", name: "陈晓敏", gender: "女" as const, joinedAt: "2020-02-16", currentPostId: "P02" },
  ].map((e) => ({ ...e, createdAt: nowIso() }));

  const assignments = [
    { id: "a1", employeeId: "E1001", postId: "P01", date: "2019-03-11", note: "上岗" },
    { id: "a2", employeeId: "E1002", postId: "P02", date: "2017-07-01", note: "上岗" },
    { id: "a3", employeeId: "E1003", postId: "P01", date: "2021-05-20", note: "上岗：冲压工" },
    { id: "a4", employeeId: "E1003", postId: "P03", date: daysAgoISO(12), note: "换岗：冲压→空压站值守，未完成复查随转新岗位" },
    { id: "a5", employeeId: "E1004", postId: "P01", date: "2018-09-02", note: "上岗：冲压工" },
    { id: "a6", employeeId: "E1005", postId: "P02", date: "2020-02-16", note: "上岗" },
  ];

  // 测听原始记录（eval 由判定层统一补算）
  type Raw = {
    id: string;
    employeeId: string;
    postId: string;
    date: string;
    kind: Audiogram["kind"];
    left: EarThresholds;
    right: EarThresholds;
  };

  const raw: Raw[] = [
    // E1001：年度复查逾期（触发于 45 天前，至今未复查，已随换岗？无换岗→逾期）
    { id: "x101", employeeId: "E1001", postId: "P01", date: "2024-06-03", kind: "baseline", left: ear(15, 15, 20), right: ear(10, 15, 20) },
    { id: "x102", employeeId: "E1001", postId: "P01", date: daysAgoISO(45), kind: "annual", left: ear(25, 25, 30), right: ear(20, 25, 30) },

    // E1002：复查仍上移 → 需干预（触发 60 天前，30 天前复查仍超标）
    { id: "x201", employeeId: "E1002", postId: "P02", date: "2024-05-10", kind: "baseline", left: ear(20, 20, 25), right: ear(15, 20, 25) },
    { id: "x202", employeeId: "E1002", postId: "P02", date: daysAgoISO(60), kind: "annual", left: ear(30, 30, 35), right: ear(25, 30, 35) },
    { id: "x203", employeeId: "E1002", postId: "P02", date: daysAgoISO(30), kind: "retest", left: ear(30, 30, 35), right: ear(25, 30, 35) },

    // E1003：待复查，触发于 20 天前（12 天前从冲压换到空压站，任务随转新岗位，未逾期）
    { id: "x301", employeeId: "E1003", postId: "P01", date: "2024-04-15", kind: "baseline", left: ear(10, 10, 15), right: ear(10, 15, 15) },
    { id: "x302", employeeId: "E1003", postId: "P01", date: daysAgoISO(20), kind: "annual", left: ear(20, 20, 25), right: ear(20, 25, 20) },

    // E1004：复查逾期（触发 40 天前，无复查）
    { id: "x401", employeeId: "E1004", postId: "P01", date: "2024-06-20", kind: "baseline", left: ear(15, 20, 20), right: ear(15, 15, 20) },
    { id: "x402", employeeId: "E1004", postId: "P01", date: daysAgoISO(40), kind: "annual", left: ear(25, 30, 30), right: ear(25, 30, 25) },

    // E1005：复查恢复（触发 50 天前，18 天前复查恢复→已恢复）
    { id: "x501", employeeId: "E1005", postId: "P02", date: "2024-05-28", kind: "baseline", left: ear(10, 15, 20), right: ear(10, 10, 15) },
    { id: "x502", employeeId: "E1005", postId: "P02", date: daysAgoISO(50), kind: "annual", left: ear(20, 25, 30), right: ear(20, 20, 25) },
    { id: "x503", employeeId: "E1005", postId: "P02", date: daysAgoISO(18), kind: "retest", left: ear(15, 15, 20), right: ear(10, 15, 20) },
  ];

  // 用判定层回填 eval，并补“前阈值”留存
  const partialData: MonitoringData = {
    version: DATA_VERSION,
    posts,
    employees,
    assignments,
    exams: [],
  };

  const byEmployee = new Map<string, Raw[]>();
  for (const r of raw) {
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push(r);
    byEmployee.set(r.employeeId, list);
  }

  const exams: Audiogram[] = [];
  for (const [, list] of byEmployee) {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    let baselineRec: Audiogram | undefined;
    let triggerRec: Audiogram | undefined;
    for (const r of sorted) {
      const evalResult = evaluateExam({
        date: r.date,
        kind: r.kind,
        left: r.left,
        right: r.right,
        baseline: r.kind === "baseline" ? undefined : baselineRec,
        trigger: r.kind === "retest" ? triggerRec : undefined,
      });
      const beforeThresholds =
        r.kind === "baseline"
          ? undefined
          : r.kind === "retest" && triggerRec
            ? {
                kind: triggerRec.kind,
                date: triggerRec.date,
                left: triggerRec.left,
                right: triggerRec.right,
              }
            : baselineRec
              ? {
                  kind: baselineRec.kind,
                  date: baselineRec.date,
                  left: baselineRec.left,
                  right: baselineRec.right,
                }
              : undefined;
      const rec: Audiogram = {
        ...r,
        beforeThresholds,
        eval: evalResult,
        createdAt: nowIso(),
      };
      if (r.kind === "baseline") baselineRec = rec;
      if (r.kind === "annual" && evalResult.disposition === "retest") triggerRec = rec;
      exams.push(rec);
    }
  }
  partialData.exams = exams;
  return partialData;
}

// ------------------------------------------------------------
// 整库读写
// ------------------------------------------------------------

export function loadData(): MonitoringData {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) {
      const parsed = JSON.parse(text) as MonitoringData;
      if (parsed && Array.isArray(parsed.exams) && Array.isArray(parsed.employees)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("本机资料读取失败，改用示例数据：", err);
  }
  const seed = seedData();
  saveData(seed);
  return seed;
}

export function saveData(data: MonitoringData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("本机资料保存失败：", err);
    throw new Error("本机资料保存失败，请检查浏览器存储空间。");
  }
}

export function resetData(): MonitoringData {
  const seed = seedData();
  saveData(seed);
  return seed;
}

export function clearData(): void {
  localStorage.removeItem(STORAGE_KEY);
}
