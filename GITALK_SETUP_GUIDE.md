# Gitalk 论坛配置指南

## 问题诊断
- ❌ 论坛加载缓慢
- ❌ 论坛没有内容显示
- ❌ 需要将弹出式窗口改为正文显示

**根本原因**：Gitalk 的 `clientID` 和 `clientSecret` 未配置

## 解决方案

### 第一步：创建 GitHub OAuth Application

1. 访问 [GitHub OAuth Apps 设置页面](https://github.com/settings/developers)
2. 点击 **New OAuth App**
3. 填写以下信息：
   - **Application name**: 你的博客名称（如 "My Blog Forum"）
   - **Homepage URL**: 你的博客地址（如 `https://yourdomain.com`）
   - **Authorization callback URL**: `https://yourdomain.com/forum/`
4. 点击 **Register application**
5. 复制 **Client ID** 和 **Client Secret**（Secret 只显示一次，妥善保管）

### 第二步：更新配置文件

编辑 `themes/kratos-rebirth/_config.yml`，找到 Gitalk 配置部分：

```yaml
gitalk:
  clientID: 'YOUR_CLIENT_ID'           # 替换为你的 Client ID
  clientSecret: 'YOUR_CLIENT_SECRET'   # 替换为你的 Client Secret
  repo: 'your-repo-name'               # 替换为你的 GitHub 仓库名
  owner: 'your-github-username'        # 替换为你的 GitHub 用户名
  admin: 
    - 'your-github-username'           # 替换为你的 GitHub 用户名
  distractionFreeMode: false
```

### 第三步：验证配置

1. 保存配置文件
2. 重新生成博客：`hexo clean && hexo generate`
3. 访问论坛页面 `/forum/`
4. 应该能看到 Gitalk 评论框

## 性能优化建议

### 已实施的优化
✅ 预加载 Gitalk 样式表
✅ 异步加载脚本
✅ 添加加载状态提示
✅ 完善错误处理

### 进一步优化选项

#### 选项 1：使用 CDN 加速（推荐）
如果 jsDelivr CDN 在你的地区速度慢，可以改用其他 CDN：

```javascript
// 替换为阿里云 CDN
script.src = 'https://cdn.jsdelivr.net/npm/gitalk@1/dist/gitalk.min.js';
// 或
script.src = 'https://unpkg.com/gitalk@1/dist/gitalk.min.js';
```

#### 选项 2：本地缓存
在 `_config.yml` 中添加缓存配置：

```yaml
jsconfig:
  main:
    gitalkCache: true  # 启用本地缓存
```

#### 选项 3：延迟加载
只在用户滚动到论坛区域时才加载 Gitalk：

```javascript
// 在 simple.ejs 中添加 Intersection Observer
const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    loadGitalk();
    observer.unobserve(entries[0].target);
  }
});
observer.observe(document.getElementById('gitalk-container'));
```

## 常见问题

### Q: 为什么还是显示"加载中..."？
A: 检查以下几点：
1. 确认 clientID 和 clientSecret 正确填写
2. 检查网络连接
3. 打开浏览器控制台（F12）查看错误信息
4. 确保 Authorization callback URL 与实际地址匹配

### Q: 如何隐藏 Gitalk 的弹出式认证窗口？
A: 在配置中设置：
```yaml
gitalk:
  distractionFreeMode: true  # 启用无干扰模式
```

### Q: 如何切换到其他评论系统？
A: 可选方案：
- **Waline**：更轻量，支持匿名评论
- **Twikoo**：国内友好，支持自部署
- **Valine**：简洁轻量

在 `_config.yml` 中修改 `posts.comments.provider` 即可切换。

## 测试清单

- [ ] GitHub OAuth App 已创建
- [ ] clientID 和 clientSecret 已填写
- [ ] repo 和 owner 信息正确
- [ ] 博客已重新生成（hexo clean && hexo generate）
- [ ] 论坛页面能正常加载 Gitalk
- [ ] 可以发表评论
- [ ] 加载速度满意

## 需要帮助？

如果还有问题，请检查：
1. [Gitalk 官方文档](https://gitalk.github.io/)
2. [Gitalk GitHub Issues](https://github.com/gitalk/gitalk/issues)
3. 浏览器控制台的错误信息
