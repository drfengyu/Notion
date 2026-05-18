---
title: C# 并行编程 - Parallel 与 PLINQ
date: 2026-05-12
tags:
  - C#
  - 并行编程
  - Parallel
  - PLINQ
categories:
  - 编程笔记
---

## 概述

`System.Threading.Tasks` 命名空间提供 `Parallel` 类和 PLINQ（并行 LINQ），简化数据并行和任务并行的实现。它们自动将工作分配到多个线程。

## Parallel.For

并行 for 循环，适合迭代次数已知的计算密集型任务。

```csharp
using System.Threading.Tasks;

// 基本用法
Parallel.For(0, 100, i => {
    Console.WriteLine($"索引 {i}，线程: {Thread.CurrentThread.ManagedThreadId}");
});

// 带并行选项
Parallel.For(0, 1000, new ParallelOptions 
{ 
    MaxDegreeOfParallelism = 4  // 最大并行度
}, i => {
    // 计算密集型工作
    double result = Math.Sqrt(i) * Math.PI;
});
```

### 线程局部变量（高性能）

```csharp
// 使用线程局部变量减少锁竞争
long sum = 0;
Parallel.For(0, 1000000,

    // 初始化局部变量
    () => 0L,

    // 循环体
    (i, state, local) => {
        return local + i;
    },

    // 聚合局部结果
    local => Interlocked.Add(ref sum, local)
);

Console.WriteLine($"总和: {sum}");
```

## Parallel.ForEach

并行遍历集合。

```csharp
var items = Enumerable.Range(1, 100).ToList();

Parallel.ForEach(items, item => {
    ProcessItem(item);
});

// 并行遍历数组
int[] numbers = new int[1000];
Parallel.ForEach(numbers, (num, state, index) => {
    numbers[index] = index * index;
});

// 控制并行行为
Parallel.ForEach(items, new ParallelOptions { MaxDegreeOfParallelism = 4 },
    item => {
        Console.WriteLine($"{item}");
    });
```

### 提前退出（Break/Stop）

```csharp
Parallel.For(0, 1000000, (i, state) => {
    if (i > 1000)
    {
        state.Break();  // 通知不再处理后续迭代，但已完成的不影响
        // state.Stop(); // 立即停止所有正在执行的迭代
        return;
    }
    DoWork(i);
});
```

## Parallel.Invoke

并行执行多个操作。

```csharp
Parallel.Invoke(
    () => DoWork1(),
    () => DoWork2(),
    () => DoWork3(),
    () => DownloadData()
);

// 带配置
Parallel.Invoke(new ParallelOptions { MaxDegreeOfParallelism = 2 },
    () => LongRunningTaskA(),
    () => LongRunningTaskB()
);
```

## 完整示例：图像处理

```csharp
using System;
using System.Drawing;
using System.Threading.Tasks;

class ImageProcessor
{
    public static void ApplyGrayscale(Bitmap bitmap)
    {
        Rectangle rect = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        System.Drawing.Imaging.BitmapData bmpData = bitmap.LockBits(rect,
            System.Drawing.Imaging.ImageLockMode.ReadWrite,
            bitmap.PixelFormat);

        int bytesPerPixel = Image.GetPixelFormatSize(bitmap.PixelFormat) / 8;
        byte* ptr = (byte*)bmpData.Scan0;
        int stride = bmpData.Stride;

        // 并行处理每一行
        Parallel.For(0, bitmap.Height, y =>
        {
            byte* row = ptr + (y * stride);
            for (int x = 0; x < bitmap.Width; x++)
            {
                int idx = x * bytesPerPixel;
                byte gray = (byte)(row[idx] * 0.299 + row[idx + 1] * 0.587 + row[idx + 2] * 0.114);
                row[idx] = gray;
                row[idx + 1] = gray;
                row[idx + 2] = gray;
            }
        });

        bitmap.UnlockBits(bmpData);
    }
}
```

## PLINQ（并行 LINQ）

### 基础使用

```csharp
using System.Linq;

var numbers = Enumerable.Range(1, 10000000);

// 并行查询
var evenNumbers = numbers
    .AsParallel()
    .Where(n => n % 2 == 0)
    .ToList();

// 并行聚合
var sum = numbers.AsParallel().Sum();
var average = numbers.AsParallel().Average();

// 自定义聚合
var result = numbers.AsParallel()
    .Aggregate(
        0,
        (local, n) => local + n,
        (total, local) => total + local,
        total => total
    );
```

### 执行顺序

```csharp
// AsOrdered 保持原始顺序（有性能开销）
var ordered = numbers.AsParallel().AsOrdered()
    .Where(x => x > 5000000)
    .ToList();

// AsUnordered 取消顺序约束，提升性能
var unordered = numbers.AsParallel().AsUnordered()
    .Where(x => x > 5000000)
    .ToList();
```

### 控制并行度

```csharp
var result = numbers.AsParallel()
    .WithDegreeOfParallelism(4)
    .WithExecutionMode(ParallelExecutionMode.ForceParallelism)
    .Where(n => IsPrime(n))
    .ToList();

// 强制顺序执行（调试使用）
var sequential = numbers.AsParallel()
    .WithExecutionMode(ParallelExecutionMode.Default)
    .AsSequential()  // 切换回顺序 LINQ
    .Where(n => n % 2 == 0);
```

### 合并选项

```csharp
// 控制结果返回方式
var results = numbers.AsParallel()
    .WithMergeOptions(ParallelMergeOptions.NotBuffered)  // 立即返回
    .Select(x => HeavyCompute(x))
    .ToList();

// 合并选项说明：
// - NotBuffered: 结果一产生就返回
// - AutoBuffered: 系统决定缓冲大小（默认）
// - FullyBuffered: 全部完成后再返回
```

## PLINQ 异常处理

```csharp
try
{
    var results = Enumerable.Range(0, 100)
        .AsParallel()
        .Select(x => 100 / x)  // 除以零
        .ToList();
}
catch (AggregateException ae)
{
    foreach (var ex in ae.InnerExceptions)
    {
        Console.WriteLine($"异常: {ex.Message}");
    }
}
```

## 使用 CancellationToken

```csharp
using System.Threading;

CancellationTokenSource cts = new CancellationTokenSource();
cts.CancelAfter(1000);

try
{
    Parallel.For(0, 10000000, new ParallelOptions 
    { 
        CancellationToken = cts.Token 
    }, i => {
        DoWork(i);
    });
}
catch (OperationCanceledException)
{
    Console.WriteLine("并行操作被取消");
}
```

## 何时使用 Parallel/PLINQ

| 场景 | 推荐 |
|------|------|
| CPU 密集型计算 | ✅ Parallel / PLINQ |
| 迭代次数多（>1000） | ✅ 值得并行化 |
| 简单循环体（少数指令） | ❌ 并行开销大于收益 |
| 有依赖关系的迭代 | ❌ 必须顺序执行 |
| IO 密集型操作 | ❌ 使用 async/await 代替 |
| 小数据量 | ❌ 顺序执行更快 |

## 性能注意事项

```csharp
// 不适用并行：循环体太简单
for (int i = 0; i < 1000000; i++)
{
    sum += i;  // 并行化会增加锁开销
}

// 适用并行：循环体计算密集
Parallel.For(0, 1000, i => {
    var result = Enumerable.Range(0, 1000000)
        .Select(x => Math.Sqrt(x) * Math.PI)
        .Sum();
});

// 使用 ThreadLocal 避免锁
Parallel.For(0, 1000000, () => 0, (i, state, local) => local + i, 
    local => Interlocked.Add(ref sum, local));
```

## 诊断与调试

```csharp
// 查看是否真的并行执行
var query = Enumerable.Range(0, 100)
    .AsParallel()
    .WithDegreeOfParallelism(4)
    .Select(x => {
        Console.WriteLine($"处理 {x}，线程: {Thread.CurrentThread.ManagedThreadId}");
        return x * 2;
    })
    .ToList();
```

## 参考资源

- [Microsoft Docs: 并行编程](https://learn.microsoft.com/zh-cn/dotnet/standard/parallel-programming/)
- [Parallel 类](https://learn.microsoft.com/zh-cn/dotnet/api/system.threading.tasks.parallel)
- [PLINQ 指南](https://learn.microsoft.com/zh-cn/dotnet/standard/parallel-programming/parallel-linq-plinq)
