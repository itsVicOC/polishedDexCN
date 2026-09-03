# PolishedDex CN

PolishedDex CN 是一个只面向 **Pokemon Polished Crystal（抛光水晶）** 的中英双语静态图鉴。它把 PolishedDex 的公开数据整理为可搜索、可交叉跳转、可离线使用的本地快照，方便在游玩时查询宝可梦、技能、物品、特性、地点和训练家。

本项目为非官方粉丝工具，不提供 ROM、补丁或游戏文件，也不代表 Nintendo、Game Freak、The Pokemon Company、Polished Crystal 开发团队或 PolishedDex。

## 功能

- 289 个宝可梦：编号、属性、图鉴描述、普通/闪光正背面图、动画图、能力值、特性、携带物、蛋组、进化、技能学习集和获取地点。
- 255 个技能：属性、类别、威力、命中率、PP、效果、TM/HM 来源和可学习宝可梦。
- 396 个物品：分类、买入/卖出价格、效果、使用方式、商店、拾取和获取地点。
- 154 个特性、649 个地点/子区域、761 个训练家及全部战斗阶段和队伍记录。
- 进化链、蛋组、属性相克、能力值排行、事件日历、地图查看器和全局中英搜索。
- 离线工具：队伍构建、伤害计算、捕获率、闪光率、撞树、蛋技能、繁殖兼容、遭遇查找、能力比较和属性相克。
- 47 篇攻略文章：保留英文原文、交叉链接和中文术语对照；详情页支持显示/隐藏中文栏。
- Service Worker 缓存核心数据、详情、工具索引和已访问的媒体资源，首次访问后可在断网环境继续查询。

## 在线地址

GitHub Pages 发布后地址为：

`https://itsvicoc.github.io/polishedDexCN/`

本地预览：

```bash
npm run preview -- --host 127.0.0.1 --port 4177
```

## 开发

环境要求：Node.js 22 或更高版本（Vite 8 的最低版本要求）。

```bash
npm ci
npm run dev
```

生产构建：

```bash
npm run build
npm run validate
```

构建产物在 `dist/`。构建同时生成 `dist/404.html`，用于 GitHub Pages、Netlify、Vercel 等静态托管环境的深链接回退。

## 数据同步

### DeepLX 自动翻译（可选）

需要生成攻略中文内容时，脚本会优先调用 DeepLX；端点只从本地环境变量读取，不会写入前端代码或生成数据。将真实端点保存到被 Git 忽略的 `.env.local`：

```bash
DEEPLX_ENDPOINT=https://your-deeplx-host.example/translate
```

也可以在执行命令前临时设置 `DEEPLX_ENDPOINT`。请求失败、未配置端点或离线运行时，会自动回退到项目维护的离线术语表。不要把真实端点提交到 GitHub。

可通过 `DEEPLX_ENDPOINTS` 提供逗号分隔的备用端点；脚本会按顺序尝试，并以批量请求减少限流。

如果之前因限流生成过回退内容，端点恢复后使用 `DEEPLX_REFRESH=1 npm run locales` 重新精翻攻略与图鉴说明；脚本会保护官方宝可梦、招式、物品、特性和地点名称。

基础同步从 PolishedDex 公开页面读取 Next.js 数据流，并在数量或页面结构变化时失败，避免静默生成不完整快照。

```bash
npm run sync
npm run locales
npm run data
npm run assets
npm run api
npm run validate
```

完整同步（包含进化、攻略、宝可梦、地点、训练家和物品详情）可以使用：

```bash
npm run sync:full
```

各阶段作用：

- `sync`：抓取 `public/data/*-source.json`、事件、进化和攻略详情快照。
- `locales`：生成官方简体中文术语表、攻略翻译，并自动恢复攻略 HTML 属性与静态资源路径；无法离线获取的上游图片使用透明占位，避免部署后出现破图。
- `repair:guides`：单独修复已有攻略快照的标签属性、图片路径和缺失图片占位。
- `data`：生成 `app-data.json`、各类详情 JSON、工具索引和 `app-manifest.json`。
- `assets`：下载本地精灵图、动画 GIF、物品图标、训练家头像和地图瓦片。
- `api`：生成 `/data/pokemon.json`、`/data/moves.json` 等公共数据别名。
- `validate`：校验数量、必需字段、详情文件、资源、双语攻略字段和跨实体引用。

需要单独刷新详情时，可使用：

```bash
FULL_DETAILS=1 npm run sync
FULL_LOCATION_DETAILS=1 npm run sync
FULL_TRAINER_DETAILS=1 npm run sync
FULL_ITEM_DETAILS=1 npm run sync
FULL_EVOLUTION_DETAILS=1 FULL_GUIDES=1 npm run sync
```

## 数据结构

前端通过 `src/data.ts` 的类型化访问层读取数据，不直接依赖上游 HTML 结构。

```text
public/data/app-data.json             核心首屏数据
public/data/details/<kind>/*.json     按实体懒加载的详情
public/data/tools/*.json              工具索引
public/data/guides/*.json             攻略原文和中文对照
public/assets/                        本地媒体资源
public/data/app-manifest.json         快照来源、时间和数量清单
```

## 路由

```text
/pokemon             /moves              /items
/abilities           /locations          /trainers
/evolutions          /egg-groups         /stats
/types               /events             /map
/guides              /about              /tools
/tools/team-builder  /tools/damage       /tools/typechart
/tools/compare       /tools/catchrate    /tools/shinyrates
/tools/headbutt      /tools/eggmoves     /tools/compatibility
/tools/encounter-finder
```

## GitHub Pages

`.github/workflows/deploy-pages.yml` 会在 `main` 分支推送或手动触发时：

1. 安装锁定版本依赖。
2. 使用 `/polishedDexCN/` base 构建 Vite 静态产物。
3. 上传 `dist/` 为 Pages artifact。
4. 通过 GitHub Pages 环境发布。

仓库设置中需要将 Pages 的构建来源设为 **GitHub Actions**。工作流使用官方 Pages Actions，不需要额外服务器或数据库。

## 许可与署名

源数据、攻略结构、地图瓦片和部分媒体来自 [PolishedDex](https://www.polisheddex.app) 的公开页面；具体素材的权利和许可仍归原权利人所有。Pokemon、角色、名称及相关素材归 Nintendo、Game Freak、The Pokemon Company 等各自权利人所有。Polished Crystal 及其代码/内容归开发团队所有。

本项目仅提供索引、翻译对照和离线查询界面。若权利人要求移除或替换素材，请通过仓库 issue 联系维护者。

## 验证

```bash
npm run build
npm run validate
for f in scripts/*.mjs; do node --check "$f"; done
node --check public/sw.js
```

当前快照的校验数量为：289 宝可梦、255 技能、396 物品、154 特性、649 地点、761 训练家、47 攻略。地图资源为当前公开端点可取得的 10 张本地 z1/z2 瓦片；完整地点仍可通过地点列表和详情页检索。
