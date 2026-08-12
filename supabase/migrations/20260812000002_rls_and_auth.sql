-- RLS 정책 + 태블릿 번호 인증 RPC
--
-- 배경: 헬스장 태블릿은 공용 기기라 Supabase Auth 세션을 들고 있지 않고
-- anon 키만 가진다. 따라서 유저/루틴/출석 테이블은 anon 에게 직접 노출하지 않고,
-- security definer 함수(RPC)로만 접근시킨다.

alter table public.apartments     enable row level security;
alter table public.users          enable row level security;
alter table public.equipments     enable row level security;
alter table public.daily_routines enable row level security;
alter table public.attendance_logs enable row level security;

-- 단지 정보와 기구 정보는 읽기 전용 공개(태블릿 초기 화면, QR 스캔 시 필요).
drop policy if exists "apartments are readable" on public.apartments;
create policy "apartments are readable"
    on public.apartments for select
    to anon, authenticated
    using (true);

drop policy if exists "equipments are readable" on public.equipments;
create policy "equipments are readable"
    on public.equipments for select
    to anon, authenticated
    using (true);

-- users / daily_routines / attendance_logs 에는 anon 정책을 두지 않는다.
-- => RLS deny-by-default. service_role 과 security definer 함수만 통과한다.


-- ─────────────────────────────────────────────────────────────
-- 전화번호 정규화 / 검증
-- ─────────────────────────────────────────────────────────────

create or replace function public.normalize_phone_number(p_phone text)
returns text
language sql
immutable
as $$
    select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

comment on function public.normalize_phone_number(text) is
    '입력에서 숫자만 남긴다. 저장 포맷은 하이픈 없는 01012345678.';


-- ─────────────────────────────────────────────────────────────
-- 태블릿 번호 입력 인증
--
-- 처음 보는 번호면 가입시키고, 있으면 로그인시킨다(find-or-create).
-- 같은 호출에서 하루 1회 출석도 기록한다 — 태블릿에 번호를 찍는 행위가 곧 체크인이다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.sign_in_with_phone(
    p_apt_id       uuid,
    p_phone_number text,
    p_profile_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_phone      text;
    v_user       public.users;
    v_is_new     boolean := false;
    v_attended   boolean := false;
    v_today      date := (now() at time zone 'Asia/Seoul')::date;
begin
    v_phone := public.normalize_phone_number(p_phone_number);

    -- 국내 휴대폰 번호(010/011/016/017/018/019) 10~11자리
    if v_phone !~ '^01[016789][0-9]{7,8}$' then
        raise exception 'INVALID_PHONE_NUMBER' using errcode = '22023';
    end if;

    if p_apt_id is null or not exists (
        select 1 from public.apartments a where a.id = p_apt_id
    ) then
        raise exception 'APARTMENT_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_user
    from public.users u
    where u.phone_number = v_phone;

    if not found then
        insert into public.users (apt_id, phone_number, profile_data)
        values (
            p_apt_id,
            v_phone,
            case
                when jsonb_typeof(coalesce(p_profile_data, '{}'::jsonb)) = 'object'
                    then coalesce(p_profile_data, '{}'::jsonb)
                else '{}'::jsonb
            end
        )
        returning * into v_user;

        v_is_new := true;

    elsif v_user.apt_id is distinct from p_apt_id then
        -- 다른 단지에 등록된 번호. 단지 이전은 관리자가 처리한다.
        raise exception 'PHONE_REGISTERED_TO_OTHER_APARTMENT' using errcode = 'P0003';
    end if;

    -- 하루 1회만 출석 인정
    if not exists (
        select 1
        from public.attendance_logs l
        where l.user_id = v_user.id
          and (l.attended_at at time zone 'Asia/Seoul')::date = v_today
    ) then
        insert into public.attendance_logs (user_id) values (v_user.id);
        v_attended := true;
    end if;

    return jsonb_build_object(
        'user', to_jsonb(v_user),
        'is_new_user', v_is_new,
        'attendance_logged', v_attended
    );
end;
$$;

comment on function public.sign_in_with_phone(uuid, text, jsonb) is
    '태블릿 번호 입력 인증. 신규 번호는 가입, 기존 번호는 로그인. 하루 1회 출석 기록 포함.';

revoke all on function public.sign_in_with_phone(uuid, text, jsonb) from public;
grant execute on function public.sign_in_with_phone(uuid, text, jsonb) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 온보딩: 신규 유저의 가변 프로필(성별/연령대/운동목적) 저장
-- profile_data 를 통째로 덮어쓰지 않고 병합한다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.update_profile_data(
    p_user_id uuid,
    p_patch   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.users;
begin
    if jsonb_typeof(coalesce(p_patch, 'null'::jsonb)) <> 'object' then
        raise exception 'INVALID_PROFILE_PATCH' using errcode = '22023';
    end if;

    update public.users u
    set profile_data = u.profile_data || p_patch
    where u.id = p_user_id
    returning * into v_user;

    if not found then
        raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
    end if;

    return to_jsonb(v_user);
end;
$$;

revoke all on function public.update_profile_data(uuid, jsonb) from public;
grant execute on function public.update_profile_data(uuid, jsonb) to anon, authenticated;
