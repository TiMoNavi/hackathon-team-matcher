import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Bell, Bookmark, Check, CheckCheck, ChevronDown, Compass, Flower2, Heart, LayoutGrid, MapPin, MessageCircle, Moon, Plus, Search, SlidersHorizontal, Sparkles, Sun, Users, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { ProgressTracker } from '@/components/affectui/progress-tracker'
import data from './demo-data.json'

type Member = typeof data.members[number]
const roles = ['全部', '前端', '后端', '设计', '产品']
const navItems = [{ label: '发现', icon: Compass }, { label: '广场', icon: LayoutGrid }, { label: '消息', icon: MessageCircle }, { label: '个人', icon: Users }]

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={'brand ' + (compact ? 'brand-compact' : '')}><span className="brand-mark"><Flower2 size={24} strokeWidth={1.7} /></span><span>同频<span className="brand-en">CoLab</span></span></div>
}

function Avatar({ member, large = false }: { member: Member; large?: boolean }) {
  return <div className={'member-avatar avatar-' + member.color + (large ? ' avatar-large' : '')} aria-hidden="true"><span>{member.initial}</span><span className="avatar-online" /></div>
}

export default function App() {
  const [role, setRole] = useState('全部')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Member | null>(null)
  const [following, setFollowing] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [dark, setDark] = useState(false)
  const [savedIdeas, setSavedIdeas] = useState<number[]>([])
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(''), 4200); return () => clearTimeout(id) }, [notice])
  const members = useMemo(() => data.members.filter(member => (role === '全部' || member.role === role) && (member.name + ' ' + member.skills.join(' ') + ' ' + member.headline).toLowerCase().includes(query.trim().toLowerCase())), [role, query])
  const toggleFollow = (id: string) => setFollowing(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const navAction = (label: string) => {
    if (label === '发现') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    if (label === '广场') { document.getElementById('ideas')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    if (label === '个人') { setSelected(data.members[0]); return }
    setNotice('消息入口交互演示 · 暂未连接真实会话')
  }
  const clearFilters = () => { setRole('全部'); setQuery('') }

  return <div className="app-shell">
    <aside className="desktop-sidebar" aria-label="主导航">
      <Brand />
      <div className="workspace-switch"><span className="workspace-icon">A</span><span><strong>AI 创造者周末</strong><small>你的活动空间</small></span><ChevronDown size={15} /></div>
      <div className="nav-caption">一起创造点什么</div>
      <nav className="sidebar-nav">{navItems.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => navAction(label)} className={'nav-item ' + (label === '发现' ? 'active' : '')} aria-current={label === '发现' ? 'page' : undefined}><Icon size={19} strokeWidth={1.8} /><span>{label}</span>{label === '消息' && <span className="nav-unread">3</span>}{label === '发现' && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="invitation-note"><span className="note-spark"><Sparkles size={20} /></span><strong>好搭档，值得一起遇见</strong><p>把这场周末的灵感之旅，<br />分享给同样热爱创造的人。</p><button onClick={() => setNotice('邀请功能演示 · 未发送邀请')}>邀请朋友 <ArrowUpRight size={14} /></button></div><div className="sidebar-user"><div className="self-avatar">林</div><span><strong>林舟</strong><small>让想法发生</small></span><button aria-label="切换深浅色" onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></div></div>
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="mobile-brand"><Brand compact /></div><div className="breadcrumb"><span>我的空间</span><span className="breadcrumb-slash">/</span><strong>发现同频的人</strong></div><div className="topbar-actions"><span className="live-pill"><span />{data.event.phase}</span><button className="icon-button" aria-label="查看通知" onClick={() => setNotice('你有 3 条演示通知，真实通知尚未接入')}><Bell size={19} /><i /></button><div className="topbar-avatar">林</div></div></header>
      <main className="page-main">
        <div className="page-heading"><div><div className="eyebrow"><span className="small-line" />MEET YOUR NEXT CO-CREATOR</div><h1>发现<span className="heading-dot">.</span></h1><p>你缺的那个拼图，也许就在这里。</p></div><span className="route-badge"><span />React 前端插件验证</span></div>

        <section className="hero-panel" aria-label="活动概览"><div className="hero-copy"><div className="hero-kicker"><span className="status-indicator" />{data.event.name}<span className="tiny-divider" />11.14 — 11.15</div><h2>找到与你<br /><span>同频的队友</span><span className="hero-star">✳</span></h2><p>{data.subtitle}</p><div className="hero-meta"><MapPin size={14} /><span>{data.event.city}</span><span className="hero-meta-line" />从相遇，到一起创造</div></div><div className="orbit-scene" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orb-core"><Flower2 size={68} strokeWidth={1} /></div><span className="floating-chip chip-design">✦ 灵感碰撞</span><span className="floating-chip chip-code">&lt;/&gt; 一起实现</span><span className="orbit-person person-a">林</span><span className="orbit-person person-b">许</span><span className="orbit-dot dot-a" /><span className="orbit-dot dot-b" /></div><div className="hero-stats"><div><strong>{data.event.participants}<span>位</span></strong><small>参与者已就位</small></div><div><strong>{data.event.ideas}<span>个</span></strong><small>开放中的想法</small></div><div><strong>{data.event.teams}<span>支</span></strong><small>队伍正在组建</small></div><a href="#members" aria-label="发现活动成员"><ArrowDown size={19} /></a></div></section>

        <div className="main-grid"><div className="discovery-main">
          <section id="members" className="members-section" aria-labelledby="members-title"><div className="section-heading"><div><h2 id="members-title">也许，你们正好同频 <span className="count-pill">{data.members.length}</span></h2><p>一个想法的下一步，从认识一个人开始。</p></div><span className="sort-label"><SlidersHorizontal size={14} />为你推荐</span></div>
            <div className="filter-toolbar"><div className="role-filter" aria-label="筛选成员角色">{roles.map(item => <button type="button" key={item} data-role-filter={item} aria-pressed={role === item} className={role === item ? 'selected' : ''} onClick={() => setRole(item)}>{item}</button>)}</div><label className="member-search"><Search size={17} /><input data-testid="member-search" aria-label="搜索姓名或技能" placeholder="搜索姓名或技能" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="清除搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label></div>
            <div className="results-note" aria-live="polite">当前活动中找到 <strong>{members.length}</strong> 位成员{(query || role !== '全部') && <button onClick={clearFilters}>重置筛选</button>}</div>
            <div className="members-grid">{members.map(member => <Card key={member.id} data-testid="member-card" data-member-id={member.id} className="member-card"><div className="card-top"><Avatar member={member} /><div className="member-identity"><h3>{member.name}<span className="verified-mark"><Check size={9} strokeWidth={3} /></span></h3><span className="role-text">{member.role}<span> · </span>创造者</span></div><div className="match-indicator"><Sparkles size={12} /><strong>{member.match}%</strong><small>同频</small></div></div><p className="member-headline">{member.headline}</p><div className="skill-tags">{member.skills.map(skill => <span key={skill}>{skill}</span>)}</div><div className="member-status"><span />{member.availability}</div><div className="member-card-actions"><Button variant="outline" className="detail-button" data-testid={'member-details-' + member.id} onClick={() => setSelected(member)} aria-label={'查看' + member.name + '的详情'}>查看详情 <ArrowUpRight size={14} /></Button><Button variant="ghost" className={'follow-button ' + (following.includes(member.id) ? 'is-followed' : '')} data-testid={'member-follow-' + member.id} aria-label={(following.includes(member.id) ? '取消关注' : '关注') + member.name} aria-pressed={following.includes(member.id)} onClick={() => toggleFollow(member.id)}>{following.includes(member.id) ? <CheckCheck size={16} /> : <Plus size={16} />}{following.includes(member.id) ? '已关注' : '关注'}</Button></div></Card>)}</div>
            {members.length === 0 && <div className="empty-state"><Search size={29} /><h3>暂时没有找到这样的搭档</h3><p>换个关键词，或看看其他角色的创造者。</p><Button variant="outline" onClick={clearFilters}>重置筛选</Button></div>}
          </section>
          <section id="ideas" className="ideas-section" aria-labelledby="ideas-title"><div className="section-heading"><div><h2 id="ideas-title">让想法，找到同行的人</h2><p>还有这些小小的开始，正在等待你的加入。</p></div><span className="ideas-count">02 <ArrowUpRight size={16} /></span></div><div className="ideas-grid">{data.ideas.map((idea, index) => <Card key={idea.title} className={'idea-card idea-' + index}><div className="idea-top"><span className="idea-symbol">{index ? '✺' : '↗'}</span><span className="idea-category">{idea.category}</span><button aria-label={(savedIdeas.includes(index) ? '取消收藏' : '收藏') + idea.title} onClick={() => setSavedIdeas(current => current.includes(index) ? current.filter(id => id !== index) : [...current, index])}><Bookmark size={17} fill={savedIdeas.includes(index) ? 'currentColor' : 'none'} /></button></div><h3>{idea.title}</h3><p>{idea.description}</p><div className="idea-footer"><span><span className="tiny-avatar">{index ? '周' : '许'}</span>{idea.lookingFor}</span><button aria-label={'查看想法：' + idea.title} onClick={() => setNotice('想法详情演示：' + idea.description)}><ArrowRight size={16} /></button></div></Card>)}</div></section>
        </div>
        <aside className="right-rail" aria-label="活动帮助与动态"><div className="readiness-panel"><div className="rail-overline"><span className="rail-icon"><Sparkles size={15} /></span>为相遇，做一点准备</div><ProgressTracker className="colab-readiness" title="你的组队准备" steps={[{ id: 'profile', label: '展示你的技能与热爱', done: true }, { id: 'people', label: '认识一位同频的伙伴', done: false }, { id: 'idea', label: '找到想一起做的事', done: false }]} onChange={() => {}} /><p className="readiness-hint">每一个小动作，都让合作更近一步。<br /><span>此处进度只在本次演示中保留。</span></p></div><div className="event-timeline"><div className="rail-title"><h3>这个周末，一起发生</h3><span>活动日程</span></div><ol><li className="current"><span className="timeline-node" /><div><small>现在 · 正在进行</small><h4>遇见伙伴，自由组队</h4><p>认识彼此，让想法开始生长</p></div></li><li><span className="timeline-node" /><div><small>周六 10:00</small><h4>灵感启动，把想法落地</h4><p>从一张草图到第一个原型</p></div></li><li><span className="timeline-node" /><div><small>周日 16:00</small><h4>分享成果，一起庆祝</h4><p>每一个认真创造的人都值得被看见</p></div></li></ol><span className="schedule-note">演示日程 · 非实际活动安排</span></div><div className="community-note"><Heart size={21} strokeWidth={1.3} /><blockquote>好的合作，<br />始于对彼此的好奇。</blockquote><span>STAY CURIOUS. BUILD TOGETHER.</span></div></aside></div>
        <footer className="page-footer"><span><span className="footer-dot" />交互演示 · 非真实成员数据</span><span>React 插件独立页面 · 没有加载原生主题</span></footer>
      </main>
    </div>

    <nav className="mobile-nav" aria-label="移动主导航">{navItems.map(({ label, icon: Icon }) => <button key={label} className={label === '发现' ? 'active' : ''} onClick={() => navAction(label)} aria-current={label === '发现' ? 'page' : undefined}><Icon size={21} strokeWidth={1.8} /><span>{label}</span></button>)}</nav>
    <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}><SheetContent className="profile-sheet" showCloseButton={false}><button className="sheet-close" aria-label="关闭详情" onClick={() => setSelected(null)}><X size={20} /></button>{selected && <><div className="sheet-cover"><span>MEET YOUR CO-CREATOR</span><Flower2 size={80} strokeWidth={0.8} /></div><div className="sheet-body"><Avatar member={selected} large /><div className="sheet-name"><SheetTitle>{selected.name}</SheetTitle><span className="sheet-role">{selected.role}</span></div><SheetDescription>{selected.headline}</SheetDescription><div className="sheet-match"><Sparkles size={18} /><span><strong>{selected.match}% 的同频可能</strong><small>基于演示数据展示，不是实际算法匹配结果</small></span></div><h4>我带来的技能</h4><div className="skill-tags sheet-skills">{selected.skills.map(skill => <span key={skill}>{skill}</span>)}</div><h4>这次，我想一起</h4><p className="sheet-intro">在 AI 创造者周末认识不同背景的伙伴，把一个有趣的问题做成可体验的原型。期待坦诚的交流，也期待一起把事情做好的成就感。</p><div className="member-status"><span />{selected.availability}</div><Button className="sheet-follow" onClick={() => toggleFollow(selected.id)} aria-pressed={following.includes(selected.id)}>{following.includes(selected.id) ? <Check size={17} /> : <Plus size={17} />}{following.includes(selected.id) ? '已关注，期待一起创造' : '关注这位创造者'}</Button><p className="sheet-disclaimer">关注只改变当前演示页面，不会创建真实关系。</p></div></>}</SheetContent></Sheet>
    {notice && <div className="notice-toast" role="status"><Sparkles size={17} /><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </div>
}
