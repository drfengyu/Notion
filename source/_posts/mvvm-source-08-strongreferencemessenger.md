---
title: CommunityToolkit.Mvvm 源码分析 (8) — StrongReferenceMessenger 篇
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

`StrongReferenceMessenger` 使用**强引用**，数据结构完全不同。

---

## 1. 何时用 StrongReferenceMessenger？

```csharp
// 场景：短期存在的弹窗/对话框
// → 生命周期可控，手动 Unregister 即可
public class EditDialogViewModel
{
    private readonly StrongReferenceMessenger _messenger = new();

    public EditDialogViewModel()
    {
        _messenger.Register<SaveMessage>(this, Handler);
    }

    public void OnClose()
    {
        // 必须手动取消注册
        _messenger.UnregisterAll(this);
    }
}

// 场景：高频消息广播（如游戏 UI 每秒刷新）
// → StrongReferenceMessenger 性能更好（无 WeakReference 开销）
public class GameHudViewModel
{
    private static readonly StrongReferenceMessenger Messenger = new();

    public void UpdateHealth(int hp)
    {
        Messenger.Send(new HealthUpdateMessage(hp));
    }
}
```

---

## 2. 内部数据结构

```csharp
public sealed class StrongReferenceMessenger : IMessenger
{
    // 接收者 → 该接收者注册的所有映射
    private readonly Dictionary2<Recipient, HashSet<IMapping>> recipientsMap = new();

    // 类型组合 → 具体的映射实例
    private readonly Dictionary2<Type2, IMapping> typesMap = new();
}
```

**关键差异：** 这里没有 `ConditionalWeakTable2`，而是用 `Recipient` 结构体作强引用。

---

## 3. Recipient 结构体

```csharp
private readonly struct Recipient : IEquatable<Recipient>
{
    public readonly object Target;  // ← 强引用

    public Recipient(object target) => Target = target;

    // 基于引用相等，不受 Equals 重写影响
    public bool Equals(Recipient other) => ReferenceEquals(Target, other.Target);

    // 使用 RuntimeHelpers.GetHashCode，确保返回对象原始哈希码
    public override int GetHashCode() => RuntimeHelpers.GetHashCode(Target);
}
```

---

## 4. Mapping 与 Mapping<TToken>

```csharp
// Unit Token（默认通道）
private sealed class Mapping : Dictionary2<Recipient, object?>, IMapping { }

// 自定义 Token
private sealed class Mapping<TToken> :
    Dictionary2<Recipient, Dictionary2<TToken, object?>>, IMapping
    where TToken : IEquatable<TToken> { }
```

**数据结构图解：**

```
typesMap:  Type2(NavMsg, Unit)           →  Mapping  ─── Recipient_A → null
typesMap:  Type2(StatusMsg, string)      →  Mapping<string> ─── Recipient_B → Dictionary2
                                                                              ├── "Errors" → dispatcher
                                                                              └── "Info"   → dispatcher

recipientsMap:  Recipient_A → HashSet{ Mapping<NavMsg> }
                Recipient_B → HashSet{ Mapping<string><StatusMsg> }
```

**双重记录的好处**：`UnregisterAll(recipient)` 只需查 `recipientsMap`，O(1) 找到该接收者的所有映射，逐个清理。

---

## 5. Register 源码

```csharp
private void Register<TMessage, TToken>(
    object recipient, TToken token, MessageHandlerDispatcher? dispatcher)
{
    lock (this.recipientsMap)
    {
        Recipient key = new(recipient);
        IMapping mapping;

        if (typeof(TToken) == typeof(Unit))
        {
            Mapping underlyingMapping = GetOrAddMapping<TMessage>();
            ref object? handler = ref underlyingMapping.GetOrAddValueRef(key);
            if (handler is not null) ThrowDuplicate();
            handler = dispatcher;
            mapping = underlyingMapping;
        }
        else
        {
            Mapping<TToken> underlyingMapping = GetOrAddMapping<TMessage, TToken>();
            ref var map = ref underlyingMapping.GetOrAddValueRef(key);
            map ??= new Dictionary2<TToken, object?>();
            ref object? handler = ref map.GetOrAddValueRef(token);
            if (handler is not null) ThrowDuplicate();
            handler = dispatcher;
            mapping = underlyingMapping;
        }

        // 记录到 recipientsMap
        ref HashSet<IMapping>? set = ref this.recipientsMap.GetOrAddValueRef(key);
        set ??= new HashSet<IMapping>();
        set.Add(mapping);
    }
}
```

---

## 6. Send 源码（ArrayPool 版本）

```csharp
public TMessage Send<TMessage, TToken>(TMessage message, TToken token)
{
    object?[] rentedArray;
    int i = 0;

    lock (this.recipientsMap)
    {
        // ... 从 typesMap 获取 Mapping 实例 ...
        rentedArray = ArrayPool<object?>.Shared.Rent(2 * totalHandlersCount);

        // 复制 [handler, recipient, handler, recipient, ...]
        // 到 ArrayPool 数组
    }

    try
    {
        // 复用 WeakReferenceMessenger.SendAll
        WeakReferenceMessenger.SendAll(pairs, i, message);
    }
    finally
    {
        Array.Clear(rentedArray, 0, 2 * i);
        ArrayPool<object?>.Shared.Return(rentedArray);
    }

    return message;
}
```

---

## 7. Cleanup 是空方法

```csharp
void IMessenger.Cleanup()
{
    // StrongReferenceMessenger 不需要清理
    // 每次 Unregister 都同步清理了所有空映射
}
```

对比 WeakReferenceMessenger 需要 Gen2 GC 回调清理死条目。

---

## 8. 性能对比

| 操作 | WeakReferenceMessenger | StrongReferenceMessenger |
|------|----------------------|------------------------|
| 接收者引用 | 弱引用 | 强引用（需手动 Unregister） |
| Send 数组 | ArrayPoolBufferWriter | ArrayPool\<object\> |
| Cleanup | Gen2 GC 自动 | 无（同步清理） |
| 哈希 | 依赖对象 GetHashCode | RuntimeHelpers.GetHashCode |

---

**下一篇预告：RelayCommand<T> 源码分析 — 类型安全的泛型命令参数处理**
