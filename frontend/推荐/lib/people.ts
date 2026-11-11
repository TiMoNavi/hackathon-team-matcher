export type Branch = { label: string; title: string; detail: string; source: string; note: string };
export type Person = { id: string; name: string; english: string; image: string; role: string; city: string; intro: string; tags: string[]; looking: string; chapters: Branch[][] };
export const chapters = [
  { title: "能一起做什么", short: "能力与互补", subtitle: "从 TA 最擅长的地方，找到你们的交集。" },
  { title: "正在关心什么", short: "兴趣与想法", subtitle: "技能之外，看看什么会让 TA 眼睛发亮。" },
  { title: "怎么一起协作", short: "时间与节奏", subtitle: "一起做事的节奏，也值得提前聊聊。" },
] as const;
export const people: Person[] = [
  { id: "xiaoman", name: "林小满", english: "Xiaoman", image: "/avatars/avatar-1.jpg", role: "前端开发 · 体验爱好者", city: "上海", intro: "把复杂的问题，做成简单好用的界面。", tags: ["React", "TypeScript", "前端交互"], looking: "想认识对 AI 应用感兴趣的搭档", chapters: [
    [
      { label: "最先值得认识的一面", title: "把想法做成可交互的作品", detail: "从页面到交互，小满想负责能被真正用起来的那一部分。你可以和 TA 讨论产品流程，再一起把原型跑通。", source: "本人确认的贡献方向 · 演示", note: "React / TypeScript / 界面交互" },
      { label: "你们可以接上的一块", title: "你做 AI，TA 把体验接起来", detail: "小满正在寻找熟悉 AI 理解与规划的搭档。是否适合你的方案，还需要你们一起确认技术边界。", source: "本次活动的合作意愿 · 演示", note: "正在找 AI 应用方向的伙伴" },
      { label: "做过的事", title: "一个能听懂碎碎念的旅行助手", detail: "把「想找个安静的小店坐坐」这样的随口一说，变成适合自己的行程。小满做过可交互的旅行路线原型。", source: "本人确认的项目摘要 · 演示", note: "旅行路线原型" },
      { label: "可以从这里聊起", title: "先做一个能现场演示的小版本", detail: "先挑一个旅行场景，在周末内连通输入、理解与路线展示。具体范围留给你们讨论。", source: "根据演示资料预写的交流建议", note: "一个场景，就可以开始" },
    ],
    [
      { label: "最近想做的东西", title: "让 AI 听懂日常的小念头", detail: "比起增加更多设置，小满更想让自然的一句话成为使用工具的起点。", source: "本人确认的项目意图 · 演示", note: "AI + 日常体验" },
      { label: "正在探索", title: "旅行，也可以不用做攻略", detail: "旅行助手从一句随口说出的需求生成路线。当前演示只描述这个想法，不代表实际产品已经上线。", source: "本人确认的想法摘要 · 演示", note: "把随口一说变成行程" },
      { label: "在意的细节", title: "少一些步骤，多一点顺手", detail: "小满希望把复杂的问题做成简单好用的界面，这是 TA 自己选择的贡献方向。", source: "本人确认的个人简介 · 演示", note: "自然的交互，清楚的反馈" },
      { label: "一个开场话题", title: "你最想让 AI 听懂哪句话？", detail: "这是一条可编辑的交流灵感，没有向任何人发送。", source: "预写的开场建议 · 演示", note: "从一个具体的小麻烦聊起" },
    ],
    [
      { label: "时间能不能碰上", title: "这个周末，两天一起投入", detail: "小满本次活动可投入周末两天。具体开始时间和时段仍需双方确认。", source: "本人确认的本次活动时间 · 演示", note: "周六 + 周日" },
      { label: "可以怎样分工", title: "TA 做界面，你们一起定体验", detail: "小满可以承担界面和地图交互，希望伙伴一起打通 AI 理解与规划。", source: "本次活动的贡献与需求 · 演示", note: "界面与地图交互" },
      { label: "本次共同目标", title: "完成一个能亲手试的小作品", detail: "先选择一个可演示的旅行场景，再确定你们各自负责的部分。这里是交流建议，不是替双方作出承诺。", source: "根据演示资料预写的建议", note: "从原型开始" },
      { label: "留给你们确认", title: "线下碰头，还是远程一起做？", detail: "演示资料只有上海这一城市信息，没有确认线下地点或远程安排，不替 TA 推断协作方式。", source: "尚未确认的信息", note: "聊一聊，才知道" },
    ],
  ] },
  { id: "zoe", name: "许知夏", english: "Zoe", image: "/avatars/avatar-3.jpg", role: "产品设计 · 细节观察者", city: "杭州", intro: "在意每一次点击，也在意屏幕另一边的人。", tags: ["Figma", "用户研究", "交互设计"], looking: "想和开发者一起把体验打磨好", chapters: [
    [
      { label: "最先值得认识的一面", title: "把模糊的点子，变成清楚的体验", detail: "知夏愿意负责用户研究、需求梳理与交互流程。TA 有从用户访谈到交互原型的经历。", source: "本人确认的技能与经历 · 演示", note: "用户研究 / Figma / 交互原型" },
      { label: "可以接上的一块", title: "你来实现，TA 把流程想细", detail: "知夏希望找到愿意共同打磨体验的开发者，把原型做成可用产品。", source: "本次活动合作意愿 · 演示", note: "正在寻找开发伙伴" },
      { label: "正在做的事", title: "给独居生活，多一点安心", detail: "做一个轻量的日常报平安工具，让一个人生活的人在需要时联系到信任的朋友。", source: "本人确认的想法摘要 · 演示", note: "日常报平安工具" },
      { label: "可以从这里聊起", title: "你身边的人，会怎么用它？", detail: "从一个具体使用者聊起，再讨论最小可行的流程。", source: "预写的开场建议 · 演示", note: "先理解真实需求" },
    ],
    [
      { label: "最在意的方向", title: "做一个真的有人会用的小产品", detail: "知夏关心独居者与朋友之间的日常联系，希望用轻量产品解决具体需求。", source: "本人确认的项目意图 · 演示", note: "日常陪伴" },
      { label: "想探索的场景", title: "一个人生活，也能被惦记", detail: "报平安工具围绕可信任的朋友展开，具体隐私流程需要后续产品讨论。", source: "本人确认的想法摘要 · 演示", note: "轻量、自然的联系" },
      { label: "能带来的视角", title: "先听听使用者怎么说", detail: "知夏有用户访谈与交互原型的经验，可协助在开工前确认问题。", source: "本人确认的经历 · 演示", note: "访谈到原型" },
      { label: "一个开场话题", title: "独居时，你最想解决什么？", detail: "这是一条预写的开场话题，没有发送给对方。", source: "交流建议 · 演示", note: "从生活里的小麻烦开始" },
    ],
    [
      { label: "时间能不能碰上", title: "本次活动，全程参与", detail: "知夏选择本次活动全程参与，具体碰头时间仍需交流确认。", source: "本人确认的本次活动时间 · 演示", note: "有时间一起试用和迭代" },
      { label: "可以怎样分工", title: "从需求梳理，到交互原型", detail: "知夏承担需求和交互，希望开发伙伴协助工程实现。", source: "本人确认的贡献方向 · 演示", note: "设计与工程互补" },
      { label: "可以一起尝试", title: "边做边试，把细节磨出来", detail: "一起试用原型、讨论并改进，是依据演示资料给出的协作建议。", source: "预写的协作建议 · 演示", note: "先走通一个核心流程" },
      { label: "留给你们确认", title: "第一次碰头，怎么安排？", detail: "当前没有已确认的地点、时段和远程方式，需双方沟通。", source: "尚未确认的信息", note: "聊一聊，才知道" },
    ],
  ] },
  { id: "keke", name: "唐可", english: "Keke", image: "/avatars/avatar-5.jpg", role: "创意开发 · 好奇心选手", city: "苏州", intro: "让代码有一点好玩，也有一点温度。", tags: ["Three.js", "Web", "互动体验"], looking: "想认识视觉设计和声音创作伙伴", chapters: [
    [
      { label: "最先值得认识的一面", title: "让想象变成可以触碰的作品", detail: "唐可有 Three.js 互动作品经验，想负责 Web 互动和动效。", source: "本人确认的技能与项目 · 演示", note: "Three.js / Web / 互动体验" },
      { label: "可以接上的一块", title: "你带来灵感，TA 让它动起来", detail: "唐可希望和视觉设计或声音创作伙伴一起探索表达。", source: "本次活动合作意愿 · 演示", note: "寻找视觉与声音伙伴" },
      { label: "正在做的事", title: "把城市里的声音，种成花园", detail: "收集风声、车流和街角日常，让每段声音长成可以触碰的小景观。", source: "本人确认的想法摘要 · 演示", note: "声音 × 互动" },
      { label: "可以从这里聊起", title: "一段声音，可以长成什么？", detail: "从一段真实声音和一个简单的交互变化开始。", source: "预写的开场建议 · 演示", note: "先做一个小实验" },
    ],
    [
      { label: "最感兴趣的方向", title: "让人愿意停一会儿的互动", detail: "唐可希望作品既有功能，也让人愿意停下来感受。", source: "本人确认的项目意图 · 演示", note: "声音、空间与互动" },
      { label: "想探索的素材", title: "街角的风，路过的声音", detail: "城市声音花园以日常环境的声音为素材。", source: "本人确认的想法摘要 · 演示", note: "城市里的日常" },
      { label: "想做的小实验", title: "用一个动作，改变一片景观", detail: "把输入与视觉响应连起来，是适合从原型开始的方向。", source: "根据演示资料预写的建议", note: "可触碰的 Web 作品" },
      { label: "一个开场话题", title: "你会为这座城留下哪段声音？", detail: "这是一条预写的交流建议，没有向任何人发送。", source: "交流建议 · 演示", note: "说说你听到的日常" },
    ],
    [
      { label: "时间能不能碰上", title: "两天活动，晚上也可以聊", detail: "唐可本次活动两天参与，愿意在晚上继续讨论。具体时段需双方确认。", source: "本人确认的本次活动时间 · 演示", note: "活动期间可投入" },
      { label: "可以怎样分工", title: "TA 来做 Web 互动和动效", detail: "伙伴可以带来视觉或声音想法，再共同确定作品形式。", source: "本人确认的贡献方向 · 演示", note: "工程与表达相接" },
      { label: "可以一起尝试", title: "边做边试，保留一点意外", detail: "这是根据作品方向给出的交流建议，不是对性格的判断。", source: "预写的协作建议 · 演示", note: "从一个可运行的小实验开始" },
      { label: "留给你们确认", title: "素材、设备和现场怎么准备？", detail: "当前资料没有确认设备与素材清单，需要双方讨论。", source: "尚未确认的信息", note: "开工前一起对齐" },
    ],
  ] },
];
