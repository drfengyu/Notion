---
title: C# 线程同步 - lock 与 Monitor
date: 2026-05-12
tags:
  - C#
  - 线程同步
  - lock
categories:
  - 编程笔记
---

## 概述

多线程访问共享资源时可能出现数据不一致。`lock` 和 `Monitor` 用于确保同一时刻只有一个线程进入临界区。

## lock 语句

`lock` 是最简单的同步方式。

```csharp
private static readonly object _lockObj = new object();
private static int _counter = 0;

public static void Increment()
{
    lock (_lockObj)
    {
        _counter++;
    }
}
```

### 完整示例：计数器竞争条件

```csharp
using System;
using System.Threading;

class Program
{
    private static int _counter = 0;
    private static readonly object _lockObj = new object();

    static void Main()
    {
        Thread[] threads = new Thread[10];
        
        for (int i = 0; i < threads.Length; i++)
        {
            threads[i] = new Thread(Worker);
            threads[i].Start();
        }
        
        foreach (var t in threads)
            t.Join();
        
        Console.WriteLine($"最终计数: {_counter}");  // 应该是 10000
    }
    
    static void Worker()
    {
        for (int i = 0; i < 1000; i++)
        {
            // 不加 lock 会导致结果小于 10000
            lock (_lockObj)
            {
                _counter++;
            }
        }
    }
}
```

### lock 的锁定对象选择

- **实例方法**：`lock(this)` 有风险，外部可能也锁定该实例
- **公共类型**：`lock(typeof(MyClass))` 有风险
- **字符串**：字符串可能被暂留，不同变量指向同一对象

```csharp
// ✅ 推荐：私有只读对象
private readonly object _lock = new object();

// ❌ 不推荐：this 可能被外部锁定
lock (this) { }

// ❌ 不推荐：类型对象可能被其他程序集锁定
lock (typeof(MyClass)) { }

// ❌ 不推荐：字符串会被暂留
string s = "lock";
lock (s) { }
```

## Monitor 类

`lock` 是 `Monitor` 的语法糖。以下代码等价：

```csharp
// lock 写法
lock (_lockObj)
{
    // 临界区
}

// Monitor 等价写法
Monitor.Enter(_lockObj);
try
{
    // 临界区
}
finally
{
    Monitor.Exit(_lockObj);
}
```

### TryEnter - 带超时的锁

```csharp
if (Monitor.TryEnter(_lockObj, TimeSpan.FromSeconds(1)))
{
    try
    {
        // 获得锁后的操作
    }
    finally
    {
        Monitor.Exit(_lockObj);
    }
}
else
{
    Console.WriteLine("获取锁超时");
}
```

### Wait 和 Pulse - 线程间通信

生产者-消费者示例：

```csharp
using System;
using System.Threading;

class ProducerConsumer
{
    private readonly object _lock = new object();
    private Queue<int> _queue = new Queue<int>();
    private bool _done = false;

    public void Produce()
    {
        for (int i = 0; i < 10; i++)
        {
            lock (_lock)
            {
                _queue.Enqueue(i);
                Console.WriteLine($"生产: {i}");
                Monitor.Pulse(_lock);  // 唤醒一个等待线程
            }
            Thread.Sleep(100);
        }
        
        lock (_lock)
        {
            _done = true;
            Monitor.PulseAll(_lock);
        }
    }

    public void Consume()
    {
        while (true)
        {
            lock (_lock)
            {
                while (_queue.Count == 0 && !_done)
                {
                    Monitor.Wait(_lock);  // 释放锁并等待 Pulse
                }
                
                if (_queue.Count > 0)
                {
                    int item = _queue.Dequeue();
                    Console.WriteLine($"消费: {item}");
                }
                else if (_done)
                    break;
            }
        }
    }
}
```

### Pulse 与 PulseAll

- `Pulse`：唤醒一个等待线程
- `PulseAll`：唤醒所有等待线程
- `Wait`：释放锁并阻塞，收到 Pulse 后重新获取锁继续执行

## 使用场景对比

| 场景 | 推荐方案 |
|------|----------|
| 简单计数、短临界区 | `lock` |
| 需要超时控制的锁 | `Monitor.TryEnter` |
| 线程间信号通知 | `Monitor.Wait/Pulse` |
| 跨进程同步 | `Mutex` |
| 读写锁（多读单写） | `ReaderWriterLockSlim` |

## 常见错误

### 锁定可变对象

```csharp
// ❌ 错误：对象引用可能改变
private object _lock = new object();
lock (_lock)
{
    _lock = new object();  // 锁对象改变，失去同步效果
}
```

### 死锁

```csharp
// 两个线程分别锁定 a 和 b，然后等待对方释放
object a = new object();
object b = new object();

// 线程 1
lock (a) { lock (b) { } }

// 线程 2
lock (b) { lock (a) { } }  // 可能死锁
```

解决方案：统一锁定顺序，或使用 `Monitor.TryEnter` 超时机制。

## 性能注意事项

1. 临界区尽可能短
2. 避免在锁内执行 IO 操作
3. 不需要同步的代码放在锁外面

```csharp
// ❌ 不好
lock (_lock)
{
    var data = GetData();      // 可能耗时
    Process(data);
    _cache = data;
}

// ✅ 更好
var data = GetData();
Process(data);
lock (_lock)
{
    _cache = data;
}
```

## 参考资源

- [Microsoft Docs: lock 语句](https://learn.microsoft.com/zh-cn/dotnet/csharp/language-reference/statements/lock)
- [Microsoft Docs: Monitor 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.monitor)
