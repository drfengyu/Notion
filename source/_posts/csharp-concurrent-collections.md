---
title: C# 线程安全集合 - Concurrent Collections
date: 2026-05-12
tags:
  - C#
  - 并发集合
  - 线程安全
categories:
  - 编程笔记
---

## 概述

`System.Collections.Concurrent` 命名空间提供了线程安全的集合类。在多线程环境中使用这些集合可以避免手动加锁，提升性能。

## ConcurrentDictionary<TKey, TValue>

线程安全的字典实现。

### 基本操作

```csharp
using System.Collections.Concurrent;

ConcurrentDictionary<string, int> dict = new ConcurrentDictionary<string, int>();

// 添加或更新
dict.TryAdd("apple", 1);
dict.TryAdd("banana", 2);

// 获取值
if (dict.TryGetValue("apple", out int value))
{
    Console.WriteLine($"apple: {value}");
}

// 更新（原子操作）
dict.AddOrUpdate("apple", 
    addValueFactory: key => 1,
    updateValueFactory: (key, oldValue) => oldValue + 1);

// 移除
dict.TryRemove("banana", out int removed);

// 获取或添加
int count = dict.GetOrAdd("orange", 0);
```

### 遍历

```csharp
// 遍历时不能直接修改集合，但 ConcurrentDictionary 允许在遍历时修改
// 遍历的是快照，不会抛出异常
foreach (var kvp in dict)
{
    Console.WriteLine($"{kvp.Key}: {kvp.Value}");
}

// 安全修改遍历中的元素
dict.ToList().ForEach(kvp => {
    dict.TryUpdate(kvp.Key, kvp.Value + 10, kvp.Value);
});
```

## ConcurrentQueue<T>

FIFO 队列，无锁实现。

```csharp
ConcurrentQueue<int> queue = new ConcurrentQueue<int>();

// 入队
queue.Enqueue(1);
queue.Enqueue(2);

// 出队
if (queue.TryDequeue(out int result))
{
    Console.WriteLine($"出队: {result}");
}

// 偷看（不移除）
if (queue.TryPeek(out int peek))
{
    Console.WriteLine($"队首: {peek}");
}

// 生产-消费者示例
async Task Producer(ConcurrentQueue<int> q, int items)
{
    for (int i = 0; i < items; i++)
    {
        q.Enqueue(i);
        await Task.Delay(10);
    }
}

async Task Consumer(ConcurrentQueue<int> q, CancellationToken ct)
{
    while (!ct.IsCancellationRequested || q.Count > 0)
    {
        if (q.TryDequeue(out int item))
        {
            Console.WriteLine($"处理: {item}");
        }
        else
        {
            await Task.Delay(50);
        }
    }
}
```

## ConcurrentStack<T>

LIFO 栈。

```csharp
ConcurrentStack<int> stack = new ConcurrentStack<int>();

// 压栈
stack.Push(1);
stack.PushRange(new[] { 2, 3, 4 });

// 弹栈
if (stack.TryPop(out int result))
{
    Console.WriteLine($"弹出: {result}");
}

// 批量弹出
stack.TryPopRange(out int[] items, 3);
```

## ConcurrentBag<T>

无序集合，特别适合生产-消费模式中多个线程独立产生产品的场景。

```csharp
ConcurrentBag<string> bag = new ConcurrentBag<string>();

// 添加
bag.Add("task1");
bag.Add("task2");

// 取出
if (bag.TryTake(out string item))
{
    Console.WriteLine($"取出: {item}");
}

// 偷看
if (bag.TryPeek(out string peek))
{
    Console.WriteLine($"下一个: {peek}");
}
```

### 线程本地存储优化

ConcurrentBag 为每个线程维护一个本地队列，减少竞争。

```csharp
ConcurrentBag<int> bag = new ConcurrentBag<int>();

Parallel.For(0, 1000, i => {
    bag.Add(i);  // 每个线程添加到自己的本地存储
});

Console.WriteLine($"总数: {bag.Count}");  // 1000

// 取出时优先从本地队列取，如果没有再偷取其他线程的
int sum = 0;
while (bag.TryTake(out int item))
{
    sum += item;
}
```

## BlockingCollection<T>

支持阻塞操作的集合，通常包装 ConcurrentQueue。

```csharp
using System.Collections.Concurrent;

// 默认包装 ConcurrentQueue（FIFO）
BlockingCollection<int> collection = new BlockingCollection<int>();

// 生产者
Task producer = Task.Run(() => {
    for (int i = 0; i < 10; i++)
    {
        collection.Add(i);
        Console.WriteLine($"生产: {i}");
        Thread.Sleep(100);
    }
    collection.CompleteAdding();  // 标记不再添加
});

// 消费者
Task consumer = Task.Run(() => {
    foreach (var item in collection.GetConsumingEnumerable())
    {
        Console.WriteLine($"消费: {item}");
    }
});

await Task.WhenAll(producer, consumer);
```

### 有界集合

```csharp
// 容量为 10，超过会阻塞生产者
BlockingCollection<int> bounded = new BlockingCollection<int>(10);

// 使用 ConcurrentBag
BlockingCollection<string> bagCollection = new BlockingCollection<string>(
    new ConcurrentBag<string>(), 
    boundedCapacity: 20);
```

### 超时操作

```csharp
if (collection.TryAdd(42, TimeSpan.FromSeconds(1)))
{
    Console.WriteLine("添加成功");
}

if (collection.TryTake(out int item, TimeSpan.FromSeconds(1)))
{
    Console.WriteLine($"取出: {item}");
}
```

## 性能对比

| 集合 | 适用场景 | 性能特点 |
|------|----------|----------|
| ConcurrentDictionary | 键值查找频繁 | 读多写少时接近普通 Dictionary |
| ConcurrentQueue | 生产者-消费者队列 | 无锁，极高吞吐量 |
| ConcurrentStack | LIFO 场景 | 无锁实现 |
| ConcurrentBag | 每个线程独立产生/消费 | 线程本地存储，适合并行循环 |
| BlockingCollection | 需要阻塞等待 | 包装器，可与任意 IProducerConsumerCollection 配合 |

## 完整示例：多阶段处理管道

```csharp
using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;

class PipelineExample
{
    static async Task Main()
    {
        var stage1 = new BlockingCollection<string>(10);
        var stage2 = new BlockingCollection<(string, int)>(10);
        
        // 阶段1：读取数据
        var reader = Task.Run(() => {
            for (int i = 1; i <= 100; i++)
            {
                stage1.Add($"item_{i}");
            }
            stage1.CompleteAdding();
        });
        
        // 阶段2：转换处理
        var processor = Task.Run(() => {
            foreach (var item in stage1.GetConsumingEnumerable())
            {
                int length = item.Length;
                stage2.Add((item, length));
            }
            stage2.CompleteAdding();
        });
        
        // 阶段3：输出
        foreach (var (item, length) in stage2.GetConsumingEnumerable())
        {
            Console.WriteLine($"{item}: {length} chars");
        }
        
        await Task.WhenAll(reader, processor);
    }
}
```

## 注意事项

1. **Count 属性是 O(n)**：`ConcurrentBag.Count` 和 `ConcurrentQueue.Count` 需要遍历
2. **遍历快照**：`GetEnumerator()` 返回集合的快照
3. **避免长时间持有锁**：并发集合的原子操作短暂但并非零开销
4. **与普通加锁集合的选择**：高并发时使用 Concurrent 版本，低并发时普通集合加锁可能更快

```csharp
// 不推荐：在遍历时进行大量操作
foreach (var item in concurrentBag)
{
    // 每个操作都涉及原子性的开销
}

// 推荐：先取出再处理
while (concurrentBag.TryTake(out var item))
{
    Process(item);
}
```

## 参考资源

- [Microsoft Docs: 线程安全集合](https://learn.microsoft.com/zh-cn/dotnet/standard/collections/thread-safe/)
- [ConcurrentDictionary 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.collections.concurrent.concurrentdictionary-2)
- [BlockingCollection 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.collections.concurrent.blockingcollection-1)
