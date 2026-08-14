variable "region" {
  description = "AWS 리전 (기본: 서울)"
  type        = string
  default     = "ap-northeast-2"
}

variable "name" {
  description = "리소스 이름 접두어"
  type        = string
  default     = "fitroutine-api"
}

variable "instance_type" {
  description = "EC2 인스턴스 크기. t3.micro 는 신규 계정 프리티어 대상. 부족하면 t3.small 로 올린다."
  type        = string
  default     = "t3.micro"
}

variable "ssh_allowed_cidr" {
  description = "SSH(22번 포트) 접속을 허용할 IP 대역. 보안을 위해 '내IP/32' 로 좁히는 것을 권장. 예: 1.2.3.4/32"
  type        = string
  default     = "0.0.0.0/0"
}
