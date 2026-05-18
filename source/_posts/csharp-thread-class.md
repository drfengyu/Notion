---
title: C# 线程详解 - Thread 类
date: 2026-05-12
tags:
  - C#
  - 线程
  - 多线程
categories:
  - 编程笔记
---

## 概述

`System.Threading.Thread` 是 .NET 中最基础的线程操作类。通过 Thread 类可以创建、启动、暂停、恢复和终止线程。

## 创建和启动线程

### 基本创建方式

```csharp
using System.Threading;

// 无参数
Thread t1 = new Thread(new ThreadStart(DoWork));
t1.Start();

// 带参数
Thread t2 = new Thread(new ParameterizedThreadStart(DoWorkWithParam));
t2.Start("hello");

// Lambda 表达式
Thread t3 = new Thread(() => {
    Console.WriteLine("Lambda 线程执行");
});
t3.Start();

static void DoWork()
{
    Console.WriteLine($"线程 ID: {Environment.CurrentManagedThreadId}");
}

static void DoWorkWithParam(object obj)
{
    string msg = obj as string;
    Console.WriteLine($"收到参数: {msg}");
}
```

## 线程常用属性

| 属性 | 说明 |
|------|------|
| `Name` | 线程名称，调试时非常有用 |
| `IsBackground` | 是否为后台线程。后台线程不会阻止进程退出 |
| `Priority` | 线程优先级 |
| `ThreadState` | 当前线程状态 |
| `ManagedThreadId` | 托管线程唯一标识符 |

```csharp
Thread t = new Thread(DoWork);
t.Name = "MyWorker";
t.IsBackground = true;      // 设为后台线程
t.Priority = ThreadPriority.AboveNormal;
t.Start();

Console.WriteLine($"Name: {t.Name}");
Console.WriteLine($"IsBackground: {t.IsBackground}");
Console.WriteLine($"Priority: {t.Priority}");
Console.WriteLine($"ThreadState: {t.ThreadState}");
```

## 线程状态与生命周期

### 状态枚举

```
Unstarted → Running → WaitSleepJoin → Running → Stopped
                ↓
            Suspended (已过时，不推荐)
```

```csharp
Thread t = new Thread(DoWork);
Console.WriteLine($"创建后: {t.ThreadState}");  // Unstarted

t.Start();
Console.WriteLine($"启动后: {t.ThreadState}");  // Running

Thread.Sleep(100);  // 让出 CPU
Console.WriteLine($"Sleep 后: {t.ThreadState}"); // WaitSleepJoin

t.Join();  // 等待线程结束
Console.WriteLine($"结束后: {t.ThreadState}");  // Stopped
```

## 控制线程

### Sleep - 暂停当前线程

```csharp
// 暂停当前线程 1000 毫秒
Thread.Sleep(1000);

// TimeSpan 方式
Thread.Sleep(TimeSpan.FromSeconds(1));
```

**注意**：`Thread.Sleep` 作用于**当前线程**，不能用于暂停其他线程。

### Join - 等待线程完成

```csharp
Thread t = new Thread(() => {
    Thread.Sleep(2000);
    Console.WriteLine("工作线程完成");
});

t.Start();
Console.WriteLine("等待工作线程...");
t.Join();  // 阻塞当前线程，直到 t 完成
Console.WriteLine("主线程继续");
```

带超时的 Join：

```csharp
if (t.Join(TimeSpan.FromSeconds(1)))
{
    Console.WriteLine("线程在 1 秒内完成");
}
else
{
    Console.WriteLine("线程超时未完成");
}
```

### Interrupt - 中断等待线程

```csharp
Thread t = new Thread(() => {
    try
    {
        Thread.Sleep(Timeout.Infinite);
    }
    catch (ThreadInterruptedException)
    {
        Console.WriteLine("线程被中断");
    }
});
t.Start();
Thread.Sleep(100);
t.Interrupt();  // 唤醒等待中的线程并抛出 ThreadInterruptedException
```

### Abort - 终止线程（已过时）

```csharp
// ⚠️ 不推荐使用，可能造成资源泄漏
t.Abort();
```

> .NET Core/.NET 5+ 中 `Abort` 会抛出 `PlatformNotSupportedException`。推荐使用 `CancellationToken` 或共享标志位实现协作式取消。

## 线程优先级

```csharp
// 优先级枚举
// Lowest < BelowNormal < Normal < AboveNormal < Highest

Thread t = new Thread(DoWork);
t.Priority = ThreadPriority.Highest;
t.Start();
```

高优先级线程获得更多 CPU 时间，可能造成低优先级线程饥饿。一般情况下使用默认的 `Normal`。

## 前台线程 vs 后台线程

- **前台线程**：进程会等待所有前台线程结束才退出
- **后台线程**：进程退出时立即终止，不等待

```csharp
// 默认是前台线程
Thread foreground = new Thread(() => {
    Thread.Sleep(5000);
    Console.WriteLine("前台线程执行完");
});
foreground.Start();

// 设置为后台线程
Thread background = new Thread(() => {
    while (true)  // 无限循环，但进程退出时会自动终止
    {
        Thread.Sleep(1000);
        Console.WriteLine("后台线程运行中");
    }
});
background.IsBackground = true;
background.Start();
```

## 完整示例：多线程计算

```csharp
using System;
using System.Threading;

class Program
{
    static void Main()
    {
        Console.WriteLine($"主线程 ID: {Thread.CurrentThread.ManagedThreadId}");

        // 创建三个工作线程
        for (int i = 1; i <= 3; i++)
        {
            int taskId = i;  // 捕获变量
            Thread worker = new Thread(() => Calculate(taskId));
            worker.Name = $"Worker-{taskId}";
            worker.Start();
        }

        Console.WriteLine("主线程继续做其他事...");
        Thread.Sleep(1000);
        Console.WriteLine("主线程结束");
    }

    static void Calculate(int taskId)
    {
        Console.WriteLine($"[{Thread.CurrentThread.Name}] 开始计算，线程 ID: {Thread.CurrentThread.ManagedThreadId}");
        
        int sum = 0;
        for (int i = 1; i <= 1000000; i++)
        {
            sum += i;
        }
        
        Console.WriteLine($"[{Thread.CurrentThread.Name}] 计算结果: {sum}");
    }
}
```

## 常见问题与注意事项

1. **跨线程访问 UI 控件**：WinForms/WPF 中需要通过 `Invoke` 回到 UI 线程

```csharp
// WinForms 示例
this.Invoke(new Action(() => {
    label1.Text = "更新完成";
}));
```

2. **线程安全**：多个线程访问共享变量需要同步

```csharp
private static readonly object _lock = new object();
private static int _counter = 0;

static void Increment()
{
    lock (_lock)  // 确保原子性
    {
        _counter++;
    }
}
```

3. **避免使用 Thread.Suspend/Resume**：已过时且容易死锁

4. **ThreadStatic 特性**：每个线程独立副本

```csharp
[ThreadStatic]
private static int _threadLocal = 0;
```

## 何时使用 Thread 而不是 Task

| 场景 | 推荐 |
|------|------|
| 需要精细控制线程优先级 | Thread |
| 长时间运行的后台操作 | Thread (或 TaskCreationOptions.LongRunning) |
| 需要取消支持 | Task + CancellationToken |
| 需要返回值 | Task<T> |
| 需要异常传播和 Continuation | Task |
| 简单并发操作 | Task / Parallel |

## 参考资源

- [Microsoft Docs: Thread 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.thread)
- [线程与线程处理](https://learn.microsoft.com/zh-cn/dotnet/standard/threading/)
