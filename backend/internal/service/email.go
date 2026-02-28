package service

import (
	"crypto/tls"
	"fmt"
	"net/smtp"

	resend "github.com/resend/resend-go/v2"
	"github.com/inscripoem/bta-voting-system/backend/internal/config"
)

type EmailSender interface {
	SendVerificationCode(to, code string) error
	SendUpgradeVerification(to, link string) error
}

type ResendSender struct {
	client    *resend.Client
	fromEmail string
}

func NewResendSender(apiKey, from string) *ResendSender {
	return &ResendSender{client: resend.NewClient(apiKey), fromEmail: from}
}

func (s *ResendSender) SendVerificationCode(to, code string) error {
	_, err := s.client.Emails.Send(&resend.SendEmailRequest{
		From:    s.fromEmail,
		To:      []string{to},
		Subject: "大二杯 - 邮箱验证码",
		Html:    fmt.Sprintf("<p>你的验证码是：<strong>%s</strong>，5分钟内有效。</p>", code),
	})
	return err
}

func (s *ResendSender) SendUpgradeVerification(to, link string) error {
	_, err := s.client.Emails.Send(&resend.SendEmailRequest{
		From:    s.fromEmail,
		To:      []string{to},
		Subject: "大二杯 - 账号升级验证",
		Html:    fmt.Sprintf(`<p>点击以下链接完成账号升级：</p><a href="%s">%s</a><p>链接10分钟内有效。</p>`, link, link),
	})
	return err
}

type SMTPSender struct {
	host      string
	port      int
	user      string
	pass      string
	fromEmail string
}

func NewSMTPSender(cfg *config.Config) *SMTPSender {
	return &SMTPSender{
		host:      cfg.SMTPHost,
		port:      cfg.SMTPPort,
		user:      cfg.SMTPUser,
		pass:      cfg.SMTPPass,
		fromEmail: cfg.EmailFrom,
	}
}

func (s *SMTPSender) send(to, subject, body string) error {
	auth := smtp.PlainAuth("", s.user, s.pass, s.host)
	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		s.fromEmail, to, subject, body,
	)
	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	tlsCfg := &tls.Config{ServerName: s.host}
	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return err
	}
	c, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return err
	}
	defer c.Quit()
	if err = c.Auth(auth); err != nil {
		return err
	}
	if err = c.Mail(s.fromEmail); err != nil {
		return err
	}
	if err = c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	_, err = w.Write([]byte(msg))
	w.Close()
	return err
}

func (s *SMTPSender) SendVerificationCode(to, code string) error {
	return s.send(to, "大二杯 - 邮箱验证码",
		fmt.Sprintf("<p>你的验证码是：<strong>%s</strong>，5分钟内有效。</p>", code))
}

func (s *SMTPSender) SendUpgradeVerification(to, link string) error {
	return s.send(to, "大二杯 - 账号升级验证",
		fmt.Sprintf(`<p>点击以下链接完成账号升级：</p><a href="%s">%s</a><p>链接10分钟内有效。</p>`, link, link))
}

func NewEmailSender(cfg *config.Config) EmailSender {
	if cfg.EmailProvider == "resend" {
		return NewResendSender(cfg.ResendAPIKey, cfg.EmailFrom)
	}
	return NewSMTPSender(cfg)
}
