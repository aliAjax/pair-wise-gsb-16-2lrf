import { useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./state/store";
import Overview from "./ui/Overview";
import Employees from "./ui/Employees";
import EmployeeDetail from "./ui/EmployeeDetail";

type Tab = "overview" | "employees";

function Shell() {
  const { store, resetAll } = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function openEmployee(id: string) {
    setSelectedId(id);
  }

  function backToList() {
    setSelectedId(null);
    setTab("employees");
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">职业健康监护 · 噪声岗位</p>
          <h1>职业听力监护台</h1>
          <p className="subtitle">
            登记员工与岗位噪声，记录左右耳 2/3/4 kHz 听阈；对照基线，任一耳平均上移 10
            分贝自动安排 30 天复查，复查仍上移才列为需干预。换岗时未完成复查结转新岗位，前后阈值与处理依据全程保留，资料本机保存。
          </p>
          <nav className="tabs">
            <button className={tab === "overview" ? "selected" : ""} onClick={() => { setTab("overview"); setSelectedId(null); }}>
              总览与复查台
            </button>
            <button className={tab === "employees" ? "selected" : ""} onClick={() => { setTab("employees"); setSelectedId(null); }}>
              员工监护名册
            </button>
          </nav>
        </div>
        <div className="stack-card">
          <span>判定规则</span>
          <strong>双耳 2/3/4 kHz 平均听阈</strong>
          <p className="rule-line">任一耳较基线 ≥ +10 dB → 30天复查</p>
          <p className="rule-line">复查仍 ≥ +10 dB → 需干预</p>
          <button
            className="ghost-btn"
            onClick={() => {
              if (window.confirm("确定清空本机全部监护资料并恢复演示数据？此操作不可撤销。")) {
                resetAll();
                setSelectedId(null);
                setTab("overview");
              }
            }}
          >
            清空并恢复演示数据
          </button>
        </div>
      </section>

      {selectedId ? (
        <EmployeeDetail employeeId={selectedId} onBack={backToList} />
      ) : tab === "overview" ? (
        <Overview store={store} onOpenEmployee={openEmployee} />
      ) : (
        <Employees onOpenEmployee={openEmployee} />
      )}

      <footer className="page-footer">
        监护资料仅保存在本机浏览器（localStorage），不上传服务器；判定规则与页面分离，可审计可复核。
      </footer>
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
