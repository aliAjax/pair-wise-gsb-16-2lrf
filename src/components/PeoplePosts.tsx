// 页面层：岗位噪声登记、员工登记、换岗处理
// 换岗只写履历；未完成复查的随岗转移由判定层根据履历自动推导。

import { useState } from "react";
import type { MonitoringData } from "../monitoring/types";
import { isNoisePost } from "../monitoring/rules";
import { Badge } from "./badges";

interface Props {
  data: MonitoringData;
  today: string;
  onAddPost: (draft: {
    name: string;
    workshop: string;
    limitDba: number;
    protection: string;
  }) => void;
  onAddEmployee: (draft: {
    id: string;
    name: string;
    gender: "男" | "女";
    joinedAt: string;
    currentPostId: string;
  }) => string | null;
  onTransfer: (
    employeeId: string,
    newPostId: string,
    date: string,
    note: string
  ) => string | null;
  onOpenEmployee: (employeeId: string) => void;
}

export default function PeoplePosts({
  data,
  today,
  onAddPost,
  onAddEmployee,
  onTransfer,
  onOpenEmployee,
}: Props) {
  // 岗位表单
  const [postName, setPostName] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [limitDba, setLimitDba] = useState(88);
  const [protection, setProtection] = useState("");
  const [postErr, setPostErr] = useState("");

  // 员工表单
  const [empId, setEmpId] = useState("");
  const [empName, setEmpName] = useState("");
  const [gender, setGender] = useState<"男" | "女">("男");
  const [joinedAt, setJoinedAt] = useState(today);
  const [joinPostId, setJoinPostId] = useState(data.posts[0]?.id ?? "");
  const [empErr, setEmpErr] = useState("");

  // 换岗表单
  const [trEmp, setTrEmp] = useState(data.employees[0]?.id ?? "");
  const [trPost, setTrPost] = useState("");
  const [trDate, setTrDate] = useState(today);
  const [trNote, setTrNote] = useState("");
  const [trErr, setTrErr] = useState("");

  const submitPost = () => {
    setPostErr("");
    if (!postName.trim() || !workshop.trim()) {
      setPostErr("请填写岗位名称与车间");
      return;
    }
    onAddPost({ name: postName.trim(), workshop: workshop.trim(), limitDba, protection: protection.trim() || "未登记" });
    setPostName("");
    setWorkshop("");
    setProtection("");
    setLimitDba(88);
  };

  const submitEmployee = () => {
    setEmpErr("");
    if (!empId.trim() || !empName.trim()) {
      setEmpErr("请填写工号与姓名");
      return;
    }
    if (!joinPostId) {
      setEmpErr("请先登记岗位再登记员工");
      return;
    }
    const err = onAddEmployee({
      id: empId.trim(),
      name: empName.trim(),
      gender,
      joinedAt,
      currentPostId: joinPostId,
    });
    if (err) {
      setEmpErr(err);
      return;
    }
    setEmpId("");
    setEmpName("");
  };

  const submitTransfer = () => {
    setTrErr("");
    if (!trEmp) return setTrErr("请选择员工");
    if (!trPost) return setTrErr("请选择新岗位");
    if (!trDate) return setTrErr("请选择到岗日期");
    const err = onTransfer(trEmp, trPost, trDate, trNote.trim());
    if (err) {
      setTrErr(err);
      return;
    }
    setTrPost("");
    setTrNote("");
  };

  const postNameOf = (id: string) => data.posts.find((p) => p.id === id)?.name ?? "—";
  const currentEmp = data.employees.find((e) => e.id === trEmp);

  return (
    <div className="two-col">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>岗位噪声</p>
            <h2>噪声岗位登记</h2>
          </div>
        </div>
        <div className="form-grid one">
          <label>
            <span>岗位名称</span>
            <input value={postName} placeholder="如：冲压工" onChange={(e) => setPostName(e.target.value)} />
          </label>
          <label>
            <span>所属车间</span>
            <input value={workshop} placeholder="如：冲压车间" onChange={(e) => setWorkshop(e.target.value)} />
          </label>
          <label>
            <span>8h等效噪声暴露 dB(A)（≥85为噪声岗位）</span>
            <input type="number" min={40} max={120} value={limitDba} onChange={(e) => setLimitDba(Number(e.target.value))} />
          </label>
          <label>
            <span>配发护听器</span>
            <input value={protection} placeholder="如：慢回弹耳塞 SNR 37dB" onChange={(e) => setProtection(e.target.value)} />
          </label>
        </div>
        {postErr && <div className="warn-box">{postErr}</div>}
        <div className="form-actions">
          <button className="primary-action" onClick={submitPost}>登记岗位</button>
        </div>

        <ul className="plain-list">
          {data.posts.map((p) => (
            <li key={p.id}>
              <strong>{p.workshop} · {p.name}</strong>
              <Badge tone={isNoisePost(p.limitDba) ? "danger" : "ok"}>
                {p.limitDba} dB(A){isNoisePost(p.limitDba) ? " · 噪声岗" : " · 非噪声岗"}
              </Badge>
              <span className="muted-text">{p.protection}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>员工</p>
            <h2>员工登记上岗</h2>
          </div>
        </div>
        <div className="form-grid one">
          <label>
            <span>工号</span>
            <input value={empId} placeholder="如 E1006" onChange={(e) => setEmpId(e.target.value)} />
          </label>
          <label>
            <span>姓名</span>
            <input value={empName} onChange={(e) => setEmpName(e.target.value)} />
          </label>
          <div className="form-grid two-mini">
            <label>
              <span>性别</span>
              <select value={gender} onChange={(e) => setGender(e.target.value as "男" | "女")}>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </label>
            <label>
              <span>入职/上岗日期</span>
              <input type="date" value={joinedAt} max={today} onChange={(e) => setJoinedAt(e.target.value)} />
            </label>
          </div>
          <label>
            <span>上岗岗位</span>
            <select value={joinPostId} onChange={(e) => setJoinPostId(e.target.value)}>
              {data.posts.map((p) => (
                <option key={p.id} value={p.id}>{p.workshop} · {p.name}</option>
              ))}
            </select>
          </label>
        </div>
        {empErr && <div className="warn-box">{empErr}</div>}
        <div className="form-actions">
          <button className="primary-action" onClick={submitEmployee}>登记员工并建上岗履历</button>
        </div>

        <ul className="plain-list">
          {data.employees.map((e) => (
            <li key={e.id}>
              <strong>{e.id} · {e.name}</strong>
              <span className="muted-text">{e.gender} · 入职 {e.joinedAt}</span>
              <button className="mini" onClick={() => onOpenEmployee(e.id)}>
                现岗：{postNameOf(e.currentPostId)} / 档案
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel wide">
        <div className="section-heading">
          <div>
            <p>换岗</p>
            <h2>岗位调动与复查随转</h2>
          </div>
        </div>
        <p className="rule-note">
          换岗后该员工未完成的30天复查自动转到新岗位，任务期限不变；在看板“随岗转移”列可查。
        </p>
        <div className="form-grid">
          <label>
            <span>员工</span>
            <select value={trEmp} onChange={(e) => setTrEmp(e.target.value)}>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>{e.id} · {e.name}（现岗：{postNameOf(e.currentPostId)}）</option>
              ))}
            </select>
          </label>
          <label>
            <span>调入新岗位</span>
            <select value={trPost} onChange={(e) => setTrPost(e.target.value)}>
              <option value="">请选择…</option>
              {data.posts
                .filter((p) => p.id !== currentEmp?.currentPostId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.workshop} · {p.name}（{p.limitDba}dB(A)）
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>到岗日期</span>
            <input type="date" value={trDate} max={today} onChange={(e) => setTrDate(e.target.value)} />
          </label>
          <label>
            <span>调动说明</span>
            <input value={trNote} placeholder="如：脱离噪声岗位 / 车间调整" onChange={(e) => setTrNote(e.target.value)} />
          </label>
        </div>
        {trErr && <div className="warn-box">{trErr}</div>}
        <div className="form-actions">
          <button className="primary-action" onClick={submitTransfer}>确认换岗（记录履历）</button>
        </div>
      </section>
    </div>
  );
}
