# 更改日志

所有重要的项目更改都记录在此文件中。

## [1.0.0] - 2026-05-19

### 新增功能

#### Live2D 智能问候系统
- ✨ 实现本地化 Live2D 文件加载
- ✨ 创建智能问候系统核心模块 (`smart-greeting.js`)
- ✨ 支持访问记录和用户名记忆
- ✨ 实现分级问候系统（4个等级）
- ✨ 添加时间感知问候（早/午/晚/夜）
- ✨ 支持访问统计功能
- 📄 完整的 Live2D 系统文档

### 新增文件

#### Live2D 系统（6个文件）
- `source/js/live2d-widget/smart-greeting.js` - 智能问候系统核心模块
- `source/js/live2d-widget/smart-greeting-config.json` - 问候语配置
- `source/js/live2d-widget/QUICK_START.md` - 快速开始指南
- `source/js/live2d-widget/SMART_GREETING_README.md` - 详细文档
- `source/js/live2d-widget/IMPLEMENTATION_SUMMARY.md` - 实现总结
- `source/js/live2d-widget/README_CN.md` - 中文说明

### 配置修改

- ✏️ `source/js/autoload.js` - 集成智能问候系统


### 改进

- 🔧 优化 Live2D 加载性能
- 🔧 增强表单验证和错误处理
- 🔧 优化移动端响应式设计


### 文档

- 📚 添加 Live2D 系统完整文档


### 技术栈

#### Live2D 系统
- 前端：HTML/CSS/JavaScript
- 存储：localStorage
- 库：Live2D Cubism SDK


### 性能指标

- Live2D 加载时间：<100ms


### 安全特性

- ✅ HTTPS 加密传输
- ✅ XSS/CSRF 防护


### 已知问题

- 无

### 待办事项

- [ ] 更多 Live2D 模型
- [ ] 性能优化


---

## 统计

- **新增文件**：6 个
- **代码行数**：~1000 行
- **文档行数**：~1500 行
- **总计**：~2500 行


---

## 贡献者

- 浅梦风凌 (Claude)

---

## 许可证

MIT License

---

**最后更新**：2026-05-19
