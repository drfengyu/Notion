---
title: CommunityToolkit.Mvvm 源码分析 (11) — IMessenger 接口体系篇
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

前三篇分析了 WeakReferenceMessenger 和 StrongReferenceMessenger 的内部实现。这篇聚焦**接口层设计**。

---

## 1. IMessenger 接口

```csharp
public interface IMessenger
{
    bool IsRegistered<TMessage, TToken>(object recipient, TToken token)
        where TMessage : class where TToken : IEquatable<TToken>;

    void Register<TRecipient, TMessage, TToken>(TRecipient recipient, TToken token,
        MessageHandler<TRecipient, TMessage> handler)
        where TRecipient : class where TMessage : class where TToken : IEquatable<TToken>;

    void UnregisterAll(object recipient);
    void UnregisterAll<TToken>(object recipient, TToken token) where TToken : IEquatable<TToken>;
    void Unregister<TMessage, TToken>(object recipient, TToken token)
        where TMessage : class where TToken : IEquatable<TToken>;

    TMessage Send<TMessage, TToken>(TMessage message, TToken token)
        where TMessage : class where TToken : IEquatable<TToken>;

    void Cleanup();
    void Reset();
}
```

**约束说明：**
- `TMessage : class` — 消息必须是引用类型
- `TToken : IEquatable<TToken>` — 通道标识必须可比较

---

## 2. 示例：五种注册方式

```csharp
// 方式 1：Lambda 委托（最常用）
WeakReferenceMessenger.Default.Register<MyMessage>(this, (r, m) =>
{
    // r = this（接收者），m = 消息
    Console.WriteLine($"收到消息: {m.Text}");
});

// 方式 2：静态方法（零分配，推荐）
WeakReferenceMessenger.Default.Register<MyMessage>(this,
    static (r, m) => ((MyViewModel)r).HandleMessage(m));

// 方式 3：方法组（简洁）
WeakReferenceMessenger.Default.Register<MyMessage>(this, HandleMessage);
private void HandleMessage(object recipient, MyMessage message) { }

// 方式 4：IRecipient<T> 接口（最清晰，零分配）
public class MyViewModel : IRecipient<MyMessage>, IRecipient<OtherMessage>
{
    public MyViewModel()
    {
        WeakReferenceMessenger.Default.RegisterAll(this);
    }

    public void Receive(MyMessage message) { }
    public void Receive(OtherMessage message) { }
}

// 方式 5：带 Token 的频道
WeakReferenceMessenger.Default.Register<MyMessage, string>(
    this, "ChannelA", (r, m) => { });
```

---

## 3. 示例：MessageHandler 委托的设计意图

```csharp
// 委托签名：接收者 + 消息
public delegate void MessageHandler<TRecipient, in TMessage>(
    TRecipient recipient, TMessage message);

// 为什么把接收者作为参数传入？
// → 避免闭包捕获，支持 static 方法

// ❌ 传统事件方式（闭包捕获 = 分配）
button.Click += (s, e) => this.HandleClick(e);
// ↑ 捕获了 this，每次 new 一个闭包

// ✅ 框架方式（静态委托 = 零分配）
Messenger.Register<MyMessage>(this,
    static (r, m) => ((MyViewModel)r).Handle(m));
// ↑ 静态 lambda，编译器缓存委托实例
```

---

## 4. 示例：Unit Token — 默认通道

```csharp
// 所有默认通道的 API，内部使用 Unit 类型
public static void Register<TMessage>(this IMessenger messenger,
    IRecipient<TMessage> recipient)
{
    // 调用完整接口，但 Unit 作为 TToken
    messenger.Register<IRecipient<TMessage>, TMessage, Unit>(
        recipient, default, static (r, m) => r.Receive(m));
}

// Unit 是一个空的内部结构体
internal readonly struct Unit : IEquatable<Unit>
{
    public bool Equals(Unit other) => true;
    public override int GetHashCode() => 0;
}
```

---

## 5. RegisterAll 双路径策略

```csharp
public static void RegisterAll(this IMessenger messenger, object recipient)
{
    // Fast Path：从程序集中找生成器生成的注册方法
    var registrationAction = DiscoveredRecipients.RegistrationMethods.GetValue(
        recipient.GetType(), type =>
    {
        if (type.Assembly.GetType(
            "CommunityToolkit.Mvvm.Messaging.__Internals.__IMessengerExtensions")
            is Type t &&
            t.GetMethod("CreateAllMessagesRegistrator", new[] { type })
            is MethodInfo mi)
        {
            return (Action<IMessenger, object>)mi.Invoke(null, null)!;
        }
        return null;
    });

    if (registrationAction is not null)
        registrationAction(messenger, recipient);  // Fast Path
    else
        messenger.RegisterAll(recipient, default(Unit));  // Slow Path
}
```

---

## 6. 性能总结

| 注册方式 | 分配 | 调用方式 | 推荐场景 |
|---------|------|---------|---------|
| `Register(this, (r,m)=>...)` | 委托 + 闭包 | 间接调用 | 日常使用 |
| `Register(this, static (r,m)=>...)` | 静态委托 | 间接调用 | 性能敏感路径 |
| `RegisterAll + IRecipient<T>` | 零 | 直接虚方法 | 接口清晰时 |
| 带 Token | 多一个 Dictionary | 同上的* | 频道隔离 |

---

**下一篇预告：系列总结 — 从源码看 CommunityToolkit.Mvvm 的设计哲学**
