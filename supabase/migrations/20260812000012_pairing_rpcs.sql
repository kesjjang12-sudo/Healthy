-- QR 페어링 완료 처리 + 카카오/구글 최초 로그인 시 프로필 생성.

-- 페어링이 "병합"으로 끝나면(카카오로 먼저 가입한 계정이 이미 있어서, 키오스크가
-- 번호로 만든 그림자 계정을 흡수하는 경우) 그림자 계정(users 행)이 지워진다.
-- candidate_user_id 를 on delete cascade 로 두면 이 페어링 기록 자체가 같이
-- 지워져서, 그 순간 키오스크가 상태를 조회하면 "없음(not_found)"으로 보여
-- 방금 성공한 페어링을 실패로 착각하게 된다. 상태 조회는 PII 를 안 돌려주므로
-- candidate_user_id 가 나중에 null 이 돼도 문제없다.
alter table public.device_pairings
    alter column candidate_user_id drop not null;

alter table public.device_pairings
    drop constraint device_pairings_candidate_user_id_fkey;

alter table public.device_pairings
    add constraint device_pairings_candidate_user_id_fkey
    foreign key (candidate_user_id) references public.users(id) on delete set null;


-- ─────────────────────────────────────────────────────────────
-- 키오스크가 폴링하는 상태 조회. PII 없이 상태 문자열만.
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_pairing_status(p_pairing_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pairing public.device_pairings;
begin
    select * into v_pairing from public.device_pairings where pairing_code = p_pairing_code;

    if not found then
        return jsonb_build_object('status', 'not_found');
    elsif v_pairing.consumed_at is not null then
        return jsonb_build_object('status', 'consumed');
    elsif v_pairing.expires_at < now() then
        return jsonb_build_object('status', 'expired');
    else
        return jsonb_build_object('status', 'pending');
    end if;
end;
$$;

comment on function public.get_pairing_status(text) is
    '키오스크가 2초 간격으로 폴링. PII 없이 상태(pending/consumed/expired/not_found)만 돌려준다.';

revoke all on function public.get_pairing_status(text) from public;
grant execute on function public.get_pairing_status(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- 폰 앱이 QR 을 스캔한 뒤(또는 카메라 대신 코드를 직접 입력한 뒤) 호출.
-- 지금 로그인된 auth.uid() 를 이 코드가 가리키는 계정에 연결한다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.complete_pairing(p_pairing_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_pairing                    public.device_pairings;
    v_candidate                  public.users;
    v_existing                   public.users;
    v_membership                 public.user_gym_memberships%rowtype;
    v_candidate_primary_apt_id   uuid;
    v_candidate_phone            varchar(20);
    v_final_user                 public.users;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_pairing from public.device_pairings where pairing_code = p_pairing_code;

    if not found then
        raise exception 'PAIRING_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_pairing.consumed_at is not null then
        raise exception 'PAIRING_ALREADY_USED' using errcode = 'P0005';
    end if;
    if v_pairing.expires_at < now() then
        raise exception 'PAIRING_EXPIRED' using errcode = 'P0006';
    end if;

    select * into v_candidate from public.users where id = v_pairing.candidate_user_id;
    select * into v_existing from public.users where auth_user_id = auth.uid();

    if v_existing is null then
        update public.users set auth_user_id = auth.uid() where id = v_candidate.id
        returning * into v_final_user;

    elsif v_existing.id = v_candidate.id then
        -- 이미 페어링된 코드를 다시 스캔한 경우. no-op.
        v_final_user := v_existing;

    else
        -- 병합: 카카오/구글로 먼저 만든 계정(v_existing)이 살아남고, 키오스크가
        -- 번호로 만든 그림자 계정(v_candidate)은 흡수된다.
        v_candidate_phone := v_candidate.phone_number;

        select apt_id into v_candidate_primary_apt_id
            from public.user_gym_memberships
            where user_id = v_candidate.id and is_primary;

        for v_membership in
            select * from public.user_gym_memberships where user_id = v_candidate.id
        loop
            if exists (
                select 1 from public.user_gym_memberships
                where user_id = v_existing.id and apt_id = v_membership.apt_id
            ) then
                update public.user_gym_memberships
                set visit_count = visit_count + v_membership.visit_count,
                    first_checked_in_at = least(first_checked_in_at, v_membership.first_checked_in_at),
                    last_checked_in_at = greatest(last_checked_in_at, v_membership.last_checked_in_at)
                where user_id = v_existing.id and apt_id = v_membership.apt_id;

                delete from public.user_gym_memberships where id = v_membership.id;
            else
                -- existing 의 주 소속을 침범하면 안 되니 옮겨 붙일 때는 무조건 false 로 둔다.
                update public.user_gym_memberships
                set user_id = v_existing.id, is_primary = false
                where id = v_membership.id;
            end if;
        end loop;

        -- existing 이 원래 멤버십이 하나도 없었다면(예: 카카오 가입 직후 첫 페어링),
        -- 위에서 전부 is_primary=false 로 옮겨져 주 소속이 없는 상태가 된다.
        -- candidate 가 원래 갖고 있던 주 소속을 물려준다.
        if v_candidate_primary_apt_id is not null
           and not exists (
               select 1 from public.user_gym_memberships where user_id = v_existing.id and is_primary
           )
        then
            update public.user_gym_memberships set is_primary = true
                where user_id = v_existing.id and apt_id = v_candidate_primary_apt_id;
            update public.users set apt_id = v_candidate_primary_apt_id where id = v_existing.id;
        end if;

        update public.attendance_logs set user_id = v_existing.id where user_id = v_candidate.id;

        -- daily_routines 는 (user_id, equip_id, routine_date) 유니크라, 옮기기 전에
        -- existing 이 이미 같은 조합을 갖고 있으면 candidate 쪽을 버린다(진짜 기록 보존).
        delete from public.daily_routines d
        where d.user_id = v_candidate.id
          and exists (
              select 1 from public.daily_routines d2
              where d2.user_id = v_existing.id
                and d2.equip_id = d.equip_id
                and d2.routine_date = d.routine_date
          );
        update public.daily_routines set user_id = v_existing.id where user_id = v_candidate.id;

        -- 그림자 계정을 지운다. candidate 의 phone_number 는 로컬 변수에 이미
        -- 담아 뒀으니, 행이 사라진 뒤에 옮겨야 unique 제약이 잠깐이라도 안 깨진다.
        delete from public.users where id = v_candidate.id;

        if v_existing.phone_number is null then
            update public.users set phone_number = v_candidate_phone where id = v_existing.id;
        end if;

        select * into v_final_user from public.users where id = v_existing.id;
    end if;

    update public.device_pairings
    set consumed_at = now(), consumed_by_auth_user_id = auth.uid()
    where id = v_pairing.id;

    return jsonb_build_object('user', to_jsonb(v_final_user));
end;
$$;

comment on function public.complete_pairing(text) is
    'QR/코드 페어링을 완료한다. 이미 카카오·구글 계정이 있으면 그림자 계정(번호로만 있던 계정)을 흡수 병합한다.';

revoke all on function public.complete_pairing(text) from public;
grant execute on function public.complete_pairing(text) to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 카카오/구글로 처음 로그인했을 때 public.users 행을 만든다(아직 전화번호 없음).
-- 이미 있으면(재로그인) 그대로 돌려준다.
-- ─────────────────────────────────────────────────────────────

create or replace function public.bootstrap_oauth_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user public.users;
begin
    if auth.uid() is null then
        raise exception 'AUTH_REQUIRED' using errcode = '42501';
    end if;

    select * into v_user from public.users where auth_user_id = auth.uid();

    if not found then
        insert into public.users (auth_user_id) values (auth.uid()) returning * into v_user;
    end if;

    return jsonb_build_object('user', to_jsonb(v_user));
end;
$$;

comment on function public.bootstrap_oauth_profile() is
    '카카오/구글 로그인 직후 호출. 처음이면 전화번호 없는 프로필을 만들고, 있으면 그대로 돌려준다.';

revoke all on function public.bootstrap_oauth_profile() from public;
grant execute on function public.bootstrap_oauth_profile() to authenticated;
