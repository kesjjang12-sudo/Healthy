# FitRoutine 백엔드/API 서버 — AWS 자동 구성 (Terraform)
#
# 만들어지는 것:
#   - EC2 인스턴스 1대 (Ubuntu 24.04, 기본 프리티어급 t3.micro)
#   - 고정 IP (Elastic IP) — 서버를 재시작해도 주소가 바뀌지 않는다
#   - 방화벽 (보안 그룹): SSH(22), HTTP(80), HTTPS(443)만 연다
#   - SSH 접속 키: 자동 생성해서 로컬에 fitroutine-api.pem 으로 저장
#   - 서버 초기 설정: Node.js 22 + pm2 + nginx + 샘플 API 자동 설치 (user_data.sh)
#
# 사용법은 같은 폴더의 README.md 참고.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ── 네트워크: 계정의 기본 VPC를 그대로 쓴다 (별도 비용 없음) ──────────────

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ── OS 이미지: 우분투 24.04 LTS 최신판 ──────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical (우분투 공식)

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── SSH 키: 자동 생성 → 로컬 pem 파일로 저장 ────────────────────────────

resource "tls_private_key" "ssh" {
  algorithm = "ED25519"
}

resource "aws_key_pair" "api" {
  key_name   = "${var.name}-key"
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "local_sensitive_file" "pem" {
  content         = tls_private_key.ssh.private_key_openssh
  filename        = "${path.module}/${var.name}.pem"
  file_permission = "0600"
}

# ── 방화벽 (보안 그룹) ──────────────────────────────────────────────────

resource "aws_security_group" "api" {
  name        = "${var.name}-sg"
  description = "FitRoutine API server: SSH/HTTP/HTTPS"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-sg" }
}

# ── EC2 인스턴스 ───────────────────────────────────────────────────────

resource "aws_instance" "api" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.api.id]
  key_name               = aws_key_pair.api.key_name
  user_data              = file("${path.module}/user_data.sh")

  root_block_device {
    volume_size = 20 # GB — 프리티어 한도(30GB) 안
    volume_type = "gp3"
  }

  tags = { Name = var.name }
}

# ── 고정 IP ────────────────────────────────────────────────────────────

resource "aws_eip" "api" {
  instance = aws_instance.api.id
  domain   = "vpc"
  tags     = { Name = "${var.name}-eip" }
}
