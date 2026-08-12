-- 연령대에 10·20·30대를 추가한다.
--
-- 처음엔 시니어 위주로 40대부터만 받았는데, 아파트 헬스장은 온 가족이 쓰는 곳이라
-- 자녀·젊은 세대가 그대로 막혔다. 연령대를 못 고르면 설문 자체를 못 끝낸다.
--
-- routine_templates 는 age_modifiers 를 크로스 조인해 만들어지므로, 여기에 줄만
-- 넣고 rebuild 를 다시 돌리면 조합이 알아서 채워진다.
-- (성별 2 × 연령 7 × 운동목적 15가지 = 210개)

insert into public.age_modifiers (age_group, weight_multiplier, set_delta) values
    -- 10대는 아직 크는 중이라 20~30대보다 낮게 잡는다. 힘이 모자라서가 아니라
    -- 성장판을 생각해 가볍게 여러 번 하는 쪽이 안전하기 때문이다.
    (10, 0.75, 0),
    (20, 1.15, 0),
    (30, 1.10, 0)
on conflict (age_group) do nothing;

select public.rebuild_routine_templates();
