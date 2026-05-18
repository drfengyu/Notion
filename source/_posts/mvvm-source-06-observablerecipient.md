---
title: CommunityToolkit.Mvvm 源码分析 (6) — ObservableRecipient 篇
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
  - 源码分析
categories:
  - MVVM 框架源码分析
---

## 本篇定位

`ObservableRecipient` 在 `ObservableObject` 之上增加了 **IMessenger 消息收发能力**。

---

## 1. 示例一：ViewModel 之间通信

```csharp
// ===== 定义消息 =====
public sealed class UserSelectedMessage
{
    public int UserId { get; }
    public UserSelectedMessage(int id) => UserId = id;
}

// ===== 用户列表 VM（发送者） =====
public partial class UserListViewModel : ObservableRecipient
{
    [ObservableProperty]
    private int _selectedUserId;

    partial void OnSelectedUserIdChanged(int value)
    {
        // 当选中用户变化时，发送消息通知其他 VM
        Messenger.Send(new UserSelectedMessage(value));
    }
}

// ===== 用户详情 VM（接收者） =====
public partial class UserDetailViewModel : ObservableRecipient,
    IRecipient<UserSelectedMessage>
{
    [ObservableProperty]
    private string _userName = "";

    public UserDetailViewModel()
    {
        // 激活时自动注册所有 IRecipient<T>
        IsActive = true;
    }

    public void Receive(UserSelectedMessage message)
    {
        LoadUser(message.UserId);
    }

    private async void LoadUser(int id)
    {
        UserName = $"加载用户 {id}...";
        await Task.Delay(500);
        UserName = $"用户 {id} - 张三";
    }
}
```

**执行流程：**

```
用户在 List 中点击 → SelectedUserId 变化
  → OnSelectedUserIdChanged 触发
    → Messenger.Send(UserSelectedMessage)
      → UserDetailViewModel.Receive 被调用
        → LoadUser → UI 更新
```

---

## 2. 示例二：IsActive 生命周期

```csharp
public partial class DocumentViewModel : ObservableRecipient
{
    private bool _hasChanges;
    public bool HasChanges
    {
        get => _hasChanges;
        set => SetProperty(ref _hasChanges, value);
    }

    // 当 IsActive = true 时自动注册消息
    // 当 IsActive = false 时自动取消注册
    public void OnDocumentOpened()
    {
        IsActive = true;   // 开始接收消息
    }

    public void OnDocumentClosed()
    {
        IsActive = false;  // 停止接收消息，自动 UnregisterAll
    }

    // 可重写 OnActivated 自定义注册行为
    protected override void OnActivated()
    {
        // 只注册特定消息，而非全部 IRecipient<T>
        Messenger.Register<SaveRequestMessage>(this, (r, m) =>
        {
            ((DocumentViewModel)r).Save();
        });

        // 也可以调用基类注册全部 IRecipient<T>
        // base.OnActivated();
    }

    private void Save() => HasChanges = false;
}
```

---

## 3. 示例三：broadcast 参数（自动广播属性变化）

```csharp
public sealed class UserNameChangedMessage
{
    public string OldName { get; }
    public string NewName { get; }
    public UserNameChangedMessage(string oldName, string newName)
    {
        OldName = oldName;
        NewName = newName;
    }
}

public partial class MainViewModel : ObservableRecipient
{
    private string _userName = "默认用户";

    public string UserName
    {
        get => _userName;
        // 第三个参数 broadcast = true → 自动广播 PropertyChangedMessage<string>
        set => SetProperty(ref _userName, value, true);
    }
}

// 另一个 VM 接收属性变化广播
public class StatusBarViewModel : IRecipient<PropertyChangedMessage<string>>
{
    public StatusBarViewModel()
    {
        WeakReferenceMessenger.Default.RegisterAll(this);
    }

    public void Receive(PropertyChangedMessage<string> message)
    {
        if (message.PropertyName == nameof(UserName))
        {
            Console.WriteLine($"用户名: {message.OldValue} → {message.NewValue}");
            // 输出: 用户名: 默认用户 → 新用户名
        }
    }
}
```

---

## 4. IsActive 源码

```csharp
private bool isActive;

public bool IsActive
{
    get => this.isActive;
    set
    {
        // 第三个参数 true：值变化时广播 PropertyChangedMessage<bool>
        if (SetProperty(ref this.isActive, value, true))
        {
            if (value)
                OnActivated();     // 激活 → 注册消息
            else
                OnDeactivated();   // 停用 → 取消注册
        }
    }
}

protected virtual void OnActivated()
{
    Messenger.RegisterAll(this);  // 注册所有 IRecipient<T>
}

protected virtual void OnDeactivated()
{
    Messenger.UnregisterAll(this);  // 取消所有
}
```

---

## 5. broadcast SetProperty 源码

```csharp
protected bool SetProperty<T>(
    [NotNullIfNotNull(nameof(newValue))] ref T field,
    T newValue,
    bool broadcast,
    [CallerMemberName] string? propertyName = null)
{
    T oldValue = field;
    bool propertyChanged = SetProperty(ref field, newValue, propertyName);

    // 值确实变了且要求广播 → 发送 PropertyChangedMessage<T>
    if (propertyChanged && broadcast)
        Broadcast(oldValue, newValue, propertyName);

    return propertyChanged;
}

protected virtual void Broadcast<T>(T oldValue, T newValue, string? propertyName)
{
    var message = new PropertyChangedMessage<T>(this, propertyName, oldValue, newValue);
    _ = Messenger.Send(message);
}
```

---

## 6. 测试技巧：注入 Mock Messenger

```csharp
// 使用带 IMessenger 参数的构造函数
public class TestViewModel : ObservableRecipient
{
    public TestViewModel(IMessenger messenger) : base(messenger)
    {
    }
}

// 单元测试
[Test]
public void Test_SendMessage()
{
    var messenger = new WeakReferenceMessenger();
    var vm = new TestViewModel(messenger);
    vm.IsActive = true;

    // 验证消息发送
    // ...
}
```

---

## 7. 选择基类决策树

```
需要消息通信？
  ├─ 是 → ObservableRecipient
  │     └─ 需要广播属性变化？→ 用 SetProperty(..., broadcast: true)
  │
  └─ 否 → ObservableObject
        └─ 需要数据验证？→ ObservableValidator
```

---

**下一篇预告：ObservableValidator 源码分析 — 数据注解验证的实现**
