---
title: C# 线程池与 Task - 高效并发编程
date: 2026-05-12
tags:
  - C#
  - 线程池
  - Task
categories:
  - 编程笔记
---

## 概述

线程池（ThreadPool）和 Task 是 .NET 中推荐的并发编程方式。它们简化了线程管理，避免频繁创建销毁线程的开销。

## 线程池 (ThreadPool)

线程池维护一组工作线程，任务到来时分配空闲线程执行。

### 基础使用

```csharp
using System.Threading;

// 向线程池排队任务
ThreadPool.QueueUserWorkItem(state => {
    Console.WriteLine($"线程池执行，线程 ID: {Thread.CurrentThread.ManagedThreadId}");
});

// 带参数
ThreadPool.QueueUserWorkItem(state => {
    int data = (int)state;
    Console.WriteLine($"数据: {data}");
}, 42);
```

### 设置线程池大小

```csharp
// 获取默认线程数
ThreadPool.GetMinThreads(out int minWorker, out int minIo);
ThreadPool.GetMaxThreads(out int maxWorker, out int maxIo);
Console.WriteLine($"最小工蜂线程: {minWorker}, 最小 IO 线程: {minIo}");

// 调整线程数（谨慎使用）
ThreadPool.SetMinThreads(4, 4);
ThreadPool.SetMaxThreads(50, 50);
```

## Task（推荐）

Task 基于线程池，提供更丰富的 API。

### 创建和启动

```csharp
using System.Threading.Tasks;

// 方式1：Task.Run
Task task1 = Task.Run(() => {
    Console.WriteLine("Task 执行");
});

// 方式2：Task.Factory.StartNew
Task task2 = Task.Factory.StartNew(() => {
    Console.WriteLine("Factory 创建");
});

// 带返回值
Task<int> taskWithResult = Task.Run(() => {
    return 42;
});
int result = await taskWithResult;
```

### 等待完成

```csharp
Task task = Task.Run(() => Thread.Sleep(1000));

// 阻塞等待
task.Wait();

// 带超时
bool completed = task.Wait(TimeSpan.FromSeconds(2));

// 等待多个任务
Task[] tasks = { task1, task2 };
Task.WaitAll(tasks);      // 全部完成
Task.WaitAny(tasks);      // 任一完成
```

### 延续 (Continuation)

```csharp
Task.Run(() => 42)
    .ContinueWith(prev => {
        Console.WriteLine($"前一个结果: {prev.Result}");
        return prev.Result * 2;
    })
    .ContinueWith(prev => {
        Console.WriteLine($"最终结果: {prev.Result}");
    });
```

### 异常处理

```csharp
Task task = Task.Run(() => {
    throw new InvalidOperationException("任务异常");
});

try
{
    await task;
}
catch (InvalidOperationException ex)
{
    Console.WriteLine($"捕获异常: {ex.Message}");
}

// 或使用 Wait 捕获 AggregateException
try
{
    task.Wait();
}
catch (AggregateException ae)
{
    foreach (var ex in ae.InnerExceptions)
    {
        Console.WriteLine(ex.Message);
    }
}
```

## 取消任务 (CancellationToken)

```csharp
using System.Threading;

CancellationTokenSource cts = new CancellationTokenSource();

Task task = Task.Run(() => {
    while (!cts.Token.IsCancellationRequested)
    {
        Console.WriteLine("工作中...");
        Thread.Sleep(500);
    }
    Console.WriteLine("任务已取消");
}, cts.Token);

Thread.Sleep(2000);
cts.Cancel();  // 发出取消信号
await task;
```

### 带超时的自动取消

```csharp
CancellationTokenSource cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));

try
{
    await Task.Run(() => {
        for (int i = 0; i < 10; i++)
        {
            cts.Token.ThrowIfCancellationRequested();
            Thread.Sleep(1000);
        }
    }, cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("任务因超时被取消");
}
```

## async/await 配合 Task

```csharp
public async Task<string> FetchDataAsync()
{
    // 模拟异步 IO
    await Task.Delay(1000);
    return "数据";
}

// 使用
string data = await FetchDataAsync();
```

### 避免死锁：ConfigureAwait

```csharp
// 在库代码中使用 ConfigureAwait(false)
await Task.Delay(1000).ConfigureAwait(false);
```

## 长时间运行的任务

默认 Task 使用线程池，长时间运行可能阻塞其他任务：

```csharp
// 创建专用线程而非线程池线程
Task longTask = Task.Factory.StartNew(() => {
    while (true)
    {
        // 长时间循环
    }
}, TaskCreationOptions.LongRunning);
```

## 完整示例：批量请求

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

class Program
{
    static async Task Main()
    {
        var urls = new[] { "url1", "url2", "url3", "url4", "url5" };
        
        // 并发处理所有 URL
        var tasks = new List<Task<string>>();
        foreach (var url in urls)
        {
            tasks.Add(DownloadAsync(url));
        }
        
        // 等待全部完成
        string[] results = await Task.WhenAll(tasks);
        
        foreach (var result in results)
        {
            Console.WriteLine(result);
        }
    }
    
    static async Task<string> DownloadAsync(string url)
    {
        await Task.Delay(500); // 模拟网络请求
        return $"下载完成: {url}";
    }
}
```

## 对比总结

| 特性 | Thread | ThreadPool | Task |
|------|--------|------------|------|
| 创建开销 | 高 | 低 | 极低 |
| 返回值支持 | 无 | 无 | 有 (Task<T>) |
| 取消支持 | 手动 | 手动 | CancellationToken |
| 异常传播 | 需自行处理 | 需自行处理 | 自动传播 |
| 延续 | 无 | 无 | ContinueWith / await |
| 推荐度 | 特殊场景 | 中 | 高 |

## 最佳实践

1. **默认使用 Task**，除非需要精细化控制线程
2. **使用 async/await** 编写异步代码
3. **始终处理异常**，不要静默失败
4. **库代码使用 ConfigureAwait(false)**
5. **LongRunning 任务**使用 TaskCreationOptions.LongRunning

## 参考资源

- [Microsoft Docs: 线程池](https://learn.microsoft.com/zh-cn/dotnet/standard/threading/the-managed-thread-pool)
- [Microsoft Docs: Task 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.tasks.task)
