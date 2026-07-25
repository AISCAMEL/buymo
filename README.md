# BUYMO - 車買取サービス

合同会社アイズが運営する車買取サービス「BUYMO」の公式サイトリポジトリ。

## 構成

```
site/       公開サイト（WPX FTPへ自動デプロイ）
  index.html          トップLP
  buymo.html          買取LP
  buymo-contact.html  お問い合わせ
  area/               都道府県別SEO LP（47件）
  genre/              買取ジャンルLP
  assets/             CSS / JS / 画像
```

## デプロイ

`main` ブランチにpushすると GitHub Actions でWPX FTPへ自動デプロイ。

GitHub Secrets に以下を設定：
- `FTP_HOST`
- `FTP_USER`
- `FTP_PASSWORD`
- `FTP_SERVER_DIR`
