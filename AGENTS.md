# 给 agent 的仓库须知

动手前读 [CONTRIBUTING.md](CONTRIBUTING.md)，按其中「修改与验证」「发布」逐条执行。最容易漏的几件：

- **合集索引 `index.json` 必须跟着 npm 走。** 它是 DSH 插件页「索引源」读取的目录，由 `node scripts/build-index.mjs` 生成，不要手改。用 `scripts/publish-npm.sh` 发布会自动重新生成并提交，之后记得 `git push origin main`；不经该脚本发布，或改了插件的 locale 标题／说明、图标、关键词，就手动运行一次再提交。CI「合集索引」任务落后即失败。
- 改了插件就同步升版本：插件 `package.json`、插件 README 与根 README 的版本表和固定 Git 地址、`CHANGELOG.md`。提交前运行 `npm run check`。
- 推送、打标签、发 Release、发 npm 都是对外发布，先得到仓库所有者同意。
