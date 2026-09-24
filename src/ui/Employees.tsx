// 员工名册：登记噪声岗位员工，按状态/关键词筛选。

import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { VERDICT_META } from "../domain/types";
import { ErrorLine } from "./widgets";

const blankForm = {
  code: "",
  name: "",
  department: "",
  postName: "",
  noiseLevel: "",
  exposureHours: "8",
};

export default function Employees({
  onOpenEmployee,
}: {
  onOpenEmployee: (id: string) => void;
}) {
  const { store, dispatch } = useStore();
  const [form, setForm] = useState(blankForm);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState<string>();

  const filtered = useMemo(() => {
    const kw = keyword.trim();
    return store.employees.filter((e) => {
      if (!kw) return true;
      return [e.name, e.code, e.department, e.postName].some((v) => v.includes(kw));
    });
  }, [store.employees, keyword]);

  function submit() {
    if (!form.code.trim() || !form.name.trim() || !form.postName.trim() || !form.noiseLevel.trim()) {
      setError("请完整填写工号、姓名、岗位与噪声暴露水平");
      return;
    }
    if (store.employees.some((e) => e.code === form.code.trim())) {
      setError("该工号已登记");
      return;
    }
    try {
      dispatch({
        type: "ADD_EMPLOYEE",
        employee: {
          code: form.code.trim(),
          name: form.name.trim(),
          department: form.department.trim() || "未分部门",
          postName: form.postName.trim(),
          noiseLevel: form.noiseLevel.trim(),
          exposureHours: Number(form.exposureHours) || 8,
        },
      });
      setForm(blankForm);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登记失败");
    }
  }

  return (
    <div className="two-col">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>监护名册</p>
            <h2>噪声岗位员工（{filtered.length}）</h2>
          </div>
          <input
            className="search-input"
            placeholder="搜索姓名 / 工号 / 岗位"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className="roster-grid">
          {filtered.map((e) => {
            const meta = VERDICT_META[e.currentVerdict];
            return (
              <button key={e.id} className="employee-card" onClick={() => onOpenEmployee(e.id)}>
                <div className="employee-card-head">
                  <strong>{e.name}</strong>
                  <span className={`badge tone-${meta.tone}`}>{meta.label}</span>
                </div>
                <span className="sub-line">{e.code} · {e.department}</span>
                <span className="sub-line">{e.postName} · {e.noiseLevel} · 日接触 {e.exposureHours}h</span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="empty-hint">没有匹配的员工。</p>}
        </div>
      </section>

      <aside className="panel form-panel">
        <p className="eyebrow">登记员工</p>
        <h2>新增噪声岗位人员</h2>
        <div className="form-stack">
          <label>
            <span>工号</span>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="如 G-4102" />
          </label>
          <label>
            <span>姓名</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            <span>部门</span>
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="如 冲压车间" />
          </label>
          <label>
            <span>岗位名称</span>
            <input value={form.postName} onChange={(e) => setForm({ ...form, postName: e.target.value })} placeholder="如 冲压工" />
          </label>
          <label>
            <span>岗位噪声暴露 dB(A)</span>
            <input value={form.noiseLevel} onChange={(e) => setForm({ ...form, noiseLevel: e.target.value })} placeholder="如 94 dB(A)" />
          </label>
          <label>
            <span>日噪声接触小时数</span>
            <input type="number" min={0} max={24} step={0.5} value={form.exposureHours} onChange={(e) => setForm({ ...form, exposureHours: e.target.value })} />
          </label>
          <ErrorLine message={error} />
          <button className="primary-action" onClick={submit}>登记员工</button>
        </div>
      </aside>
    </div>
  );
}
