# Gitalk 论坛配置指南

## 📋 概述

这是一个基于 Gitalk 的简化版论坛系统。Gitalk 是一个基于 GitHub Issues 的评论系统，无需后端服务器。

## 🚀 快速开始

### 第一步：创建 GitHub OAuth Application

1. 访问 [GitHub OAuth Apps](https://github.com/settings/developers)
2. 点击 "New OAuth App"
3. 填写应用信息：
   - **Application name**: 你的博客名称
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://your-domain.com`
4. 创建后获取 **Client ID** 和 **Client Secret**

### 第二步：配置博客

编辑 `themes/kratos-rebirth/_config.yml`：

```yaml
comments:
  provider: 'gitalk'

gitalk:
  clientID: 'your-client-id'
  clientSecret: 'your-client-secret'
  repo: 'your-repo-name'
  owner: 'your-github-username'
  admin:
    - 'your-github-username'
  distractionFreeMode: false
```

**参数说明**：
- `clientID`: GitHub OAuth App 的 Client ID
- `clientSecret`: GitHub OAuth App 的 Client Secret
- `repo`: 用于存储评论的 GitHub 仓库名称
- `owner`: 仓库所有者的 GitHub 用户名
- `admin`: 管理员列表（可以删除评论）

### 第三步：构建和测试

```bash
npm run build
npm run server
# 访问 http://localhost:4000/forum/
```

## 📖 使用说明

### 访问论坛

1. 打开博客，点击导航栏中的"论坛"
2. 在评论区发起新的讨论
3. 第一次评论时需要授权 GitHub 账户

### 发起讨论

1. 在评论区输入你的想法
2. 点击"评论"按钮
3. 授权 GitHub 账户（首次需要）
4. 评论发布成功

### 管理评论

- **删除评论**：只有管理员可以删除评论
- **编辑评论**：在 GitHub Issues 中直接编辑
- **查看所有讨论**：访问 GitHub 仓库的 Issues 页面

## 🔧 高级配置

### 自定义标签

在 `themes/kratos-rebirth/layout/forum/simple.ejs` 中修改：

```javascript
labels: ['forum'],  // 改为你想要的标签
```

### 自定义语言

```javascript
language: 'zh-CN',  // 支持: 'en', 'zh-CN', 'zh-TW', 'es-ES', 'fr-FR', 'it-IT', 'ja-JP', 'ko-KR', 'pt-BR', 'ru-RU'
```

### 自定义分页

```javascript
perPage: 15,  // 每页显示的评论数
pagerDirection: 'last',  // 'first' 或 'last'
```

## 🔐 安全建议

1. **不要在代码中暴露 Client Secret**
   - 使用环境变量或配置文件
   - 不要提交到公开仓库

2. **限制 OAuth 应用权限**
   - 只授予必要的权限
   - 定期检查授权应用

3. **使用专用仓库**
   - 为评论创建专用的 GitHub 仓库
   - 不要使用主博客仓库

## 📊 性能优化

### 缓存 Gitalk 脚本

在 `_config.yml` 中配置 CDN：

```yaml
vendors:
  cdn: https://cdn.jsdelivr.net
```

### 延迟加载

修改 `simple.ejs` 中的脚本加载方式：

```javascript
// 使用 defer 属性延迟加载
script.defer = true;
```

## 🐛 常见问题

### Q: 评论不显示？
A: 检查以下几点：
1. GitHub OAuth 配置是否正确
2. 仓库是否存在且可访问
3. 浏览器控制台是否有错误信息

### Q: 如何删除评论？
A: 只有管理员可以删除评论。访问 GitHub 仓库的 Issues 页面，找到对应的 Issue，删除评论。

### Q: 如何迁移评论？
A: Gitalk 的评论存储在 GitHub Issues 中，可以通过 GitHub API 导出。

### Q: 支持匿名评论吗？
A: 不支持。所有评论都需要 GitHub 账户。

## 📚 相关资源

- [Gitalk 官方文档](https://github.com/gitalk/gitalk)
- [GitHub OAuth 文档](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Kratos Rebirth 主题](https://github.com/Candinya/Kratos-Rebirth)

## 🔄 更新日志

### v1.0 (2026-05-19)
- ✅ 实现基于 Gitalk 的简化版论坛
- ✅ 添加论坛菜单到导航栏
- ✅ 完整的配置指南

---

**最后更新**：2026-05-19  
**版本**：1.0  
**状态**：生产就绪
