---
title: C# ref关键字详解
date: 2026-09-18
tags:
  - C#
  - ref
categories:
  - 编程笔记
---

# C# ref 关键字详解
`ref` 用于**引用传递**，让方法接收变量的**内存地址**，而不是变量的值拷贝。
> 核心区别：默认是**值传递（传副本）**；`ref` 是**引用传递（传原变量本身）**

## ✅ 基础规则
1. 调用 `ref` 参数的方法时，**实参必须提前初始化赋值**（不能是未赋值的局部变量）
2. 方法声明和调用处，**两边都要写 ref**（C# 7.2 之前强制，新版也建议显式写）
3. `ref` 可以用于：值类型、引用类型、数组；不能用于只读变量（`readonly`、`const`）
4. 方法内修改参数，**会直接修改外面原始变量**

## 1. 值类型 + ref（最常用场景）
值类型（int, double, struct）默认传副本，方法内部修改不会影响外部；加 ref 就会修改原值。
```csharp
using System;

class Program
{
    // ref 参数：接收变量地址
    static void ChangeNum(ref int num)
    {
        num = 999; // 修改的是外面原始变量
    }

    static void Main()
    {
        int a = 10;
        ChangeNum(ref a); // 调用必须写 ref
        Console.WriteLine(a); // 输出：999
    }
}
```

> 如果去掉 ref：输出仍然是 10，方法修改的只是副本。

## 2. ref 作用于引用类型（class）
引用类型本身传递的是**引用副本**，不加 ref 也能修改对象内部字段；
加 `ref` 的效果：**可以让参数指向一个全新的对象**。
```csharp
class Student
{
    public string Name;
}

static void ReplaceStudent(ref Student s)
{
    // 直接替换外面变量指向的对象
    s = new Student { Name = "新同学" };
}

static void Main()
{
    Student stu = new Student { Name = "老王" };
    ReplaceStudent(ref stu);
    Console.WriteLine(stu.Name); // 新同学
}
```
> 不加 ref 的话，方法里 `s = new Student()` 只会修改本地副本引用，外部 stu 不变。

## 3. ref 返回值（C# 7.0+）
方法可以返回一个**引用**，调用方可以直接修改返回的那个变量。
```csharp
static ref int FindItem(int[] arr, int index)
{
    return ref arr[index]; // 返回数组元素的引用
}

static void Main()
{
    int[] arr = { 1, 2, 3 };
    ref var item = ref FindItem(arr, 1);
    item = 200;
    Console.WriteLine(arr[1]); // 200
}
```

## 4. ref 局部变量
直接定义一个指向已有变量的引用：
```csharp
int x = 100;
ref int rx = ref x;
rx = 200;
Console.WriteLine(x); // 200
```

## 5. ref in / ref readonly（C# 7.2+）
- `in`：只读引用传递，**禁止方法内修改**，适合大结构体，避免拷贝开销
- `ref readonly`：返回只读引用，不能修改返回值

```csharp
static void ReadOnlyFunc(in Point p)
{
    // p.X = 10; // 编译报错，不能修改
}
```

## 6. ref vs out 对比（高频面试）
| ref | out |
|---|---|
| 实参**必须预先赋值** | 实参可以不预先赋值 |
| 方法内**可读可写** | 方法内必须给 out 参数赋值，调用前值会被忽略 |
| 声明+调用都写 ref | 声明+调用都写 out |
| 适合：需要修改原有变量 | 适合：方法返回多个结果 |

示例 out：
```csharp
static void GetXY(out int x, out int y)
{
    x = 1;
    y = 2;
}
// 调用
GetXY(out int a, out int b);
```

## ⚠️ 常见坑
1. **不能把常量作为 ref 参数**：`ChangeNum(ref 10)` 编译报错，必须传变量
2. ref 不能和 async 一起使用：`async` 方法不支持 ref/out 参数
3. 不要返回局部变量的 ref（会产生危险的悬空引用）
```csharp
// ❌ 错误！返回栈上局部变量的引用
static ref int BadReturn()
{
    int tmp = 10;
    return ref tmp;
}
```

## 📌 什么时候用 ref？
1. 方法需要修改**外部值类型变量**（int、struct）
2. 方法需要把外部引用变量指向全新对象
3. 超大结构体，用 `in` 减少内存拷贝
4. 需要 ref 返回，直接修改容器内元素（高性能场景）

# ref / out / 默认传参 完整对比 Demo
```csharp
using System;

namespace RefOutDemo
{
    class Program
    {
        // 默认：值传递，拷贝一份，方法内修改不影响外部
        static void NormalPass(int num)
        {
            num = 100;
            Console.WriteLine($"【普通传参】方法内num = {num}");
        }

        // ref：引用传递，实参必须提前赋值；可读可写
        static void RefPass(ref int num)
        {
            num = 200;
            Console.WriteLine($"【ref传参】方法内num = {num}");
        }

        // out：输出参数，实参可以不赋值；方法内部必须给out参数赋值
        static void OutPass(out int num)
        {
            num = 300; // out必须在方法内赋值，否则编译报错
            Console.WriteLine($"【out传参】方法内num = {num}");
        }

        static void Main(string[] args)
        {
            int val = 10;
            Console.WriteLine($"初始 val = {val}\n");

            NormalPass(val);
            Console.WriteLine($"普通传参后 val = {val}\n");

            RefPass(ref val);
            Console.WriteLine($"ref传参后 val = {val}\n");

            OutPass(out val);
            Console.WriteLine($"out传参后 val = {val}");
        }
    }
}
```

## 运行输出
```
初始 val = 10

【普通传参】方法内num = 100
普通传参后 val = 10

【ref传参】方法内num = 200
ref传参后 val = 200

【out传参】方法内num = 300
out传参后 val = 300
```

---

# 引用类型（class）下三者对比 Demo
> 重点理解：class本身传的是引用副本，不加ref也能修改对象成员；只有加ref才可以**替换整个对象**
```csharp
using System;

namespace RefOutClassDemo
{
    class User
    {
        public string Name { get; set; }
    }

    class Program
    {
        // 普通传引用类型：拷贝引用地址，可修改对象内部字段，不能替换外部对象
        static void NormalClass(User u)
        {
            u.Name = "张三";
            u = new User { Name = "新对象" }; // 只修改本地副本，外面不变
            Console.WriteLine($"【普通class】方法内u.Name={u.Name}");
        }

        // ref class：可以直接替换外部原始变量指向的对象
        static void RefClass(ref User u)
        {
            u = new User { Name = "李四" };
            Console.WriteLine($"【ref class】方法内u.Name={u.Name}");
        }

        // out class：方法内必须给u赋值
        static void OutClass(out User u)
        {
            u = new User { Name = "王五" };
            Console.WriteLine($"【out class】方法内u.Name={u.Name}");
        }

        static void Main(string[] args)
        {
            User user = new User { Name = "原始名字" };
            Console.WriteLine($"初始：{user.Name}\n");

            NormalClass(user);
            Console.WriteLine($"普通class调用后：{user.Name}\n");

            RefClass(ref user);
            Console.WriteLine($"ref class调用后：{user.Name}\n");

            OutClass(out user);
            Console.WriteLine($"out class调用后：{user.Name}");
        }
    }
}
```
## 运行输出
```
初始：原始名字

【普通class】方法内u.Name=新对象
普通class调用后：张三

【ref class】方法内u.Name=李四
ref class调用后：李四

【out class】方法内u.Name=王五
out class调用后：王五
```

---

# 核心总结表
| 方式 | 值类型(int/struct) | 引用类型(class) | 实参要求 | 方法内要求 |
|---|---|---|---|---|
| 默认传参 | 传值拷贝，修改不影响外部 | 传引用副本，可以修改对象成员；不能替换外部对象 | 变量可赋值可不赋值 | 无强制赋值要求 |
| ref | 传变量地址，修改直接影响外部 | 传变量地址，可以替换外部对象 | **调用前必须赋值** | 可读可写，无强制赋值 |
| out | 传变量地址，修改直接影响外部 | 传变量地址，可以替换外部对象 | 调用前可以不赋值 | **方法内必须赋值** |

## 面试一句话记忆
1. **普通传参**：值类型拷贝值，引用类型拷贝引用
2. **ref**：进来之前要有值，方法里随便读写
3. **out**：进来的值没用，方法里必须给值
