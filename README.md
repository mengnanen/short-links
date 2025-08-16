## 介绍

首先感谢原项目 [https://github.com/x-dr/short](https://github.com/x-dr/short) 的开源，本项目是在其基础上进行优化和功能增强的版本。

**相比原项目，本项目的改进如下：**

*   **UI 大改造：** 重新设计了用户界面，使其更加美观、现代化，并增强了用户体验。
*   **过期时间选项：** 增加了短链接过期时间选项，更加灵活。

## 演示
[https://url.wangwangit.com/](https://url.wangwangit.com/)

## 使用 Cloudflare Pages 部署

1.  **Fork 本项目**
2.  **登录 Cloudflare 控制台：** [https://dash.cloudflare.com/](https://dash.cloudflare.com/)
3.  **创建 Pages 项目：** 在您的 Cloudflare 账户中，选择 `Pages` > `创建项目` > `连接到 Git`。
4.  **选择仓库并部署：** 选择您 Fork 的项目仓库，在 `设置构建和部署` 部分保持默认设置，然后点击 `保存并部署`。
5.  **创建 D1 数据库：** 参考 [https://github.com/x-dr/telegraph-Image/blob/main/docs/manage.md](https://github.com/x-dr/telegraph-Image/blob/main/docs/manage.md) 创建一个 D1 数据库。
6.  **创建数据库表：** 在 D1 数据库控制台中执行以下 SQL 命令创建表：
```sql
-- 先删表（可选）
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS logs;

-- 建 links 表
CREATE TABLE IF NOT EXISTS links (
  id           INTEGER PRIMARY KEY NOT NULL,
  url          TEXT NOT NULL,
  slug         TEXT UNIQUE,
  ua           TEXT,
  ip           TEXT,
  status       INTEGER DEFAULT 1,
  create_time  TEXT DEFAULT (datetime('now')),
  expires_at   TEXT          
);

-- 建 logs 表
CREATE TABLE IF NOT EXISTS logs (
  id           INTEGER PRIMARY KEY NOT NULL,
  url          TEXT,
  slug         TEXT,
  referer      TEXT,
  ua           TEXT,
  ip           TEXT,
  create_time  TEXT DEFAULT (datetime('now'))
);

--（可选）索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
CREATE INDEX IF NOT EXISTS idx_logs_slug ON logs(slug);

-- 快速质检，能看到 links 和 logs 两个表即成功
SELECT name, sql FROM sqlite_master WHERE type='table';

-- 追加密码
ALTER TABLE links ADD COLUMN password TEXT;
```

## API
短链接生成
```
# POST /create
curl -X POST -H "Content-Type: application/json" -d '{"url":"https://url.wangwangit.com"}' https://url.wangwangit.com/create

# 指定 slug
curl -X POST -H "Content-Type: application/json" -d '{"url":"https://url.wangwangit.com","slug":"example"}' https://url.wangwangit.com/create

# 设置过期时间
curl -X POST -H "Content-Type: application/json" -d '{"url":"https://url.wangwangit.com", "expiry": "5m"}' https://url.wangwangit.com/create

# 响应示例
{
  "slug": "<slug>",
  "link": "http://d.131213.xyz/<slug>"
}
```
