/**
 * Smart Greeting System for Live2D Widget
 * 智能问候系统 - 记住用户信息和访问历史
 */

class SmartGreeting {
  constructor() {
    this.storageKey = 'live2d_user_data';
    this.userData = this.loadUserData();
    this.config = null;
    this.loadConfig();
  }

  async loadConfig() {
    try {
      const response = await fetch('/js/live2d-widget/smart-greeting-config.json');
      this.config = await response.json();
    } catch (e) {
      console.warn('Failed to load smart greeting config:', e);
      this.config = this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      greetings: {
        first: ['欢迎来到我的小窝～', '第一次见面呢，请多多指教！'],
        second: ['又见面了呢～', '欢迎回来！'],
        regular: ['欢迎回来，我的朋友～', '你又来了呢，真开心～'],
        frequent: ['哇，你今天又来了！', '你真的很喜欢来看我呢～'],
      },
      timeGreetings: {
        morning: ['早上好！新的一天要加油呢～'],
        afternoon: ['下午好～工作顺利吗？'],
        evening: ['晚上好～今天过得怎么样？'],
        night: ['这么晚还在工作呀？要注意身体呢～'],
      },
      statistics: ['你已经访问了 {count} 次呢～'],
      personalGreetings: ['{name}，{greeting}'],
      firstTimeAsk: ['请问怎么称呼你呢？'],
    };
  }

  loadUserData() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : this.getDefaultUserData();
    } catch (e) {
      console.warn('Failed to load user data:', e);
      return this.getDefaultUserData();
    }
  }

  getDefaultUserData() {
    return {
      userName: '',
      visitCount: 0,
      lastVisit: null,
      firstVisit: new Date().toISOString(),
      totalTime: 0,
      lastGreeted: null,
    };
  }

  saveUserData() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.userData));
    } catch (e) {
      console.warn('Failed to save user data:', e);
    }
  }

  updateVisit() {
    this.userData.visitCount++;
    this.userData.lastVisit = new Date().toISOString();
    this.saveUserData();
  }

  setUserName(name) {
    if (name && name.trim()) {
      this.userData.userName = name.trim();
      this.saveUserData();
    }
  }

  getUserName() {
    return this.userData.userName;
  }

  getVisitCount() {
    return this.userData.visitCount;
  }

  getGreeting() {
    if (!this.config) return '欢迎来访～';

    const greetings = this.config.greetings;
    let type = 'first';
    const count = this.getVisitCount();

    if (count === 1) type = 'first';
    else if (count === 2) type = 'second';
    else if (count <= 10) type = 'regular';
    else type = 'frequent';

    const messages = greetings[type] || greetings.first;
    return messages[Math.floor(Math.random() * messages.length)];
  }

  getPersonalizedGreeting() {
    if (!this.config) return this.getGreeting();

    const userName = this.getUserName();
    const baseGreeting = this.getGreeting();
    const count = this.getVisitCount();

    if (userName) {
      const templates = this.config.personalGreetings || ['{name}，{greeting}'];
      const template = templates[Math.floor(Math.random() * templates.length)];
      return template.replace('{name}', userName).replace('{greeting}', baseGreeting);
    }

    if (count === 1) {
      const askMessages = this.config.firstTimeAsk || ['请问怎么称呼你呢？'];
      return `${baseGreeting}${askMessages[Math.floor(Math.random() * askMessages.length)]}`;
    }

    return baseGreeting;
  }

  getTimeBasedGreeting() {
    if (!this.config) return '欢迎来访～';

    const hour = new Date().getHours();
    const timeGreetings = this.config.timeGreetings;

    let period = 'afternoon';
    if (hour >= 6 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 18) period = 'afternoon';
    else if (hour >= 18 && hour < 22) period = 'evening';
    else period = 'night';

    const messages = timeGreetings[period] || timeGreetings.afternoon;
    return messages[Math.floor(Math.random() * messages.length)];
  }

  getVisitStatistics() {
    if (!this.config) return `你已经访问了 ${this.getVisitCount()} 次呢～`;

    const count = this.getVisitCount();
    const templates = this.config.statistics || [`你已经访问了 ${count} 次呢～`];
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('{count}', count);
  }

  // Show message using the waifu-tips system
  showMessage(text, duration = 5000) {
    const tips = document.getElementById('waifu-tips');
    if (!tips) return;

    tips.innerHTML = text;
    tips.classList.add('waifu-tips-active');

    setTimeout(() => {
      tips.classList.remove('waifu-tips-active');
    }, duration);
  }
}

// 监听自定义事件来显示问候
window.addEventListener('live2d:greeting', (event) => {
  if (window.smartGreeting) {
    window.smartGreeting.showMessage(event.detail, 5000);
  }
});

// 导出全局实例
window.smartGreeting = new SmartGreeting();
