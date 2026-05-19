/**
 * 用户系统核心模块
 * User System Core Module
 *
 * 功能：
 * - 用户认证（注册、登录、登出）
 * - 用户信息管理
 * - 本地存储管理
 * - API 调用封装
 */

class UserSystem {
  constructor(options = {}) {
    this.walineServerURL = options.walineServerURL || '';
    this.storagePrefix = 'user_system_';
    this.currentUser = this.loadUser();
    this.token = this.loadToken();
    this.init();
  }

  /**
   * 初始化用户系统
   */
  init() {
    this.setupEventListeners();
    this.checkAuthStatus();
    this.loadUserProfile();
  }

  /**
   * 设置事件监听
   */
  setupEventListeners() {
    // 监听登录表单提交
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // 监听注册表单提交
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => this.handleRegister(e));
    }

    // 监听发帖表单提交
    const postForm = document.getElementById('post-form');
    if (postForm) {
      postForm.addEventListener('submit', (e) => this.handleCreatePost(e));
    }

    // 监听登出按钮
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  /**
   * 用户注册
   */
  async handleRegister(e) {
    e.preventDefault();

    const email = document.getElementById('register-email').value;
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    // 验证
    if (!this.validateEmail(email)) {
      this.showError('请输入有效的邮箱地址');
      return;
    }

    if (username.length < 3) {
      this.showError('用户名至少需要 3 个字符');
      return;
    }

    if (password.length < 6) {
      this.showError('密码至少需要 6 个字符');
      return;
    }

    if (password !== confirmPassword) {
      this.showError('两次输入的密码不一致');
      return;
    }

    try {
      const response = await this.apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          username,
          password,
        }),
      });

      if (response.success) {
        this.showSuccess('注册成功！请登录');
        setTimeout(() => {
          window.location.href = '/user/login/';
        }, 2000);
      } else {
        this.showError(response.message || '注册失败');
      }
    } catch (error) {
      this.showError('注册出错：' + error.message);
    }
  }

  /**
   * 用户登录
   */
  async handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      this.showError('请输入邮箱和密码');
      return;
    }

    try {
      const response = await this.apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response.success) {
        this.saveToken(response.token);
        this.currentUser = response.user;
        this.saveUser(response.user);
        this.showSuccess('登录成功！');
        setTimeout(() => {
          window.location.href = '/user/profile/';
        }, 1500);
      } else {
        this.showError(response.message || '登录失败');
      }
    } catch (error) {
      this.showError('登录出错：' + error.message);
    }
  }

  /**
   * 用户登出
   */
  logout() {
    if (confirm('确定要登出吗？')) {
      this.clearToken();
      this.clearUser();
      this.currentUser = null;
      this.showSuccess('已登出');
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    }
  }

  /**
   * 创建新帖子
   */
  async handleCreatePost(e) {
    e.preventDefault();

    if (!this.currentUser) {
      this.showError('请先登录');
      return;
    }

    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    const category = document.getElementById('post-category').value;
    const tags = document.getElementById('post-tags').value.split(',').map(t => t.trim());

    if (!title || !content) {
      this.showError('请填写标题和内容');
      return;
    }

    try {
      const response = await this.apiCall('/posts/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          title,
          content,
          category,
          tags,
        }),
      });

      if (response.success) {
        this.showSuccess('发帖成功！');
        setTimeout(() => {
          window.location.href = `/forum/post/${response.postId}/`;
        }, 1500);
      } else {
        this.showError(response.message || '发帖失败');
      }
    } catch (error) {
      this.showError('发帖出错：' + error.message);
    }
  }

  /**
   * 点赞帖子或评论
   */
  async likePost(postId) {
    if (!this.currentUser) {
      this.showError('请先登录');
      return;
    }

    try {
      const response = await this.apiCall(`/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (response.success) {
        this.updateLikeButton(postId, response.liked);
      }
    } catch (error) {
      this.showError('操作失败：' + error.message);
    }
  }

  /**
   * 收藏帖子
   */
  async collectPost(postId) {
    if (!this.currentUser) {
      this.showError('请先登录');
      return;
    }

    try {
      const response = await this.apiCall(`/posts/${postId}/collect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (response.success) {
        this.updateCollectButton(postId, response.collected);
      }
    } catch (error) {
      this.showError('操作失败：' + error.message);
    }
  }

  /**
   * 关注用户
   */
  async followUser(userId) {
    if (!this.currentUser) {
      this.showError('请先登录');
      return;
    }

    try {
      const response = await this.apiCall(`/users/${userId}/follow`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (response.success) {
        this.updateFollowButton(userId, response.following);
      }
    } catch (error) {
      this.showError('操作失败：' + error.message);
    }
  }

  /**
   * 获取用户信息
   */
  async getUserProfile(userId) {
    try {
      const response = await this.apiCall(`/users/${userId}/profile`);
      return response.user;
    } catch (error) {
      this.showError('获取用户信息失败：' + error.message);
      return null;
    }
  }

  /**
   * 更新用户信息
   */
  async updateProfile(profileData) {
    if (!this.currentUser) {
      this.showError('请先登录');
      return;
    }

    try {
      const response = await this.apiCall('/users/profile/update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(profileData),
      });

      if (response.success) {
        this.currentUser = response.user;
        this.saveUser(response.user);
        this.showSuccess('个人信息已更新');
        return true;
      } else {
        this.showError(response.message || '更新失败');
        return false;
      }
    } catch (error) {
      this.showError('更新出错：' + error.message);
      return false;
    }
  }

  /**
   * 获取论坛帖子列表
   */
  async getPostsList(page = 1, category = '', search = '') {
    try {
      const params = new URLSearchParams({
        page,
        category,
        search,
      });

      const response = await this.apiCall(`/posts/list?${params}`);
      return response.posts;
    } catch (error) {
      this.showError('获取帖子列表失败：' + error.message);
      return [];
    }
  }

  /**
   * 获取单个帖子详情
   */
  async getPost(postId) {
    try {
      const response = await this.apiCall(`/posts/${postId}`);
      return response.post;
    } catch (error) {
      this.showError('获取帖子失败：' + error.message);
      return null;
    }
  }

  /**
   * API 调用封装
   */
  async apiCall(endpoint, options = {}) {
    const url = `${this.walineServerURL}/api${endpoint}`;
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const finalOptions = { ...defaultOptions, ...options };

    try {
      const response = await fetch(url, finalOptions);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '请求失败');
      }

      return data;
    } catch (error) {
      console.error('API 调用错误:', error);
      throw error;
    }
  }

  /**
   * 检查认证状态
   */
  checkAuthStatus() {
    const authElements = document.querySelectorAll('[data-auth-required]');
    authElements.forEach((el) => {
      if (this.currentUser) {
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    });

    // 更新用户信息显示
    if (this.currentUser) {
      this.updateUserDisplay();
    }
  }

  /**
   * 更新用户显示信息
   */
  updateUserDisplay() {
    const userNameEl = document.getElementById('user-name');
    const userAvatarEl = document.getElementById('user-avatar');

    if (userNameEl) {
      userNameEl.textContent = this.currentUser.username;
    }

    if (userAvatarEl) {
      userAvatarEl.src = this.currentUser.avatar || '/images/default-avatar.png';
    }
  }

  /**
   * 加载用户个人资料
   */
  loadUserProfile() {
    if (this.currentUser && window.location.pathname.includes('/user/profile/')) {
      this.displayUserProfile();
    }
  }

  /**
   * 显示用户个人资料
   */
  displayUserProfile() {
    const profileContainer = document.getElementById('user-profile');
    if (!profileContainer) return;

    profileContainer.innerHTML = `
      <div class="profile-header">
        <img src="${this.currentUser.avatar || '/images/default-avatar.png'}"
             alt="${this.currentUser.username}" class="profile-avatar">
        <div class="profile-info">
          <h2>${this.currentUser.username}</h2>
          <p class="profile-bio">${this.currentUser.bio || '这个用户很懒，还没有填写个人简介'}</p>
          <div class="profile-stats">
            <span>粉丝: ${this.currentUser.followers?.length || 0}</span>
            <span>关注: ${this.currentUser.following?.length || 0}</span>
            <span>积分: ${this.currentUser.points || 0}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 验证邮箱格式
   */
  validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /**
   * 显示错误消息
   */
  showError(message) {
    this.showMessage(message, 'error');
  }

  /**
   * 显示成功消息
   */
  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  /**
   * 显示消息
   */
  showMessage(message, type = 'info') {
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${type}`;
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      background: ${type === 'error' ? '#f8d7da' : type === 'success' ? '#d4edda' : '#d1ecf1'};
      color: ${type === 'error' ? '#721c24' : type === 'success' ? '#155724' : '#0c5460'};
      border-radius: 4px;
      z-index: 9999;
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(messageEl);

    setTimeout(() => {
      messageEl.remove();
    }, 3000);
  }

  /**
   * 本地存储管理
   */
  saveUser(user) {
    localStorage.setItem(this.storagePrefix + 'user', JSON.stringify(user));
  }

  loadUser() {
    const user = localStorage.getItem(this.storagePrefix + 'user');
    return user ? JSON.parse(user) : null;
  }

  clearUser() {
    localStorage.removeItem(this.storagePrefix + 'user');
  }

  saveToken(token) {
    localStorage.setItem(this.storagePrefix + 'token', token);
  }

  loadToken() {
    return localStorage.getItem(this.storagePrefix + 'token');
  }

  clearToken() {
    localStorage.removeItem(this.storagePrefix + 'token');
  }
}

// 导出全局实例
window.userSystem = null;

// 初始化用户系统
document.addEventListener('DOMContentLoaded', () => {
  const walineServerURL = document.querySelector('[data-waline-server]')?.dataset.walineServer || '';
  window.userSystem = new UserSystem({ walineServerURL });
});
