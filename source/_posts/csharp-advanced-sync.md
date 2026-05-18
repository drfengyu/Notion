---
title: C# 高级同步 - AsyncLock、SemaphoreSlim 与同步最佳实践
date: 2026-05-12
tags:
  - C#
  - AsyncLock
  - SemaphoreSlim
  - 同步
categories:
  - 编程笔记
---

## 概述

除了基础的 lock 和 Monitor，.NET 还提供专为异步场景设计的同步原语，以及一些高级模式。

## SemaphoreSlim（异步等待）

`SemaphoreSlim` 支持异步等待，是进程内异步限流的首选。

### 基础用法

```csharp
using System.Threading;

SemaphoreSlim semaphore = new SemaphoreSlim(3, 3);  // 并发数 3

public async Task ProcessAsync(string item)
{
    await semaphore.WaitAsync();
    try
    {
        await DoWorkAsync(item);
    }
    finally
    {
        semaphore.Release();
    }
}
```

### 带超时的异步等待

```csharp
if (await semaphore.WaitAsync(TimeSpan.FromSeconds(2)))
{
    try { await DoWorkAsync(); }
    finally { semaphore.Release(); }
}
else
{
    Console.WriteLine("获取锁超时");
}
```

## AsyncLock 实现

C# 没有内置的 AsyncLock，但可以用 SemaphoreSlim 实现：

```csharp
public class AsyncLock
{
    private readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);
    private readonly Task<IDisposable> _releaserTask;
    
    public AsyncLock()
    {
        _releaserTask = Task.FromResult<IDisposable>(new Releaser(this));
    }
    
    public Task<IDisposable> LockAsync()
    {
        var wait = _semaphore.WaitAsync();
        return wait.IsCompleted 
            ? _releaserTask 
            : wait.ContinueWith((_, state) => (IDisposable)state, 
                new Releaser(this), 
                CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);
    }
    
    private class Releaser : IDisposable
    {
        private readonly AsyncLock _parent;
        public Releaser(AsyncLock parent) => _parent = parent;
        public void Dispose() => _parent._semaphore.Release();
    }
}

// 使用
private readonly AsyncLock _lock = new AsyncLock();

public async Task UseAsyncLock()
{
    using (await _lock.LockAsync())
    {
        // 异步安全操作
        await DoSomethingAsync();
    }
}
```

### 简化版（推荐）

```csharp
public class AsyncLock
{
    private readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);
    
    public async Task<IDisposable> LockAsync()
    {
        await _semaphore.WaitAsync();
        return new Releaser(_semaphore);
    }
    
    private class Releaser : IDisposable
    {
        private readonly SemaphoreSlim _semaphore;
        public Releaser(SemaphoreSlim semaphore) => _semaphore = semaphore;
        public void Dispose() => _semaphore.Release();
    }
}
```

## ReaderWriterLockSlim

适用于多读单写场景。

```csharp
using System.Threading;

public class Cache<TKey, TValue>
{
    private readonly Dictionary<TKey, TValue> _cache = new Dictionary<TKey, TValue>();
    private readonly ReaderWriterLockSlim _lock = new ReaderWriterLockSlim();
    
    public TValue Get(TKey key)
    {
        _lock.EnterReadLock();
        try
        {
            return _cache.TryGetValue(key, out var value) ? value : default;
        }
        finally
        {
            _lock.ExitReadLock();
        }
    }
    
    public void Set(TKey key, TValue value)
    {
        _lock.EnterWriteLock();
        try
        {
            _cache[key] = value;
        }
        finally
        {
            _lock.ExitWriteLock();
        }
    }
    
    // 升级读锁为写锁
    public TValue GetOrAdd(TKey key, Func<TKey, TValue> factory)
    {
        _lock.EnterUpgradeableReadLock();
        try
        {
            if (_cache.TryGetValue(key, out var value))
                return value;
            
            _lock.EnterWriteLock();
            try
            {
                value = factory(key);
                _cache[key] = value;
                return value;
            }
            finally
            {
                _lock.ExitWriteLock();
            }
        }
        finally
        {
            _lock.ExitUpgradeableReadLock();
        }
    }
}
```

### ReaderWriterLockSlim vs lock

| 场景 | lock | ReaderWriterLockSlim |
|------|------|---------------------|
| 读多写少 | 所有操作互斥 | 读操作并行 |
| 写多读少 | 性能相当 | 额外开销 |
| 递归锁支持 | 是（同一线程） | 可配置 |
| 内存开销 | 低 | 高 |

## 并发模式

### 生产者-消费者（BlockingCollection）

```csharp
using System.Collections.Concurrent;

public class ProducerConsumer<T>
{
    private readonly BlockingCollection<T> _queue = new BlockingCollection<T>();
    
    public void Produce(T item) => _queue.Add(item);
    public void CompleteAdding() => _queue.CompleteAdding();
    
    public IEnumerable<T> Consume()
    {
        foreach (var item in _queue.GetConsumingEnumerable())
            yield return item;
    }
    
    public async Task ProcessAsync(Func<T, Task> processor, CancellationToken token)
    {
        foreach (var item in _queue.GetConsumingEnumerable(token))
        {
            await processor(item);
        }
    }
}
```

### 工作窃取队列（ConcurrentQueue + Parallel）

```csharp
public class WorkStealingQueue<T>
{
    private readonly ConcurrentQueue<T> _queue = new ConcurrentQueue<T>();
    
    public void Add(T item) => _queue.Enqueue(item);
    
    public bool TryTake(out T item) => _queue.TryDequeue(out item);
    
    public async Task ParallelProcessAsync(Func<T, Task> processor, int concurrency)
    {
        var tasks = new List<Task>();
        
        for (int i = 0; i < concurrency; i++)
        {
            tasks.Add(Task.Run(async () => {
                while (_queue.TryDequeue(out var item))
                {
                    await processor(item);
                }
            }));
        }
        
        await Task.WhenAll(tasks);
    }
}
```

## 避免常见陷阱

### 异步锁中的 ConfigureAwait

```csharp
// ❌ 可能导致死锁
public async Task UseLockAsync()
{
    using (await _asyncLock.LockAsync())
    {
        await DoWorkAsync().ConfigureAwait(false);  // 上下文改变
        // Releaser 可能在错误上下文释放
    }
}

// ✅ 使用同一配置
public async Task UseLockAsync()
{
    using (await _asyncLock.LockAsync().ConfigureAwait(false))
    {
        await DoWorkAsync().ConfigureAwait(false);
    }
}
```

### 递归锁问题

```csharp
// SemaphoreSlim 不支持递归
SemaphoreSlim sem = new SemaphoreSlim(1, 1);

await sem.WaitAsync();
await sem.WaitAsync();  // ❌ 死锁！同一线程不能重复获取

// lock 支持递归（同一线程）
lock (_obj)
{
    lock (_obj)  // ✅ 允许
    {
    }
}
```

## 性能数据参考

| 同步原语 | 平均耗时（纳秒） | 适用场景 |
|---------|----------------|----------|
| lock | ~50 | 短临界区 |
| SpinLock | ~30 | 极短临界区（<1us） |
| SemaphoreSlim | ~100 | 异步同步 |
| ReaderWriterLockSlim | ~200（读）~500（写） | 读多写少 |
| Mutex | ~2000 | 跨进程 |

## 选择指南

| 需求 | 推荐 |
|------|------|
| 简单互斥（同步） | lock |
| 简单互斥（异步） | SemaphoreSlim(1,1) |
| 限制并发数 | SemaphoreSlim |
| 读多写少 | ReaderWriterLockSlim |
| 跨进程 | Mutex / 命名 Semaphore |
| 无锁原子操作 | Interlocked |
| 极短临界区 | SpinLock |

## 参考资源

- [SemaphoreSlim 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.semaphoreslim)
- [ReaderWriterLockSlim 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.readerwriterlockslim)
- [线程同步最佳实践](https://learn.microsoft.com/zh-cn/dotnet/standard/threading/overview-of-synchronization-primitives)
