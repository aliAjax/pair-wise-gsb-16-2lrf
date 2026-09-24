// 职业听力监护 · 状态编排
// 组合监护资料、判定规则与本机保存：唯一记录约束、基线对照、
// 复查任务开/关、员工状态、换岗结转都集中在这里。

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  Audiogram,
  DataStore,
  Employee,
  Exam,
  ExamKind,
  FollowUp,
  Transfer,
} from "../domain/types";
import {
  findDuplicateDate,
  judgeExam,
  retestDueDate,
} from "../domain/rules";
import { loadStore, saveStore, clearStore } from "../storage/local";
import { buildSeedStore } from "./seed";

function uid(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

const emptyStore: DataStore = {
  version: 1,
  employees: [],
  exams: [],
  transfers: [],
  followUps: [],
  seeded: true,
};

type Action =
  | { type: "ADD_EMPLOYEE"; employee: Omit<Employee, "id" | "createdAt" | "currentVerdict"> }
  | {
      type: "ADD_EXAM";
      employeeId: string;
      date: string;
      kind: ExamKind;
      audiogram: Audiogram;
    }
  | {
      type: "TRANSFER";
      employeeId: string;
      date: string;
      toPost: string;
      toNoiseLevel: string;
      toExposureHours: number;
    }
  | { type: "RESET" };

export interface ActionError {
  error: string;
}

function baselineOf(exams: Exam[], employeeId: string): Exam | undefined {
  return exams
    .filter((e) => e.employeeId === employeeId && e.kind === "baseline")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function latestExamOf(exams: Exam[], employeeId: string): Exam | undefined {
  return exams
    .filter((e) => e.employeeId === employeeId)
    .sort((a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    )[0];
}

function pendingFollowUps(followUps: FollowUp[], employeeId: string, exams: Exam[]): FollowUp[] {
  return followUps.filter((f) => {
    if (f.status !== "pending") return false;
    return exams.some((e) => e.id === f.sourceExamId && e.employeeId === employeeId);
  });
}

function reducer(state: DataStore, action: Action): DataStore {
  switch (action.type) {
    case "ADD_EMPLOYEE": {
      const employee: Employee = {
        ...action.employee,
        id: uid("emp"),
        currentVerdict: "normal",
        createdAt: new Date().toISOString(),
      };
      return { ...state, employees: [...state.employees, employee] };
    }

    case "ADD_EXAM": {
      const employee = state.employees.find((e) => e.id === action.employeeId);
      if (!employee) return state;

      // 同一员工同一天只留一份有效记录
      const duplicate = findDuplicateDate(state.exams, action.employeeId, action.date);
      if (duplicate) {
        throw new Error(`该员工 ${action.date} 已有一份有效测听记录，不能重复登记`);
      }

      const baseline = baselineOf(state.exams, action.employeeId);
      if (action.kind !== "baseline" && !baseline) {
        throw new Error("还没有上岗基线，无法对照基线判定，请先登记基线测听");
      }

      const pending = pendingFollowUps(state.followUps, action.employeeId, state.exams);
      const trigger =
        action.kind === "retest" && pending.length > 0
          ? state.exams.find((e) => e.id === pending[0].sourceExamId)
          : undefined;

      const judged = judgeExam({
        kind: action.kind,
        audiogram: action.audiogram,
        baseline: baseline?.audiogram,
        triggerExam: trigger,
      });

      const exam: Exam = {
        id: uid("exam"),
        employeeId: action.employeeId,
        postName: employee.postName,
        noiseLevel: employee.noiseLevel,
        date: action.date,
        kind: action.kind,
        audiogram: action.audiogram,
        verdict: judged.verdict,
        baselineId: baseline?.id,
        shifts: judged.shifts,
        retestOf: trigger?.id,
        basis: judged.basis,
        createdAt: new Date().toISOString(),
      };

      let followUps = state.followUps;

      if (action.kind === "annual" && judged.verdict === "retest") {
        // 年度测听再次触发：先关闭此前仍未完成的复查，再开新任务，避免任务悬挂
        followUps = followUps.map((f) =>
          pending.some((p) => p.sourceExamId === f.sourceExamId)
            ? {
                ...f,
                status: "closed",
                closedReason: `${action.date} 年度测听再次提示上移，原复查任务由新任务替代`,
              }
            : f
        );
        followUps = [
          ...followUps,
          {
            sourceExamId: exam.id,
            dueDate: retestDueDate(action.date),
            status: "pending",
          },
        ];
      } else if (action.kind === "retest") {
        // 复查无论恢复还是仍上移，本次复查任务均关闭
        followUps = followUps.map((f) =>
          pending.some((p) => p.sourceExamId === f.sourceExamId)
            ? {
                ...f,
                status: "closed",
                closedReason:
                  judged.verdict === "intervene"
                    ? `${action.date} 复查仍上移，转为需干预`
                    : `${action.date} 复查恢复，任务关闭`,
              }
            : f
        );
      }

      const employees = state.employees.map((e) =>
        e.id === action.employeeId ? { ...e, currentVerdict: judged.verdict } : e
      );

      return {
        ...state,
        exams: [...state.exams, exam],
        followUps,
        employees,
      };
    }

    case "TRANSFER": {
      const employee = state.employees.find((e) => e.id === action.employeeId);
      if (!employee) return state;

      const pending = pendingFollowUps(state.followUps, action.employeeId, state.exams);
      const carriedSource =
        pending.length > 0
          ? state.exams.find((e) => e.id === pending[0].sourceExamId)
          : undefined;
      const carriedLatest = latestExamOf(state.exams, action.employeeId);

      const carriedText =
        carriedSource && carriedLatest
          ? `该员工有未完成的30天复查（原定 ${pending[0].dueDate} 前完成），复查任务随换岗结转至新岗位继续跟踪，不重新起算；保留换岗前最近测听（${carriedLatest.date}，${carriedLatest.postName}）阈值：左耳 ${carriedLatest.audiogram.left[2000]}/${carriedLatest.audiogram.left[3000]}/${carriedLatest.audiogram.left[4000]} dB、右耳 ${carriedLatest.audiogram.right[2000]}/${carriedLatest.audiogram.right[3000]}/${carriedLatest.audiogram.right[4000]} dB（2/3/4kHz），作为新岗位复查的前后阈值依据。`
          : carriedLatest
            ? `该员工无未完成复查任务。保留换岗前最近测听（${carriedLatest.date}，${carriedLatest.postName}）阈值：左耳 ${carriedLatest.audiogram.left[2000]}/${carriedLatest.audiogram.left[3000]}/${carriedLatest.audiogram.left[4000]} dB、右耳 ${carriedLatest.audiogram.right[2000]}/${carriedLatest.audiogram.right[3000]}/${carriedLatest.audiogram.right[4000]} dB（2/3/4kHz），原基线继续有效。`
            : "该员工尚未进行测听，换岗后须尽快安排上岗基线测听。";

      const transfer: Transfer = {
        id: uid("trf"),
        employeeId: action.employeeId,
        date: action.date,
        fromPost: employee.postName,
        fromNoiseLevel: employee.noiseLevel,
        toPost: action.toPost,
        toNoiseLevel: action.toNoiseLevel,
        toExposureHours: action.toExposureHours,
        carriedExamId: carriedSource?.id,
        carriedThresholds: carriedLatest?.audiogram,
        basis:
          `${action.date} 由「${employee.postName}（${employee.noiseLevel}）」换岗至「${action.toPost}（${action.toNoiseLevel}，日接触 ${action.toExposureHours} 小时）」。` +
          carriedText,
        createdAt: new Date().toISOString(),
      };

      const employees = state.employees.map((e) =>
        e.id === action.employeeId
          ? {
              ...e,
              postName: action.toPost,
              noiseLevel: action.toNoiseLevel,
              exposureHours: action.toExposureHours,
            }
          : e
      );

      return { ...state, transfers: [...state.transfers, transfer], employees };
    }

    case "RESET":
      return emptyStore;

    default:
      return state;
  }
}

interface StoreContextValue {
  store: DataStore;
  dispatch: Dispatch<Action>;
  resetAll: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function initStore(): DataStore {
  const loaded = loadStore();
  if (loaded) return loaded;
  return buildSeedStore();
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reducer, undefined, initStore);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  const value = useMemo<StoreContextValue>(
    () => ({
      store,
      dispatch,
      resetAll: () => {
        clearStore();
        dispatch({ type: "RESET" });
      },
    }),
    [store]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
