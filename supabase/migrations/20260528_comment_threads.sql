-- ============================================
-- 시간의 지도 — 댓글 답글(스레드)
-- feed_comments에 parent_id 추가: NULL=최상위 댓글, 값=해당 댓글의 답글
-- (마이그레이션 드리프트로 db push가 막혀 있으면 Dashboard SQL Editor에서 실행)
-- ============================================

ALTER TABLE public.feed_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.feed_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_feed_comments_parent ON public.feed_comments(parent_id);
