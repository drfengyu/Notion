---
title: C# 异步编程 - async await 详解
date: 2026-05-12
tags:
  - C#
  - async
  - await
  - 异步编程
categories:
  - 编程笔记
---

## 概述

async/await 是 C# 5.0 引入的异步编程模型，让异步代码看起来和同步代码相似，大幅简化异步编程。

## 基础概念

### async 关键字

标记方法为异步方法，允许使用 await。

```csharp
// 返回 Task 表示异步操作
public async Task DoSomethingAsync()
{
    await Task.Delay(1000);
}

// 返回 Task<T> 表示异步返回值
public async Task<string> GetDataAsync()
{
    await Task.Delay(500);
    return "完成";
}

// async void 仅用于事件处理
private async void Button_Click(object sender, EventArgs e)
{
    await LoadDataAsync();
}
```

### await 关键字

暂停方法执行直到等待的操作完成，期间不会阻塞线程。

```csharp
public async Task<string> FetchDataAsync()
{
    // 发起异步请求，立即返回 Task
    HttpClient client = new HttpClient();
    
    // await 挂起方法，不阻塞线程
    string result = await client.GetStringAsync("https://api.example.com/data");
    
    // 当请求完成后，自动恢复执行
    return result;
}
```

## 执行流程

```csharp
public async Task DemoAsync()
{
    Console.WriteLine("1. 开始");
    
    Task<string> task = LongOperationAsync();
    Console.WriteLine("2. 操作发起，未阻塞");
    
    string result = await task;
    Console.WriteLine($"3. 操作完成: {result}");
    
    Console.WriteLine("4. 继续执行");
}

private async Task<string> LongOperationAsync()
{
    Console.WriteLine("  内部: 开始工作");
    await Task.Delay(1000);
    Console.WriteLine("  内部: 工作完成");
    return "成功";
}

// 输出:
// 1. 开始
// 2. 操作发起，未阻塞
//   内部: 开始工作
//   内部: 工作完成
// 3. 操作完成: 成功
// 4. 继续执行
```

## 返回值类型

| 返回类型 | 适用场景 |
|----------|----------|
| `Task` | 无返回值的异步操作 |
| `Task<T>` | 有返回值的异步操作 |
| `ValueTask` / `ValueTask<T>` | 高频调用、结果可能同步返回的场景 |
| `void` | 仅限事件处理程序 |

### Task vs ValueTask

```csharp
// Task：每次返回新对象，有内存分配
public async Task<int> GetIdAsync()
{
    await Task.Delay(10);
    return 42;
}

// ValueTask：值类型，避免堆分配（适合高频或结果常可同步返回的场景）
public ValueTask<int> GetCachedValueAsync()
{
    if (_cachedValue != null)
        return new ValueTask<int>(_cachedValue.Value);
    
    return new ValueTask<int>(LoadValueAsync());
}

private async Task<int> LoadValueAsync()
{
    await Task.Delay(100);
    return 42;
}
```

## 异常处理

async/await 异常不会丢失，像同步代码一样捕获。

```csharp
public async Task HandleExceptionAsync()
{
    try
    {
        await FaultyOperationAsync();
    }
    catch (InvalidOperationException ex)
    {
        Console.WriteLine($"捕获异常: {ex.Message}");
    }
}

private async Task FaultyOperationAsync()
{
    await Task.Delay(100);
    throw new InvalidOperationException("出错了");
}
```

### 多个异步操作异常

```csharp
// 使用 Task.WhenAll 时的异常聚合
public async Task HandleMultipleAsync()
{
    var tasks = new List<Task>
    {
        FaultyOperationAsync(),
        AnotherFaultyAsync()
    };

    try
    {
        await Task.WhenAll(tasks);
    }
    catch (Exception ex)
    {
        // 只会捕获到第一个抛出的异常
        Console.WriteLine(ex.Message);
        
        // 要查看所有异常，检查 Task.Exception
        foreach (var task in tasks)
        {
            if (task.IsFaulted && task.Exception != null)
            {
                foreach (var inner in task.Exception.InnerExceptions)
                {
                    Console.WriteLine(inner.Message);
                }
            }
        }
    }
}
```

## ConfigureAwait

控制 await 是否恢复原 SynchronizationContext。

```csharp
public async Task ConfigureAwaitDemoAsync()
{
    // 库代码中推荐 false，避免死锁，提升性能
    await Task.Delay(1000).ConfigureAwait(false);
    
    // ⚠️ 问题：ConfigureAwait(false) 后，当前 SynchronizationContext 可能不同
    // ❌ 不要在此处直接更新 UI
    // this.TextBox.Text = "完成";   // 可能抛出异常
}

// UI 应用的正确做法
public async Task ButtonClickHandlerAsync()
{
    // 默认行为：恢复 UI 上下文
    await Task.Delay(1000);
    
    // 可以安全更新 UI
    this.TextBox.Text = "完成";
}
```

## 避免死锁

```csharp
// ❌ 错误：同步等待异步结果（死锁风险）
public string SyncWrapped()
{
    return GetDataAsync().Result;   // 死锁
    // 或 return GetDataAsync().Wait(); // 死锁
}

// ✅ 正确：一路 async
public async Task<string> CorrectAsync()
{
    return await GetDataAsync();
}

// 无法改成 async 时的替代方案
public string Workaround()
{
    // 配置 ConfigureAwait(false) 减少死锁风险
    return Task.Run(async () => await GetDataAsync().ConfigureAwait(false))
               .Result;
}
```

## 组合异步操作

### 顺序执行

```csharp
public async Task SequentialAsync()
{
    var result1 = await Operation1Async();
    var result2 = await Operation2Async();
    var result3 = await Operation3Async();
    // 总耗时 = 各操作耗时之和
}
```

### 并行执行

```csharp
public async Task ParallelAsync()
{
    var task1 = Operation1Async();
    var task2 = Operation2Async();
    var task3 = Operation3Async();
    
    // 等待所有完成
    await Task.WhenAll(task1, task2, task3);
    // 总耗时 ≈ 最长操作的耗时
}

// 获取所有结果
public async Task<string[]> FetchAllAsync()
{
    var tasks = urls.Select(url => httpClient.GetStringAsync(url));
    return await Task.WhenAll(tasks);
}
```

### 竞速执行

```csharp
public async Task<string> RaceAsync()
{
    Task<string> task1 = GetFromCacheAsync();
    Task<string> task2 = GetFromDatabaseAsync();
    
    // 返回最先完成的结果
    Task<string> completed = await Task.WhenAny(task1, task2);
    return await completed;
}

// 带超时的快速失败
public async Task<string> WithTimeoutAsync(TimeSpan timeout)
{
    using var cts = new CancellationTokenSource(timeout);
    
    try
    {
        return await FetchAsync(cts.Token);
    }
    catch (OperationCanceledException)
    {
        return "超时";
    }
}
```

## IAsyncEnumerable（异步流）

C# 8.0+ 支持异步枚举。

```csharp
public async IAsyncEnumerable<int> GenerateNumbersAsync()
{
    for (int i = 0; i < 10; i++)
    {
        await Task.Delay(100);
        yield return i;
    }
}

// 消费异步流
public async Task ConsumeAsync()
{
    await foreach (var number in GenerateNumbersAsync())
    {
        Console.WriteLine($"收到: {number}");
    }
}
```

## 完整示例：异步 Web 请求

```csharp
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

class AsyncExample
{
    private static readonly HttpClient _client = new HttpClient();
    
    public static async Task Main()
    {
        var urls = new[]
        {
            "https://api.github.com/users/octocat",
            "https://api.github.com/users/defunkt",
            "https://api.github.com/users/kevin"
        };
        
        // 添加默认请求头
        _client.DefaultRequestHeaders.UserAgent.ParseAdd("AsyncApp/1.0");
        
        await ProcessUrlsAsync(urls);
    }
    
    private static async Task ProcessUrlsAsync(string[] urls)
    {
        var tasks = new List<Task<(string url, int length)>>();
        
        foreach (var url in urls)
        {
            tasks.Add(FetchAndMeasureAsync(url));
        }
        
        var results = await Task.WhenAll(tasks);
        
        foreach (var (url, length) in results)
        {
            Console.WriteLine($"{url}: {length} 字符");
        }
    }
    
    private static async Task<(string, int)> FetchAndMeasureAsync(string url)
    {
        try
        {
            string content = await _client.GetStringAsync(url);
            return (url, content.Length);
        }
        catch (HttpRequestException ex)
        {
            Console.WriteLine($"请求 {url} 失败: {ex.Message}");
            return (url, 0);
        }
    }
}
```

## 最佳实践

| 原则 | 说明 |
|------|------|
| 一路 async | 尽量保持 async 调用链，不要混用同步等待 |
| 避免 async void | 仅用于事件处理程序 |
| 库代码使用 ConfigureAwait(false) | 避免死锁，提升性能 |
| 使用 CancellationToken | 支持取消操作 |
| 不要阻塞异步代码 | 避免 .Result, .Wait() |
| 适当使用 ValueTask | 高频调用或热路径 |

## 参考资源

- [Microsoft Docs: async 编程](https://learn.microsoft.com/zh-cn/dotnet/csharp/asynchronous-programming/)
- [异步模式最佳实践](https://learn.microsoft.com/zh-cn/dotnet/standard/asynchronous-programming-patterns/)
- [ConfigureAwait FAQ](https://devblogs.microsoft.com/dotnet/configureawait-faq/)
