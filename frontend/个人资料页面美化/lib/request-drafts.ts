import type { ProfileEntry } from '@/lib/profile-data';
export type Viewer='developer'|'designer'|'guest';
export type RequestTone='friendly'|'short'|'specific';
// Prewritten local examples, never a live AI response. Only visible entry IDs
// are used; private values and contact fields cannot enter this draft builder.
export function requestVariants(viewer:Viewer,entries:ProfileEntry[]){
 const has=(id:string)=>entries.some(e=>e.id===id);
 const intro=viewer==='developer'?'我做全栈开发':viewer==='designer'?'我也做产品设计':'我对一起做小产品很感兴趣';
 const subject=has('project-roam')?'你在做的漫游地图':has('skill-design')?'你的交互设计经验':'你分享的资料';
 const goal=has('project-roam')?(viewer==='developer'?'地图服务接入与原型实现可以怎样分工':viewer==='designer'?'一起验证地图里的关键用户路径':'这个想法接下来最想推进的部分'):'我们各自感兴趣的方向';
 return [
  {id:'friendly' as const,label:'自然一点',body:'你好，知夏！'+intro+'，看了'+subject+'，觉得很有意思。想加个好友，聊聊'+goal+'，看看有没有一起做点什么的机会。'},
  {id:'short' as const,label:'简短一点',body:'你好，知夏！'+intro+'，对'+subject+'很感兴趣。方便加个好友，交流一下吗？'},
  {id:'specific' as const,label:'具体一点',body:'你好，知夏！'+intro+'。想从'+subject+'聊起，重点讨论'+goal+'。如果你也感兴趣，希望先加个好友，再约一次简短交流。'},
 ];
}
