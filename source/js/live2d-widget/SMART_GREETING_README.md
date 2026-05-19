# Live2D 智能问候系统

## 功能介绍

智能问候系统为 Live2D 看板娘添加了以下功能：

### 1. 访问记录
- 记录用户访问次数
- 区分首次访问、二次访问、常规访问和频繁访问
- 根据访问频率显示不同的问候语

### 2. 用户名记忆
- 自动从评论表单中识别用户名
- 记住用户名并在问候中使用
- 个性化的问候体验

### 3. 时间感知问候
- 根据当前时间显示不同的问候
- 早上、下午、晚上、深夜各有不同的问候语
- 更加贴心的交互体验

### 4. 访问统计
- 显示用户的访问次数
- 可通过 `window.smartGreeting.getVisitStatistics()` 获取

## 文件说明

### smart-greeting.js
核心模块，包含以下主要类和方法：

```javascript
// 获取当前用户数据
window.smartGreeting.userData

// 更新访问记录
window.smartGreeting.updateVisit()

// 设置用户名
window.smartGreeting.setUserName(name)

// 获取个性化问候
window.smartGreeting.getPersonalizedGreeting()

// 获取时间相关问候
window.smartGreeting.getTimeBasedGreeting()

// 获取访问统计
window.smartGreeting.getVisitStatistics()

// 显示消息
window.smartGreeting.showMessage(text, duration)
```

### smart-greeting-config.json
配置文件，包含所有问候语和模板：

- `greetings`: 不同访问阶段的问候语
- `timeGreetings`: 不同时间段的问候语
- `statistics`: 访问统计的显示模板
- `personalGreetings`: 个性化问候的模板
- `firstTimeAsk`: 首次访问时的提问

## 使用方法

### 基础使用
系统会自动在页面加载时：
1. 加载用户数据
2. 更新访问记录
3. 显示个性化问候

### 自定义问候语
编辑 `smart-greeting-config.json` 文件，修改相应的问候语数组即可。

### 获取用户信息
```javascript
// 获取访问次数
const count = window.smartGreeting.getVisitCount();

// 获取用户名
const name = window.smartGreeting.getUserName();

// 获取完整用户数据
const data = window.smartGreeting.userData;
```

### 手动显示问候
```javascript
// 显示个性化问候
const greeting = window.smartGreeting.getPersonalizedGreeting();
window.smartGreeting.showMessage(greeting, 5000);

// 显示时间相关问候
const timeGreeting = window.smartGreeting.getTimeBasedGreeting();
window.smartGreeting.showMessage(timeGreeting, 5000);

// 显示访问统计
const stats = window.smartGreeting.getVisitStatistics();
window.smartGreeting.showMessage(stats, 5000);
```

## 数据存储

用户数据存储在浏览器的 `localStorage` 中，键名为 `live2d_user_data`。

存储的数据包括：
- `userName`: 用户名
- `visitCount`: 访问次数
- `lastVisit`: 最后访问时间
- `firstVisit`: 首次访问时间
- `totalTime`: 总访问时长

## 自动识别用户名

系统会自动从以下选择器中识别用户名：
- `.vnick` (Valine 评论系统)
- 其他常见的用户名输入框

如需添加更多识别方式，可以修改 `smart-greeting.js` 中的相关代码。

## 浏览器兼容性

- 需要支持 `localStorage` API
- 需要支持 ES6+ 语法
- 推荐使用现代浏览器（Chrome, Firefox, Safari, Edge）

## 注意事项

1. 用户数据存储在本地，清除浏览器缓存会导致数据丢失
2. 不同域名的网站数据互不影响
3. 隐私浏览模式下可能无法正常保存数据

## 扩展功能建议

- [ ] 添加天气 API 集成
- [ ] 添加节日特殊问候
- [ ] 添加用户偏好设置面板
- [ ] 添加访问时长统计
- [ ] 添加用户行为分析
