// 员工监护档案：岗位噪声资料、测听登记（对照基线实时预览）、
// 30天复查任务、换岗与前后阈值保留、完整处理依据。

import { useMemo, useState } from "react";
import { useStore, latestExamOf } from "../state/store";
import { EXAM_KIND_LABEL, Exam, ExamKind } from "../domain/types";
import {
  earPta,
  judgeExam,
  shiftsAgainst,
  shiftedEars,
  EAR_LABEL,
} from "../domain/rules";
import {
  ThresholdInputs,
  VerdictBadge,
  ErrorLine,
  emptyAudiogram,
  isAudiogramComplete,
} from "./widgets";

const TODAY = "2026-09-24";

function baselineFirst(exams: Exam[]): Exam | undefined {
  return exams
    .filter((e) => e.kind === "baseline")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export default function EmployeeDetail({
  employeeId,
  onBack,
}: {
  employeeId: string;
  onBack: () => void;
}) {
  const { store, dispatch } = useStore();
  const employee = store.employees.find((e) => e.id === employeeId);

  const [examDate, setExamDate] = useState(TODAY);
  const [kind, setKind] = useState<ExamKind>("annual");
  const [audiogram, setAudiogram] = useState(emptyAudiogram);
  const [examError, setExamError] = useState<string>();

  const [trfDate, setTrfDate] = useState(TODAY);
  const [toPost, setToPost] = useState("");
  const [toNoise, setToNoise] = useState("");
  const [toHours, setToHours] = useState("8");
  const [trfError, setTrfError] = useState<string>();

  const exams = useMemo(
    () =>
      store.exams
        .filter((e) => e.employeeId === employeeId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [store.exams, employeeId]
  );
  const transfers = useMemo(
    () =>
      store.transfers
        .filter((t) => t.employeeId === employeeId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [store.transfers, employeeId]
  );
  const followUps = useMemo(
    () =>
      store.followUps
        .filter((f) => store.exams.some((e) => e.id === f.sourceExamId && e.employeeId === employeeId))
        .slice()
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [store.followUps, store.exams, employeeId]
  );

  const baseline = baselineFirst(exams);
  const latest = latestExamOf(store.exams, employeeId);
  const pending = followUps.filter((f) => f.status === "pending");

  const preview = useMemo(() => {
    if (!isAudiogramComplete(audiogram)) return undefined;
    if (kind === "baseline" || !baseline) {
      return judgeExam({ kind, audiogram });
    }
    const shifts = shiftsAgainst(audiogram, baseline.audiogram);
    return { ...judgeExam({ kind, audiogram, baseline: baseline.audiogram }), shifts };
  }, [audiogram, kind, baseline]);

  if (!employee) {
    return (
      <section className="panel">
        <p className="empty-hint">未找到该员工。</p>
        <button onClick={onBack}>返回名册</button>
      </section>
    );
  }

  function submitExam() {
    if (!examDate) {
      setExamError("请选择测听日期");
      return;
    }
    if (!isAudiogramComplete(audiogram)) {
      setExamError("请填写左右耳 2/3/4 kHz 全部六个听阈值");
      return;
    }
    try {
      dispatch({ type: "ADD_EXAM", employeeId, date: examDate, kind, audiogram });
      setAudiogram(emptyAudiogram());
      setExamError(undefined);
    } catch (err) {
      setExamError(err instanceof Error ? err.message : "登记失败");
    }
  }

  function startRetest() {
    setKind("retest");
    setExamDate(TODAY);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitTransfer() {
    if (!trfDate || !toPost.trim() || !toNoise.trim()) {
      setTrfError("请填写换岗日期、新岗位与新岗位噪声水平");
      return;
    }
    if (toPost.trim() === employee!.postName) {
      setTrfError("新岗位与当前岗位相同，无需换岗");
      return;
    }
    try {
      dispatch({
        type: "TRANSFER",
        employeeId,
        date: trfDate,
        toPost: toPost.trim(),
        toNoiseLevel: toNoise.trim(),
        toExposureHours: Number(toHours) || 8,
      });
      setToPost("");
      setToNoise("");
      setToHours("8");
      setTrfError(undefined);
    } catch (err) {
      setTrfError(err instanceof Error ? err.message : "换岗失败");
    }
  }

  return (
    <div className="stack-gap">
      <section className="panel">
        <button className="back-btn" onClick={onBack}>← 返回名册</button>
        <div className="detail-head">
          <div>
            <h2>{employee.name} <span className="sub-line">{employee.code}</span></h2>
            <p className="subtitle-line">
              {employee.department} · 现岗位 <strong>{employee.postName}</strong> · 噪声暴露{" "}
              <strong>{employee.noiseLevel}</strong> · 日接触 {employee.exposureHours} 小时
            </p>
          </div>
          <VerdictBadge verdict={employee.currentVerdict} />
        </div>
        {pending.length > 0 && (
          <div className="alert-strip">
            <span>
              有未完成的30天复查：应于 {pending[0].dueDate} 前完成
              {pending[0].dueDate < TODAY ? `（已逾期）` : ""}
            </span>
            <button className="primary-action" onClick={startRetest}>登记复查测听</button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>测听登记</p>
            <h2>左右耳 2 / 3 / 4 kHz 听阈</h2>
          </div>
        </div>
        <div className="exam-form-row">
          <label className="date-field">
            <span>测听日期</span>
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
          <div className="kind-toggle" role="radiogroup" aria-label="测听类型">
            {(["baseline", "annual", "retest"] as ExamKind[]).map((k) => (
              <button
                key={k}
                className={kind === k ? "selected" : ""}
                onClick={() => setKind(k)}
              >
                {EXAM_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        {kind !== "baseline" && !baseline && (
          <p className="form-error">该员工尚无上岗基线，请先登记「上岗基线」测听。</p>
        )}
        {baseline && kind !== "baseline" && (
          <p className="baseline-hint">
            对照基线 {baseline.date}：左耳 {baseline.audiogram.left[2000]}/{baseline.audiogram.left[3000]}/{baseline.audiogram.left[4000]} dB，
            右耳 {baseline.audiogram.right[2000]}/{baseline.audiogram.right[3000]}/{baseline.audiogram.right[4000]} dB（2/3/4kHz）
          </p>
        )}
        <ThresholdInputs value={audiogram} onChange={setAudiogram} idPrefix="exam" />
        {preview && (
          <div className={`preview-box tone-${preview.verdict}`}>
            <div className="preview-head">
              <VerdictBadge verdict={preview.verdict} />
              {preview.shifts && (
                <span>
                  左耳 PTA {earPta(audiogram.left)} dB（上移 {preview.shifts.left > 0 ? "+" : ""}{preview.shifts.left}），
                  右耳 PTA {earPta(audiogram.right)} dB（上移 {preview.shifts.right > 0 ? "+" : ""}{preview.shifts.right}）
                  {shiftedEars(preview.shifts).length > 0 &&
                    `；${shiftedEars(preview.shifts).map((s) => EAR_LABEL[s]).join("、")}达到10dB标准`}
                </span>
              )}
            </div>
            <p>{preview.basis}</p>
          </div>
        )}
        <ErrorLine message={examError} />
        <button className="primary-action" onClick={submitExam}>保存测听记录</button>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>监护时间线</p>
            <h2>测听记录与处理依据</h2>
          </div>
          {latest && <span className="sub-line">最近测听 {latest.date}</span>}
        </div>
        <div className="timeline">
          {exams.map((e) => (
            <article key={e.id} className="timeline-item">
              <div className="timeline-date">
                <strong>{e.date}</strong>
                <span>{EXAM_KIND_LABEL[e.kind]}</span>
                <span className="sub-line">{e.postName} · {e.noiseLevel}</span>
              </div>
              <div className="timeline-body">
                <div className="timeline-tags">
                  <VerdictBadge verdict={e.verdict} />
                  {e.retestOf && <span className="tag">复查测听</span>}
                  {e.baselineId && <span className="tag">对照基线 {baseline?.date}</span>}
                </div>
                <table className="threshold-table">
                  <thead>
                    <tr><th>耳别</th><th>2kHz</th><th>3kHz</th><th>4kHz</th><th>PTA</th><th>较基线</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>左耳</td>
                      <td>{e.audiogram.left[2000]}</td>
                      <td>{e.audiogram.left[3000]}</td>
                      <td>{e.audiogram.left[4000]}</td>
                      <td>{earPta(e.audiogram.left)}</td>
                      <td>{e.shifts ? `${e.shifts.left > 0 ? "+" : ""}${e.shifts.left} dB` : "—"}</td>
                    </tr>
                    <tr>
                      <td>右耳</td>
                      <td>{e.audiogram.right[2000]}</td>
                      <td>{e.audiogram.right[3000]}</td>
                      <td>{e.audiogram.right[4000]}</td>
                      <td>{earPta(e.audiogram.right)}</td>
                      <td>{e.shifts ? `${e.shifts.right > 0 ? "+" : ""}${e.shifts.right} dB` : "—"}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="basis-text">{e.basis}</p>
              </div>
            </article>
          ))}
          {exams.length === 0 && <p className="empty-hint">尚无测听记录，请先登记上岗基线。</p>}
        </div>
      </section>

      <section className="two-col">
        <section className="panel">
          <p className="eyebrow">复查任务</p>
          <h2>30天复查跟踪</h2>
          <div className="followup-list">
            {followUps.map((f) => (
              <div key={f.sourceExamId} className={`followup-item ${f.status === "pending" ? "pending" : "closed"}`}>
                <strong>{f.status === "pending" ? "待复查" : "已关闭"}</strong>
                <span className="sub-line">
                  应完成 {f.dueDate}
                  {f.status === "pending" && f.dueDate < TODAY ? " · 已逾期" : ""}
                </span>
                {f.closedReason && <span className="sub-line">{f.closedReason}</span>}
              </div>
            ))}
            {followUps.length === 0 && <p className="empty-hint">年度测听出现任一耳上移≥10dB时，会自动建立复查任务。</p>}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">换岗管理</p>
          <h2>未完成复查结转新岗位</h2>
          <div className="form-stack">
            <label>
              <span>换岗日期</span>
              <input type="date" value={trfDate} onChange={(e) => setTrfDate(e.target.value)} />
            </label>
            <label>
              <span>新岗位</span>
              <input value={toPost} onChange={(e) => setToPost(e.target.value)} placeholder="如 装配检验员" />
            </label>
            <label>
              <span>新岗位噪声 dB(A)</span>
              <input value={toNoise} onChange={(e) => setToNoise(e.target.value)} placeholder="如 82 dB(A)" />
            </label>
            <label>
              <span>新岗位日接触小时</span>
              <input type="number" min={0} max={24} step={0.5} value={toHours} onChange={(e) => setToHours(e.target.value)} />
            </label>
            <ErrorLine message={trfError} />
            <button className="primary-action" onClick={submitTransfer}>办理换岗并结转</button>
          </div>
          <div className="transfer-list">
            {transfers.map((t) => (
              <article key={t.id} className="transfer-item">
                <strong>{t.date}：{t.fromPost} → {t.toPost}</strong>
                <span className="sub-line">{t.fromNoiseLevel} → {t.toNoiseLevel}，日接触 {t.toExposureHours}h</span>
                {t.carriedThresholds && (
                  <span className="sub-line">
                    保留换岗前阈值：左 {t.carriedThresholds.left[2000]}/{t.carriedThresholds.left[3000]}/{t.carriedThresholds.left[4000]}，
                    右 {t.carriedThresholds.right[2000]}/{t.carriedThresholds.right[3000]}/{t.carriedThresholds.right[4000]} dB（2/3/4kHz）
                  </span>
                )}
                <p className="basis-text">{t.basis}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
