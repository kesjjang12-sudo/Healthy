-- 1) 이름 — 카카오/구글이 주는 이름을 그대로 쓴다.
-- 2) 진행 상황 — "내가 잘하고 있나"를 판단할 수 있는 집계를 만든다.


-- ─────────────────────────────────────────────────────────────
-- 로그인 뒤 "○○ 님, 안녕하세요"를 띄우려면 이름이 있어야 한다.
--
-- 지금은 프로필 탭에서 직접 치기 전에는 이름이 비어 있어서 모두가 "회원 님"
-- 이었다. 카카오·구글은 로그인할 때 표시 이름을 함께 준다(전화번호와 달리
-- 심사 없이 기본 스코프로 받는 값이다). 그걸 auth.users 의 메타데이터에서
-- 꺼내 profile_data.nickname 에 채운다.
--
-- 이미 이름이 있으면 건드리지 않는다 — 프로필 탭에서 직접 고친 이름이
-- 다음 로그인 때 카카오 이름으로 되돌아가면 안 된다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.bootstrap_oauth_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user  public.users;
    v_phone text;
    v_name  text;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users where auth_user_id = auth.uid();

    if not found then
        -- 이 auth 신원으로는 처음이다. 문자 인증으로 들어온 거라면 번호로 기존
        -- 계정을 찾아본다. 카카오/구글/익명은 phone 클레임이 없어 그냥 건너뛴다.
        v_phone := public.local_phone_from_e164(nullif(auth.jwt() ->> 'phone', ''));

        if v_phone is not null and v_phone <> '' then
            select * into v_user from public.users u where u.phone_number = v_phone;

            if found then
                -- 예전 auth 연결(앱을 지워 못 쓰게 된 익명 계정 등)을 새 것으로
                -- 갈아끼운다. complete_pairing 이 재연결에서 하는 것과 같은 처리다.
                update public.users set auth_user_id = auth.uid() where id = v_user.id
                returning * into v_user;
            end if;
        end if;
    end if;

    if v_user.id is null then
        -- 정말 처음 보는 사람이다. 번호를 아는 경우(문자 인증) 같이 넣어 둔다 —
        -- 나중에 태블릿에서 같은 번호로 체크인해도 계정이 갈라지지 않는다.
        insert into public.users (auth_user_id, phone_number)
        values (auth.uid(), nullif(v_phone, ''))
        returning * into v_user;
    end if;

    -- 제공자마다 키가 다르다. 카카오는 주로 name/nickname, 구글은 name/full_name.
    -- 익명 로그인(전화번호 경로)은 메타데이터가 비어 있어 전부 null 이 나온다.
    select coalesce(
        nullif(btrim(au.raw_user_meta_data->>'name'), ''),
        nullif(btrim(au.raw_user_meta_data->>'full_name'), ''),
        nullif(btrim(au.raw_user_meta_data->>'nickname'), ''),
        nullif(btrim(au.raw_user_meta_data->>'preferred_username'), ''),
        nullif(btrim(au.raw_user_meta_data->>'user_name'), '')
    )
    into v_name
    from auth.users au
    where au.id = auth.uid();

    -- 이메일 주소가 이름 자리에 들어오는 제공자가 있다. "abc@gmail.com 님"은
    -- 인사말로 못 쓰니 @ 앞부분만 남긴다.
    if v_name like '%@%' then
        v_name := nullif(btrim(split_part(v_name, '@', 1)), '');
    end if;

    -- 화면 한 줄에 들어가야 한다. 긴 이름은 잘라 둔다.
    v_name := left(v_name, 20);

    -- ⚠️ nickname 이 아니라 real_name 에 넣는다.
    --
    -- 카카오·구글이 주는 이름은 대개 실명("김철수")이다. nickname 은 단지
    -- 랭킹에 그대로 노출되는 값이라, 여기에 실명을 채우면 로그인만 했을 뿐인
    -- 사람의 본명이 이웃들에게 공개된다. 인사말("○○ 님, 안녕하세요")은 본인만
    -- 보는 화면이므로 real_name 으로 충분하다.
    --
    -- 닉네임은 본인이 직접 정하게 두고(update_nickname RPC — 비속어 필터와
    -- 2주 제한이 걸려 있다), 여기서는 손대지 않는다.
    if v_name is not null and coalesce(btrim(v_user.profile_data->>'real_name'), '') = '' then
        update public.users
        set profile_data = profile_data || jsonb_build_object('real_name', v_name)
        where id = v_user.id
        returning * into v_user;
    end if;

    return jsonb_build_object('user', to_jsonb(v_user));
end;
$$;

comment on function public.bootstrap_oauth_profile() is
    '카카오/구글/문자 로그인 직후 호출. 번호로 기존 계정을 잇거나 새로 만들고, 실명이 비어 있으면 제공자가 준 표시 이름을 real_name 에 채운다(닉네임은 본인이 정한다).';

revoke all on function public.bootstrap_oauth_profile() from public;
grant execute on function public.bootstrap_oauth_profile() to authenticated;


-- 두 기간을 같은 방식으로 세야 비교가 성립한다. 본인 확인은 부르는 쪽에서
-- 이미 했으므로 여기서는 다시 하지 않는다(그래서 실행 권한도 주지 않는다).
create or replace function public.summarize_activity_window(
    p_user_id uuid,
    p_from    date,
    p_to      date
)
returns jsonb
language sql
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'attendance_days', (
            select count(distinct (attended_at at time zone 'Asia/Seoul')::date)
            from public.attendance_logs
            where user_id = p_user_id
              and (attended_at at time zone 'Asia/Seoul')::date between p_from and p_to
        ),
        'completed_count', coalesce(c.completed_count, 0),
        'total_sets', coalesce(c.total_sets, 0),
        'cardio_minutes', coalesce(c.cardio_minutes, 0)
    )
    from (
        select
            count(*) as completed_count,
            coalesce(sum(d.target_sets) filter (where d.target_duration_minutes is null), 0)
                as total_sets,
            coalesce(sum(coalesce(d.actual_duration_minutes, d.target_duration_minutes))
                     filter (where d.target_duration_minutes is not null), 0) as cardio_minutes
        from public.daily_routines d
        where d.user_id = p_user_id and d.is_completed
          and d.routine_date between p_from and p_to
    ) c;
$$;

comment on function public.summarize_activity_window(uuid, date, date) is
    'get_progress_summary 내부용. 한 기간의 출석일·완료·세트·유산소 분을 센다. 본인 확인은 부르는 쪽 책임.';

revoke all on function public.summarize_activity_window(uuid, date, date) from public;


-- ─────────────────────────────────────────────────────────────
-- 분석 탭: "내가 잘하고 있나"에 답하는 집계.
--
-- 지금 분석 탭은 칼로리와 부위별 세트만 보여준다. 숫자는 있지만 그게 잘하는
-- 건지 못하는 건지 판단할 기준이 없다. 사람이 스스로 판단하려면 비교 대상이
-- 있어야 한다 — 그래서 같은 길이의 직전 기간을 같이 돌려준다.
--
-- 기준은 출석(attendance_logs)을 앞에 둔다. 완료 개수는 완료 버튼을 누르기만
-- 하면 늘지만(20260812000018 에서 랭킹 기준을 출석으로 바꾼 것과 같은 이유),
-- 출석은 키오스크 체크인이 있어야 남는다. "이번 주 세 번 나오셨어요"가
-- "3개 완료"보다 정직하고, 시니어에게 더 잘 읽히는 문장이기도 하다.
--
-- 날짜 경계는 전부 Asia/Seoul 기준이다. UTC 로 자르면 밤 9시 운동이 다음 날로
-- 넘어가 "어제 안 나왔다"가 된다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_progress_summary(
    p_user_id uuid,
    p_days    integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id  uuid;
    v_days           integer;
    v_today          date;
    v_current_from   date;
    v_previous_from  date;
    v_current        jsonb;
    v_previous       jsonb;
    v_streak         integer := 0;
    v_week           date;
    v_has_visit      boolean;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;
    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    -- 화면의 기간 선택(7일/30일)이 그대로 넘어온다. 범위를 벗어난 값은 잘라낸다.
    v_days := least(greatest(coalesce(p_days, 7), 1), 365);

    v_today := (now() at time zone 'Asia/Seoul')::date;
    v_current_from := v_today - (v_days - 1);
    v_previous_from := v_current_from - v_days;

    v_current := public.summarize_activity_window(p_user_id, v_current_from, v_today);
    v_previous := public.summarize_activity_window(
        p_user_id, v_previous_from, v_current_from - 1
    );

    -- 연속 몇 주째 나오고 있나.
    --
    -- 헬스장은 매일 오는 곳이 아니라서 "연속 며칠"은 거의 항상 1로 떨어진다.
    -- 주 단위로 세야 꾸준함이 드러난다. 이번 주에 아직 안 나왔어도 주가 끝난
    -- 게 아니므로 끊긴 것으로 보지 않고 지난주부터 센다.
    v_week := date_trunc('week', v_today)::date;

    select exists (
        select 1 from public.attendance_logs
        where user_id = p_user_id
          and (attended_at at time zone 'Asia/Seoul')::date >= v_week
    ) into v_has_visit;

    if not v_has_visit then
        v_week := v_week - 7;
    end if;

    loop
        select exists (
            select 1 from public.attendance_logs
            where user_id = p_user_id
              and (attended_at at time zone 'Asia/Seoul')::date between v_week and v_week + 6
        ) into v_has_visit;

        exit when not v_has_visit;

        v_streak := v_streak + 1;
        v_week := v_week - 7;
    end loop;

    return jsonb_build_object(
        'days', v_days,
        'current', v_current,
        'previous', v_previous,
        'streak_weeks', v_streak
    );
end;
$$;

comment on function public.get_progress_summary(uuid, integer) is
    '분석 탭 — 최근 p_days 와 직전 같은 길이 기간을 나란히, 그리고 연속 출석 주 수. 비교 대상이 있어야 잘하고 있는지 판단할 수 있다.';

revoke all on function public.get_progress_summary(uuid, integer) from public;
grant execute on function public.get_progress_summary(uuid, integer) to authenticated;
