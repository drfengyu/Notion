你是一个无头自动化任务。请独立完成「每日 GitHub Trending 去重推送到 Hexo 博客」，全程不要向用户提问，遇到可自动决策的情况自行决定。严格按以下步骤执行：

【路径约定】
- Hexo 博客仓库根目录：E:/Project/Github/Notion
- 文章目录：E:/Project/Github/Notion/source/_posts/github-trending-daily/
- 去重清单：E:/Project/Github/Notion/source/_posts/github-trending-daily/_seen.json （JSON，含 repos 数组，是历史已推送过的所有仓库全名 owner/repo）

【步骤】
1. 确定今天日期（格式 YYYY-MM-DD）。可用 Bash 执行 `date +%F` 获取。

2. 抓取榜单：用 Bash 执行
   `curl -s --max-time 40 -x socks5://127.0.0.1:10808 "https://github.com/trending" -o /tmp/trending.html -w "%{http_code}"`
   （经 v2rayN 的 socks5 代理，本机直连 github 会被网络限制拦截）。
   若状态非 200 或文件为空，重试一次；仍失败则用 WebSearch 搜「GitHub trending today」兜底，并在文章中注明数据来源已降级。

3. 解析：用 Windows 原生 python 解析 HTML（注意 bash 的 /tmp/trending.html 实际路径是 C:\Users\ADMINI~1\AppData\Local\Temp\trending.html）。按 `article class="Box-row"` 切分，每条提取：owner/repo（从 h2 内 a 标签 href）、语言（itemprop="programmingLanguage"）、总 stars（/stargazers 链接内数字）、当日新增 stars（"N stars today"）、描述（p.col-9）。输出为 JSON 到临时文件。务必用 encoding='utf-8' 读写，避免 GBK 报错；不要把含 emoji 的内容 print 到控制台。

4. 去重：读取 _seen.json 的 repos 列表，从抓取结果中剔除所有已出现过的仓库，只保留全新仓库。

5. 选取：从新仓库中按当日新增 star 从高到低选至少 5 个；不足 5 个则尽量多选，并在文章注明今日新增仓库较少。若一个新仓库都没有，则文章正文写明「今日 Trending 榜单中暂无未推送过的新仓库」，仍照常生成并提交（保持每日连续）。

6. 写文章：用 Write 写入 E:/Project/Github/Notion/source/_posts/github-trending-daily/{今天日期}.md。文件开头必须是 Hexo front-matter（顶格，三个连字符）：
   title: GitHub Trending 日报 · {日期}
   date: {日期}
   tags 包含 GitHub、Trending、开源
   categories 为 GitHub 日报
   front-matter 之后是正文。每个仓库一节：序号、[owner/repo](https://github.com/owner/repo) 链接、语言、总 star、+当日新增/天、一句话中文简介（把英文描述翻译/概括为中文）、一句中文亮点。正文第一段（数据来源说明）之后单独加一行 `<!-- more -->`。

7. 更新清单：把本次新推送的仓库全名追加进 _seen.json 的 repos 数组（保留原有全部条目，去重后写回），用 Write 覆盖。

8. 本地验证：Bash 执行 `cd "E:/Project/Github/Notion" && npx hexo generate 2>&1 | tail -5`，确认无 ERROR。

9. 提交推送：Bash 执行
   `cd "E:/Project/Github/Notion" && git add source/_posts/github-trending-daily/ && git commit -m "post: GitHub Trending 日报 {日期}" && git push github master`
   git 凭据由 Windows 凭据管理器托管，无需输入密码。

10. 结束时简要说明：今天推送了哪些新仓库、文章地址（https://notion.fuwari.fun/{年}/{月}/{日}/github-trending-daily/{日期}/）、各步骤成败。

若任何关键步骤失败（抓取、构建、推送），在输出中明确写出失败原因，不要静默失败。
