'use client';

// Shadcn UI Kit avatar15: click popover, adapted to the Signalry theme.
import Image from 'next/image';
import { useId, type ReactElement } from 'react';
import { ArrowUpRight, Sparkles, Users, X } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { getPerson, profileHref } from '@/lib/event-data';

export function MemberPreview({ personId, children, size = 42, className = '' }: {
  personId: number; children?: ReactElement; size?: number; className?: string;
}) {
  const person = getPerson(personId);
  const titleId = useId();
  const descriptionId = useId();
  if (!person) return null;
  return <Popover modal>
    <PopoverTrigger asChild>
      {children ?? <button type="button" className={'member-avatar ' + className} aria-label={'查看' + person.name + '的基本信息'}>
        <Image src={'/avatars/avatar-' + person.avatar + '.jpg'} width={size} height={size} alt="" />
      </button>}
    </PopoverTrigger>
    <PopoverContent className="member-popover" sideOffset={10} collisionPadding={14} aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div className="member-cover" aria-hidden="true"><span>GOOD PEOPLE, GREAT IDEAS.</span><Sparkles size={26} strokeWidth={1.3} /></div>
      <PopoverPrimitive.Close className="member-close" aria-label="关闭资料卡"><X size={16} /></PopoverPrimitive.Close>
      <div className="member-body">
        <Image className="member-portrait" src={'/avatars/avatar-' + person.avatar + '.jpg'} width={64} height={64} alt="" />
        <span className="member-context"><Users size={12} />同场伙伴</span>
        <div className="member-heading"><h3 id={titleId}>{person.name}</h3><span>{person.role}</span></div>
        <p id={descriptionId} className="member-intro">{person.intro}</p>
        {person.skills.length > 0 && <div className="member-skills">{person.skills.map(skill => <span key={skill}>{skill}</span>)}</div>}
        <div className="member-looking"><Sparkles size={15} /><div><span>这次想一起做</span><p>{person.looking}</p></div></div>
        <Button asChild className="member-home-link"><a href={profileHref(person.id)} target="_blank" rel="noopener noreferrer">查看个人主页<ArrowUpRight size={16} /><span className="sr-only">（新标签页打开）</span></a></Button>
        <p className="member-disclosure">演示人物 · 只展示基本资料</p>
      </div>
    </PopoverContent>
  </Popover>;
}
