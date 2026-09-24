// 页面层：测听登记 / 编辑
// 录入员工、测听时岗位、日期、性质与左右耳 2/3/4kHz 听阈；
// 保存前预览对照基线的 PTA 与上移量；保存时由判定层生成结论与处理依据。

import { useEffect, useMemo, useState } from "react";
import type {
  Audiogram,
  EarThresholds,
  ExamKind,
  MonitoringData,
} from "../monitoring/types";
import { DISPOSITION_LABEL, EXAM_KIND_LABEL, FREQ_KHZ } from "../monitoring/types";
import {
  addDays,
  findBaseline,
  pta,
  RETEST_DAYS,
  validExamsOf,
} from "../monitoring/rules";
import { dispositionTone, Badge } from "./badges";

interface Props {
  data: MonitoringData;
  today: string;
  initialEmployeeId?: string;
  initialKind?: ExamKind;
  editing?: Audiogram | null;
  onSaved: (msg: string) => void;
  onCancelEdit: () => void;
  saveExam: (data: MonitoringData, draft: {
    id?: string;
    employeeId: string;
    postId: string;
    date: string;
    kind: ExamKind;
    left: EarThresholds;
    right: EarThresholds;
  }) => { data: MonitoringData; superseded: Audiogram | null; saved: Audiogram };
}

function ThresholdInputs({
  label,
  values,
  onChange,
}: {
  label: string;
  values: EarThresholds;
  onChange: (next: EarThresholds) => void;
}) {
  return (
    <div className="thr-block">
      <h4>{label}</h4>
      <div className="thr-grid">
        {FREQ_KHZ.map((f) => (
          <label key={f}>
            <span>{f} kHz 听阈 dB</span>
            <input
              type="number"
              min={-10}
              max={120}
              step={5}
              value={values[f]}
              onChange={(e) =>
                onChange({ ...values, [f]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        <div className="pta-preview">
          <span>PTA 均值</span>
          <strong>{pta(values)} dB</strong>
        </div>
      </div>
    </div>
  );
}

export default function ExamForm({
  data,
  today,
  initialEmployeeId,
  initialKind,
  editing,
  onSaved,
  onCancelEdit,
  saveExam,
}: Props) {
  const [employeeId, setEmployeeId] = useState(
    editing?.employeeId ?? initialEmployeeId ?? data.employees[0]?.id ?? ""
  );
  const [date, setDate] = useState(editing?.date ?? today);
  const [kind, setKind] = useState<ExamKind>(editing?.kind ?? initialKind ?? "annual");
  const [left, setLeft] = useState<EarThresholds>(editing?.left ?? { 2: 10, 3: 10, 4: 15 });
  const [right, setRight] = useState<EarThresholds>(editing?.right ?? { 2: 10, 3: 10, 4: 15 });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) {
      if (initialEmployeeId) setEmployeeId(initialEmployeeId);
      if (initialKind) setKind(initialKind);
    }
  }, [initialEmployeeId, initialKind, editing]);

  const employee = data.employees.find((e) => e.id === employeeId);

  // 测听时岗位：默认取员工在该日期的岗位（由换岗履历推导）
  const postId = useMemo(() => {
    if (!employee) return "";
    const assignments = data.assignments.filter((a) => a.employeeId === employeeId);
    const at = [...assignments]
      .filter((a) => a.date <= date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return at?.postId ?? employee.currentPostId;
  }, [data.assignments, employee, employeeId, date]);

  const baseline = useMemo(
    () => findBaseline(data.exams, editing?.id),
    [data.exams, editing?.id]
  );

  const trigger = useMemo(() => {
    if (!employeeId) return undefined;
    return [...validExamsOf(data, employeeId)]
      .reverse()
      .find((e) => e.kind === "annual" && e.eval.disposition === "retest" && e.date <= date);
  }, [data, employeeId, date]);

  // 前阈值（随记录留存）：复查为触发复查的年度测听，年度为基线
  const before =
    kind === "retest" ? trigger ?? baseline : kind === "annual" ? baseline : undefined;

  const refLeft = before?.left;
  const refRight = before?.right;
  const leftShift = refLeft ? pta(left) - pta(refLeft) : null;
  const rightShift = refRight ? pta(right) - pta(refRight) : null;

  // 是否上移的判定一律以基线为准（复查“仍上移”= 相对基线仍 ≥10dB）
  const baselineLeftShift = baseline ? pta(left) - pta(baseline.left) : null;
  const baselineRightShift = baseline ? pta(right) - pta(baseline.right) : null;
  const shiftedVsBaseline =
    baseline !== undefined &&
    (baselineLeftShift! >= 10 || baselineRightShift! >= 10);
  const wouldRetest = kind === "baseline" ? false : shiftedVsBaseline;

  // 同日已有记录提示（同一员工同一天只留一份有效记录）
  const sameDay = data.exams.find(
    (e) =>
      e.employeeId === employeeId &&
      e.date === date &&
      !e.superseded &&
      e.id !== editing?.id
  );

  const dueDate = addDays(date, RETEST_DAYS);

  const submit = () => {
    setError("");
    if (!employeeId) return setError("请选择员工");
    if (!date) return setError("请选择测听日期");
    if (!postId) return setError("该员工测听日期时无岗位记录，请先登记上岗/换岗履历");
    for (const v of [left[2], left[3], left[4], right[2], right[3], right[4]]) {
      if (Number.isNaN(v)) return setError("听阈需为数字（dB HL）");
    }
    const result = saveExam(data, {
      id: editing?.id,
      employeeId,
      postId,
      date,
      kind,
      left,
      right,
    });
    const parts = [];
    parts.push(
      `已保存 ${DISPOSITION_LABEL[result.saved.eval.disposition]}`
    );
    if (result.superseded) {
      parts.push(`同日旧记录（${result.superseded.date}）已作废，仅保留本次一份有效记录`);
    }
    onSaved(parts.join("；"));
    if (!editing) {
      setLeft({ 2: 10, 3: 10, 4: 15 });
      setRight({ 2: 10, 3: 10, 4: 15 });
    }
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>{editing ? "编辑测听记录" : "测听登记"}</p>
          <h2>纯音听阈（2、3、4 kHz）与STS判定</h2>
        </div>
        {editing && (
          <button onClick={onCancelEdit}>取消编辑</button>
        )}
      </div>

      <div className="form-grid">
        <label>
          <span>员工</span>
          <select value={employeeId} disabled={!!editing} onChange={(e) => setEmployeeId(e.target.value)}>
            {data.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} · {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>测听日期</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>测听性质</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as ExamKind)}>
            <option value="baseline">{EXAM_KIND_LABEL.baseline}（上岗/建档）</option>
            <option value="annual">{EXAM_KIND_LABEL.annual}（在岗年度）</option>
            <option value="retest">{EXAM_KIND_LABEL.retest}（STS后30天）</option>
          </select>
        </label>
        <label>
          <span>测听时岗位（按日期自动带出）</span>
          <input readOnly value={data.posts.find((p) => p.id === postId)?.name ?? "—"} />
        </label>
      </div>

      <div className="thr-columns">
        <ThresholdInputs label="左耳" values={left} onChange={setLeft} />
        <ThresholdInputs label="右耳" values={right} onChange={setRight} />
      </div>

      {/* 对照预览：前阈值 → 现阈值 */}
      <div className="compare-box">
        {kind === "baseline" ? (
          <p>本次作为基线建档，不做对照；左右耳 PTA 将留存为以后年度测听的对照依据。</p>
        ) : before ? (
          <>
            <h4>对照预览（保存后随记录留存前阈值与处理依据）</h4>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>耳别</th>
                  <th>前阈值PTA（{before.date} {EXAM_KIND_LABEL[before.kind]}）</th>
                  <th>本次PTA</th>
                  <th>较前次</th>
                  {kind === "retest" && baseline && (
                    <>
                      <th>基线PTA（{baseline.date}）</th>
                      <th>较基线（判定用）</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>左耳</td>
                  <td>{pta(before.left)} dB</td>
                  <td>{pta(left)} dB</td>
                  <td className={typeof leftShift === "number" && leftShift >= 10 ? "text-danger" : ""}>
                    {leftShift === null ? "—" : `${leftShift >= 0 ? "+" : ""}${leftShift} dB`}
                  </td>
                  {kind === "retest" && baseline && (
                    <>
                      <td>{pta(baseline.left)} dB</td>
                      <td className={baselineLeftShift! >= 10 ? "text-danger" : ""}>
                        {baselineLeftShift! >= 0 ? "+" : ""}{baselineLeftShift} dB
                      </td>
                    </>
                  )}
                </tr>
                <tr>
                  <td>右耳</td>
                  <td>{pta(before.right)} dB</td>
                  <td>{pta(right)} dB</td>
                  <td className={typeof rightShift === "number" && rightShift >= 10 ? "text-danger" : ""}>
                    {rightShift === null ? "—" : `${rightShift >= 0 ? "+" : ""}${rightShift} dB`}
                  </td>
                  {kind === "retest" && baseline && (
                    <>
                      <td>{pta(baseline.right)} dB</td>
                      <td className={baselineRightShift! >= 10 ? "text-danger" : ""}>
                        {baselineRightShift! >= 0 ? "+" : ""}{baselineRightShift} dB
                      </td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
            <p className="preview-verdict">
              {kind === "annual" ? (
                wouldRetest ? (
                  <Badge tone="watch">将判定：任一耳较基线上移≥10dB，安排30天复查（{dueDate} 前完成）</Badge>
                ) : (
                  <Badge tone="ok">将判定：未见标准阈移</Badge>
                )
              ) : wouldRetest ? (
                <Badge tone="danger">将判定：复查较基线仍上移≥10dB → 需干预</Badge>
              ) : (
                <Badge tone="ok">将判定：复查较基线上移&lt;10dB → 恢复，解除复查</Badge>
              )}
            </p>
          </>
        ) : (
          <p className="text-warn">该员工尚无基线测听，本次只能记录、无法对照STS；建议先补登基线。</p>
        )}
      </div>

      {sameDay && (
        <div className="warn-box">
          该员工 {date} 已有一份
          「{EXAM_KIND_LABEL[sameDay.kind]}」
          （{DISPOSITION_LABEL[sameDay.eval.disposition]}）。保存后旧记录将作废，
          <strong>同一员工同一天只保留本次一份有效记录</strong>。
        </div>
      )}

      {error && <div className="warn-box">{error}</div>}

      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          {editing ? "保存修改并重新判定" : "保存测听记录"}
        </button>
        <span className="muted-text">结论由判定层按GBZ 188自动计算，保存到本机浏览器</span>
      </div>
    </section>
  );
}
