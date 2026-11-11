// Fictional local presentation fixtures. Keys/value shapes follow FieldCatalog.php.
// These are not API responses and do not implement an authorization layer.
export type Scenario = 'full' | 'sparse' | 'long' | 'no-photo';
export type SectionId = 'capabilities' | 'experience' | 'collaboration' | 'commitment';
export type Detail = { eyebrow: string; title: string; body: string; tags?: string[]; field?: string };
type PartialDate = { value: string; precision: 'year' | 'month' | 'day' };
type LabelValue = { code: string; label: string; note?: string; self_level?: 'learning' | 'working' | 'proficient' | 'expert' };
type ProjectValue = { title: string; role: string; contribution: string; tech_codes: string[]; outcome: string; start: PartialDate; end?: PartialDate; links?: string[] };
export type FieldValue = string | LabelValue | { codes: string[]; free_text?: string } | { role_codes?: string[]; skill_codes?: string[]; free_text?: string } | { traits: string[]; self_description?: string } | { code: string; self_level?: string } | { school: string; major?: string; degree?: string; start?: PartialDate; end?: PartialDate } | ProjectValue | { organization: string; role?: string; summary?: string; start?: PartialDate; end?: PartialDate } | { title: string; issuer?: string; date?: PartialDate; description?: string } | { hours_min: number; hours_max: number; period: 'week' | 'day' | 'event'; note?: string } | { starts_at: string; ends_at: string; timezone: string } | { mode: 'online' | 'onsite' | 'hybrid'; note?: string } | { location_label: string; note?: string };
export type ProfileEntry = { id: string; field: string; scope: 'global' | 'event'; value: FieldValue; label: string; short: string; detail: string; section: SectionId; tone?: 'violet' | 'lime' };
const global = (entry: Omit<ProfileEntry, 'scope'>): ProfileEntry => ({ ...entry, scope: 'global' });
const space = (entry: Omit<ProfileEntry, 'scope' | 'section'>): ProfileEntry => ({ ...entry, scope: 'event', section: 'commitment' });
export const identity = { nickname: '林知夏', avatar_ref: '/images/portrait.jpg', headline: '产品设计师 / 创意前端' };
export const entries: ProfileEntry[] = [
  global({ id:'skill-design', field:'skill', label:'技能', short:'交互设计 · 熟练', value:{ code:'interaction_design',label:'交互设计',self_level:'proficient' }, detail:'交互设计，熟练（本人自评）。主要负责用户路径、信息架构与高保真原型。', section:'capabilities', tone:'violet' }),
  global({ id:'direction-ai', field:'direction', label:'方向', short:'AI 应用 × 创意工具', value:{ code:'ai_application',label:'AI 应用',note:'关注创意工具' }, detail:'希望探索 AI 应用在创意工具里的具体用途。', section:'capabilities' }),
  space({ id:'event-seeking', field:'event_seeking', label:'本次寻找', short:'全栈伙伴，一起做出第一版', value:{role_codes:['fullstack'],skill_codes:[],free_text:'一起完成可体验原型'}, detail:'在周末造物场寻找一位全栈伙伴，协作完成漫游地图的可体验原型。', tone:'lime' }),
  global({ id:'project-roam', field:'project', label:'项目', short:'漫游地图 · 产品与交互原型', value:{ title:'漫游地图',role:'产品 / 交互设计',contribution:'用户路径、地图交互与前端原型',tech_codes:['react','figma'],outcome:'完成地点收藏与路线预览原型',start:{value:'2026-09',precision:'month'} }, detail:'把零散收藏的地点组织成半日路线。负责用户路径、地图交互与前端原型；已完成地点收藏与路线预览，地图服务接入仍待协作。', section:'experience', tone:'violet' }),
  space({ id:'event-time', field:'event_time_commitment', label:'本次投入', short:'每周 8–12 小时', value:{hours_min:8,hours_max:12,period:'week'}, detail:'本次活动每周预计投入 8–12 小时。时间为本人填写，具体同步时段另行约定。' }),
  global({ id:'collab', field:'collaboration_preference', label:'协作', short:'小步原型，异步推进', value:{codes:['async','prototype_first'],free_text:'先做原型，再按反馈迭代'}, detail:'偏好异步推进，把分歧落到原型上，每次讨论确定下一步。', section:'collaboration' }),
  global({ id:'skill-react', field:'skill', label:'技能', short:'React / TypeScript · 可独立完成', value:{code:'react',label:'React / TypeScript',self_level:'working'}, detail:'React / TypeScript，可独立完成（本人自评）。能实现页面与交互原型，复杂服务端能力需要队友支持。', section:'capabilities' }),
  global({ id:'school', field:'education', label:'教育', short:'江南设计学院 · 交互设计', value:{school:'江南设计学院（虚构）',major:'交互设计',degree:'本科',start:{value:'2020',precision:'year'},end:{value:'2024',precision:'year'}}, detail:'江南设计学院（虚构），交互设计本科，2020–2024。此条为选中的教育记录演示。', section:'experience' }),
  global({ id:'city',field:'city',label:'坐标',short:'杭州',value:'杭州',detail:'常驻杭州。',section:'collaboration' }),
  global({ id:'skill-figma',field:'skill',label:'技能',short:'Figma · 熟练',value:{code:'figma',label:'Figma',self_level:'proficient'},detail:'Figma，熟练（本人自评）。用于界面设计、组件整理与交互原型。',section:'capabilities',tone:'violet' }),
  space({ id:'event-goal',field:'event_goal',label:'活动目标',short:'完成一条可走通的城市路线',value:{codes:['build_prototype'],free_text:'完成漫游地图可体验原型'},detail:'在周末造物场完成漫游地图的可体验原型，先验证地点收藏到路线预览的完整路径。' }),
  global({ id:'interest-tools',field:'interest',label:'兴趣',short:'独立产品 / 城市探索',value:{code:'indie_product',label:'独立产品',note:'关注城市探索工具'},detail:'关注有清晰使用场景的独立产品，也对城市探索工具感兴趣。',section:'capabilities' }),
  global({ id:'communication',field:'communication_preference',label:'沟通',short:'文字先行，每次讨论有结论',value:{codes:['written_first','short_sync'],free_text:'提前写清问题，短会确认决策'},detail:'先用文字描述问题，必要时开短会，讨论结束后记录决定和各自要做的事。',section:'collaboration' }),
  space({ id:'event-role',field:'event_role',label:'活动角色',short:'产品设计 / 前端原型',value:{code:'product_design',label:'产品设计',note:'兼顾前端原型'},detail:'本次活动愿意承担产品设计和前端原型实现。',tone:'violet' }),
  global({ id:'project-spark',field:'project',label:'项目',short:'一闪 · 灵感收集工具',value:{title:'一闪',role:'交互设计',contribution:'记录流程与回看页面',tech_codes:['figma','react'],outcome:'完成交互验证原型',start:{value:'2026-06',precision:'month'},end:{value:'2026-08',precision:'month'}},detail:'让截图、短句与语音留在一个轻量收集工具里。负责记录流程和回看页面，已完成交互验证原型；未提供公开上线链接。',section:'experience' }),
  global({ id:'seeking',field:'seeking',label:'长期寻找',short:'愿意一起做小产品的伙伴',value:'寻找愿意长期一起做小产品的共创伙伴',detail:'寻找愿意长期一起做小产品的伙伴。这个偏好属于全局资料，与本次活动的全栈需求分别展示。',section:'collaboration',tone:'lime' }),
  space({ id:'event-contribution',field:'event_contribution',label:'可以贡献',short:'需求梳理 → 设计 → 前端原型',value:{skill_codes:['interaction_design','react'],free_text:'需求梳理、界面设计与前端原型'},detail:'本次可贡献需求梳理、界面设计、可点击高保真原型与关键前端页面。' }),
  global({ id:'role',field:'role',label:'角色',short:'产品设计师 / 创作者',value:{code:'product_designer',label:'产品设计师',note:'独立创作'},detail:'主要角色为产品设计师，也参与独立产品创作。',section:'capabilities' }),
  space({ id:'event-mode',field:'event_collaboration_mode',label:'协作方式',short:'线上为主，也可以杭州见面',value:{mode:'hybrid',note:'线上为主，杭州可线下'},detail:'本次活动采用混合协作，平时线上推进，杭州可以安排线下讨论。' }),
  global({ id:'skill-research',field:'skill',label:'技能',short:'用户访谈 · 可独立完成',value:{code:'user_research',label:'用户访谈',self_level:'working'},detail:'用户访谈，可独立完成（本人自评）。能够准备访谈提纲、整理问题与验证交互方案。',section:'capabilities' }),
  space({ id:'event-availability',field:'event_availability',label:'可用时段',short:'周六 14:00–18:00 · UTC+8',value:{starts_at:'2026-11-14T14:00:00+08:00',ends_at:'2026-11-14T18:00:00+08:00',timezone:'Asia/Shanghai'},detail:'本次可用时段：2026 年 11 月 14 日（周六）14:00–18:00，Asia/Shanghai。其他时间需要再确认。' }),
  global({ id:'award',field:'award',label:'奖项',short:'创意工具挑战 · 最佳交互',value:{title:'最佳交互',issuer:'创意工具挑战（虚构）',date:{value:'2025-10',precision:'month'},description:'演示奖项记录'},detail:'2025.10，创意工具挑战（虚构）最佳交互奖。仅用于展示奖项字段的呈现方式。',section:'experience' }),
  global({ id:'language',field:'language',label:'语言',short:'中文 · 母语',value:{code:'zh',self_level:'native'},detail:'中文为主要沟通语言。',section:'collaboration' }),
  global({ id:'language-en',field:'language',label:'语言',short:'英文 · 工作交流',value:{code:'en',self_level:'working'},detail:'英文，可进行工作交流（本人自评）。',section:'collaboration' }),
  global({ id:'timezone',field:'timezone',label:'时区',short:'Asia/Shanghai · UTC+8',value:'Asia/Shanghai',detail:'当前时区为 Asia/Shanghai。活动可用时段按该时区展示。',section:'collaboration' }),
  global({ id:'headline',field:'headline',label:'一句话介绍',short:identity.headline,value:identity.headline,detail:identity.headline,section:'capabilities' }),
  space({ id:'event-presence',field:'event_presence',label:'活动地点',short:'杭州 · 可参加线下讨论',value:{location_label:'杭州',note:'具体场地另行约定'},detail:'本次可在杭州参加线下讨论，具体场地另行约定。' }),
  space({ id:'event-contact',field:'event_contact_preference',label:'联系偏好',short:'先站内聊，再约讨论',value:{codes:['in_app_first'],free_text:'先通过站内沟通确认主题'},detail:'希望先通过站内沟通确认共同话题，再约时间讨论；此条是偏好，不是联系方式授权。' }),
  space({ id:'event-constraint',field:'event_constraint',label:'本次限制',short:'工作日晚间不安排长会',value:'工作日晚间不安排超过 30 分钟的会议',detail:'工作日晚间不安排超过 30 分钟的会议。尚未填写其他固定可用时段。' }),
];
export const heroPool = entries.filter(entry => !['timezone','headline','language-en','event-contact'].includes(entry.id));
export const sparseIds = new Set(['skill-design','city','headline']);
export function visibleEntries(sparse: boolean) { return sparse ? entries.filter(e => sparseIds.has(e.id)) : entries; }
export function toDetail(entry: ProfileEntry): Detail { return { eyebrow:(entry.scope === 'event' ? '本次活动' : '全局资料') + ' · ' + entry.label,title:entry.short,body:entry.detail,field:entry.field,tags:[entry.scope === 'event' ? '周末造物场' : '长期资料','虚构演示条目'] }; }
export const ideas = [
 { id:'roam',name:'漫游地图',category:'城市探索 × AI',description:'把收藏夹里的地点，变成这个周末的一条小路线。',detail:'在周末造物场发布的想法演示。先做一座城市、一条路线，验证从地点收藏到出发的完整路径。希望找到熟悉地图服务与全栈开发的共创伙伴。',tags:['发起的想法','寻找共创伙伴'],accent:'roam',event:'周末造物场'},
 { id:'spark',name:'一闪 · 灵感收集',category:'创意工具',description:'让散落的截图、短句和声音，留在一个顺手的小工具里。',detail:'在周末造物场参与的想法演示。讨论轻量记录和回看流程，目前处于交互方案阶段。此处仅展示对观看者可见的关系。',tags:['参与的想法','交互讨论中'],accent:'spark',event:'周末造物场'},
];
export const activities = [
 {id:'weekend',title:'周末造物场',status:'ongoing' as const,date:'2026.11.10 — 11.16',shortDate:'NOV 2026',place:'杭州 / 线上',role:'产品设计 · 前端原型',detail:'当前活动关系演示。本次希望完成漫游地图的可体验原型，可投入每周 8–12 小时。'},
 {id:'aidesign',title:'AI × Design 共创日',status:'past' as const,date:'2026.10.18',shortDate:'OCT 2026',place:'上海',role:'交互设计',detail:'历史布局预览：完成灵感收集工具的交互原型。当前后端关系接口仅支持当前活动，此条不表示已提供跨活动历史接口。'},
 {id:'summer',title:'夏日独立开发者聚会',status:'past' as const,date:'2026.08.23',shortDate:'AUG 2026',place:'杭州',role:'作品分享',detail:'历史布局预览：分享早期原型并收集使用反馈。此条为独立视觉演示。'},
];
