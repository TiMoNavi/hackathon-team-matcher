import type { Person } from './people';

export type ProfileDimension = {
  id: string;
  label: string;
  evidence: string;
  source: string;
  suggestion: string;
  confirm: string;
  pending?: boolean;
};

export function profileDimensions(person: Person): ProfileDimension[] {
  const c = person.chapters;
  return [
    {id:'contribution',label:'贡献能力',evidence:c[0][0].note,source:c[0][0].source,suggestion:c[2][1].title,confirm:'具体负责哪些功能、能交付到哪一步'},
    {id:'direction',label:'项目方向',evidence:c[0][2].note,source:c[0][2].source,suggestion:c[0][3].title,confirm:'你们是否愿意从同一个使用场景开始'},
    {id:'partner',label:'角色互补',evidence:c[0][1].note,source:c[0][1].source,suggestion:c[0][1].title,confirm:'你的贡献是否能接上 TA 当前的需要'},
    {id:'time',label:'投入时间',evidence:c[2][0].title,source:c[2][0].source,suggestion:'先对齐能一起动手的时段，再确定范围',confirm:'开始时间、共同在线时段与投入安排'},
    {id:'arrangement',label:'协作安排',evidence:c[2][3].title,source:c[2][3].source,suggestion:person.id==='keke'?'先说清素材和设备各自由谁准备':'先聊清碰头地点与远程协作方式',confirm:c[2][3].detail,pending:true},
  ];
}
