"""每日 GitHub Trending 抓取、去重并推送到 Hexo 博客（无 AI 依赖，可后续人工/AI 润色）。"""
import html as html_lib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

BASE = Path(r"E:\Project\Github\Notion")
POSTS_DIR = BASE / "source" / "_posts" / "github-trending-daily"
SEEN_FILE = POSTS_DIR / "_seen.json"
TRENDING_URL = "https://github.com/trending"
PROXY = "socks5://127.0.0.1:10808"
HEXO_CMD = BASE / "node_modules" / ".bin" / "hexo.cmd"


def log(msg):
    print(msg, flush=True)


def run(argv, timeout=120, cwd=None):
    return subprocess.run(
        argv, cwd=cwd, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout,
    )


def find_tool(name):
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"未找到 {name}，请检查 PATH")
    return path


def fetch_trending():
    curl = find_tool("curl")
    last_err = ""
    for attempt, proxy in enumerate([PROXY, PROXY, None], 1):
        tmp = Path(tempfile.gettempdir()) / "trending.html"
        argv = [curl, "-s", "--max-time", "40", "-o", str(tmp), "-w", "%{http_code}"]
        if proxy:
            argv += ["-x", proxy]
        argv.append(TRENDING_URL)
        try:
            r = run(argv, timeout=60)
        except subprocess.TimeoutExpired:
            last_err = "curl 超时"
            continue
        code = (r.stdout or "").strip()
        size = tmp.stat().st_size if tmp.exists() else 0
        if code == "200" and size > 10000:
            source = "经代理抓取" if proxy else "直连抓取（代理不可用，已降级）"
            return tmp.read_text(encoding="utf-8", errors="replace"), source
        last_err = f"第 {attempt} 次尝试失败 http_code={code} size={size}"
        log(last_err)
    raise RuntimeError(f"抓取 GitHub Trending 失败：{last_err}")


def parse_trending(html_text):
    rows = re.split(r'<article class="Box-row">', html_text)[1:]
    repos = []
    for row in rows:
        m = re.search(r'<h2 class="h3 lh-condensed">(.*?)</h2>', row, re.S)
        if not m:
            continue
        hm = re.search(r'href="/([^"]+)"', m.group(1))
        if not hm:
            continue
        full = hm.group(1).strip().strip("/")
        lang = None
        lm = re.search(r'itemprop="programmingLanguage">([^<]+)<', row)
        if lm:
            lang = lm.group(1).strip()
        total = None
        sm = re.search(r'href="/' + re.escape(full) + r'/stargazers"[^>]*>.*?([\d,]+)\s*<', row, re.S)
        if sm:
            total = sm.group(1).replace(",", "")
        today = 0
        tm = re.search(r'([\d,]+)\s+stars today', row)
        if tm:
            today = int(tm.group(1).replace(",", ""))
        desc = None
        dm = re.search(r'<p class="col-9[^"]*"[^>]*>(.*?)</p>', row, re.S)
        if dm:
            desc = re.sub(r"<[^>]+>", "", dm.group(1))
            desc = html_lib.unescape(desc).strip()
            desc = re.sub(r"\s+", " ", desc)
        repos.append({"full": full, "lang": lang, "total": total, "today": today, "desc": desc})
    return repos


def load_seen():
    if SEEN_FILE.exists():
        return json.loads(SEEN_FILE.read_text(encoding="utf-8"))["repos"]
    return []


def save_seen(repos):
    SEEN_FILE.write_text(
        json.dumps({"repos": sorted(set(repos))}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def fmt_stars(v):
    return f"{int(v):,}" if v else "未知"


def build_article(today, new_repos, source_note):
    lines = [
        "---",
        f"title: GitHub Trending 日报 · {today}",
        f"date: {today}",
        "tags:",
        "  - GitHub",
        "  - Trending",
        "  - 开源",
        "categories:",
        "  - GitHub 日报",
        "---",
        "",
    ]
    if new_repos:
        lines.append(
            f"数据来源：[GitHub Trending]({TRENDING_URL})（{source_note}），"
            f"共收录 {len(new_repos)} 个全新仓库，按当日新增 Star 数排序。"
        )
    else:
        lines.append(
            f"数据来源：[GitHub Trending]({TRENDING_URL})（{source_note}）。"
            "今日 Trending 榜单中暂无未推送过的新仓库。"
        )
    lines += ["", "<!-- more -->", ""]
    for i, r in enumerate(new_repos, 1):
        lines += [
            f"## {i}. [{r['full']}](https://github.com/{r['full']})",
            f"- **语言**：{r['lang'] or '未标注'}",
            f"- **总 Star**：{fmt_stars(r['total'])}",
            f"- **当日新增**：+{r['today']:,}/天",
            f"- **简介**：{r['desc'] or '无描述'}",
            "",
        ]
    return "\n".join(lines)


def hexo_generate(today):
    if not HEXO_CMD.exists():
        raise RuntimeError(f"未找到 {HEXO_CMD}")
    r = run(["cmd", "/c", str(HEXO_CMD), "generate"], cwd=BASE, timeout=600)
    output = (r.stdout or "") + (r.stderr or "")
    error_lines = [ln for ln in output.splitlines() if "ERROR" in ln]
    if error_lines:
        # 站内旧文遗留的 ERROR 不阻断推送，但完整记录便于排查
        log("警告：hexo 输出含 ERROR（不影响本次推送则可忽略）：\n" + "\n".join(error_lines))
    log("hexo generate 输出（末尾）：\n" + "\n".join(output.strip().splitlines()[-5:]))
    if r.returncode != 0:
        raise RuntimeError(f"hexo generate 退出码 {r.returncode}")
    public_post = BASE / "public" / today.replace("-", "/") / "github-trending-daily" / today / "index.html"
    if not public_post.exists():
        raise RuntimeError(f"构建产物缺失：{public_post}")


def git_commit_push(today):
    git = find_tool("git")
    run([git, "add", "--", "source/_posts/github-trending-daily"], cwd=BASE)
    r = run([git, "status", "--porcelain", "--", "source/_posts/github-trending-daily"], cwd=BASE)
    if not (r.stdout or "").strip():
        log("git 无待提交变更（可能已提交过），跳过提交")
        return
    r = run([git, "commit", "-m", f"post: GitHub Trending 日报 {today}"], cwd=BASE)
    if r.returncode != 0:
        raise RuntimeError(f"git commit 失败: {(r.stderr or r.stdout).strip()}")
    r = run([git, "push", "origin", "master"], cwd=BASE, timeout=180)
    if r.returncode != 0:
        raise RuntimeError(f"git push 失败: {(r.stderr or r.stdout).strip()}")
    log("已提交并推送到 origin/master")


def main():
    today = date.today().isoformat()
    post_file = POSTS_DIR / f"{today}.md"
    log(f"[{today}] 开始处理每日 GitHub Trending 推送")

    if post_file.exists():
        log(f"今日文章已存在，跳过生成：{post_file.name}")
        seen = load_seen()
        existing = set(re.findall(r"\]\(https://github\.com/([^/)]+/[^/)]+)\)", post_file.read_text(encoding="utf-8")))
        if existing - set(seen):
            save_seen(seen + sorted(existing))
    else:
        html_text, source_note = fetch_trending()
        repos = parse_trending(html_text)
        if not repos:
            raise RuntimeError("解析结果为 0 条，页面结构可能已变化，中止")
        if len(repos) < 5:
            log(f"警告：本次仅解析到 {len(repos)} 条")
        seen = load_seen()
        seen_set = set(seen)
        new_repos = sorted(
            (r for r in repos if r["full"] not in seen_set),
            key=lambda r: r["today"], reverse=True,
        )
        log(f"榜单共 {len(repos)} 个仓库，其中新仓库 {len(new_repos)} 个："
            + ", ".join(r["full"] for r in new_repos))
        post_file.write_text(build_article(today, new_repos, source_note), encoding="utf-8")
        if new_repos:
            save_seen(seen + [r["full"] for r in new_repos])
        log(f"已生成文章：{post_file}")

    hexo_generate(today)
    git_commit_push(today)
    pushed = re.findall(r"\]\(https://github\.com/([^/)]+/[^/)]+)\)", post_file.read_text(encoding="utf-8"))
    log(f"完成。今日收录 {len(pushed)} 个仓库，文章：source/_posts/github-trending-daily/{today}.md")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    try:
        main()
    except Exception as e:
        log(f"失败：{e}")
        sys.exit(1)
