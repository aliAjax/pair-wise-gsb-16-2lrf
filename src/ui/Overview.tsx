// 总览：监护指标与复查任务台。只做展示与跳转，不直接改数据。

import { useMemo } from "react";
import { DataStore, Exam, VERDICT_META } from "../domain/types";

const TODAY = "2026-09-24";

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) /
      86_400_000
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone: string;
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  );
}

export default function Overview({
  store,
  onOpenEmployee,
}: {
  store: DataStore;
  onOpenEmployee: (id: string) => void;
}) {
  const tasks = useMemo(() => {
    return store.followUps
      .filter((f) => f.status === "pending")
      .map((f) => {
        const source = store.exams.find((e) => e.id === f.sourceExamId) as Exam | undefined;
        const employee = source
          ? store.employees.find((e) => e.id === source.employeeId)
          : undefined;
        return { followUp: f, source, employee };
      })
      .filter((t) => t.source && t.employee)
      .sort((a, b) => a.followUp.dueDate.localeCompare(b.followUp.dueDate));
  }, [store]);

  const interveneCount = store.employees.filter((e) => e.currentVerdict === "intervene").length;
  const overdueCount = tasks.filter((t) => t.followUp.dueDate < TODAY).length;
  const dueSoonCount = tasks.filter(
    (t) => t.followUp.dueDate >= TODAY && daysBetween(TODAY, t.followUp.dueDate) <= 7
  ).length;

  const transferCarried = new Set(
    store.transfers.filter((t) => t.carriedExamId).map((t) => t.carriedExamId)
  );

  return (
    <div className="stack-gap">
      <section className="metrics-grid metrics-5">
        <Metric label="监护员工" value={store.employees.length} hint="噪声岗位在册" tone="neutral" />
        <Metric label="待复查" value={tasks.length} hint={`7天内到期 ${dueSoonCount} 人`} tone="watch" />
        <Metric label="复查逾期" value={overdueCount} hint="已超过30天期限" tone="danger" />
        <Metric label="需干预" value={interveneCount} hint="复查仍上移" tone="danger" />
        <Metric label="测听记录" value={store.exams.length} hint="基线/年度/复查" tone="neutral" />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>30天复查任务台</p>
            <h2>待办复查（换岗后自动结转）</h2>
          </div>
        </div>
        {tasks.length === 0 ? (
          <p className="empty-hint">当前没有待完成的复查任务。</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>员工</th>
                  <th>现岗位 / 噪声</th>
                  <th>触发测听</th>
                  <th>应完成日期</th>
                  <th>状态</th>
                  <th>结转</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(({ followUp, source, employee }) => {
                  if (!source || !employee) return null;
                  const overdue = followUp.dueDate < TODAY;
                  const leftDays = daysBetween(TODAY, followUp.dueDate);
                  return (
                    <tr key={followUp.sourceExamId} className={overdue ? "row-danger" : ""}>
                      <td>
                        <strong>{employee.name}</strong>
                        <span className="sub-line">{employee.code} · {employee.department}</span>
                      </td>
                      <td>{employee.postName}<span className="sub-line">{employee.noiseLevel}</span></td>
                      <td>{source.date} 年度测听</td>
                      <td>
                        {followUp.dueDate}
                        <span className={`sub-line ${overdue ? "text-danger" : ""}`}>
                          {overdue ? `已逾期 ${-leftDays} 天` : `还剩 ${leftDays} 天`}
                        </span>
                      </td>
                      <td>
                        <span className={`badge tone-${VERDICT_META[employee.currentVerdict].tone}`}>
                          {VERDICT_META[employee.currentVerdict].label}
                        </span>
                      </td>
                      <td>{transferCarried.has(source.id) ? "已随换岗结转" : "—"}</td>
                      <td>
                        <button onClick={() => onOpenEmployee(employee.id)}>去登记复查</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
