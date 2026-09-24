// 页面层：测听记录台账
// 列表 + 展开详情：保留前阈值与本次阈值的对照、判定处置与处理依据；
// 同日被覆盖的记录标记“已作废”，不参与判定但可追溯。

import { Fragment, useMemo, useState } from "react";
import type { Audiogram, MonitoringData } from "../monitoring/types";
import { DISPOSITION_LABEL, EXAM_KIND_LABEL, FREQ_KHZ } from "../monitoring/types";
import { pta } from "../monitoring/rules";
import { Badge, dispositionTone } from "./badges";

interface Props {
  data: MonitoringData;
  focusEmployeeId?: string;
  onEdit: (exam: Audiogram) => void;
  onDelete: (examId: string) => void;
  onRegister: (employeeId: string) => void;
}

function EarCell({
  label,
  t,
  before,
}: {
  label: string;
  t: Audiogram["left"];
  before?: Audiogram["left"];
}) {
  const shift = before ? pta(t) - pta(before) : null;
  return (
    <td>
      <span className="ear-label">{label}</span>
      {FREQ_KHZ.map((f) => (
        <span key={f} className="thr-num">
          {t[f]}
        </span>
      ))}
      <span className={`pta-line ${shift !== null && shift >= 10 ? "text-danger" : ""}`}>
        PTA {pta(t)}
        {shift !== null && `（${shift >= 0 ? "+" : ""}${shift}）`}
      </span>
    </td>
  );
}

export default function RecordsView({
  data,
  focusEmployeeId,
  onEdit,
  onDelete,
  onRegister,
}: Props) {
  const [employeeFilter, setEmployeeFilter] = useState(focusEmployeeId ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSuperseded, setShowSuperseded] = useState(false);

  const postName = (id: string) => data.posts.find((p) => p.id === id)?.name ?? "—";
  const emp = (id: string) => data.employees.find((e) => e.id === id);

  const rows = useMemo(() => {
    return data.exams
      .filter((e) => (showSuperseded ? true : !e.superseded))
      .filter((e) => (employeeFilter ? e.employeeId === employeeFilter : true))
      .sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1
      );
  }, [data.exams, employeeFilter, showSuperseded]);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>监护资料台账</p>
          <h2>测听记录与判定依据</h2>
        </div>
        <div className="filter-bar">
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">全部员工</option>
            {data.employees.map((e) => (
              <option key={e.id} value={e.id}>{e.id} · {e.name}</option>
            ))}
          </select>
          <label className="inline-check">
            <input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} />
            显示同日作废记录
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">暂无测听记录。</div>
      ) : (
        <div className="table-wrap">
          <table className="grid-table records-table">
            <thead>
              <tr>
                <th>日期 / 性质</th>
                <th>员工 / 岗位</th>
                <th>左耳 2/3/4 kHz（dB）</th>
                <th>右耳 2/3/4 kHz（dB）</th>
                <th>判定</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const open = expanded === e.id;
                const before = e.beforeThresholds;
                return (
                  <Fragment key={e.id}>
                    <tr className={e.superseded ? "row-superseded" : ""}>
                      <td>
                        <strong>{e.date}</strong>
                        <span className="sub-line">{EXAM_KIND_LABEL[e.kind]}</span>
                        {e.superseded && <Badge tone="muted">已作废</Badge>}
                      </td>
                      <td>
                        {emp(e.employeeId)?.id} {emp(e.employeeId)?.name}
                        <span className="sub-line">{postName(e.postId)}</span>
                      </td>
                      <EarCell label="左" t={e.left} before={before?.left} />
                      <EarCell label="右" t={e.right} before={before?.right} />
                      <td>
                        <Badge tone={dispositionTone(e.eval.disposition)}>
                          {DISPOSITION_LABEL[e.eval.disposition]}
                        </Badge>
                        <button className="link-btn" onClick={() => setExpanded(open ? null : e.id)}>
                          {open ? "收起依据" : "查看依据"}
                        </button>
                      </td>
                      <td>
                        {!e.superseded && (
                          <>
                            <button className="mini" onClick={() => onEdit(e)}>编辑</button>
                            <button
                              className="mini danger-btn"
                              onClick={() => {
                                if (confirm(`删除 ${e.date} 的${EXAM_KIND_LABEL[e.kind]}记录？相关复查任务将重新判定。`)) {
                                  onDelete(e.id);
                                }
                              }}
                            >
                              删除
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr key={e.id + "-detail"} className="detail-row">
                        <td colSpan={6}>
                          <div className="basis-box">
                            <h4>处理依据</h4>
                            <p>{e.eval.basis}</p>
                            {before && (
                              <div className="before-grid">
                                <div>
                                  <h5>前阈值（{before.date} · {EXAM_KIND_LABEL[before.kind]}）</h5>
                                  <table className="mini-table">
                                    <thead><tr><th></th>{FREQ_KHZ.map((f) => <th key={f}>{f}k</th>)}</tr></thead>
                                    <tbody>
                                      <tr><td>左</td>{FREQ_KHZ.map((f) => <td key={f}>{before.left[f]}</td>)}</tr>
                                      <tr><td>右</td>{FREQ_KHZ.map((f) => <td key={f}>{before.right[f]}</td>)}</tr>
                                    </tbody>
                                  </table>
                                </div>
                                <div>
                                  <h5>本次阈值（{e.date} · {EXAM_KIND_LABEL[e.kind]}）</h5>
                                  <table className="mini-table">
                                    <thead><tr><th></th>{FREQ_KHZ.map((f) => <th key={f}>{f}k</th>)}</tr></thead>
                                    <tbody>
                                      <tr><td>左</td>{FREQ_KHZ.map((f) => <td key={f}>{e.left[f]}</td>)}</tr>
                                      <tr><td>右</td>{FREQ_KHZ.map((f) => <td key={f}>{e.right[f]}</td>)}</tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            {(e.eval.disposition === "retest" || e.eval.disposition === "intervention") && (
                              <button className="mini primary-action" onClick={() => onRegister(e.employeeId)}>
                                {e.eval.disposition === "retest" ? "为该员工登记30天复查" : "查看该员工档案"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
