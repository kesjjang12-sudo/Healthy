-- 이사하면 옛 단지에서 빠진다. 단, 그동안의 운동 기록은 그대로 남는다.
--
-- 지금까지 "이 헬스장으로 옮기셨나요?"에 "네"를 눌러도 옛 멤버십이 그대로 남았다.
-- 랭킹은 user_gym_memberships 를 조인하므로, 이사 간 사람이 옛 단지 순위표에
-- 계속 보였다. 게다가 그 사람은 그 단지에서 쌓아 둔 출석일이 많아 상위권에
-- 박힌 채로 다시는 오지 않는다 — 남은 주민들에겐 영영 못 넘는 유령이 된다.
--
-- 그렇다고 행을 지우면 안 된다. 지우면 "그 헬스장을 몇 번 다녔는지"라는 본인
-- 기록까지 사라진다. 그래서 지우는 대신 left_at 을 찍는다. 랭킹에서는 빠지고,
-- 프로필의 "내 헬스장"에는 이전에 다니던 곳으로 남는다.
--
-- 운동 기록 쪽은 손댈 게 없다. 달력(get_attendance_days), 분석(get_workout_summary),
-- DAY_N 배지(get_visit_stats)는 전부 user_id 로만 조회하고 단지로 거르지 않는다.
-- attendance_logs 와 daily_routines 도 그대로 둔다 — 소속이 바뀌는 것과 그동안
-- 운동한 사실이 남는 것은 별개다.


alter table public.user_gym_memberships
    add column if not exists left_at timestamptz;

comment on column public.user_gym_memberships.left_at is
    '이 헬스장을 떠난 시각(이사 확인 시). null 이면 지금 다니는 곳. 랭킹은 null 인 행만 센다.';

-- "오늘만 방문했어요"를 누른 시각. 이걸 안 남기면 두 헬스장을 정말로 번갈아
-- 쓰는 사람에게 방문할 때마다 같은 팝업을 띄우게 된다.
alter table public.user_gym_memberships
    add column if not exists switch_declined_at timestamptz;

comment on column public.user_gym_memberships.switch_declined_at is
    '"오늘만 방문" 응답 시각. 30일간은 같은 헬스장에서 이사 여부를 다시 묻지 않는다.';

create index if not exists user_gym_memberships_active_apt_idx
    on public.user_gym_memberships (apt_id) where left_at is null;


-- ─────────────────────────────────────────────────────────────
-- 1. 랭킹: 지금 다니는 사람만
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_apartment_leaderboard(p_apt_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select id into v_me from public.users where auth_user_id = auth.uid();

    return coalesce(
        jsonb_agg(
            jsonb_build_object(
                'rank', lb.rnk,
                'nickname', coalesce(lb.profile_data->>'nickname', '회원' || right(lb.id::text, 4)),
                'attendance_count', lb.attendance_count,
                'total_points', lb.total_points,
                'is_me', lb.id = v_me
            )
            order by lb.rnk
        ),
        '[]'::jsonb
    )
    from (
        select
            u.id,
            u.profile_data,
            u.total_points,
            count(distinct (l.attended_at at time zone 'Asia/Seoul')::date) as attendance_count,
            row_number() over (
                order by count(distinct (l.attended_at at time zone 'Asia/Seoul')::date) desc,
                         u.created_at asc
            ) as rnk
        from public.users u
        -- left_at 이 찍힌 사람은 이 단지를 떠난 사람이다. 출석 기록(l)은 그대로
        -- 두므로 본인 달력·분석에는 계속 보이지만, 여기 순위표에는 안 나온다.
        join public.user_gym_memberships m
          on m.user_id = u.id and m.apt_id = p_apt_id and m.left_at is null
        left join public.attendance_logs l on l.user_id = u.id and l.apt_id = p_apt_id
        group by u.id, u.profile_data, u.total_points, u.created_at
    ) lb
    -- 상위 p_limit 명 + 그 밖이어도 내 순위는 항상 포함(고정 행으로 보여주기 위해)
    where lb.rnk <= p_limit or lb.id = v_me;
end;
$$;

comment on function public.get_apartment_leaderboard(uuid, integer) is
    '지금 이 단지를 다니는 사람들의 출석 랭킹(떠난 사람 제외). 닉네임/출석횟수/포인트만 노출, PII 없음.';

revoke all on function public.get_apartment_leaderboard(uuid, integer) from public;
grant execute on function public.get_apartment_leaderboard(uuid, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 2. 소속 전환이 곧 "옛 헬스장 탈퇴"
-- ─────────────────────────────────────────────────────────────

create or replace function public.confirm_gym_membership(
    p_user_id     uuid,
    p_apt_id      uuid,
    p_make_primary boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
    v_left_count    integer := 0;
begin
    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;

    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if auth.uid() is not null and v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if not exists (
        select 1 from public.user_gym_memberships where user_id = p_user_id and apt_id = p_apt_id
    ) then
        raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
    end if;

    if p_make_primary then
        -- 이사했다는 뜻이므로 다니던 다른 헬스장은 전부 떠난 것으로 본다. 행을
        -- 지우지 않는 이유는 방문 횟수·첫 방문일이 본인 기록이기 때문이다.
        update public.user_gym_memberships
        set is_primary = false,
            left_at    = coalesce(left_at, now())
        where user_id = p_user_id and apt_id <> p_apt_id and left_at is null;

        get diagnostics v_left_count = row_count;

        -- 되돌아온 경우(떠났던 곳을 다시 주 소속으로)도 여기서 복구된다.
        update public.user_gym_memberships
        set is_primary         = true,
            left_at            = null,
            switch_declined_at = null
        where user_id = p_user_id and apt_id = p_apt_id;

        update public.users set apt_id = p_apt_id where id = p_user_id;
    else
        -- "오늘만 방문했어요". 멤버십은 그대로 두되, 30일간 다시 묻지 않는다.
        update public.user_gym_memberships
        set switch_declined_at = now()
        where user_id = p_user_id and apt_id = p_apt_id;
    end if;

    return jsonb_build_object(
        'user_id', p_user_id,
        'apt_id', p_apt_id,
        'is_primary', p_make_primary,
        -- 화면이 "이전 헬스장에서 빠졌습니다"를 정직하게 말할 수 있게 알려준다.
        'left_count', v_left_count
    );
end;
$$;

comment on function public.confirm_gym_membership(uuid, uuid, boolean) is
    '주 소속 전환. true 면 다니던 다른 헬스장을 떠난 것으로 처리한다(행은 남기고 left_at 만 찍는다 — 운동 기록과 방문 이력은 보존). false 면 "오늘만 방문"으로 보고 30일간 다시 묻지 않는다.';

revoke all on function public.confirm_gym_membership(uuid, uuid, boolean) from public;
grant execute on function public.confirm_gym_membership(uuid, uuid, boolean) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 3. 내 헬스장 목록에 "떠난 곳"을 구분해 준다
-- ─────────────────────────────────────────────────────────────

create or replace function public.list_my_gym_memberships(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_auth_id uuid;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select auth_user_id into v_owner_auth_id from public.users where id = p_user_id;

    if not found or v_owner_auth_id is distinct from auth.uid() then
        raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    return coalesce(
        jsonb_agg(
            jsonb_build_object(
                'apt_id', m.apt_id,
                'apt_name', a.name,
                'is_primary', m.is_primary,
                'visit_count', m.visit_count,
                'first_checked_in_at', m.first_checked_in_at,
                'last_checked_in_at', m.last_checked_in_at,
                'left_at', m.left_at
            )
            -- 지금 다니는 곳(주 소속 먼저)을 위로, 떠난 곳을 아래로.
            order by m.left_at is not null, m.is_primary desc, m.last_checked_in_at desc
        ),
        '[]'::jsonb
    )
    from public.user_gym_memberships m
    join public.apartments a on a.id = m.apt_id
    where m.user_id = p_user_id;
end;
$$;

comment on function public.list_my_gym_memberships(uuid) is
    '내가 다닌 헬스장 목록. 떠난 곳(left_at)도 기록으로 남겨 함께 돌려준다.';

revoke all on function public.list_my_gym_memberships(uuid) from public;
grant execute on function public.list_my_gym_memberships(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 4. 팝업을 놓쳐도 다시 물어본다
-- ─────────────────────────────────────────────────────────────

-- 지금까지 이 팝업은 "그 단지에서의 첫 체크인"에만 떴다. 그래서 그때 자리를
-- 비웠거나 뒷사람에 밀려 그냥 넘어가면 다시는 묻지 않았고, 그 사람은 옛 단지
-- 랭킹에 영영 남았다. 옛 단지에서 빼는 유일한 경로가 이 팝업이므로, 한 번
-- 놓쳤다고 끝나면 안 된다.
--
-- 이제는 "주 소속이 아닌 헬스장에 온 날"마다 묻는다. 단, 같은 날 두 번 찍으면
-- 다시 묻지 않고, "오늘만 방문했어요"를 누른 뒤 30일간도 묻지 않는다.
create or replace function public.kiosk_check_in(
    p_apt_id       uuid,
    p_phone_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_phone                     text;
    v_user                      public.users;
    v_membership                public.user_gym_memberships;
    v_is_new_membership         boolean := false;
    v_has_existing_membership   boolean := false;
    v_already_attended_today    boolean;
    v_prompt_gym_switch         boolean;
    v_today                     date := (now() at time zone 'Asia/Seoul')::date;
    v_pairing_code              text;
    v_attempt                   integer;
begin
    v_phone := public.normalize_phone_number(p_phone_number);

    if v_phone !~ '^01[016789][0-9]{7,8}$' then
        raise exception 'INVALID_PHONE_NUMBER' using errcode = '22023';
    end if;

    if p_apt_id is null or not exists (
        select 1 from public.apartments a where a.id = p_apt_id
    ) then
        raise exception 'APARTMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_user from public.users u where u.phone_number = v_phone;

    if not found then
        insert into public.users (apt_id, phone_number) values (p_apt_id, v_phone)
        returning * into v_user;
    end if;

    -- 이 단지 멤버십이 이미 있는지 (재방문인지 새 단지인지)
    select * into v_membership
    from public.user_gym_memberships m
    where m.user_id = v_user.id and m.apt_id = p_apt_id;

    if not found then
        v_is_new_membership := true;
        -- 불변식: 멤버십이 하나라도 있으면 그중 정확히 하나는 is_primary 다
        -- (첫 멤버십은 항상 primary=true 로 생기기 때문). 그래서 "다른 멤버십이
        -- 있는지"만 확인하면 "이미 주 소속이 있는지"를 알 수 있다.
        v_has_existing_membership := exists (
            select 1 from public.user_gym_memberships m where m.user_id = v_user.id
        );

        insert into public.user_gym_memberships (user_id, apt_id, is_primary, visit_count)
        values (v_user.id, p_apt_id, not v_has_existing_membership, 1)
        returning * into v_membership;

        if not v_has_existing_membership then
            update public.users set apt_id = p_apt_id where id = v_user.id;
        end if;
    end if;

    -- 하루/한 헬스장당 출석은 1회만 인정. visit_count 도 이 기준을 따라야 한다 —
    -- 안 그러면 같은 날 실수로 두 번 찍었을 때 방문 횟수가 이중으로 올라간다.
    v_already_attended_today := exists (
        select 1 from public.attendance_logs l
        where l.user_id = v_user.id
          and l.apt_id = p_apt_id
          and (l.attended_at at time zone 'Asia/Seoul')::date = v_today
    );

    if not v_already_attended_today then
        insert into public.attendance_logs (user_id, apt_id) values (v_user.id, p_apt_id);

        -- 방금 새로 만든 멤버십은 이미 visit_count=1 로 시작했으니 여기서 또
        -- 올리지 않는다. 기존 멤버십이었을 때만, 그것도 오늘 처음 온 경우에만 올린다.
        if not v_is_new_membership then
            update public.user_gym_memberships
            set visit_count = visit_count + 1, last_checked_in_at = now()
            where id = v_membership.id
            returning * into v_membership;
        end if;
    end if;

    -- 떠났던 헬스장(left_at)에 다시 온 경우도 여기 걸린다. 자동으로 되돌리지
    -- 않고 물어보는 이유는, 옛 헬스장에 하루 들른 것만으로 그 단지 랭킹에
    -- 출석일 전부를 들고 복귀해 버리면 안 되기 때문이다.
    v_prompt_gym_switch :=
        not v_membership.is_primary
        and not v_already_attended_today
        and exists (
            select 1 from public.user_gym_memberships m
            where m.user_id = v_user.id and m.is_primary
        )
        and (
            v_membership.switch_declined_at is null
            or v_membership.switch_declined_at < now() - interval '30 days'
        );

    if v_user.auth_user_id is null then
        for v_attempt in 1..5 loop
            v_pairing_code := lpad(floor(random() * 1000000)::text, 6, '0');
            begin
                insert into public.device_pairings (pairing_code, candidate_user_id, apt_id, expires_at)
                values (v_pairing_code, v_user.id, p_apt_id, now() + interval '3 minutes');
                exit;
            exception when unique_violation then
                if v_attempt = 5 then
                    raise exception 'PAIRING_CODE_GENERATION_FAILED' using errcode = 'P0004';
                end if;
            end;
        end loop;

        return jsonb_build_object(
            'user_id', v_user.id,
            'needs_pairing', true,
            'pairing_code', v_pairing_code,
            'visit_count', v_membership.visit_count,
            'prompt_gym_switch', v_prompt_gym_switch
        );
    end if;

    return jsonb_build_object(
        'user_id', v_user.id,
        'needs_pairing', false,
        'visit_count', v_membership.visit_count,
        'prompt_gym_switch', v_prompt_gym_switch
    );
end;
$$;

comment on function public.kiosk_check_in(uuid, text) is
    '태블릿 출입 체크인. 개인정보(이름/포인트/루틴)는 절대 돌려주지 않는다 — user_id, 방문횟수, 페어링 필요 여부뿐. 주 소속이 아닌 헬스장에 온 날엔 이사 여부를 묻는다.';

revoke all on function public.kiosk_check_in(uuid, text) from public;
grant execute on function public.kiosk_check_in(uuid, text) to anon, authenticated;
