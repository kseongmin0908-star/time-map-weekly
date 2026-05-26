-- ============================================
-- 시간의 지도 — 사용자 정의 회고 태그
-- user_profiles에 custom_tags 컬럼 추가 (재사용 태그 버튼)
-- ============================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS custom_tags text[] NOT NULL DEFAULT '{}';
