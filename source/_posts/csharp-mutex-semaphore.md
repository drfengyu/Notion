---
title: C# 跨进程同步 - Mutex 与 Semaphore
date: 2026-05-12
tags:
  - C#
  - Mutex
  - Semaphore
  - 线程同步
categories:
  - 编程笔记
---

## 概述

Mutex 和 Semaphore 是内核同步对象，支持跨进程同步。相比 lock/Monitor（用户态），它们有更大的开销但功能更强。

## Mutex（互斥体）

Mutex 确保同一时刻只有一个线程（或进程）拥有资源。

### 进程内使用

```csharp
using System.Threading;

Mutex mutex = new Mutex();

try
{
    if (mutex.WaitOne(TimeSpan.FromSeconds(1)))
    {
        // 临界区
        Console.WriteLine("获得锁，执行操作");
    }
    else
    {
        Console.WriteLine("获取锁超时");
    }
}
finally
{
    mutex.ReleaseMutex();
}
```

### 跨进程互斥

通过命名 Mutex 实现进程间同步：

```csharp
// 创建或打开已存在的命名 Mutex
Mutex mutex = new Mutex(false, "Global\\MyApp_SingleInstance");

// 检查是否已有实例在运行
bool isFirstInstance;
Mutex mutex = new Mutex(true, "Global\\MyApp_SingleInstance", out isFirstInstance);

if (!isFirstInstance)
{
    Console.WriteLine("已有实例运行中，程序退出");
    return;
}

// 运行主程序
Run();
```

### 单实例应用完整示例

```csharp
using System;
using System.Threading;
using System.Windows.Forms;

class Program
{
    [STAThread]
    static void Main()
    {
        using (Mutex mutex = new Mutex(true, "Global\\MyWinApp_SingleInstance", out bool isFirst))
        {
            if (!isFirst)
            {
                MessageBox.Show("程序已在运行");
                return;
            }
            
            Application.Run(new MainForm());
        }
    }
}
```

### 跨进程锁

```csharp
// 进程 A
Mutex mutex = new Mutex(false, "Global\\SharedResource");
mutex.WaitOne();
// 访问共享资源（如文件）
mutex.ReleaseMutex();

// 进程 B 使用相同的名称，会等待进程 A 释放
```

## Semaphore（信号量）

Semaphore 限制同时访问资源的线程数。

### 本地信号量

```csharp
// 初始计数 2，最大计数 3
Semaphore semaphore = new Semaphore(2, 3);

for (int i = 0; i < 10; i++)
{
    int taskId = i;
    Task.Run(() => {
        semaphore.WaitOne();
        try
        {
            Console.WriteLine($"{taskId} 获得信号量，线程: {Thread.CurrentThread.ManagedThreadId}");
            Thread.Sleep(1000);
        }
        finally
        {
            semaphore.Release();
            Console.WriteLine($"{taskId} 释放信号量");
        }
    });
}
```

### 使用 using 简化

```csharp
using SemaphoreSlim semaphore = new SemaphoreSlim(2, 3);

await semaphore.WaitAsync();
try
{
    // 异步操作
}
finally
{
    semaphore.Release();
}
```

### 命名信号量（跨进程）

```csharp
// 创建命名信号量
Semaphore semaphore = new Semaphore(2, 3, "Global\\MyNamedSemaphore");

// 不同进程使用相同名称即可共享
```

## SemaphoreSlim（推荐）

`SemaphoreSlim` 是轻量级版本，不支持跨进程，性能更好。

```csharp
using System.Threading;

SemaphoreSlim semaphore = new SemaphoreSlim(2, 3);

// 同步等待
semaphore.Wait();
try
{
    // 临界区
}
finally
{
    semaphore.Release();
}

// 异步等待（重要优势）
await semaphore.WaitAsync();
try
{
    await DoWorkAsync();
}
finally
{
    semaphore.Release();
}

// 带超时
if (await semaphore.WaitAsync(TimeSpan.FromSeconds(1)))
{
    try { /* 临界区 */ }
    finally { semaphore.Release(); }
}
```

## 实际应用场景

### 连接池限制

```csharp
public class DatabaseConnectionPool
{
    private readonly SemaphoreSlim _semaphore;
    private readonly List<DbConnection> _connections;
    
    public DatabaseConnectionPool(int maxConnections)
    {
        _semaphore = new SemaphoreSlim(maxConnections, maxConnections);
        _connections = new List<DbConnection>();
        
        for (int i = 0; i < maxConnections; i++)
        {
            _connections.Add(CreateConnection());
        }
    }
    
    public async Task<DbConnection> GetConnectionAsync()
    {
        await _semaphore.WaitAsync();
        lock (_connections)
        {
            var conn = _connections.First(c => c.State == ConnectionState.Closed);
            conn.Open();
            return conn;
        }
    }
    
    public void ReturnConnection(DbConnection connection)
    {
        connection.Close();
        _semaphore.Release();
    }
}
```

### API 限流

```csharp
public class RateLimiter
{
    private readonly SemaphoreSlim _semaphore;
    private readonly int _maxRequests;
    
    public RateLimiter(int maxConcurrentRequests)
    {
        _maxRequests = maxConcurrentRequests;
        _semaphore = new SemaphoreSlim(maxConcurrentRequests, maxConcurrentRequests);
    }
    
    public async Task<T> ExecuteAsync<T>(Func<Task<T>> action)
    {
        await _semaphore.WaitAsync();
        try
        {
            return await action();
        }
        finally
        {
            _semaphore.Release();
        }
    }
}
```

## 对比

| 特性 | Mutex | Semaphore | SemaphoreSlim |
|------|-------|-----------|---------------|
| 跨进程 | 支持 | 支持 | 不支持 |
| 性能 | 慢 | 慢 | 快 |
| 异步等待 | 不支持 | 不支持 | 支持 (WaitAsync) |
| 超时控制 | WaitOne(TimeSpan) | WaitOne(TimeSpan) | Wait/WaitAsync |
| 推荐场景 | 单例/跨进程锁 | 跨进程并发控制 | 进程内并发控制 |

## 注意事项

1. **始终释放资源**：使用 try/finally 或 using
2. **命名格式**：Global\ 表示全局（跨会话），Local\ 表示仅当前会话
3. **权限问题**：跨进程可能需要调整 ACL
4. **避免持有锁执行耗时操作**
5. **SemaphoreSlim 比 Semaphore 更适合 .NET 应用**

```csharp
// 释放示例
SemaphoreSlim sem = null;
try
{
    sem = new SemaphoreSlim(1, 1);
    await sem.WaitAsync();
    // 工作
}
finally
{
    sem?.Release();
    sem?.Dispose();
}
```

## 参考资源

- [Microsoft Docs: Mutex 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.mutex)
- [Microsoft Docs: Semaphore 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.semaphore)
- [Microsoft Docs: SemaphoreSlim 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.semaphoreslim)
