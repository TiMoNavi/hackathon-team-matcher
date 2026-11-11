'use client';

// Reply layout adapted from Shadcn UI Kit chat-bubble2/message-list-item.
import { useRef, type FormEvent } from 'react';
import { CornerDownRight, MessageCircle, Reply, Send, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MemberPreview } from '@/components/blocks/member-preview';
import { getPerson, type Post, type ReplyContext } from '@/lib/event-data';

export function DiscussionThread({ post, canWrite, draft, replyTo, error, onDraftChange, onReply, onSubmit }: {
  post: Post; canWrite: boolean; draft: string; replyTo?: ReplyContext; error: string;
  onDraftChange: (value: string) => void; onReply: (reply?: ReplyContext) => void; onSubmit: (e: FormEvent) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  return <section className="discussion-thread" aria-label="帖子回复">
    <div className="thread-heading"><h3><MessageCircle size={18} />一起聊聊<span>{post.comments.length}</span></h3><span>每个想法，都有回响</span></div>
    <div className="comment-list">
      {post.comments.map((comment, index) => {
        const author = getPerson(comment.authorId);
        if (!author) return null;
        return <article className={'comment reply-row ' + (author.id === 0 ? 'own-reply' : '')} key={comment.id} data-testid={'reply-' + comment.id}>
          <MemberPreview personId={author.id} size={36} />
          <div className="reply-body">
            <div className="reply-byline"><MemberPreview personId={author.id}><button type="button" className="member-name">{author.name}</button></MemberPreview>{author.id === post.authorId && <span className="reply-author-badge">楼主</span>}{author.id === 0 && <span className="reply-author-badge">我</span>}<span className="reply-floor">#{index + 1}</span></div>
            <div className="reply-bubble">
              {comment.replyTo && <blockquote className="reply-quote"><CornerDownRight size={13} /><div><strong>{getPerson(comment.replyTo.authorId)?.name}</strong><p>{comment.replyTo.message}</p></div></blockquote>}
              <p>{comment.message}</p>
            </div>
            <div className="reply-meta"><time>{comment.time}</time><button type="button" disabled={!canWrite} aria-label={'回复' + author.name + '的第' + (index + 1) + '条讨论'} onClick={() => { onReply({ id: comment.id, authorId: comment.authorId, message: comment.message }); input.current?.focus(); }}><Reply size={13} />回复</button></div>
          </div>
        </article>;
      })}
      {!post.comments.length && <div className="thread-empty"><MessageCircle size={24} /><strong>第一个回应，就从你开始。</strong><p>一个建议、一点共鸣，都可以。</p></div>}
    </div>
    <form onSubmit={onSubmit} className="reply-composer">
      <div className="composer-person"><MemberPreview personId={0} size={30} /><span className="composer-prompt">{canWrite ? '也说说你的想法' : '这场活动已归档'}</span><span><Users size={12} />活动内可见</span></div>
      {replyTo && <div className="replying-to"><Reply size={14} /><div><strong>回复 {getPerson(replyTo.authorId)?.name}</strong><p>{replyTo.message}</p></div><button type="button" aria-label="取消引用回复" onClick={() => onReply(undefined)}><X size={15} /></button></div>}
      <label className="sr-only" htmlFor="comment-message">写下你的回复</label>
      <textarea ref={input} id="comment-message" rows={3} value={draft} maxLength={1000} onChange={e => onDraftChange(e.target.value)} placeholder={canWrite ? '一个建议、一点共鸣，或者「我也想一起」…' : '可以回看讨论，暂不能回复'} disabled={!canWrite} aria-describedby="reply-help" />
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="reply-composer-footer"><span id="reply-help">{draft.length > 0 ? draft.length + ' / 1000 · 草稿已保留' : '关闭窗口会保留草稿'}</span><Button type="submit" aria-label="发送演示回复" disabled={!canWrite}>发送回复<Send size={14} /></Button></div>
    </form>
    <p className="dialog-demo-note">回复与引用仅保存在本页演示中，刷新后重置。</p>
  </section>;
}
