# 用户系统部署指南

## 📋 概述

这是一个为 Hexo 博客集成的完整用户系统，包含用户认证、个人资料、论坛发帖等功能。系统基于 Waline 评论系统扩展。

## 🚀 快速开始

### 第一步：启用 Waline 服务

#### 选项 1：使用 Vercel + MongoDB Atlas（推荐）

1. **创建 MongoDB Atlas 账户**
   - 访问 https://www.mongodb.com/cloud/atlas
   - 注册免费账户
   - 创建一个免费集群
   - 获取连接字符串

2. **部署 Waline 到 Vercel**
   - Fork Waline 仓库：https://github.com/walinejs/waline
   - 在 Vercel 中导入项目
   - 配置环境变量：
     ```
     MONGODB_URI=你的MongoDB连接字符串
     JWT_TOKEN_SECRET=随机生成的密钥
     ```
   - 部署完成后获取服务器地址

3. **配置博客**
   - 编辑 `themes/kratos-rebirth/_config.yml`
   - 修改 Waline 配置：
     ```yaml
     waline:
       serverURL: https://your-waline-server.vercel.app
       comment: true
       pageview: true
     ```

#### 选项 2：自建服务器

1. **克隆 Waline 仓库**
   ```bash
   git clone https://github.com/walinejs/waline.git
   cd waline
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   创建 `.env` 文件：
   ```
   MONGODB_URI=mongodb://user:password@host:port/database
   JWT_TOKEN_SECRET=your-secret-key
   ```

4. **启动服务**
   ```bash
   npm run dev
   ```

5. **配置博客**
   - 修改 `themes/kratos-rebirth/_config.yml`
   - 设置 `serverURL` 为你的服务器地址

### 第二步：集成用户系统

1. **在主题布局中引入用户系统脚本**
   
   编辑 `themes/kratos-rebirth/layout/layout.ejs`，在 `</body>` 前添加：
   ```html
   <div data-waline-server="<%= config.theme.waline.serverURL %>"></div>
   <script src="/js/user-system.js"></script>
   ```

2. **更新导航菜单**
   
   编辑 `themes/kratos-rebirth/_config.yml`，添加用户菜单：
   ```yaml
   menu:
     index: /
     archives: /archives/
     forum: /forum/
     user:
       submenu: true
       login: /user/login/
       register: /user/register/
       profile: /user/profile/
   ```

3. **构建和测试**
   ```bash
   npm run build
   npm run server
   ```

## 📁 文件结构

```
source/
├── user/
│   ├── register.md          # 注册页面
│   ├── login.md             # 登录页面
│   └── profile.md           # 个人资料页面
├── forum/
│   ├── index.md             # 论坛首页
│   └── create.md            # 发帖页面
└── js/
    └── user-system.js       # 用户系统核心模块

themes/kratos-rebirth/
├── layout/
│   ├── user/
│   │   ├── register.ejs     # 注册模板
│   │   ├── login.ejs        # 登录模板
│   │   └── profile.ejs      # 个人资料模板
│   └── forum/
│       ├── index.ejs        # 论坛首页模板
│       └── create.ejs       # 发帖页面模板
└── _config.yml              # 主题配置
```

## 🔧 配置说明

### Waline 服务器配置

在 `themes/kratos-rebirth/_config.yml` 中配置：

```yaml
waline:
  serverURL: https://your-waline-server.vercel.app  # 必填：Waline 服务器地址
  comment: true                                       # 启用评论
  pageview: true                                      # 启用访问统计
  emoji:                                              # 表情配置
    - https://cdn.jsdelivr.net/gh/walinejs/emojis/weibo
  requiredMeta:                                       # 必填字段
    - name
    - email
  wordLimit: 0                                        # 评论字数限制（0 为无限制）
  imageUploadType: image                              # 图片上传类型
```

### 用户系统 API 端点

用户系统通过以下 API 端点与 Waline 服务器通信：

```
POST   /api/auth/register          # 用户注册
POST   /api/auth/login             # 用户登录
POST   /api/users/profile/update   # 更新个人资料
GET    /api/users/:id/profile      # 获取用户信息
POST   /api/users/:id/follow       # 关注用户
POST   /api/posts/create           # 创建帖子
GET    /api/posts/list             # 获取帖子列表
GET    /api/posts/:id              # 获取帖子详情
POST   /api/posts/:id/like         # 点赞帖子
POST   /api/posts/:id/collect      # 收藏帖子
```

## 🔐 安全配置

### 1. 启用 HTTPS

确保所有通信都使用 HTTPS：

```yaml
# _config.yml
url: https://your-domain.com
```

### 2. 配置 CORS

在 Waline 服务器配置中添加 CORS 设置：

```javascript
// Waline 服务器配置
module.exports = {
  cors: {
    origin: ['https://your-domain.com'],
    credentials: true,
  },
};
```

### 3. 密码安全

- 密码最少 6 个字符
- 使用 bcrypt 加密存储
- 支持密码重置功能

### 4. JWT 令牌

- 设置安全的 JWT_TOKEN_SECRET
- 令牌有效期：7 天
- 支持令牌刷新

## 📊 数据库模型

### 用户表 (users)

```javascript
{
  _id: ObjectId,
  email: String,                    // 邮箱（唯一）
  username: String,                 // 用户名（唯一）
  password: String,                 // 密码（bcrypt 加密）
  avatar: String,                   // 头像 URL
  bio: String,                      // 个人简介
  website: String,                  // 个人网站
  location: String,                 // 所在地
  level: Number,                    // 用户等级
  points: Number,                   // 积分
  followers: [ObjectId],            // 粉丝列表
  following: [ObjectId],            // 关注列表
  postsCount: Number,               // 发帖数
  commentsCount: Number,            // 评论数
  likesCount: Number,               // 获赞数
  isAdmin: Boolean,                 // 是否为管理员
  isBanned: Boolean,                // 是否被禁言
  createdAt: Date,                  // 创建时间
  updatedAt: Date,                  // 更新时间
}
```

### 帖子表 (posts)

```javascript
{
  _id: ObjectId,
  author: ObjectId,                 // 作者 ID
  title: String,                    // 标题
  content: String,                  // 内容
  category: String,                 // 分类
  tags: [String],                   // 标签
  likes: Number,                    // 点赞数
  comments: Number,                 // 评论数
  views: Number,                    // 浏览数
  createdAt: Date,                  // 创建时间
  updatedAt: Date,                  // 更新时间
  isDeleted: Boolean,               // 是否删除
}
```

## 🧪 测试

### 功能测试清单

- [ ] 用户注册
- [ ] 邮箱验证
- [ ] 用户登录
- [ ] 个人资料编辑
- [ ] 头像上传
- [ ] 发布新帖
- [ ] 编辑帖子
- [ ] 删除帖子
- [ ] 点赞帖子
- [ ] 收藏帖子
- [ ] 关注用户
- [ ] 评论帖子
- [ ] 用户登出

### 性能测试

```bash
# 并发用户测试
ab -n 1000 -c 100 https://your-domain.com/forum/

# 页面加载时间
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com/forum/
```

## 🐛 故障排查

### 问题 1：无法连接到 Waline 服务器

**症状**：用户系统无法初始化

**解决方案**：
1. 检查 `serverURL` 配置是否正确
2. 确保 Waline 服务器正在运行
3. 检查网络连接和防火墙设置

### 问题 2：用户注册失败

**症状**：注册表单提交后无反应

**解决方案**：
1. 检查浏览器控制台错误信息
2. 验证邮箱格式是否正确
3. 确保密码符合要求（至少 6 个字符）

### 问题 3：头像无法上传

**症状**：上传头像后不显示

**解决方案**：
1. 检查图片 URL 是否有效
2. 确保图片格式支持（JPG、PNG、GIF）
3. 检查 CORS 配置

## 📈 性能优化

### 1. 缓存策略

```javascript
// 启用浏览器缓存
Cache-Control: max-age=3600
```

### 2. 数据库索引

```javascript
// 创建索引以提高查询性能
db.users.createIndex({ email: 1 });
db.users.createIndex({ username: 1 });
db.posts.createIndex({ author: 1 });
db.posts.createIndex({ createdAt: -1 });
```

### 3. CDN 配置

使用 CDN 加速静态资源：

```yaml
# _config.yml
vendors:
  cdn: https://cdn.jsdelivr.net
```

## 🔄 更新和维护

### 定期备份

```bash
# 备份 MongoDB 数据
mongodump --uri="mongodb://user:password@host:port/database" --out=./backup
```

### 监控日志

```bash
# 查看 Waline 服务器日志
pm2 logs waline
```

## 📞 获取帮助

- 查看 [Waline 官方文档](https://waline.js.org/)
- 提交 [GitHub Issue](https://github.com/walinejs/waline/issues)
- 加入社区讨论

## 📝 许可证

本项目遵循 MIT 许可证。

---

**最后更新**：2026-05-19
**版本**：1.0
**状态**：生产就绪
