output "public_ip" {
  description = "서버 고정 IP"
  value       = aws_eip.api.public_ip
}

output "api_url" {
  description = "샘플 API 확인 주소 (부팅 후 2~3분 뒤 열린다)"
  value       = "http://${aws_eip.api.public_ip}/health"
}

output "ssh_command" {
  description = "서버 접속 명령"
  value       = "ssh -i ${var.name}.pem ubuntu@${aws_eip.api.public_ip}"
}
