"use client";

import { ModelWheel, type WheelModel } from "@/components/effects/model-wheel";

const roles: WheelModel[] = ["前端开发者", "AI 工程师", "产品设计师", "后端开发者", "开源贡献者", "创意开发者", "行动派队友"].map(name => ({
  name, viewBox: "0 0 24 24", color: "var(--primary)", d: "M12 3 21 12 12 21 3 12Z",
}));

export function RoleWheel() {
  return <div className="people-role-scene">
    <p className="people-role-label">每一种热爱<br /><span>都有人回应</span></p>
    <ModelWheel models={roles} hold={2100} className="people-role-wheel" label="伙伴方向示例：前端、AI、设计、后端、开源和创意开发。滚轮可用鼠标拖动，悬停暂停。" />
  </div>;
}
