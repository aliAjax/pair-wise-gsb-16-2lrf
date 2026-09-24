// 页面通用小组件：判定徽标、阈值输入、空状态等。

import { VERDICT_META, Verdict, FREQUENCIES, Audiogram } from "../domain/types";
import { earPta } from "../domain/rules";

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const meta = VERDICT_META[verdict];
  return <span className={`badge tone-${meta.tone}`}>{meta.label}</span>;
}

const EAR_COLUMNS: { side: "left" | "right"; label: string }[] = [
  { side: "left", label: "左耳" },
  { side: "right", label: "右耳" },
];

export function ThresholdInputs({
  value,
  onChange,
  idPrefix,
}: {
  value: Audiogram;
  onChange: (next: Audiogram) => void;
  idPrefix: string;
}) {
  return (
    <div className="threshold-grid">
      {EAR_COLUMNS.map(({ side, label }) => (
        <fieldset key={side} className="threshold-ear">
          <legend>{label}（dB HL）</legend>
          <div className="threshold-cells">
            {FREQUENCIES.map((f) => (
              <label key={f}>
                <span>{f / 1000} kHz</span>
                <input
                  id={`${idPrefix}-${side}-${f}`}
                  type="number"
                  min={-20}
                  max={120}
                  step={1}
                  value={Number.isNaN(value[side][f]) ? "" : value[side][f]}
                  onChange={(e) => {
                    const num = e.target.value === "" ? Number.NaN : Number(e.target.value);
                    onChange({
                      ...value,
                      [side]: { ...value[side], [f]: num },
                    });
                  }}
                />
              </label>
            ))}
            <div className="pta-cell">
              <span>PTA</span>
              <strong>{Number.isNaN(earPta(value[side])) ? "—" : earPta(value[side])}</strong>
            </div>
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export function isAudiogramComplete(a: Audiogram): boolean {
  return (["left", "right"] as const).every((side) =>
    FREQUENCIES.every((f) => !Number.isNaN(a[side][f]))
  );
}

export function emptyAudiogram(): Audiogram {
  return {
    left: { 2000: Number.NaN, 3000: Number.NaN, 4000: Number.NaN },
    right: { 2000: Number.NaN, 3000: Number.NaN, 4000: Number.NaN },
  };
}

export function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="form-error" role="alert">{message}</p>;
}
