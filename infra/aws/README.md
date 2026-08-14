# AWS 백엔드/API 서버 자동 구성

이 폴더의 파일들을 실행하면 AWS에 백엔드용 서버가 **자동으로** 만들어진다.
명령 몇 개만 치면 되고, 서버 내부 설정(Node.js, nginx, 프로세스 관리)까지
전부 자동이다.

## 만들어지는 것

| 리소스 | 내용 |
|---|---|
| EC2 서버 1대 | Ubuntu 24.04, t3.micro (신규 계정 프리티어 → 사실상 무료) |
| 고정 IP | 서버를 재시작해도 주소가 안 바뀜 |
| 방화벽 | SSH(22), HTTP(80), HTTPS(443)만 열림 |
| SSH 키 | 자동 생성 → 이 폴더에 `fitroutine-api.pem` 으로 저장됨 |
| 서버 내부 | Node.js 22 + pm2 + nginx + 샘플 API 자동 설치 |

리전은 서울(ap-northeast-2) 기본값.

## 준비물 (한 번만)

1. **AWS 액세스 키 발급**: AWS 콘솔 → 오른쪽 위 계정 이름 → 보안 자격 증명
   → 액세스 키 → 「액세스 키 만들기」. 나오는 **Access key ID** 와
   **Secret access key** 두 값을 복사해 둔다. (Secret 은 이때 한 번만 보여줌)
2. **AWS CLI 설치**: https://aws.amazon.com/ko/cli/ 에서 설치 후 터미널에서:
   ```bash
   aws configure
   # Access Key ID / Secret Access Key 붙여넣기
   # Default region name: ap-northeast-2
   # Default output format: (그냥 엔터)
   ```
3. **Terraform 설치**: https://developer.hashicorp.com/terraform/install
   (macOS 는 `brew install terraform`, Windows 는 설치 파일 다운로드)

## 서버 만들기 (자동)

```bash
cd infra/aws
terraform init      # 처음 한 번만
terraform apply     # 만들어질 목록을 보여줌 → yes 입력
```

2~3분 뒤 완료되면 화면에 이렇게 나온다:

```
api_url     = "http://x.x.x.x/health"
public_ip   = "x.x.x.x"
ssh_command = "ssh -i fitroutine-api.pem ubuntu@x.x.x.x"
```

- `api_url` 을 브라우저에서 열어 `{"ok":true,...}` 가 나오면 성공.
  (서버 부팅 직후라면 2~3분 더 기다렸다가 새로고침)
- `ssh_command` 를 터미널에 붙여넣으면 서버에 접속된다.

## 내 백엔드 코드 올리기

샘플 API 는 서버의 `/opt/api/server.js` 에 있다. 접속해서 교체하면 된다:

```bash
ssh -i fitroutine-api.pem ubuntu@<public_ip>
cd /opt/api
# 코드 수정/교체 후:
pm2 restart api
```

pm2 가 프로세스를 관리하므로 서버가 재부팅돼도 API 는 자동으로 다시 뜬다.

## 서버 지우기 (요금 정리)

필요 없어지면 아래 한 줄로 전부 삭제된다:

```bash
terraform destroy   # yes 입력
```

## 주의

- 이 폴더에 생기는 `fitroutine-api.pem`(서버 열쇠)과 `terraform.tfstate`(상태
  파일)는 **절대 GitHub 에 올리면 안 된다**. `.gitignore` 에 이미 막아 뒀지만,
  파일을 다른 곳으로 옮기지도 말 것.
- 프리티어(가입 후 12개월, t3.micro 월 750시간)를 벗어나면 t3.micro 기준
  월 1만 원 안팎의 요금이 나온다. AWS 콘솔 → Billing 에서 확인 가능.
- SSH 를 전 세계에 열어두기 싫으면 `terraform apply -var 'ssh_allowed_cidr=내IP/32'`
  처럼 내 IP 만 허용할 수 있다. (내 IP 는 https://checkip.amazonaws.com 에서 확인)
- 도메인을 연결하고 HTTPS 를 붙이려면 서버 접속 후:
  ```bash
  sudo apt install -y certbot python3-certbot-nginx
  sudo certbot --nginx -d 내도메인.com
  ```

## 참고: 이 앱(FitRoutine)과의 관계

현재 FitRoutine 은 웹은 GitHub Pages, 백엔드는 Supabase 로 돌아가고 있어서
이 서버가 없어도 앱 운영에는 지장이 없다. 이 구성은 별도 백엔드/API 가
필요할 때 쓰는 독립 인프라다.
