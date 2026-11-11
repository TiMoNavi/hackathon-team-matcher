export const people = [
  { name: "林小满", english: "Xiaoman", role: "前端开发", tag: "React / TypeScript", about: "喜欢把复杂问题做成简单好用的界面。这个周末，想做一件真的有人会用的小产品。", looking: "找一位对 AI 应用感兴趣的搭档", image: 1, project: "一款能听懂碎碎念的旅行助手", availability: "周末两天，可以全程投入" },
  { name: "陈序", english: "Chen Xu", role: "AI 工程师", tag: "Python / LLM", about: "模型负责想象，我负责让它稳定运行。最近在探索 Agent 与真实生活之间的连接。", looking: "找前端或产品设计伙伴", image: 2, project: "让会议结束后，行动真正开始", availability: "周六全天，周日下午" },
  { name: "许知夏", english: "Zoe", role: "产品设计", tag: "Figma / Research", about: "在意每一次点击，也在意屏幕另一边的人。想和开发者一起，把一个小需求做到刚刚好。", looking: "找愿意一起打磨体验的开发者", image: 3, project: "给独居生活多一点安心", availability: "本次活动全程参与" },
  { name: "周野", english: "Leo", role: "全栈开发", tag: "Next.js / Go", about: "从 API 到最后一像素都能接。喜欢快速做出第一版，再和队友一起迭代。", looking: "找有意思的想法和行动派", image: 4, project: "开源项目的新手任务导航", availability: "周末可线下协作" },
  { name: "唐可", english: "Keke", role: "创意开发", tag: "Three.js / Web", about: "让代码有一点好玩，也有一点温度。想做能让人停下来多看一眼的交互作品。", looking: "找视觉设计和声音创作伙伴", image: 5, project: "把城市里的声音变成一座花园", availability: "两天活动，晚上也可以聊" },
  { name: "宋一舟", english: "Yizhou", role: "后端开发", tag: "Rust / PostgreSQL", about: "对清楚的数据结构和可靠的系统有执念。也期待一个能把技术用到人身上的好点子。", looking: "找产品或前端一起开工", image: 6, project: "把社区闲置工具共享起来", availability: "周六至周日均可参与" },
];
export type Person = typeof people[number];
