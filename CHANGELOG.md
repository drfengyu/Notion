# 更改日志

所有重要的项目更改都会记录在此文件中。

## [未发布]

### 改进
- 🎮 增强 Live2D 交互功能
  - 升级到完整的 live2d-widget 库
  - 添加点击互动提示
  - 添加鼠标接近提示
  - 添加页面隐藏/显示提示
  - 添加一言（hitokoto）功能
  - 添加消息气泡显示
  - 改进透明度动画效果
  - 支持拖拽和缩放（通过工具菜单）

## [1.1.0] - 2026-05-18

### 修改
- 🎨 更新 Live2D 模型
  - 从 Hijiki（日本风格）更换为 Shizuku（清纯少女风格）
  - 安装 live2d-widget-model-shizuku@1.0.5

## [1.0.0] - 2026-05-18

### 新增
- ✨ 添加 Live2D 看板娘功能
  - 集成 hexo-helper-live2d 插件
  - 支持 Shizuku 模型（清纯少女风格）
  - 可在右侧显示，大小为 200x400px
  - 支持点击、拖拽、双击交互
  - 移动设备自适应隐藏

- 📚 创建 C# 反射系列教程（6 篇）
  - (1) 反射基础 - Type、Assembly、获取成员信息
  - (2) 动态调用 - 创建实例、调用方法、访问属性
  - (3) 特性（Attributes）- 定义、获取、数据验证框架
  - (4) 泛型反射 - 泛型类型、泛型方法、泛型约束
  - (5) 性能优化 - 表达式树、高性能访问器
  - (6) 实战应用 - 序列化、ORM、DI 容器、插件系统

### 修改
- 🔧 更新 Hexo 配置文件 (_config.yml)
  - 添加 Live2D 配置项
  - 配置模型为 Shizuku
  - 设置显示位置和大小

- 🎨 更新 kratos-rebirth 主题
  - 修改 layout.ejs 添加 Live2D 加载逻辑
  - 创建 _plugins/live2d.ejs 模板文件

### 依赖
- 新增 hexo-helper-live2d@3.1.1
- 新增 live2d-widget-model-koharu@1.0.5
- 新增 live2d-widget-model-hijiki@1.0.5
- 新增 live2d-widget-model-shizuku@1.0.5

## 项目信息

- **主题**: kratos-rebirth
- **Hexo 版本**: 8.1.2
- **Node 包管理**: pnpm
- **远程仓库**: https://gitee.com/shallowdreambreezeling/Notion.git

## 贡献者

- Claude (Anthropic)
