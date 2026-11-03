# 天津初中英语单词 · GitHub Pages 发布说明

当前仓库：`https://github.com/zy835940305/englishwords`

一个纯静态的 iPad / 手机 Web App（PWA），**零外部依赖**，完全离线可用。
所有资源都使用**相对路径**，因此可以直接部署在 GitHub Pages 的项目子路径下
（例如 `https://<用户名>.github.io/<仓库名>/`）。

## 一、站点文件清单

放在仓库**根目录**（`index.html` 必须位于站点根，即压缩包/仓库的顶层）：

```
index.html                 单页应用入口
styles.css                 样式（暗色玻璃 + 渐变）
logic.js                   内容生成与算法层
app.js                     交互 / 路由 / 状态 / localStorage
words.js                   词表数据（1897 条，勿改数据）
site.webmanifest           PWA 清单
sw.js                      Service Worker（离线缓存）
icon.svg                   图标（纯手写 SVG）
.nojekyll                  关闭 Jekyll（下划线开头文件更安全）
README_GITHUB_PAGES.md     本说明
.github/workflows/deploy-pages.yml   GitHub Actions 自动部署
```

> `words.json` / `words.csv` 是词表的其他格式，**不需要**上传到站点，
> 请勿把它们打进发布压缩包。

## 二、方式 A：GitHub Actions 自动部署（推荐）

1. 新建仓库，把上述文件（含 `.github/workflows/deploy-pages.yml`）推送到 `main` 或 `master` 分支。
2. 打开仓库 **Settings → Pages**。
3. **Build and deployment → Source** 选择 **GitHub Actions**。
4. 之后每次 push 到 `main`/`master`，工作流会自动把仓库根目录发布为站点。
   也可以在 **Actions** 页手动触发 `Deploy to GitHub Pages`（workflow_dispatch）。
5. 部署完成后，页面地址形如：`https://<用户名>.github.io/<仓库名>/`。

工作流使用 `actions/upload-pages-artifact` 上传仓库根目录（`path: .`），
因此 `index.html` 就在站点根，访问子路径不会 404。

## 三、方式 B：手动发布（无需 Actions）

1. 仓库 **Settings → Pages → Source** 选择 **Deploy from a branch**。
2. 选择分支（如 `main`）与目录 `/ (root)`，保存。
3. 等 1～2 分钟后访问 `https://<用户名>.github.io/<仓库名>/`。

`.nojekyll` 文件会阻止 GitHub Pages 用 Jekyll 处理站点，避免下划线开头的
文件或目录被忽略。

## 四、本地预览

Service Worker 只在 `http(s)` 下注册，因此不要用 `file://` 直接打开
`index.html`（页面仍可用，但无法离线缓存）。推荐起一个本地服务：

```bash
cd 站点目录
python3 -m http.server 8123
# 浏览器打开 http://localhost:8123/
```

## 五、iPad 上安装为 App

Safari 打开站点 → 点「分享」→「添加到主屏幕」。
之后从主屏图标启动即为全屏 App，且可离线使用（首次访问会缓存全部资源）。

## 六、常见问题

- **子路径 404**：确认站点文件位于仓库根目录，且 `index.html` 就是入口；
  本应用所有引用都是相对路径（`./xxx`），无需修改。
- **更新不生效**：Service Worker 有缓存。改动资源后请把 `sw.js` 顶部的
  `CACHE` 版本号（如 `tjw-cache-v1` → `v2`）升一位，用户下次打开会拉到新版本。
- **数据只在本地**：学习进度、错词本、设置都存在浏览器 `localStorage`，
  不上传任何服务器；换设备或清空浏览器数据会丢失。
