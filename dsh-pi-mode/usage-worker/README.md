# DSH-Pi 使用统计接收端

Worker 写入 `usage_day`，按北京时间自然日及周一开头的自然周去重。每天北京时间 00:17 归档已结束周期并清理 14 天前的逐安装数据。D1 免费计划可在删除后回溯 7 天。

在 Cloudflare D1 控制台打开 `dsh-pi-usage`，查询面板使用以下汇总。`version` 为空时表示全体，`code_mode / pi_plus` 是 Code Mode 采用率。

```sql
SELECT starts, NULLIF(version, '') AS version, active, pi, pi_plus, pi_im, code_mode
FROM usage_stats WHERE period = 'week'
ORDER BY starts DESC, version LIMIT 30;
```

初始化数据库使用 `schema.sql`。部署配置在 `wrangler.jsonc`，查询权限由 Cloudflare 账号管理。
