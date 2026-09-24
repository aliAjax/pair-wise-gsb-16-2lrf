// 页面层：监护看板（复查任务台 + 噪声岗位名册）

import { useMemo } from "react";
import type { FollowUpTask, MonitoringData } from "../monitoring/types";
import { TASK_STATUS_LABEL } from "../monitoring/types";
import {
  STATUS_LABEL,
  employeeStatus,
  isNoisePost,
} from "../monitoring/rules";
import { Badge, dayDiff, employeeTone, taskTone } from "./badges";

interface Props {
  data: MonitoringData;
  tasks: FollowUpTask[];
  today: string;
  onRegisterRetest: (employeeId: string) => void;
  onOpenEmployee: (employeeId: string) => void;
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone: "ok" | "watch" | "danger" | "muted";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : <i className={`dot dot-${tone}`} />}
    </article>
  );
}

export default function Dashboard({ data, tasks, today, onRegisterRetest, onOpenEmployee }: Props) {
  const postName = (id: string) => data.posts.find((p) => p.id === id)?.name ?? "—";
  const employee = (id: string) => data.employees.find((e) => e.id === id);

  const exposedEmployees = useMemo(
    () =>
      data.employees.filter((e) => {
        const p = data.posts.find((x) => x.id === e.currentPostId);
        return p && isNoisePost(p.limitDba);
      }),
    [data.employees, data.posts]
  );

  const openTasks = tasks.filter((t) => t.status === "open" || t.status === "overdue");
  const overdue = tasks.filter((t) => t.status === "overdue");
  const interventions = tasks.filter((t) => t.status === "intervention");
  const dueSoon = openTasks.filter((t) => dayDiff(today, t.dueDate) <= 7);

  return (
    <div className="stack">
      <section className="metrics-grid">
        <Metric
          label="噪声岗位接害员工"
          value={exposedEmployees.length}
          hint={`共 ${data.posts.filter((p) => isNoisePost(p.limitDba)).length} 个噪声岗位（≥85dB(A)）`}
          tone="muted"
        />
        <Metric
          label="待完成复查"
          value={openTasks.length}
          hint={overdue.length ? `其中 ${overdue.length} 人已逾期` : "均在30天期限内"}
          tone={overdue.length ? "danger" : "watch"}
        />
        <Metric
          label="需干预对象"
          value={interventions.length}
          hint="复查仍上移≥10dB"
          tone="danger"
        />
        <Metric
          label="7日内到期复查"
          value={dueSoon.length}
          hint="按触发日+30天计算"
          tone="ok"
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>复查任务台</p>
            <h2>年度测听后的30天复查跟踪</h2>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="empty">暂无复查任务。登记年度测听后，任一耳PTA上移≥10dB将自动生成。</div>
        ) : (
          <div className="table-wrap">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>员工</th>
                  <th>当前岗位</th>
                  <th>触发测听</th>
                  <th>复查期限</th>
                  <th>随岗转移</th>
                  <th>处理</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const emp = employee(t.employeeId);
                  const remaining = dayDiff(today, t.dueDate);
                  return (
                    <tr key={t.id}>
                      <td>
                        <Badge tone={taskTone(t.status)}>{TASK_STATUS_LABEL[t.status]}</Badge>
                      </td>
                      <td>
                        <button className="link-btn" onClick={() => onOpenEmployee(t.employeeId)}>
                          {emp?.id} {emp?.name}
                        </button>
                      </td>
                      <td>
                        {postName(t.currentPostId)}
                        {t.transferred && (
                          <span className="sub-line">原：{postName(t.originPostId)}</span>
                        )}
                      </td>
                      <td>{t.triggerDate} 年度测听</td>
                      <td>
                        {t.dueDate}
                        {(t.status === "open" || t.status === "overdue") && (
                          <span
                            className={`sub-line ${
                              t.status === "overdue" ? "text-danger" : remaining <= 7 ? "text-warn" : ""
                            }`}
                          >
                            {t.status === "overdue"
                              ? `已逾期 ${Math.abs(remaining)} 天`
                              : `剩余 ${remaining} 天`}
                          </span>
                        )}
                      </td>
                      <td>
                        {t.transferred ? (
                          <Badge tone="watch">已随岗转移 ×{t.transferCount}</Badge>
                        ) : (
                          <span className="muted-text">未换岗</span>
                        )}
                      </td>
                      <td>
                        {t.status === "open" || t.status === "overdue" ? (
                          <button className="mini primary-action" onClick={() => onRegisterRetest(t.employeeId)}>
                            登记复查
                          </button>
                        ) : (
                          <button className="mini" onClick={() => onOpenEmployee(t.employeeId)}>
                            查看依据
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="rule-note">
          判定口径：对照本人基线，任一耳 2/3/4kHz 平均听阈上移 ≥10dB 即安排30天复查；复查仍上移才列为需干预，复查恢复则解除。换岗时未完成的复查随员工转到新岗位（见“随岗转移”列）。
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>岗位噪声与人员名册</p>
            <h2>接害员工监护状态</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th>工号</th>
                <th>姓名</th>
                <th>当前岗位</th>
                <th>噪声暴露</th>
                <th>护听器</th>
                <th>监护状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => {
                const post = data.posts.find((p) => p.id === e.currentPostId);
                const status = employeeStatus(data, e.id, today);
                return (
                  <tr key={e.id}>
                    <td>{e.id}</td>
                    <td>{e.name}</td>
                    <td>
                      {post?.workshop} · {post?.name}
                    </td>
                    <td>
                      {post ? (
                        isNoisePost(post.limitDba) ? (
                          <Badge tone="danger">{post.limitDba} dB(A) 噪声岗</Badge>
                        ) : (
                          <Badge tone="ok">{post.limitDba} dB(A) 非噪声岗</Badge>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="muted-text">{post?.protection ?? "—"}</td>
                    <td>
                      <Badge tone={employeeTone(status)}>{STATUS_LABEL[status]}</Badge>
                    </td>
                    <td>
                      <button className="mini" onClick={() => onOpenEmployee(e.id)}>
                        监护档案
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
