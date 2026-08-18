-- 영상 링크를 자리표시자에서 실제로 열리는 주소로 바꾼다.
--
-- 지금까지 video_url 은 전부 https://example.com/videos/*.mp4 였다. "영상으로
-- 보기"를 눌러도 아무것도 안 나온다 — 버튼이 있는데 안 되는 게 버튼이 없는
-- 것보다 나쁘다.
--
-- ⚠️ 이건 임시다. 제대로 하려면 시범 영상을 직접 찍거나, 트레이너가 확인한
--    영상 주소를 운동마다 넣어야 한다. 그때는 video_url 을 그 주소로 덮어쓰면
--    되고 앱은 고칠 것이 없다.
--
-- 왜 특정 영상 주소를 바로 박지 않았나:
--   유튜브 영상 ID 를 확인 없이 넣으면 엉뚱한 영상으로 연결된다. 운동 앱에서
--   틀린 시범 영상은 틀린 자세 안내와 같은 문제이고, 남의 채널 영상은 어느 날
--   비공개로 바뀌면 조용히 죽는다. 그래서 "그 운동을 검색한 결과"로 연결한다 —
--   항상 열리고, 영상이 내려가도 깨지지 않으며, 여러 시범을 비교해 볼 수 있다.

-- 한글이 들어간 검색어를 주소에 넣으려면 퍼센트 인코딩이 필요하다.
-- Postgres 에 내장 함수가 없어 직접 만든다(글자 단위로 UTF-8 바이트를 %XX 로).
create or replace function public.youtube_search_url(p_query text)
returns text
language sql
immutable
as $$
    select 'https://www.youtube.com/results?search_query=' || string_agg(
        case
            when ch ~ '^[A-Za-z0-9]$' then ch
            when ch = ' ' then '+'
            else (
                select string_agg('%' || upper(to_hex(get_byte(convert_to(ch, 'UTF8'), i))), '')
                from generate_series(0, octet_length(convert_to(ch, 'UTF8')) - 1) as i
            )
        end, '' order by ord)
    from regexp_split_to_table(p_query, '') with ordinality as t(ch, ord);
$$;

comment on function public.youtube_search_url(text) is
    '검색어를 유튜브 검색 주소로. 운동별 시범영상 임시 링크를 만드는 데 쓴다.';

-- 자리표시자만 바꾼다. 나중에 진짜 영상 주소를 넣은 운동은 건드리지 않는다.
update public.exercise_catalog
set video_url = public.youtube_search_url(
    case station_kind
        -- 맨몸운동은 시니어용 영상이 따로 많다. "어르신"을 붙여야 젊은 사람
        -- 기준의 빠른 동작 영상이 앞에 오지 않는다.
        when '맨몸'   then '어르신 ' || name || ' 운동 방법'
        -- 유산소 기구는 자세보다 "어떻게 켜고 쓰는지"가 궁금하다.
        when '유산소' then name || ' 사용법'
        else name || ' 운동 정확한 자세'
    end
)
where video_url like '%example.com%';

comment on column public.exercise_catalog.video_url is
    '시범 영상 주소. 지금은 유튜브 검색 결과로 연결되는 임시값이다 — 트레이너가 확인한 영상이 준비되면 그 주소로 덮어쓰면 된다.';
