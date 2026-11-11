'use client';
// Adapted from Shadcn UI Kit social-media-post1. Original: docs/sources.
import Image from 'next/image';
import { Heart, MessageCircle, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getPerson, self, type Post } from '@/lib/event-data';
import { MemberPreview } from '@/components/blocks/member-preview';
export function ForumPost({post,liked,onLike,onOpen,disabled=false,detail=false}:{post:Post;liked:boolean;onLike:()=>void;onOpen:()=>void;disabled?:boolean;detail?:boolean}){
 const author=getPerson(post.authorId)??self;
 const latest=post.comments.at(-1);
 const replyAuthor=latest?getPerson(latest.authorId):undefined;
 return <Card className="forum-card gap-0 overflow-hidden py-0 shadow-none ring-0" data-testid={'post-'+post.id}>
  <CardHeader className="post-header"><MemberPreview personId={author.id}/><div className="author-copy"><MemberPreview personId={author.id}><button type="button" className="member-name"><strong>{author.name}</strong></button></MemberPreview><span>{author.role}<span className="meta-dot">·</span>{post.time}</span></div><span className={'topic-tag topic-'+post.category}>{post.category}</span></CardHeader>
  <CardContent className="post-content">{detail?<p className="post-detail-message">{post.message}</p>:<button className="post-text-button" onClick={onOpen} aria-label={'查看'+author.name+'的帖子'}><p>{post.message}</p></button>}{post.image&&<div className="post-media"><Image src={post.image} alt={post.imageAlt||'演示活动图片'} width={900} height={420}/><span>一起创造的片刻</span></div>}</CardContent>
  {!detail&&latest&&replyAuthor&&<div className="post-reply-preview"><MemberPreview personId={replyAuthor.id} size={26}/><div><MemberPreview personId={replyAuthor.id}><button className="member-name" type="button">{replyAuthor.name}</button></MemberPreview><button className="reply-preview-message" onClick={onOpen} aria-label={'查看'+author.name+'帖子的回复'}>{latest.message}</button></div><MessageCircle size={14} aria-hidden="true"/></div>}
  <CardFooter className="post-footer"><Button variant="ghost" className={liked?'reaction is-liked':'reaction'} aria-label={(liked?'取消点赞':'点赞')+' '+(post.likes+(liked?1:0))} aria-pressed={liked} onClick={onLike} disabled={disabled}><Heart fill={liked?'currentColor':'none'} size={17}/>{post.likes+(liked?1:0)}</Button>{!detail&&<><Button variant="ghost" className="reaction" onClick={onOpen}><MessageCircle size={17}/>{post.comments.length}<span>条讨论</span></Button><button className="post-open" onClick={onOpen}>一起聊聊<ArrowUpRight size={15}/></button></>}</CardFooter>
 </Card>
}
