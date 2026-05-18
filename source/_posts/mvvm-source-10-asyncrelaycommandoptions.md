---
title: CommunityToolkit.Mvvm 源码分析 (10) — AsyncRelayCommandOptions 篇
date: 2026-05-12
tags:
  - C#
  - WPF
  - MVVM
  - CommunityToolkit
  - 源码分析
  - 异步编程
categories:
  - MVVM 框架源码分析
---

## 本篇定位

`AsyncRelayCommandOptions` 是 8.0 新增的 `[Flags]` 枚举，控制异步命令的并发和异常行为。

---

## 1. 枚举定义

```csharp
[Flags]
public enum AsyncRelayCommandOptions
{
    None = 0,
    AllowConcurrentExecutions = 1 << 0,  // 允许并发执行
    FlowExceptionsToTaskScheduler = 1 << 1, // 异常不抛出
}
```

---

## 2. 示例一：默认为止（None）

```csharp
public partial class SaveViewModel : ObservableObject
{
    private int _saveCount;
    public int SaveCount
    {
        get => _saveCount;
        set => SetProperty(ref _saveCount, value);
    }

    // 默认（None）：不允并发 + 异常抛到 UI 线程
    [RelayCommand]
    private async Task SaveAsync()
    {
        await Task.Delay(1000);
        SaveCount++;
    }
}
```

**行为：** 快速点击按钮 → 只执行一次，后续点击被忽略（按钮自动禁用）。

---

## 3. 示例二：AllowConcurrentExecutions

```csharp
public partial class LogViewModel : ObservableObject
{
    [ObservableProperty]
    private string _logContent = "";

    // 允许并发：每次点击都执行
    [RelayCommand(Options = AsyncRelayCommandOptions.AllowConcurrentExecutions)]
    private async Task AppendLogAsync()
    {
        await Task.Delay(500);
        LogContent += $"[{DateTime.Now:T}] 日志记录{Environment.NewLine}";
    }
}
```

**行为：** 快速点击按钮 5 次 → 5 个任务同时运行 → 约 500ms 后 5 条日志同时写入。

**注意：** 即使没有 `AllowConcurrentExecutions`，可取消委托在并发模式下**自动取消上一次**：

```csharp
// 可取消委托 + 允许并发 = 新请求取消旧请求
[RelayCommand(Options = AsyncRelayCommandOptions.AllowConcurrentExecutions)]
private async Task SearchAsync(CancellationToken ct)
{
    // 新的搜索自动取消上一次未完成的搜索
    var results = await _api.SearchAsync(Query, ct);
    Results = results;
}
```

---

## 4. 示例三：FlowExceptionsToTaskScheduler

```csharp
public partial class DataViewModel : ObservableObject
{
    [ObservableProperty]
    private string _status = "就绪";

    [ObservableProperty]
    private Task? _loadTask;

    // 异常不抛出到 UI，通过 ExecutionTask 手动检查
    [RelayCommand(Options = AsyncRelayCommandOptions.FlowExceptionsToTaskScheduler)]
    private async Task LoadDataAsync()
    {
        Status = "加载中...";
        await Task.Delay(1000);
        throw new InvalidOperationException("加载失败"); // 不会崩溃
    }

    // 通过 LoadTask 检查异常
    partial void OnLoadTaskChanged(Task? value)
    {
        if (value?.IsFaulted == true)
        {
            Status = $"错误: {value.Exception?.InnerException?.Message}";
        }
    }
}
```

**两种模式的异常行为对比：**

```
None（默认）：
  Execute → ExecuteAsync → AwaitAndThrowIfFailed(async void)
    → 异常在 async void 中抛出
    → 传播到 UI SynchronizationContext
    → 可以被 AppDomain.UnhandledException 捕获

FlowExceptionsToTaskScheduler：
  Execute → ExecuteAsync（不 await）
    → 异常在 Task 中
    → 流入 TaskScheduler.UnobservedTaskException
    → 可通过 ExecutionTask 属性手动观察
```

---

## 5. 四种组合

| AllowConcurrent | FlowExceptions | 效果 |
|-----------------|----------------|------|
| ❌ | ❌ | 严格串行，异常崩溃（默认） |
| ✅ | ❌ | 可并发，异常崩溃 |
| ❌ | ✅ | 串行，异常安全 |
| ✅ | ✅ | 完全放开，手动管理 |

---

## 6. 源码检查点

```csharp
// CanExecute 中的并发检查
public bool CanExecute(object? parameter)
{
    bool canExecute = this.canExecute?.Invoke() != false;
    return canExecute && (
        (this.options & AsyncRelayCommandOptions.AllowConcurrentExecutions) != 0 ||
        ExecutionTask is not { IsCompleted: false });
}

// Execute 中的异常流检查
public void Execute(object? parameter)
{
    Task executionTask = ExecuteAsync(parameter);
    if ((this.options & AsyncRelayCommandOptions.FlowExceptionsToTaskScheduler) == 0)
        AwaitAndThrowIfFailed(executionTask);
}
```

---

**下一篇预告：IMessenger 接口体系篇 — IRecipient<T>、MessageHandler、RegisterAll 的设计**
