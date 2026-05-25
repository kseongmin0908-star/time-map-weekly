-- ============================================
-- 시간의 지도 — 커뮤니티 v2: 댓글, 좋아요, 자유 게시물
-- ============================================

-- 1) community_feed 확장: feed_type에 'free' 추가
ALTER TABLE public.community_feed
  DROP CONSTRAINT IF EXISTS community_feed_feed_type_check;
ALTER TABLE public.community_feed
  ADD CONSTRAINT community_feed_feed_type_check
  CHECK (feed_type IN ('weekly','daily','retro','ai_analysis','free'));

-- 2) user_profiles 기본값 변경: share 플래그 ALL ON
ALTER TABLE public.user_profiles ALTER COLUMN share_weekly SET DEFAULT true;
ALTER TABLE public.user_profiles ALTER COLUMN share_daily SET DEFAULT true;
ALTER TABLE public.user_profiles ALTER COLUMN share_retro SET DEFAULT true;

-- 3) feed_comments: 댓글 테이블
CREATE TABLE IF NOT EXISTS public.feed_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  feed_id uuid REFERENCES public.community_feed(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  is_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 4) feed_likes: 좋아요 테이블
CREATE TABLE IF NOT EXISTS public.feed_likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  feed_id uuid REFERENCES public.community_feed(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(feed_id, user_id)
);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;

-- feed_comments: 전체 SELECT + 본인 INSERT/DELETE
CREATE POLICY "Anyone can view comments" ON public.feed_comments FOR SELECT USING (true);
CREATE POLICY "Users can insert own comments" ON public.feed_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.feed_comments FOR DELETE USING (auth.uid() = user_id);

-- feed_likes: 전체 SELECT + 본인 INSERT/DELETE
CREATE POLICY "Anyone can view likes" ON public.feed_likes FOR SELECT USING (true);
CREATE POLICY "Users can insert own likes" ON public.feed_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own likes" ON public.feed_likes FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Realtime 활성화
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE feed_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE feed_likes;
