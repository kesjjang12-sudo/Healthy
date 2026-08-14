#!/bin/bash
# EC2 첫 부팅 때 딱 한 번 자동 실행되는 서버 초기 설정 스크립트.
# Node.js 22 + pm2 + nginx 를 설치하고, 3000번 포트에 샘플 API를 띄운 뒤
# nginx 가 80번 포트로 받아서 넘겨주게 한다.
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx curl

# Node.js 22 (NodeSource 공식 저장소)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2

# ── 샘플 API (여기를 실제 백엔드 코드로 교체하면 된다) ──────────────────
mkdir -p /opt/api
cat > /opt/api/server.js <<'EOF'
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'fitroutine-api', time: new Date().toISOString() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ message: 'FitRoutine API 서버가 살아 있습니다. /opt/api 를 실제 코드로 교체하세요.' }));
});

server.listen(3000, () => console.log('API listening on :3000'));
EOF

# pm2 로 상시 실행 + 재부팅 시 자동 시작
sudo -u ubuntu bash -c 'cd /opt/api && pm2 start server.js --name api'
sudo -u ubuntu pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
chown -R ubuntu:ubuntu /opt/api

# ── nginx: 80 → 3000 리버스 프록시 ─────────────────────────────────────
cat > /etc/nginx/sites-available/api <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/api /etc/nginx/sites-enabled/api
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
