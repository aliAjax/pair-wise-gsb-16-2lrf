import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { Audiogram, ExamKind, MonitoringData } from "./monitoring/types";
import { buildTasks } from "./monitoring/rules";
import { loadData, resetData, saveData, todayISO } from "./monitoring/storage";
import {
  addEmployee,
  addPost,
  deleteExam,
  saveExam,
  transferPost,
} from "./monitoring/service";
import Dashboard from "./components/Dashboard";
import ExamForm from "./components/ExamForm";
import PeoplePosts from "./components/PeoplePosts";
import RecordsView from "./components/RecordsView";
import EmployeeProfile from "./components/EmployeeProfile";

type Tab = "dashboard" | "exam" | "people" | "records";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "监护看板" },
  { key: "exam", label: "测听登记" },
  { key: "people", label: "员工 / 岗位 / 换岗" },
  { key: "records", label: "监护资料台账" },
];

function App() {
  const [data, setData] = useState<MonitoringData>(() => loadData());
  const [tab, setTab] = useState<Tab>("dashboard");
  const [today] = useState(todayISO());
  const [toast, setToast] = useState("");
  const [retestEmployeeId, setRetestEmployeeId] = useState<string | undefined>();
  const [retestKind, setRetestKind] = useState<ExamKind>("annual");
  const [editing, setEditing] = useState<Audiogram | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  // 本机保存：资料变更即落 localStorage（保存层与判定、页面分离）
  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const tasks = useMemo(() => buildTasks(data, today), [data, today]);

  const openProfile = (employeeId: string) => setProfileId(employeeId);

  const goRegisterRetest = (employeeId: string) => {
    setEditing(null);
    setRetestEmployeeId(employeeId);
    setRetestKind("retest");
    setProfileId(null);
    setTab("exam");
  };

  const handleReset = () => {
    if (confirm("恢复为示例数据？当前本机保存的监护资料将被覆盖。")) {
      setData(resetData());
      setToast("已恢复示例数据");
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">OHSM · 职业健康监护 · 噪声作业</p>
          <h1>职业听力监护台</h1>
          <p className="subtitle">
            登记员工、岗位噪声与左右耳 2/3/4kHz 听阈，对照本人基线：任一耳平均上移
            ≥10dB 自动安排30天复查，复查仍上移才列为需干预；换岗时未完成复查随转到新岗位。
            判定依据 GBZ 188。
          </p>
        </div>
        <div className="stack-card">
          <span>资料保存</span>
          <strong>本机浏览器保存（localStorage）</strong>
          <p className="sub-line">判定规则、本机保存与页面相互独立，数据不上传服务器</p>
          <button onClick={handleReset}>恢复示例数据</button>
        </div>
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "tab active" : "tab"}
            onClick={() => {
              setTab(t.key);
              setEditing(null);
              setRetestEmployeeId(undefined);
              setRetestKind("annual");
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}

      {tab === "dashboard" && (
        <Dashboard
          data={data}
          tasks={tasks}
          today={today}
          onRegisterRetest={goRegisterRetest}
          onOpenEmployee={openProfile}
        />
      )}

      {tab === "exam" && (
        <div className="stack">
          <ExamForm
            data={data}
            today={today}
            initialEmployeeId={retestEmployeeId}
            initialKind={retestKind}
            editing={editing}
            saveExam={(d, draft) => {
              const result = saveExam(d, draft);
              setData(result.data);
              return result;
            }}
            onSaved={(msg) => {
              setToast(msg);
              setEditing(null);
              setRetestEmployeeId(undefined);
              setRetestKind("annual");
            }}
            onCancelEdit={() => setEditing(null)}
          />
        </div>
      )}

      {tab === "people" && (
        <PeoplePosts
          data={data}
          today={today}
          onAddPost={(draft) => {
            const { data: next, post } = addPost(data, draft);
            setData(next);
            setToast(`已登记岗位 ${post.name}（${post.limitDba}dB(A)）`);
          }}
          onAddEmployee={(draft) => {
            try {
              setData(addEmployee(data, draft));
              setToast(`已登记员工 ${draft.id} ${draft.name}，并建立上岗履历`);
              return null;
            } catch (e) {
              return (e as Error).message;
            }
          }}
          onTransfer={(employeeId, newPostId, date, note) => {
            try {
              setData(transferPost(data, employeeId, newPostId, date, note));
              setToast("已记录换岗履历，未完成的复查将随转到新岗位");
              return null;
            } catch (e) {
              return (e as Error).message;
            }
          }}
          onOpenEmployee={openProfile}
        />
      )}

      {tab === "records" && (
        <RecordsView
          data={data}
          focusEmployeeId={profileId ?? undefined}
          onEdit={(exam) => {
            setEditing(exam);
            setRetestEmployeeId(exam.employeeId);
            setTab("exam");
          }}
          onDelete={(id) => {
            setData(deleteExam(data, id));
            setToast("记录已删除，复查任务按剩余记录重新判定");
          }}
          onRegister={goRegisterRetest}
        />
      )}

      {profileId && (
        <EmployeeProfile
          data={data}
          tasks={tasks}
          employeeId={profileId}
          today={today}
          onClose={() => setProfileId(null)}
          onRegisterRetest={goRegisterRetest}
        />
      )}

      <footer className="page-foot">
        监护资料（员工/岗位噪声/测听/换岗履历）、判定规则（STS 10dB / 30天复查 / 复查仍上移→干预 / 随岗转移）、
        本机保存（localStorage）与页面四层分离实现。
      </footer>
    </main>
  );
}

export default App;
