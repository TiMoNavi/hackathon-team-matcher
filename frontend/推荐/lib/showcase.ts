import type { Person } from './people';

export type ShowcaseItem = { id: string; kind: string; title: string; subtitle: string; description: string; art: 'route' | 'interface' | 'sound' | 'notes' | 'care' | 'experiment'; tags: string[]; source: string };
export function showcaseFor(person: Person): ShowcaseItem[] {
  const design = person.id === 'zoe', creative = person.id === 'keke';
  return [
    { id: 'main', kind: '正在做的项目', title: design ? '给独居生活，多一点安心' : creative ? '把城市声音，种成花园' : '让一句碎碎念，变成一段旅程', subtitle: design ? '小小的报平安工具' : creative ? '声音 × 互动体验' : 'AI + 旅行助手', description: person.chapters[0][2].detail, art: design ? 'care' : creative ? 'sound' : 'route', tags: person.tags.slice(0, 2), source: '本人确认的项目摘要 · 演示' },
    { id: 'craft', kind: '拿手的那部分', title: design ? '从用户访谈，走到交互原型' : creative ? '把看不见的声音，做成可触碰的景观' : '不只把页面画出来，也让它顺手', subtitle: design ? '需求 → 流程 → Figma' : creative ? 'Three.js / Web' : 'React / TypeScript', description: person.chapters[0][0].detail, art: design ? 'notes' : creative ? 'experiment' : 'interface', tags: [person.tags[0], '交互原型'], source: '本人确认的贡献方向 · 演示' },
    { id: 'idea', kind: '脑子里的小想法', title: person.chapters[1][0].title, subtitle: '最近会让 TA 眼睛发亮的事', description: person.chapters[1][0].detail, art: 'notes', tags: ['好奇心', '先做一个小版本'], source: '本人确认的项目意图 · 演示' },
    { id: 'collab', kind: '想遇见的伙伴', title: person.chapters[0][1].title, subtitle: person.looking, description: person.chapters[0][1].detail, art: 'experiment', tags: ['一起试试看', '能力互补'], source: '本次活动的合作意愿 · 演示' },
    { id: 'time', kind: '生活与协作节奏', title: person.chapters[2][0].title, subtitle: person.city + ' · 周末造物场', description: person.chapters[2][0].detail, art: 'care', tags: ['可投入时间', '具体时段再聊'], source: '本人确认的活动安排 · 演示' },
    { id: 'opener', kind: '从这句话聊起', title: person.chapters[1][3].title, subtitle: '不必先想好一段正式的自我介绍', description: person.chapters[1][3].detail, art: 'sound', tags: ['交流灵感', '一个小问题'], source: '预写交流建议 · 演示' },
  ];
}
export function hangingFor(person: Person) {
  return [
    { text: person.city, icon: 'place', detail: '目前在' + person.city + '，具体协作地点还需要你们确认。' },
    { text: person.tags[0], icon: 'code', detail: person.chapters[0][0].detail },
    { text: person.id === 'zoe' ? '认真打磨体验' : person.id === 'keke' ? '想让代码好玩' : '想把 AI 用进生活', icon: 'spark', detail: person.intro },
    { text: person.id === 'zoe' ? '全程参与' : '周末可以一起做', icon: 'clock', detail: person.chapters[2][0].detail },
    { text: '先做个小作品', icon: 'leaf', detail: person.chapters[0][3].detail },
  ];
}
