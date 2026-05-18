---
title: C# 异步编程模式 - EAP、APM 与 TAP
date: 2026-05-12
tags:
  - C#
  - 异步模式
  - EAP
  - APM
  - TAP
categories:
  - 编程笔记
---

## 概述

.NET 历史上共有三种异步编程模式：

- **APM** (Asynchronous Programming Model) - .NET 1.0，基于 `BeginXXX`/`EndXXX`
- **EAP** (Event-based Asynchronous Pattern) - .NET 2.0，基于事件
- **TAP** (Task-based Asynchronous Pattern) - .NET 4.0，基于 `Task`

**推荐**：新代码全部使用 TAP。

## TAP (Task-based Asynchronous Pattern)

### 特征

```csharp
// 返回 Task 或 Task<T>
public Task<string> DownloadStringAsync(string url);

// 支持 CancellationToken
public Task<string> DownloadStringAsync(string url, CancellationToken token);

// 支持 IProgress<T> 报告进度
public Task<string> DownloadStringAsync(string url, 
    CancellationToken token, 
    IProgress<int> progress);
```

### 实现示例

```csharp
public class DataService
{
    public async Task<string> FetchDataAsync(string id, CancellationToken token = default)
    {
        // 模拟异步操作
        await Task.Delay(1000, token);
        return $"数据: {id}";
    }
    
    public async Task<byte[]> DownloadWithProgressAsync(
        string url, 
        IProgress<float> progress = null,
        CancellationToken token = default)
    {
        using var client = new HttpClient();
        using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, token);
        response.EnsureSuccessStatusCode();
        
        var total = response.Content.Headers.ContentLength ?? -1;
        var buffer = new byte[8192];
        var bytesRead = 0L;
        
        await using var stream = await response.Content.ReadAsStreamAsync(token);
        await using var memoryStream = new MemoryStream();
        
        while (true)
        {
            int read = await stream.ReadAsync(buffer, token);
            if (read == 0) break;
            
            await memoryStream.WriteAsync(buffer.AsMemory(0, read), token);
            bytesRead += read;
            
            progress?.Report((float)bytesRead / total);
        }
        
        return memoryStream.ToArray();
    }
}
```

## APM (Asynchronous Programming Model)

### 特征

```csharp
// BeginXXX 返回 IAsyncResult
public IAsyncResult BeginGetResponse(AsyncCallback callback, object state);

// EndXXX 获取结果
public WebResponse EndGetResponse(IAsyncResult asyncResult);
```

### 使用示例

```csharp
using System.Net;

public class ApmExample
{
    public void DownloadAsync(string url)
    {
        WebRequest request = WebRequest.Create(url);
        
        // 异步开始，传入回调
        request.BeginGetResponse(ar => {
            var req = (WebRequest)ar.AsyncState;
            var response = req.EndGetResponse(ar);
            
            using var reader = new StreamReader(response.GetResponseStream());
            string result = reader.ReadToEnd();
            Console.WriteLine($"完成: {result.Length}");
        }, request);
    }
    
    // 同步等待
    public string DownloadSync(string url)
    {
        var request = WebRequest.Create(url);
        var result = request.BeginGetResponse(null, null);
        // 等待完成
        result.AsyncWaitHandle.WaitOne();
        var response = request.EndGetResponse(result);
        using var reader = new StreamReader(response.GetResponseStream());
        return reader.ReadToEnd();
    }
}
```

### 转换为 TAP

```csharp
public static Task<WebResponse> GetResponseAsync(this WebRequest request)
{
    return Task<WebResponse>.Factory.FromAsync(
        request.BeginGetResponse,
        request.EndGetResponse,
        null);
}

// 使用
var request = WebRequest.Create("https://api.example.com");
WebResponse response = await request.GetResponseAsync();
```

## EAP (Event-based Asynchronous Pattern)

### 特征

```csharp
public class ExampleComponent
{
    // 方法
    public void DoWorkAsync(string param);
    
    // 完成事件
    public event EventHandler<DoWorkCompletedEventArgs> DoWorkCompleted;
    
    // 进度事件
    public event ProgressChangedEventHandler ProgressChanged;
    
    // 取消支持
    public void CancelAsync();
}
```

### 使用示例

```csharp
using System.Net;

public class EapExample
{
    private readonly WebClient _client = new WebClient();
    
    public Task<string> DownloadStringAsync(string url)
    {
        var tcs = new TaskCompletionSource<string>();
        
        // 注册完成事件
        _client.DownloadStringCompleted += (sender, e) => {
            if (e.Cancelled)
                tcs.SetCanceled();
            else if (e.Error != null)
                tcs.SetException(e.Error);
            else
                tcs.SetResult(e.Result);
        };
        
        // 注册进度事件
        _client.DownloadProgressChanged += (sender, e) => {
            Console.WriteLine($"进度: {e.ProgressPercentage}%");
        };
        
        // 开始异步下载
        _client.DownloadStringAsync(new Uri(url));
        
        return tcs.Task;
    }
}
```

### 通用转换辅助方法

```csharp
public static class EapHelper
{
    public static Task<T> FromEap<T>(
        Action<EventHandler<T>> addHandler,
        Action<EventHandler<T>> removeHandler,
        Action startAsync)
        where T : AsyncCompletedEventArgs
    {
        var tcs = new TaskCompletionSource<T>();
        EventHandler<T> handler = null;
        
        handler = (sender, e) => {
            removeHandler(handler);
            
            if (e.Cancelled)
                tcs.SetCanceled();
            else if (e.Error != null)
                tcs.SetException(e.Error);
            else
                tcs.SetResult(e);
        };
        
        addHandler(handler);
        startAsync();
        
        return tcs.Task;
    }
}
```

## 三种模式对比

| 特性 | APM | EAP | TAP |
|------|-----|-----|-----|
| 引入版本 | .NET 1.0 | .NET 2.0 | .NET 4.0 |
| 返回值 | IAsyncResult | void | Task/Task<T> |
| 完成通知 | AsyncCallback | 事件 | ContinueWith/await |
| 取消支持 | 需自行实现 | CancelAsync | CancellationToken |
| 进度报告 | 无 | ProgressChanged | IProgress<T> |
| 异常处理 | EndXXX | 事件参数 | 异常传播 |
| 组合性 | 差 | 差 | 优秀 |
| 语言支持 | 无 | 无 | async/await |

## 迁移策略

### 将 APM 包装为 TAP

```csharp
// 使用 Task.Factory.FromAsync
public static class ApmExtensions
{
    public static Task<Stream> EndReadAsync(this Stream stream, byte[] buffer, int offset, int count)
    {
        return Task.Factory.FromAsync(
            (cb, state) => stream.BeginRead(buffer, offset, count, cb, state),
            stream.EndRead,
            null);
    }
}
```

### 将 EAP 包装为 TAP

```csharp
public static class EapExtensions
{
    public static Task<string> DownloadStringTaskAsync(this WebClient client, string url)
    {
        var tcs = new TaskCompletionSource<string>();
        
        DownloadStringCompletedEventHandler handler = null;
        handler = (sender, e) => {
            client.DownloadStringCompleted -= handler;
            
            if (e.Cancelled)
                tcs.SetCanceled();
            else if (e.Error != null)
                tcs.SetException(e.Error);
            else
                tcs.SetResult(e.Result);
        };
        
        client.DownloadStringCompleted += handler;
        client.DownloadStringAsync(new Uri(url));
        
        return tcs.Task;
    }
}

// 使用
WebClient client = new WebClient();
string result = await client.DownloadStringTaskAsync("https://example.com");
```

## 库的兼容性建议

### 针对旧 API 的适配层

```csharp
public interface IModernService
{
    Task<string> GetDataAsync(string id, CancellationToken token = default);
}

public class LegacyAdapter : IModernService
{
    private readonly LegacyService _legacy;
    
    public LegacyAdapter(LegacyService legacy)
    {
        _legacy = legacy;
    }
    
    public async Task<string> GetDataAsync(string id, CancellationToken token = default)
    {
        // 使用 TaskCompletionSource 包装旧版 APM/EAP
        var tcs = new TaskCompletionSource<string>();
        
        token.Register(() => tcs.TrySetCanceled());
        
        _legacy.BeginGetData(id, ar => {
            try
            {
                string result = _legacy.EndGetData(ar);
                tcs.TrySetResult(result);
            }
            catch (Exception ex)
            {
                tcs.TrySetException(ex);
            }
        }, null);
        
        return await tcs.Task;
    }
}
```

## 完整示例：检测并转换

```csharp
public class AsyncDetector
{
    public string DetectPattern(object obj)
    {
        var type = obj.GetType();
        
        // 检查 TAP
        if (type.GetMethods().Any(m => m.ReturnType == typeof(Task)))
            return "TAP";
        
        // 检查 APM
        if (type.GetMethods().Any(m => m.Name.StartsWith("Begin") && 
                                      m.Name.EndsWith("End") exists?))
            return "APM";
        
        // 检查 EAP
        if (type.GetEvents().Any(e => e.Name.EndsWith("Completed")))
            return "EAP";
        
        return "Unknown";
    }
}
```

## 最佳实践

| 场景 | 推荐做法 |
|------|----------|
| 新代码 | 必须使用 TAP |
| 维护旧代码 | 保持现有模式 |
| 消费旧 API | 包装为 TAP |
| 提供公共 API | 同时提供 TAP 和兼容层（如有需要） |
| 性能敏感场景 | TAP + ValueTask |

## 参考资源

- [Microsoft Docs: 异步编程模式](https://learn.microsoft.com/zh-cn/dotnet/standard/asynchronous-programming-patterns/)
- [从 APM 迁移到 TAP](https://learn.microsoft.com/zh-cn/dotnet/standard/asynchronous-programming-patterns/interop-with-other-asynchronous-patterns-and-types)
- [Task-based Asynchronous Pattern](https://learn.microsoft.com/zh-cn/dotnet/standard/asynchronous-programming-patterns/task-based-asynchronous-pattern-tap)
