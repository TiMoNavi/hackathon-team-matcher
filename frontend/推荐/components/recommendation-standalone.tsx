import { ArrowUpRight } from 'lucide-react';
import { Brand } from './brand';

export function RecommendationStandalone() {
  return <div className="recommendation-runtime"><main className="runtime-standalone"><Brand /><h1>需要从同源应用入口打开</h1><p>这个 4203 独立页面没有 HumHub 登录会话与服务端当前活动。请从已登录的应用「发现伙伴」入口继续。</p><p>正式页面使用同源 <code>/matcher/app/discover</code>，普通发现不调用 AI。本预览不会向其他端口发送凭据或读取浏览器令牌。</p><a className="runtime-demo-link" href="/demo">查看独立交互演示<ArrowUpRight size={16} /></a><p>演示中的人物、经历与助手回复均为预写样本，不代表真实服务已接通。</p></main></div>;
}
