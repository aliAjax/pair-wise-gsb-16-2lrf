// 首次使用时的演示数据，全部经判定层计算，便于直接看到
// 正常、待复查、逾期、需干预、换岗结转等状态。

import { DataStore, Employee, Exam, FollowUp, Transfer } from "../domain/types";
import { judgeExam, retestDueDate } from "../domain/rules";

interface SeedEmployee {
  code: string;
  name: string;
  department: string;
  postName: string;
  noiseLevel: string;
  exposureHours: number;
}

const employeesSeed: SeedEmployee[] = [
  { code: "G-1024", name: "王建国", department: "机加车间", postName: "数控车工", noiseLevel: "85 dB(A)", exposureHours: 8 },
  { code: "G-2087", name: "李秀兰", department: "冲压车间", postName: "冲压工", noiseLevel: "94 dB(A)", exposureHours: 7.5 },
  { code: "G-0761", name: "赵铁锤", department: "锻造车间", postName: "锻打工", noiseLevel: "97 dB(A)", exposureHours: 6 },
  { code: "G-3310", name: "孙小梅", department: "总装车间", postName: "装配检验员", noiseLevel: "82 dB(A)", exposureHours: 8 },
];

export function buildSeedStore(): DataStore {
  const employees: Employee[] = [];
  const exams: Exam[] = [];
  const transfers: Transfer[] = [];
  const followUps: FollowUp[] = [];

  const makeEmployee = (seed: SeedEmployee): Employee => {
    const e: Employee = {
      ...seed,
      id: `emp-seed-${seed.code}`,
      currentVerdict: "normal",
      createdAt: "2026-09-24T08:00:00.000Z",
    };
    employees.push(e);
    return e;
  };

  const addExam = (
    employee: Employee,
    date: string,
    kind: Exam["kind"],
    left: [number, number, number],
    right: [number, number, number],
    baselineExam?: Exam,
    retestOf?: Exam,
    postName?: string,
    noiseLevel?: string
  ): Exam => {
    const audiogram = {
      left: { 2000: left[0], 3000: left[1], 4000: left[2] },
      right: { 2000: right[0], 3000: right[1], 4000: right[2] },
    };
    const judged = judgeExam({
      kind,
      audiogram,
      baseline: baselineExam?.audiogram,
    });
    const exam: Exam = {
      id: `exam-seed-${employee.id}-${exams.length}`,
      employeeId: employee.id,
      postName: postName ?? employee.postName,
      noiseLevel: noiseLevel ?? employee.noiseLevel,
      date,
      kind,
      audiogram,
      verdict: judged.verdict,
      shifts: judged.shifts,
      baselineId: baselineExam?.id,
      retestOf: retestOf?.id,
      basis: judged.basis,
      createdAt: `${date}T02:00:00.000Z`,
    };
    exams.push(exam);
    return exam;
  };

  // 1 王建国：基线 + 年度测听正常
  {
    const e = makeEmployee(employeesSeed[0]);
    const base = addExam(e, "2024-06-03", "baseline", [10, 12, 10], [8, 10, 12]);
    const annual = addExam(e, "2026-03-12", "annual", [10, 14, 12], [10, 12, 12], base);
    e.currentVerdict = annual.verdict;
  }

  // 2 李秀兰：年度测听触发复查，30天期限已到仍未复查（逾期）
  {
    const e = makeEmployee(employeesSeed[1]);
    const base = addExam(e, "2024-05-10", "baseline", [15, 12, 10], [10, 10, 8]);
    const annual = addExam(e, "2026-08-20", "annual", [25, 24, 22], [12, 12, 10], base);
    e.currentVerdict = annual.verdict;
    followUps.push({
      sourceExamId: annual.id,
      dueDate: retestDueDate(annual.date), // 2026-09-19，已逾期
      status: "pending",
    });
  }

  // 3 赵铁锤：年度测听触发复查，复查仍上移 → 需干预
  {
    const e = makeEmployee(employeesSeed[2]);
    const base = addExam(e, "2023-04-18", "baseline", [10, 15, 18], [12, 14, 16]);
    const annual = addExam(e, "2026-06-02", "annual", [22, 26, 30], [16, 18, 20], base);
    followUps.push({
      sourceExamId: annual.id,
      dueDate: retestDueDate(annual.date),
      status: "closed",
      closedReason: "2026-07-08 复查仍上移，转为需干预",
    });
    const retest = addExam(e, "2026-07-08", "retest", [24, 28, 32], [18, 20, 22], base, annual);
    e.currentVerdict = retest.verdict;
  }

  // 4 孙小梅：原冲压岗位触发复查，未完成即换岗，复查任务结转
  {
    const seed = employeesSeed[3];
    const e: Employee = {
      ...seed,
      id: `emp-seed-${seed.code}`,
      postName: "冲压工",
      noiseLevel: "94 dB(A)",
      exposureHours: 7.5,
      currentVerdict: "retest",
      createdAt: "2026-09-24T08:00:00.000Z",
    };
    employees.push(e);
    const base = addExam(
      e,
      "2024-02-26",
      "baseline",
      [10, 10, 12],
      [8, 10, 10],
      undefined,
      undefined,
      "冲压工",
      "94 dB(A)"
    );
    const annual = addExam(
      e,
      "2026-09-01",
      "annual",
      [20, 22, 24],
      [10, 12, 12],
      base,
      undefined,
      "冲压工",
      "94 dB(A)"
    );
    followUps.push({
      sourceExamId: annual.id,
      dueDate: retestDueDate(annual.date), // 2026-10-01，随换岗结转
      status: "pending",
    });
    const transfer: Transfer = {
      id: "trf-seed-1",
      employeeId: e.id,
      date: "2026-09-15",
      fromPost: "冲压工",
      fromNoiseLevel: "94 dB(A)",
      toPost: "装配检验员",
      toNoiseLevel: "82 dB(A)",
      toExposureHours: 8,
      carriedExamId: annual.id,
      carriedThresholds: annual.audiogram,
      basis:
        "2026-09-15 由「冲压工（94 dB(A)）」换岗至「装配检验员（82 dB(A)，日接触 8 小时）」。" +
        "该员工有未完成的30天复查（原定 2026-10-01 前完成），复查任务随换岗结转至新岗位继续跟踪，不重新起算；" +
        "保留换岗前最近测听（2026-09-01，冲压工）阈值：左耳 20/22/24 dB、右耳 10/12/12 dB（2/3/4kHz），作为新岗位复查的前后阈值依据。",
      createdAt: "2026-09-15T03:00:00.000Z",
    };
    transfers.push(transfer);
    e.postName = "装配检验员";
    e.noiseLevel = "82 dB(A)";
    e.exposureHours = 8;
  }

  return {
    version: 1,
    employees,
    exams,
    transfers,
    followUps,
    seeded: true,
  };
}
