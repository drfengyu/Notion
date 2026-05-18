---
title: CommunityToolkit.Mvvm 源码分析 (12) — 系列总结篇
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

## 系列回顾

这个系列共 11 篇（本篇为总结），从实际源码出发，逐层深入 CommunityToolkit.Mvvm 的每个 DLL 组件。

---

## 完整文章地图

```
基础层（运行时程序集）
├── (1) ObservableObject          — 属性通知 + INotifyPropertyChanging
├── (2) RelayCommand              — ICommand 的简洁实现
├── (3) AsyncRelayCommand         — 异步命令状态机 + Options
├── (4) WeakReferenceMessenger    — 弱引用 + ConditionalWeakTable2
├── (5) Source Generators         — 编译时生成 [ObservableProperty] [RelayCommand]

扩展层（运行时程序集）
├── (6) ObservableRecipient       — IsActive 生命周期 + Broadcast
├── (7) ObservableValidator       — INotifyDataErrorInfo + 数据注解验证
├── (8) StrongReferenceMessenger  — 强引用 + Recipient 结构体 + Mapping
├── (9) RelayCommand<T>           — TryGetCommandArgument + Predicate<T?>
├── (10) AsyncRelayCommandOptions — AllowConcurrentExecutions + FlowExceptions
├── (11) IMessenger 接口体系       — IRecipient<T> + RegisterAll + Unit

总结篇
└── (12) 系列总结
```

---

## 源码中的设计原则

### 1. 内联优先，虚方法延后

```csharp
// 基础版 SetProperty — 非虚，代码重复以利 JIT 内联
protected bool SetProperty<T>(ref T field, T newValue, ...)

// OnPropertyChanged — 虚方法，供子类扩展
protected virtual void OnPropertyChanged(PropertyChangedEventArgs e)
```

**热点路径非虚**（`SetProperty`、`CanExecute`），**扩展路径虚**（`OnPropertyChanged`、`Broadcast`、`OnActivated`）。

### 2. 计算属性代替状态同步

```csharp
// 不存 bool _isRunning，而是基于 Task 状态计算
public bool IsRunning => ExecutionTask is { IsCompleted: false };
```

全程只有一个真实状态（`ExecutionTask`），`IsRunning`、`CanBeCanceled` 都是派生属性，永远一致。

### 3. 避免装箱

```csharp
// RelayCommand<T>.CanExecute(T?) — 类型安全泛型版本
// 只在通过 ICommand 接口调用 object? 版本时才装箱
```

### 4. 无锁广播 + 快照复制

```
Lock → 复制 handler+recipient 快照到 ArrayPool → Unlock → 遍历调用
```

避免死锁，最小化锁持有时间。

### 5. 手动展开代替互相调用

```csharp
// ObservableObject.SetProperty（基础版本）重复代码而非调用其他重载
// 原因：确保 JIT 能看到完整 EqualityComparer<T>.Default.Equals 调用
// 以便使用 intrinsics 替换为原生比较指令
```

### 6. 静态缓存委托

```csharp
// 预创建 PropertyChangedEventArgs 实例，避免每次 new
internal static readonly PropertyChangedEventArgs IsRunningChangedEventArgs
    = new(nameof(IsRunning));

// ConditionalWeakTable<Type, Action<object>> 缓存验证委托
EntityValidatorMap.GetValue(GetType(), static t => GetValidationAction(t));
```

### 7. null 保护虚方法调用

```csharp
// handler == null → IRecipient<T> 接口路径（零间接）
// handler != null → MessageHandlerDispatcher 路径
if (handler is null)
    Unsafe.As<IRecipient<TMessage>>(recipient).Receive(message);
else
    Unsafe.As<MessageHandlerDispatcher>(handler).Invoke(recipient, message);
```

避免额外分配一个"空"委托包装。

---

## 从源码到自己的框架

这 11 篇源码分析覆盖了一个生产级 MVVM 框架的方方面面。你可以基于这些理解，自己实现一个轻量版本：

| 组件 | 核心思路 | 代码量 |
|------|---------|--------|
| ObservableObject | SetProperty + INotifyPropertyChanged | ~30 行 |
| RelayCommand | Action + Func<bool> 包装 | ~40 行 |
| AsyncRelayCommand | IsRunning 计算属性 + async void | ~60 行 |
| Messenger | ConditionalWeakTable + 快照广播 | ~80 行 |
| Source Generator | ISourceGenerator + SyntaxReceiver | ~150 行 |

**这正是从"用框架"到"懂框架"再到"造框架"的最佳学习路径。**

---

## 附录：源码路径索引

| 文件 | 路径（dotnet/src/CommunityToolkit.Mvvm/） |
|------|------------------------------------------|
| ObservableObject | `ComponentModel/ObservableObject.cs` |
| ObservableRecipient | `ComponentModel/ObservableRecipient.cs` |
| ObservableValidator | `ComponentModel/ObservableValidator.cs` |
| RelayCommand | `Input/RelayCommand.cs` |
| RelayCommand\<T\> | `Input/RelayCommand{T}.cs` |
| AsyncRelayCommand | `Input/AsyncRelayCommand.cs` |
| AsyncRelayCommand\<T\> | `Input/AsyncRelayCommand{T}.cs` |
| AsyncRelayCommandOptions | `Input/AsyncRelayCommandOptions.cs` |
| WeakReferenceMessenger | `Messaging/WeakReferenceMessenger.cs` |
| StrongReferenceMessenger | `Messaging/StrongReferenceMessenger.cs` |
| IMessenger | `Messaging/IMessenger.cs` |
| IMessengerExtensions | `Messaging/IMessengerExtensions.cs` |
| IRecipient\<T\> | `Messaging/IRecipient{TMessage}.cs` |
| MessageHandler | `Messaging/MessageHandler{TRecipient,TMessage}.cs` |
| Source Generators | `CommunityToolkit.Mvvm.SourceGenerators/` |

---

系列完结。
