---
title: CommunityToolkit.Mvvm 源码分析 (3) — AsyncRelayCommand 篇
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

前两篇覆盖了属性通知和同步命令。这篇从源码看 AsyncRelayCommand 的真正实现。读完你会理解：

- 为什么 `ExecutionTask` 要用属性 setter 而不是手动管理状态？
- 两种构造函数（`Func<Task>` vs `Func<CancellationToken, Task>`）的区别
- `AsyncRelayCommandOptions` 如何控制并发和异常行为
- `CanExecute` 如何在执行期间自动返回 false

---

## 1. 示例一：最简单的异步加载

```csharp
public class DataViewModel : ObservableObject
{
    private string _data = "点击按钮加载";
    public string Data
    {
        get => _data;
        set => SetProperty(ref _data, value);
    }

    // 返回 Task → 自动生成 AsyncRelayCommand
    public AsyncRelayCommand LoadDataCommand { get; }

    public DataViewModel()
    {
        LoadDataCommand = new AsyncRelayCommand(LoadDataAsync);
    }

    private async Task LoadDataAsync()
    {
        Data = "加载中...";
        await Task.Delay(2000);  // 模拟网络请求
        Data = $"加载完成: {DateTime.Now:T}";
    }
}
```

**XAML：**

```xml
<StackPanel>
    <TextBlock Text="{Binding Data}" />
    <Button Content="加载数据" Command="{Binding LoadDataCommand}" />
</StackPanel>
```

**运行效果：** 点击按钮 → 按钮立即禁用（`IsRunning = true`）→ "加载中..." → 2秒后 → 按钮恢复，显示完成时间。

---

## 2. 示例二：加载数据时显示进度条

```csharp
public class ProgressViewModel : ObservableObject
{
    private int _progress;
    public int Progress
    {
        get => _progress;
        set => SetProperty(ref _progress, value);
    }

    private string _status = "就绪";
    public string Status
    {
        get => _status;
        set => SetProperty(ref _status, value);
    }

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        set => SetProperty(ref _isBusy, value);
    }

    public AsyncRelayCommand StartCommand { get; }

    public ProgressViewModel()
    {
        StartCommand = new AsyncRelayCommand(StartAsync);
    }

    private async Task StartAsync()
    {
        IsBusy = true;
        Status = "处理中...";

        for (int i = 0; i <= 100; i += 10)
        {
            Progress = i;
            Status = $"处理中... {i}%";
            await Task.Delay(200);
        }

        Status = "完成！";
        IsBusy = false;
    }
}
```

**XAML：**

```xml
<StackPanel>
    <ProgressBar Value="{Binding Progress}" Height="20" />
    <TextBlock Text="{Binding Status}" />
    <Button Content="开始处理" Command="{Binding StartCommand}"
            IsEnabled="{Binding IsBusy, Converter={StaticResource InvertBool}}" />
</StackPanel>
```

**不依赖 IsBusy 的更好写法：** 直接利用 `AsyncRelayCommand.IsRunning`：

```xml
<Button Content="开始处理" Command="{Binding StartCommand}" />
<!-- IsRunning 为 true 时，CanExecute 返回 false，按钮自动禁用 -->
```

---

## 3. 源码详解

### 3.1 类结构

```csharp
// 文件: Input/AsyncRelayCommand.cs
public sealed partial class AsyncRelayCommand : IAsyncRelayCommand, ICancellationAwareCommand
{
    // 两个执行委托（只有一个不为 null）
    private readonly Func<Task>? execute;                              // 无取消支持
    private readonly Func<CancellationToken, Task>? cancelableExecute; // 可取消
    private readonly Func<bool>? canExecute;
    private readonly AsyncRelayCommandOptions options;
    private CancellationTokenSource? cancellationTokenSource;
}
```

### 3.2 ExecutionTask 核心状态机

```csharp
private Task? executionTask;

public Task? ExecutionTask
{
    get => this.executionTask;
    private set
    {
        if (ReferenceEquals(this.executionTask, value))
            return;

        this.executionTask = value;

        // 1. 立即触发任务和运行状态通知
        PropertyChanged?.Invoke(this, ExecutionTaskChangedEventArgs);
        PropertyChanged?.Invoke(this, IsRunningChangedEventArgs);

        // 2. 如果有 TokenSource，触发取消状态通知
        if (this.cancellationTokenSource is not null)
        {
            PropertyChanged?.Invoke(this, CanBeCanceledChangedEventArgs);
            PropertyChanged?.Invoke(this, IsCancellationRequestedChangedEventArgs);
        }

        // 3. 如果 Task 已完成，不需要监控
        bool isAlreadyCompletedOrNull = value?.IsCompleted ?? true;
        if (isAlreadyCompletedOrNull)
            return;

        // 4. 静态 async void 监控 Task 完成
        static async void MonitorTask(AsyncRelayCommand @this, Task task)
        {
            await task.GetAwaitableWithoutEndValidation();

            if (ReferenceEquals(@this.executionTask, task))
            {
                @this.PropertyChanged?.Invoke(@this, ExecutionTaskChangedEventArgs);
                @this.PropertyChanged?.Invoke(@this, IsRunningChangedEventArgs);

                if (@this.cancellationTokenSource is not null)
                    @this.PropertyChanged?.Invoke(@this, CanBeCanceledChangedEventArgs);

                if ((@this.options & AsyncRelayCommandOptions.AllowConcurrentExecutions) == 0)
                    @this.CanExecuteChanged?.Invoke(@this, EventArgs.Empty);
            }
        }

        MonitorTask(this, value!);
    }
}
```

### 3.3 计算属性

```csharp
public bool IsRunning => ExecutionTask is { IsCompleted: false };
public bool CanBeCanceled => IsRunning && this.cancellationTokenSource is { IsCancellationRequested: false };
public bool IsCancellationRequested => this.cancellationTokenSource is { IsCancellationRequested: true };
```

**核心设计：不存 bool 字段**，全部基于 `ExecutionTask` 和 `cancellationTokenSource` 实时计算。

---

## 4. 示例三：带取消按钮的搜索

```csharp
public class SearchViewModel : ObservableObject
{
    private string _query = "";
    public string Query
    {
        get => _query;
        set => SetProperty(ref _query, value);
    }

    private string _result = "";
    public string Result
    {
        get => _result;
        set => SetProperty(ref _result, value);
    }

    // 可取消命令：使用 Func<CancellationToken, Task>
    public AsyncRelayCommand SearchCommand { get; }

    public SearchViewModel()
    {
        SearchCommand = new AsyncRelayCommand(SearchAsync);
    }

    private async Task SearchAsync(CancellationToken ct)
    {
        Result = "搜索中...";

        try
        {
            // 模拟可取消的 HTTP 请求
            await Task.Delay(5000, ct);
            Result = $"搜索结果: {Query}";
        }
        catch (OperationCanceledException)
        {
            Result = "搜索已取消";
        }
    }

    public void CancelSearch()
    {
        SearchCommand.Cancel();
    }
}
```

**XAML：**

```xml
<StackPanel>
    <TextBox Text="{Binding Query}" />
    <Button Content="搜索" Command="{Binding SearchCommand}" />
    <Button Content="取消" Command="{Binding SearchCommand.CancelCommand}" />
    <!-- CancelCommand 是 IAsyncRelayCommand 内置属性 -->
    <TextBlock Text="{Binding Result}" />
</StackPanel>
```

**执行流程：**

| 操作 | 按钮状态 | IsRunning | CanBeCanceled |
|------|---------|-----------|---------------|
| 初始 | 搜索=启用, 取消=禁用 | false | false |
| 点击搜索 | 搜索=禁用, 取消=启用 | true | true |
| 点击取消 | 搜索=禁用, 取消=禁用 | true → false | false |
| 搜索完成 | 搜索=启用, 取消=禁用 | false | false |

---

## 5. 示例四：并发控制

### 默认（不允许并发）

```csharp
// 快速连续点击按钮 → 只有第一次有效
// IsRunning 期间 CanExecute 返回 false → 按钮自动禁用
private async Task LoadAsync()
{
    await Task.Delay(3000);
}
```

### 允许并发

```csharp
private readonly AsyncRelayCommand _logCommand;

public MyViewModel()
{
    // 第二个参数 AllowConcurrentExecutions 让每次点击都执行
    _logCommand = new AsyncRelayCommand(
        LogAsync,
        AsyncRelayCommandOptions.AllowConcurrentExecutions);
}

private async Task LogAsync()
{
    await File.AppendAllTextAsync("log.txt",
        $"{DateTime.Now}: 按钮被点击{Environment.NewLine}");
}
```

### 异常行为控制

```csharp
// 默认：异常抛到 UI 线程（async void → 应用崩溃前可以 catch）
// FlowExceptionsToTaskScheduler：异常流入 TaskScheduler，可手动检查
var cmd = new AsyncRelayCommand(
    UnsafeAsync,
    AsyncRelayCommandOptions.FlowExceptionsToTaskScheduler);

// 通过 ExecutionTask 属性检查异常
cmd.ExecutionTask?.ContinueWith(t =>
{
    if (t.Exception != null)
        Logger.LogError(t.Exception);
});
```

---

## 6. 源码对源码的执行流程

```
用户点击按钮
  ↓
ICommand.Execute(object?)       → AsyncRelayCommand.Execute
  ↓
ExecuteAsync(object?)           → 调用委托，设置 ExecutionTask
  ↓
ExecutionTask setter            → 触发 PropertyChanged(IsRunning=true)
                              → 触发 CanExecuteChanged（按钮禁用）
                              → 启动 MonitorTask（异步监控）
  ↓
await execute(...)              → 用户异步方法执行
  ↓  （完成后）
MonitorTask 回调                → 触发 PropertyChanged(IsRunning=false)
                              → 触发 CanExecuteChanged（按钮恢复）
```

---

## 7. 手写最小实现

```csharp
public class MiniAsyncRelayCommand : ICommand
{
    private readonly Func<CancellationToken, Task> _execute;
    private readonly Func<bool>? _canExecute;
    private CancellationTokenSource? _cts;
    private Task? _executionTask;

    public MiniAsyncRelayCommand(Func<CancellationToken, Task> execute,
        Func<bool>? canExecute = null)
    {
        _execute = execute;
        _canExecute = canExecute;
    }

    public bool IsRunning => _executionTask is { IsCompleted: false };
    public event EventHandler? CanExecuteChanged;

    public bool CanExecute(object? parameter)
    {
        if (IsRunning) return false;
        return _canExecute?.Invoke() ?? true;
    }

    public async void Execute(object? parameter)
    {
        _cts = new CancellationTokenSource();
        _executionTask = _execute(_cts.Token);
        CanExecuteChanged?.Invoke(this, EventArgs.Empty);
        try { await _executionTask; }
        catch (OperationCanceledException) { }
        finally { CanExecuteChanged?.Invoke(this, EventArgs.Empty); }
    }

    public void Cancel() => _cts?.Cancel();
}
```

---

**下一篇预告：WeakReferenceMessenger 源码分析 — 弱引用消息机制的底层数据结构**
