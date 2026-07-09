# 电力交易刷题工具

这是一个离线优先的手机刷题网页。题库来自本地 Excel，生成后可直接通过浏览器访问，也可以部署到任意静态网站。

## 本地使用

```bash
python3 -m http.server 8765
```

然后在手机和电脑处于同一局域网时，用手机访问电脑的局域网地址加端口，例如 `http://192.168.1.10:8765/`。

## 单文件版

如果只想自己使用，不想保持电脑服务在线，可以使用 `dist/电力交易员中级工高级工技师刷题_单文件版_v7.html`。这个文件已经内嵌中级工、高级工和技师题库数据，复制到手机后用浏览器打开即可刷题。

注意：iPhone 的“文件”App 经常只预览 HTML，不完整执行里面的 JavaScript，所以本地 HTML 在 iPhone 上不稳定。想在 iPhone 微信里直接打开，建议发布成 HTTPS 静态网页链接。

重新生成单文件版：

```bash
python3 scripts/build_standalone.py
```

## 微信打开

微信里稳定打开需要 `https://...` 链接。当前可以直接把 GitHub Pages 地址发到微信：

`https://edison-mwj.github.io/power-trader-quiz/`

## GitHub Pages 发布

当前项目根目录就是 GitHub Pages 可发布的静态站点入口：

- 首页：`index.html`
- 题库：`data/questions.js`
- 离线缓存：`service-worker.js`
- PWA 配置：`manifest.webmanifest`

当前线上地址：`https://edison-mwj.github.io/power-trader-quiz/`

发布步骤：

1. 在 GitHub 新建一个空仓库，例如 `power-trader-quiz`。
2. 把本项目推送到仓库的 `main` 分支。
3. 打开仓库 `Settings` -> `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. `Branch` 选择 `main`，目录选择 `/root`，保存。
6. 等待 GitHub 生成 `https://用户名.github.io/power-trader-quiz/`。

## 更新题库

如果原始 Excel 发生变化，重新运行：

```bash
python3 scripts/extract_questions.py
python3 scripts/build_github_pages_split.py
python3 scripts/build_standalone.py
```

然后刷新网页即可。错题和进度保存在当前浏览器本地，换手机或清理浏览器数据后不会自动同步。
