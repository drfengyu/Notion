---
title: C# 任务取消 - CancellationToken 完全指南
date: 2026-05-12
tags:
  - C#
  - CancellationToken
  - 任务取消
categories:
  - 编程笔记
---

## 概述

`CancellationToken` 是 .NET 中标准的协作式取消机制。它允许一个线程向另一个线程发出取消信号，被取消的任务可以优雅地响应并清理资源。

## 基础使用

### CancellationTokenSource 与 Token

```csharp
using System.Threading;

// 创建取消源
CancellationTokenSource cts = new CancellationTokenSource();

// 获取 Token（只读）
CancellationToken token = cts.Token;

// 检查是否已取消
if (token.IsCancellationRequested)
{
    Console.WriteLine("取消信号已发出");
}

// 发出取消信号
cts.Cancel();
```

### 响应取消

```csharp
public void DoWork(CancellationToken token)
{
    for (int i = 0; i < 1000000; i++)
    {
        // 检查是否被取消
        if (token.IsCancellationRequested)
        {
            Console.WriteLine("任务被取消");
            return;  // 清理后返回
        }
        
        // 正常工作
        ProcessItem(i);
    }
}
```

## 使用 ThrowIfCancellationRequested

```csharp
public void DoWorkWithException(CancellationToken token)
{
    for (int i = 0; i < 1000000; i++)
    {
        // 如果取消，抛出 OperationCanceledException
        token.ThrowIfCancellationRequested();
        
        ProcessItem(i);
    }
}

// 调用方捕获异常
try
{
    DoWorkWithException(token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("操作已取消");
}
```

## Task 中使用 CancellationToken

```csharp
CancellationTokenSource cts = new CancellationTokenSource();

Task task = Task.Run(() => {
    for (int i = 0; i < 100; i++)
    {
        cts.Token.ThrowIfCancellationRequested();
        Thread.Sleep(100);
        Console.WriteLine($"进度: {i}%");
    }
}, cts.Token);  // 传递 Token 给 Task 构造函数

// 5 秒后取消
Thread.Sleep(5000);
cts.Cancel();

try
{
    await task;
}
catch (OperationCanceledException)
{
    Console.WriteLine("任务已取消");
}
```

## 超时取消

### 方法一：CancelAfter

```csharp
CancellationTokenSource cts = new CancellationTokenSource();
cts.CancelAfter(TimeSpan.FromSeconds(3));
// 或 cts.CancelAfter(3000);  // 毫秒

try
{
    await LongRunningOperationAsync(cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("操作超时");
}
```

### 方法二：构造函数

```csharp
// 创建 3 秒后自动取消的源
CancellationTokenSource cts = new CancellationTokenSource(3000);
```

### 扩展方法

```csharp
// 带超时的辅助扩展
public static async Task<T> WithTimeout<T>(this Task<T> task, TimeSpan timeout)
{
    using (var cts = new CancellationTokenSource(timeout))
    {
        var completedTask = await Task.WhenAny(task, Task.Delay(timeout, cts.Token));
        if (completedTask != task)
        {
            throw new TimeoutException("操作超时");
        }
        return await task;
    }
}

// 使用
var result = await FetchDataAsync().WithTimeout(TimeSpan.FromSeconds(5));
```

## 链接多个取消源

```csharp
using (CancellationTokenSource linkedCts = CancellationTokenSource.CreateLinkedTokenSource(token1, token2))
{
    CancellationToken linkedToken = linkedCts.Token;
    
    // linkedToken 会在 token1 或 token2 任一取消时取消
    await LongRunningOperationAsync(linkedToken);
}
```

### 组合超时与用户取消

```csharp
CancellationTokenSource userCts = new CancellationTokenSource();

// 链接用户取消和超时
CancellationTokenSource linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
    userCts.Token,
    new CancellationTokenSource(TimeSpan.FromSeconds(10)).Token
);

await LongRunningOperationAsync(linkedCts.Token);
```

## 注册取消回调

```csharp
using (CancellationTokenSource cts = new CancellationTokenSource())
{
    // 注册取消时的回调
    cts.Token.Register(() => {
        Console.WriteLine("取消信号已发出，执行清理");
        CleanupResources();
    });
    
    // 也可以传入状态对象
    cts.Token.Register(state => {
        var data = (MyData)state;
        data.Cleanup();
    }, myData);
    
    // 触发取消
    cts.Cancel();
}
```

### 多个回调

```csharp
CancellationTokenRegistration reg1 = token.Register(() => Console.WriteLine("回调1"));
CancellationTokenRegistration reg2 = token.Register(() => Console.WriteLine("回调2"));

// 取消注册（避免执行）
reg1.Unregister();

cts.Cancel();  // 只有回调2执行
```

## 在异步方法中使用

```csharp
public async Task ProcessWithCancelAsync(CancellationToken token)
{
    try
    {
        // 网络请求
        string data = await httpClient.GetStringAsync(url, token);
        
        // 文件操作
        await using var stream = new FileStream(path, FileMode.Open);
        await stream.CopyToAsync(memoryStream, token);
        
        // 延迟
        await Task.Delay(1000, token);
    }
    catch (OperationCanceledException)
    {
        Console.WriteLine("处理被取消");
    }
}
```

## 手动 CancellationTokenSource 释放

```csharp
// ❌ 不释放可能造成内存泄漏
CancellationTokenSource cts = new CancellationTokenSource();
// 使用 cts...
// 忘记 Dispose

// ✅ 使用 using 块
using (var cts = new CancellationTokenSource(5000))
{
    await DoWorkAsync(cts.Token);
}  // 自动释放

// ✅ 或手动释放
var cts = new CancellationTokenSource();
try
{
    await DoWorkAsync(cts.Token);
}
finally
{
    cts.Dispose();
}
```

## 不可取消的 Token

```csharp
// 表示永不取消的 Token
CancellationToken none = CancellationToken.None;

// 等价于
if (none.CanBeCanceled)  // false
{
    // 不会执行
}

// 适用场景：可选参数默认值
public async Task FetchAsync(CancellationToken token = default)
{
    // default(CancellationToken) 等同于 CancellationToken.None
    token = token == default ? CancellationToken.None : token;
    await httpClient.GetStringAsync(url, token);
}
```

## 完整示例：可取消的下载器

```csharp
using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

class Downloader
{
    private readonly HttpClient _httpClient = new HttpClient();
    private CancellationTokenSource? _currentCts;
    
    public async Task DownloadFileAsync(string url, string filePath, IProgress<float>? progress = null)
    {
        // 取消之前的下载
        CancelCurrentDownload();
        
        _currentCts = new CancellationTokenSource();
        CancellationToken token = _currentCts.Token;
        
        try
        {
            using var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);
            response.EnsureSuccessStatusCode();
            
            var totalBytes = response.Content.Headers.ContentLength ?? -1;
            using var contentStream = await response.Content.ReadAsStreamAsync(token);
            using var fileStream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);
            
            var buffer = new byte[8192];
            long bytesRead = 0;
            
            while (true)
            {
                token.ThrowIfCancellationRequested();
                
                int read = await contentStream.ReadAsync(buffer, token);
                if (read == 0) break;
                
                await fileStream.WriteAsync(buffer.AsMemory(0, read), token);
                bytesRead += read;
                
                if (totalBytes > 0 && progress != null)
                {
                    progress.Report((float)bytesRead / totalBytes);
                }
            }
            
            Console.WriteLine("下载完成");
        }
        catch (OperationCanceledException)
        {
            Console.WriteLine("下载被取消");
            if (File.Exists(filePath)) File.Delete(filePath);
            throw;
        }
    }
    
    public void CancelCurrentDownload()
    {
        if (_currentCts != null && !_currentCts.IsCancellationRequested)
        {
            _currentCts.Cancel();
            _currentCts.Dispose();
            _currentCts = null;
        }
    }
}

// 使用示例
class Program
{
    static async Task Main()
    {
        var downloader = new Downloader();
        var cts = new CancellationTokenSource();
        
        // 5 秒后自动取消
        cts.CancelAfter(5000);
        
        try
        {
            await downloader.DownloadFileAsync(
                "https://example.com/largefile.zip",
                "downloaded.zip",
                new Progress<float>(p => Console.WriteLine($"进度: {p:P0}")
            ), cts.Token);
        }
        catch (OperationCanceledException)
        {
            Console.WriteLine("下载被外部取消");
        }
    }
}
```

## 最佳实践

| 规则 | 说明 |
|------|------|
| 协作式取消 | 不支持强制终止线程 |
| 定期检查 | 循环中定期调用 ThrowIfCancellationRequested |
| 传递 Token | 将 Token 传递给所有可取消的方法 |
| 及时释放 | CancellationTokenSource 实现 IDisposable |
| 避免阻塞 | 不要长时间不检查取消状态 |
| 注册回调 | 使用 Register 做清理工作 |

## 常见误区

```csharp
// ❌ 误区1：认为 Cancel 会立即中断线程
cts.Cancel();  // 只是设置标志，目标线程需自行检查

// ❌ 误区2：忘记传递 Token 给子任务
Task.Run(() => {
    // 应该将 token 传递进来
    while (!token.IsCancellationRequested) { }
}, token);

// ❌ 误区3：重复使用已取消的 CancellationTokenSource
cts.Cancel();
await RunAsync(cts.Token);  // 立即抛出异常
// 应该创建新的 CancellationTokenSource

// ✅ 正确：重新创建
cts = new CancellationTokenSource();
await RunAsync(cts.Token);
```

## 参考资源

- [Microsoft Docs: CancellationToken](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.cancellationtoken)
- [协作式取消模式](https://learn.microsoft.com/zh-cn/dotnet/standard/threading/cancellation-in-managed-threads)
