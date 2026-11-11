// Fictional data for one demo Space. No backend writes.
export const event = { id: 'weekend-builders-demo', name: '周末造物场', edition: '第 06 期', english: 'Weekend builders', date: '2026 年 11 月 14–15 日', place: '杭州 · 创意工坊', timezone: 'Asia/Shanghai', description: '带上一个想法，遇见一群愿意一起做的人。' };
export type Person = { id: number; name: string; role: string; avatar: number; skills: string[]; intro: string; looking: string };
export const people: Person[] = [
 { id: 1, name: '林小满', role: '前端开发', avatar: 1, skills: ['React', '交互实现'], intro: '想把有意思的点子，做成可以摸到的产品。', looking: '想认识对 AI 产品感兴趣的搭档' },
 { id: 2, name: '陈序', role: 'AI 工程师', avatar: 2, skills: ['Python', 'LLM'], intro: '最近在研究怎样让 AI 真正帮到日常生活。', looking: '期待设计和前端伙伴一起做原型' },
 { id: 3, name: '许知夏', role: '产品设计', avatar: 3, skills: ['Figma', '用户体验'], intro: '喜欢简单、好用，又有一点惊喜的东西。', looking: '想一起做一个有温度的小工具' },
 { id: 4, name: '周一舟', role: '全栈开发', avatar: 4, skills: ['TypeScript', 'Node.js'], intro: '从第一个 commit 到第一个用户，都想参与。', looking: '愿意帮有趣的想法跑起来' },
 { id: 5, name: '唐可', role: '创意开发', avatar: 5, skills: ['WebGL', '创意编程'], intro: '一边写代码，一边发现新的玩法。', looking: '想做点好玩的视觉交互' },
 { id: 6, name: '宋言', role: '产品策划', avatar: 6, skills: ['产品设计', '内容'], intro: '把模糊的灵感，变成一件件能完成的小事。', looking: '对城市、生活与开源项目感兴趣' },
];
export const self: Person = { id: 0, name: '我', role: '活动参与者', avatar: 7, skills: [], intro: '这是你在活动中的演示身份。', looking: '还没有填写本场合作意向' };
export function getPerson(id: number) { return id === 0 ? self : people.find(p => p.id === id); }
export function profileHref(id: number) { return '/people/' + id; }
export const categories = ['全部', '找队友', '项目进展', '提问交流', '资源分享'] as const;
export type Category = typeof categories[number];
export type ReplyContext = { id: string; authorId: number; message: string };
export type Comment = { id: string; authorId: number; message: string; time: string; replyTo?: ReplyContext };
export type Post = { id: string; authorId: number; category: Exclude<Category,'全部'>; message: string; time: string; likes: number; image?: string; imageAlt?: string; comments: Comment[] };
export const initialPosts: Post[] = [
 {id:'p1',authorId:1,category:'找队友',time:'14:12',message:'想做一个「散步盲盒」：选一个心情，就生成一条城市漫游路线。前端原型已经搭好啦，还差一位懂推荐或地图的伙伴。这个周末，有人想一起把它做出来吗？',likes:8,comments:[{id:'c1',authorId:2,time:'14:18',message:'这个方向好有意思！我对路线推荐挺感兴趣，可以一起聊聊。'},{id:'c2',authorId:3,time:'14:22',message:'我可以帮忙看看选心情的交互～'}]},
 {id:'p2',authorId:3,category:'项目进展',time:'13:48',message:'从一张草图，到第一个能点的原型。上午还在纠结方向，下午已经开始分工了。和同频的人一起做东西，真的会快一点。',likes:12,image:'/photos/collaboration.jpg',imageAlt:'电脑与协作讨论，演示氛围素材',comments:[{id:'c3',authorId:4,time:'14:02',message:'先做一个小版本，跑起来再说。期待明天的分享！'}]},
 {id:'p3',authorId:4,category:'资源分享',time:'13:20',message:'把今天用到的原型开发清单整理好了：先确认一个具体用户、一个核心问题，再画出最短的使用路径。需要一起梳理 MVP 的伙伴，可以在这里留言。',likes:5,comments:[]},
 {id:'p4',authorId:5,category:'提问交流',time:'12:46',message:'大家会怎么做一个让人愿意每天打开的小工具？想听听你们最近遇到的、有意思的产品体验。',likes:3,comments:[{id:'c4',authorId:6,time:'13:10',message:'我会先想它能不能帮我省下一个重复的小麻烦。'}]},
];
export const gallery = [
 {id:'g1',src:'/photos/collaboration.jpg',title:'好点子，围坐着就发生了',subtitle:'把想法摊开，一起找到第一步',category:'一起创造',alt:'多人围绕摆有笔记本电脑的桌面协作'},
 {id:'g2',src:'/photos/workshop.jpg',title:'从陌生，到一起开工',subtitle:'不同的技能，同一个好奇心',category:'认识彼此',alt:'团队围坐在桌旁交流'},
 {id:'g3',src:'/photos/stage.jpg',title:'让每一个想法被看见',subtitle:'分享，也是一种新的开始',category:'灵感现场',alt:'活动场地与布置'},
 {id:'g4',src:'/photos/conversation.jpg',title:'最好的搭档，就在身边',subtitle:'认真听，也大胆地说',category:'认识彼此',alt:'伙伴在办公空间协作讨论'},
 {id:'g5',src:'/photos/coffee.jpg',title:'灵感也需要一杯咖啡',subtitle:'休息一下，再继续创造',category:'片刻休息',alt:'咖啡空间的环境'},
];
export type ScheduleItem={id:string;day:number;time:string;end:string;title:string;description:string;location:string;type:'交流'|'创作'|'分享'|'休息';host:string};
export const schedule:ScheduleItem[]=[
 {id:'s1',day:14,time:'09:30',end:'10:00',title:'签到，喝杯咖啡认识一下',description:'领取活动贴纸，写下你的名字、技能和今天想做的事。慢慢认识身边的伙伴。',location:'一楼 · 迎新区',type:'交流',host:'造物场组织小队'},
 {id:'s2',day:14,time:'10:00',end:'11:00',title:'把你的想法带上台',description:'每个人用三分钟分享一个想法。可以是一个难题，也可以是一个还没想明白的脑洞。',location:'一楼 · 分享区',type:'分享',host:'造物场组织小队'},
 {id:'s3',day:14,time:'11:00',end:'12:00',title:'遇见伙伴，自由组队',description:'围绕感兴趣的方向交流，聊聊各自的技能和投入时间，自主决定是否一起合作。',location:'一楼 · 开放区',type:'交流',host:'所有参与者'},
 {id:'s4',day:14,time:'13:30',end:'17:30',title:'一起动手，让想法发生',description:'从最小的版本开始。写第一行代码、画第一张草图、找到第一个使用场景。需要帮助时，随时到交流区找伙伴。',location:'二楼 · 共创空间',type:'创作',host:'各共创小队'},
 {id:'s5',day:14,time:'17:30',end:'18:00',title:'今天，做出了什么？',description:'轻松分享今天的进展、卡住的地方，以及明天准备迈出的下一步。',location:'一楼 · 分享区',type:'分享',host:'所有参与者'},
 {id:'s6',day:15,time:'09:30',end:'12:00',title:'继续打磨，让作品更进一步',description:'根据昨天的反馈完善原型。把核心流程走通，也给演示留一点时间。',location:'二楼 · 共创空间',type:'创作',host:'各共创小队'},
 {id:'s7',day:15,time:'13:30',end:'15:30',title:'作品见面会',description:'分享你们做出的作品、为什么想做它，以及这两天学到了什么。每一个认真完成的小版本都值得被看见。',location:'一楼 · 分享区',type:'分享',host:'所有共创小队'},
 {id:'s8',day:15,time:'15:30',end:'16:30',title:'合影，把故事继续下去',description:'留下一张合照，交换后续计划。这个周末结束了，一起创造的故事还可以继续。',location:'一楼 · 开放区',type:'交流',host:'造物场组织小队'},
];
