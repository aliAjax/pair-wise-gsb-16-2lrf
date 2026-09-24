// 页面层：员工监护档案（弹窗）
// 汇总员工的基线/年度/复查历程、前后阈值对照、判定依据、换岗履历，
// 以及未完成复查是否已随岗转到新岗位。

import type { FollowUpTask, MonitoringData } from "../monitoring/types";
import { DISPOSITION_LABEL, EXAM_KIND_LABEL, TASK_STATUS_LABEL } from "../monitoring/types";
import { isNoisePost, pta, STATUS_LABEL, employeeStatus } from "../monitoring/rules";
import { Badge, dispositionTone, employeeTone, taskTone } from "./badges";

interface Props {
  data: MonitoringData;
  tasks: FollowUpTask[];
  employeeId: string;
  today: string;
  onClose: () => void;
  onRegisterRetest: (employeeId: string) => void;
}

export default function EmployeeProfile({ data, tasks, employeeId, today, onClose, onRegisterRetest }: Props) {
  const employee = data.employees.find((e) => e.id === employeeId);
  if (!employee) return null;

  const postName = (id: string) => data.posts.find((p) => p.id === id)?.name ?? "—";
  const currentPost = data.posts.find((p) => p.id === employee.currentPostId);
  const exams = data.exams
    .filter((e) => e.employeeId === employeeId && !e.superseded)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const assignments = data.assignments
    .filter((a) => a.employeeId === employeeId)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const myTasks = tasks.filter((t) => t.employeeId === employeeId);
  const status = employeeStatus(data, employeeId, today);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <p className="eyebrow">{employee.id}</p>
            <h2>{employee.name} <span className="muted-text small">{employee.gender} · 入职 {employee.joinedAt}</span></h2>
            <p className="sub-line">
              当前岗位：{currentPost?.workshop} · {currentPost?.name}（{currentPost?.limitDba}dB(A)
              {currentPost && isNoisePost(currentPost.limitDba) ? " 噪声岗" : " 非噪声岗"}） · {currentPost?.protection}
            </p>
          </div>
          <div className="modal-head-right">
            <Badge tone={employeeTone(status)}>{STATUS_LABEL[status]}</Badge>
            <button onClick={onClose}>关闭</button>
          </div>
        </header>

        {myTasks.length > 0 && (
          <section className="profile-block">
            <h3>复查任务</h3>
            <ul className="plain-list">
              {myTasks.map((t) => (
                <li key={t.id}>
                  <Badge tone={taskTone(t.status)}>{TASK_STATUS_LABEL[t.status]}</Badge>
                  <span>
                    {t.triggerDate} 年度测听触发，期限 {t.dueDate}
                    {t.transferred && `；已由「${postName(t.originPostId)}」随岗转到「${postName(t.currentPostId)}」（共${t.transferCount}次换岗）`}
                  </span>
                  {(t.status === "open" || t.status === "overdue") && (
                    <button className="mini primary-action" onClick={() => onRegisterRetest(employeeId)}>登记复查</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="profile-block">
          <h3>测听历程（保留前后阈值）</h3>
          <div className="table-wrap">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>性质/岗位</th>
                  <th>左耳 PTA</th>
                  <th>右耳 PTA</th>
                  <th>处置</th>
                  <th>处理依据</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => {
                  const b = e.beforeThresholds;
                  const ls = b ? pta(e.left) - pta(b.left) : null;
                  const rs = b ? pta(e.right) - pta(b.right) : null;
                  return (
                    <tr key={e.id}>
                      <td>{e.date}</td>
                      <td>
                        {EXAM_KIND_LABEL[e.kind]}
                        <span className="sub-line">{postName(e.postId)}</span>
                      </td>
                      <td>
                        {pta(e.left)} dB
                        {ls !== null && (
                          <span className={`sub-line ${ls >= 10 ? "text-danger" : ""}`}>
                            前 {pta(b!.left)}（{ls >= 0 ? "+" : ""}{ls}）
                          </span>
                        )}
                      </td>
                      <td>
                        {pta(e.right)} dB
                        {rs !== null && (
                          <span className={`sub-line ${rs >= 10 ? "text-danger" : ""}`}>
                            前 {pta(b!.right)}（{rs >= 0 ? "+" : ""}{rs}）
                          </span>
                        )}
                      </td>
                      <td><Badge tone={dispositionTone(e.eval.disposition)}>{DISPOSITION_LABEL[e.eval.disposition]}</Badge></td>
                      <td className="basis-cell">{e.eval.basis}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="rule-note">
            2/3/4kHz 明细：
            {exams.map((e) => (
              <span key={e.id} className="thr-seq">
                {e.date} {EXAM_KIND_LABEL[e.kind]}：左[{e.left[2]}/{e.left[3]}/{e.left[4]}] 右[{e.right[2]}/{e.right[3]}/{e.right[4]}]
              </span>
            ))}
          </p>
        </section>

        <section className="profile-block">
          <h3>上岗 / 换岗履历</h3>
          <ul className="timeline">
            {assignments.map((a, i) => (
              <li key={a.id}>
                <time>{a.date}</time>
                <div>
                  <strong>
                    {i === 0 ? "上岗" : "换岗"}：{postName(a.postId)}
                  </strong>
                  {a.note && <p>{a.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
