---
title: CommunityToolkit.Mvvm 源码分析 (4) — WeakReferenceMessenger 篇
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
  - 源码分析
  - 消息通信
categories:
  - MVVM 框架源码分析
---

## 本篇定位

消息系统最复杂的部分。读完你会理解：

- 内部为什么不用 `Dictionary` 而是用 `Dictionary2`？
- `ConditionalWeakTable2` 如何实现"接收者被回收 → 自动取消订阅"？
- `Send` 方法如何用 `Span<T>` 和 `ArrayPool` 实现零分配广播？
- `IRecipient<T>` 的 null 标记如何零开销调用？

---

## 1. 示例一：页面间通信

```csharp
// ===== 定义消息类型 =====
public sealed class NavigationMessage
{
    public string TargetView { get; }
    public NavigationMessage(string target) => TargetView = target;
}

// ===== 发送者 ViewModel =====
public class MainViewModel
{
    private readonly IMessenger _messenger;

    public MainViewModel()
    {
        _messenger = WeakReferenceMessenger.Default;
    }

    public void NavigateTo(string viewName)
    {
        _messenger.Send(new NavigationMessage(viewName));
    }
}

// ===== 接收者 ViewModel =====
public class ShellViewModel
{
    private string _currentView = "Home";
    public string CurrentView
    {
        get => _currentView;
        set => SetProperty(ref _currentView, value);
    }

    public ShellViewModel()
    {
        // 注册接收 NavigationMessage
        WeakReferenceMessenger.Default.Register<NavigationMessage>(this, (r, m) =>
        {
            // r == this（接收者自己），m == 消息
            ((ShellViewModel)r).CurrentView = m.TargetView;
        });
    }

    // 不再使用时，不需要手动 Unregister
    // 当 ShellViewModel 被 GC 回收时，WeakReferenceMessenger 自动清理
    ~ShellViewModel()
    {
        Console.WriteLine("ShellViewModel 被回收，消息订阅已自动解除");
    }
}
```

**为什么不泄漏？**

```csharp
// ❌ 传统事件：泄漏
SomeService.SomeEvent += ShellViewModel.Handler;
// ShellViewModel 被 SomeService 强引用 → 永远无法 GC

// ✅ Messenger：安全
WeakReferenceMessenger.Default.Register<NavigationMessage>(this, Handler);
// Messenger 内部用 WeakReference 持有 this
// ShellViewModel 可以被 GC 回收
```

---

## 2. 示例二：带数据的消息传递

```csharp
// 定义消息
public sealed class UserLoggedInMessage
{
    public int UserId { get; }
    public string UserName { get; }
    public DateTime LoginTime { get; }

    public UserLoggedInMessage(int userId, string userName)
    {
        UserId = userId;
        UserName = userName;
        LoginTime = DateTime.Now;
    }
}

// 登录模块发送消息
public class LoginViewModel : ObservableObject
{
    public void DoLogin(string name)
    {
        // ... 登录逻辑 ...

        // 发送登录成功消息
        WeakReferenceMessenger.Default.Send(
            new UserLoggedInMessage(42, name));
    }
}

// 导航栏接收消息
public class NavBarViewModel : IRecipient<UserLoggedInMessage>
{
    private string _userDisplay = "未登录";
    public string UserDisplay
    {
        get => _userDisplay;
        set => _userDisplay = value;
    }

    public NavBarViewModel()
    {
        // 注册所有 IRecipient<T> 接口
        WeakReferenceMessenger.Default.RegisterAll(this);
    }

    // IRecipient<TMessage> 接口
    public void Receive(UserLoggedInMessage message)
    {
        UserDisplay = $"{message.UserName} (ID: {message.UserId}) - {message.LoginTime:T}";
    }
}

// 统计模块也接收同一条消息
public class StatViewModel : IRecipient<UserLoggedInMessage>
{
    private int _totalLogins;
    public int TotalLogins
    {
        get => _totalLogins;
        set => _totalLogins = value;
    }

    public StatViewModel()
    {
        WeakReferenceMessenger.Default.RegisterAll(this);
    }

    public void Receive(UserLoggedInMessage message)
    {
        TotalLogins++;
        Console.WriteLine($"用户 {message.UserName} 登录 (#{TotalLogins})");
    }
}
```

---

## 3. 示例三：带 Token 的频道通信

```csharp
// 用 string 作为 Token 区分不同频道
public sealed class StatusMessage
{
    public string Text { get; }
    public StatusMessage(string text) => Text = text;
}

// 发送到不同频道
public class StatusService
{
    public void SendError(string msg)
    {
        WeakReferenceMessenger.Default.Send(
            new StatusMessage(msg), "Error");
    }

    public void SendInfo(string msg)
    {
        WeakReferenceMessenger.Default.Send(
            new StatusMessage(msg), "Info");
    }
}

// 只接收错误频道
public class ErrorPanelViewModel
{
    private string _lastError = "";
    public string LastError
    {
        get => _lastError;
        set => _lastError = value;
    }

    public ErrorPanelViewModel()
    {
        // 只注册 "Error" 频道的消息
        WeakReferenceMessenger.Default.Register<StatusMessage, string>(
            this, "Error", (r, m) =>
        {
            ((ErrorPanelViewModel)r).LastError = m.Text;
        });
    }
}
```

---

## 4. 内部数据结构

```csharp
// 文件: Messaging/WeakReferenceMessenger.cs
public sealed class WeakReferenceMessenger : IMessenger
{
    // 核心映射：类型组合 → ConditionalWeakTable
    private readonly Dictionary2<Type2, ConditionalWeakTable2<object, object?>> recipientsMap = new();
}
```

recipientsMap 结构图解：

```
Type2(NavigationMessage, Unit)
  └─ ConditionalWeakTable2
      ├─ VM_A (弱引用) → null               ← IRecipient<T> 标记
      └─ VM_B (弱引用) → MessageHandlerDispatcher

Type2(StatusMessage, string)
  └─ ConditionalWeakTable2
      └─ VM_C (弱引用) → Dictionary2<string, object?>
                          ├─ "Error" → MessageHandlerDispatcher
                          └─ "Info"  → MessageHandlerDispatcher
```

---

## 5. Register 源码流程

```csharp
private void Register<TMessage, TToken>(
    object recipient, TToken token, MessageHandlerDispatcher? dispatcher)
{
    lock (this.recipientsMap)
    {
        Type2 type2 = new(typeof(TMessage), typeof(TToken));
        ref var mapping = ref this.recipientsMap.GetOrAddValueRef(type2);
        mapping ??= new ConditionalWeakTable2<object, object?>();

        if (typeof(TToken) == typeof(Unit))
        {
            // Fast Path: 默认通道，每个接收者只能注册一个 handler
            if (!mapping.TryAdd(recipient, dispatcher))
                throw new InvalidOperationException("重复注册");
        }
        else
        {
            // Slow Path: 自定义 Token，每个接收者可以有多个
            var map = Unsafe.As<Dictionary2<TToken, object?>>(
                mapping.GetValue(recipient, _ => new Dictionary2<TToken, object?>>())!);
            ref object? registeredHandler = ref map.GetOrAddValueRef(token);
            if (registeredHandler is not null)
                throw new InvalidOperationException("重复注册");
            registeredHandler = dispatcher;
        }
    }
}
```

---

## 6. Send 源码流程

```csharp
public TMessage Send<TMessage, TToken>(TMessage message, TToken token)
{
    ArrayPoolBufferWriter<object?> bufferWriter;
    int i = 0;

    lock (this.recipientsMap)
    {
        Type2 type2 = new(typeof(TMessage), typeof(TToken));
        if (!this.recipientsMap.TryGetValue(type2, out var table))
            return message;

        bufferWriter = ArrayPoolBufferWriter<object?>.Create();

        // 在锁内复制接收者快照
        using var enumerator = table.GetEnumerator();
        while (enumerator.MoveNext())
        {
            if (typeof(TToken) == typeof(Unit))
            {
                bufferWriter.Add(enumerator.GetValue());  // handler
                bufferWriter.Add(enumerator.GetKey());    // recipient
                i++;
            }
            else
            {
                var map = Unsafe.As<Dictionary2<TToken, object?>>(enumerator.GetValue()!);
                if (map.TryGetValue(token, out object? handler))
                {
                    bufferWriter.Add(handler);
                    bufferWriter.Add(enumerator.GetKey());
                    i++;
                }
            }
        }
    }  // 锁释放！广播时无锁

    try { SendAll(bufferWriter.Span, i, message); }
    finally { bufferWriter.Dispose(); }

    return message;
}
```

**为什么要在锁外广播？** 防止死锁——接收者可能在 Handler 中再次 `Send`。

---

## 7. SendAll 零开销广播

```csharp
[MethodImpl(MethodImplOptions.NoInlining)]
internal static void SendAll<TMessage>(
    ReadOnlySpan<object?> pairs, int i, TMessage message)
{
    ReadOnlySpan<object?> slice = pairs.Slice(0, 2 * i);

    ref object? start = ref MemoryMarshal.GetReference(slice);
    ref object? end = ref Unsafe.Add(ref start, slice.Length);

    while (Unsafe.IsAddressLessThan(ref start, ref end))
    {
        object? handler = start;
        object recipient = Unsafe.Add(ref start, 1)!;

        // null 检查实现受保护的虚方法调用
        if (handler is null)
            Unsafe.As<IRecipient<TMessage>>(recipient).Receive(message);
        else
            Unsafe.As<MessageHandlerDispatcher>(handler).Invoke(recipient, message);

        start = ref Unsafe.Add(ref start, 2);
    }
}
```

---

## 8. 三种注册方式的性能对比

```csharp
// 方式 1：Lambda（最常用，少量分配）
WeakReferenceMessenger.Default.Register<MyMessage>(this, (r, m) => { });

// 方式 2：静态方法（零分配，推荐性能敏感场景）
WeakReferenceMessenger.Default.Register<MyMessage>(this,
    static (r, m) => ((MyVM)r).Handle(m));

// 方式 3：IRecipient<T> 接口（零分配 + 零间接）
public class MyVM : IRecipient<MyMessage>
{
    public MyVM() => WeakReferenceMessenger.Default.RegisterAll(this);
    public void Receive(MyMessage message) { }
}
```

| 方式 | 分配 | 调用开销 |
|------|------|---------|
| Lambda | 委托 + 闭包 | 委托间接调用 |
| 静态方法 | 静态缓存委托 | 委托间接调用 |
| IRecipient<T> | 零 | **直接虚方法调用** |

---

**下一篇预告：Source Generators 源码分析 — 编译时生成如何消灭样板代码**
