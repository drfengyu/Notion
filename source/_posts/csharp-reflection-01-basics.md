---
title: C# 反射由浅入深 (1) — 反射基础
date: 2026-05-18
tags:
  - C#
  - 反射
  - Reflection
  - 基础
categories:
  - C# 反射系列
---

## 本篇定位

这是 C# 反射系列的第一篇，我们从最基础的概念开始。读完你会理解：

- 什么是反射，为什么需要反射
- `Type` 类的核心作用
- 如何获取类型信息
- `Assembly` 和 `Module` 的关系
- 反射的基本用途

---

## 1. 什么是反射

**反射（Reflection）** 是 .NET 提供的一种机制，允许程序在运行时检查和操作类型信息。

简单来说：
- **编译时**：编译器知道类型信息
- **运行时**：通过反射，你的代码也能知道类型信息

### 为什么需要反射

```csharp
// 不用反射：必须在编译时知道类型
var person = new Person { Name = "Alice", Age = 30 };
Console.WriteLine(person.Name);

// 用反射：运行时才知道类型
object obj = GetObjectFromDatabase(); // 不知道是什么类型
var nameProperty = obj.GetType().GetProperty("Name");
var name = nameProperty?.GetValue(obj);
Console.WriteLine(name);
```

反射的典型应用场景：
- **序列化/反序列化**（JSON、XML）
- **依赖注入容器**（自动创建和注入对象）
- **ORM 框架**（映射数据库表到类）
- **单元测试框架**（自动发现和执行测试方法）
- **插件系统**（动态加载程序集）

---

## 2. Type 类 — 反射的核心

`Type` 类代表一个类型的元数据。所有反射操作都从 `Type` 开始。

### 获取 Type 对象

有三种方式获取 `Type`：

```csharp
// 方式 1：使用 typeof 操作符（编译时已知类型）
Type type1 = typeof(string);

// 方式 2：使用 GetType() 方法（运行时对象）
string str = "hello";
Type type2 = str.GetType();

// 方式 3：使用 Type.GetType()（类型名称字符串）
Type type3 = Type.GetType("System.String");

// 验证它们是同一个 Type
Console.WriteLine(type1 == type2); // True
Console.WriteLine(type1 == type3); // True
```

### Type 的基本属性

```csharp
Type type = typeof(Person);

// 基本信息
Console.WriteLine(type.Name);           // "Person"
Console.WriteLine(type.FullName);       // "MyApp.Models.Person"
Console.WriteLine(type.Namespace);      // "MyApp.Models"

// 类型分类
Console.WriteLine(type.IsClass);        // True
Console.WriteLine(type.IsInterface);    // False
Console.WriteLine(type.IsValueType);    // False
Console.WriteLine(type.IsAbstract);     // False
Console.WriteLine(type.IsSealed);       // False

// 继承关系
Console.WriteLine(type.BaseType);       // System.Object
Console.WriteLine(type.GetInterfaces()); // 实现的接口数组
```

---

## 3. 获取类型成员

`Type` 提供了多个方法来获取类型的成员（属性、方法、字段等）。

### 获取属性（Properties）

```csharp
public class Person
{
    public string Name { get; set; }
    public int Age { get; set; }
    private string _email;
}

Type type = typeof(Person);

// 获取所有公开属性
PropertyInfo[] properties = type.GetProperties();
foreach (var prop in properties)
{
    Console.WriteLine($"属性: {prop.Name}, 类型: {prop.PropertyType}");
}
// 输出:
// 属性: Name, 类型: System.String
// 属性: Age, 类型: System.Int32

// 获取特定属性
PropertyInfo nameProp = type.GetProperty("Name");
Console.WriteLine(nameProp.CanRead);   // True
Console.WriteLine(nameProp.CanWrite);  // True
```

### 获取方法（Methods）

```csharp
public class Calculator
{
    public int Add(int a, int b) => a + b;
    public int Multiply(int a, int b) => a * b;
    private int Subtract(int a, int b) => a - b;
}

Type type = typeof(Calculator);

// 获取所有公开方法
MethodInfo[] methods = type.GetMethods(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.DeclaredOnly);
foreach (var method in methods)
{
    Console.WriteLine($"方法: {method.Name}");
}
// 输出:
// 方法: Add
// 方法: Multiply

// 获取特定方法
MethodInfo addMethod = type.GetMethod("Add");
Console.WriteLine($"参数个数: {addMethod.GetParameters().Length}");
```

### 获取字段（Fields）

```csharp
public class Config
{
    public string ApiKey = "secret";
    private int _timeout = 5000;
}

Type type = typeof(Config);

// 获取所有公开字段
FieldInfo[] fields = type.GetFields();
foreach (var field in fields)
{
    Console.WriteLine($"字段: {field.Name}, 类型: {field.FieldType}");
}
```

---

## 4. Assembly 和 Module

### Assembly（程序集）

`Assembly` 代表一个 .NET 程序集（.dll 或 .exe 文件）。

```csharp
// 获取类型所在的程序集
Type type = typeof(Person);
Assembly assembly = type.Assembly;

Console.WriteLine(assembly.GetName().Name);     // 程序集名称
Console.WriteLine(assembly.Location);           // 程序集文件路径

// 获取程序集中的所有类型
Type[] types = assembly.GetTypes();
foreach (var t in types)
{
    Console.WriteLine(t.FullName);
}

// 加载程序集
Assembly loadedAssembly = Assembly.LoadFrom("MyLibrary.dll");
```

### Module（模块）

大多数情况下，一个程序集包含一个模块。

```csharp
Type type = typeof(Person);
Module module = type.Module;

Console.WriteLine(module.Name);  // 模块名称
```

---

## 5. 实战例子：类型检查工具

让我们写一个简单的工具，打印任何类型的完整信息：

```csharp
public class TypeInspector
{
    public static void Inspect(Type type)
    {
        Console.WriteLine($"=== {type.FullName} ===");
        Console.WriteLine($"程序集: {type.Assembly.GetName().Name}");
        Console.WriteLine($"基类: {type.BaseType?.Name ?? "无"}");
        
        // 属性
        Console.WriteLine("\n【属性】");
        var properties = type.GetProperties();
        if (properties.Length == 0)
            Console.WriteLine("  无");
        else
            foreach (var prop in properties)
                Console.WriteLine($"  {prop.PropertyType.Name} {prop.Name}");
        
        // 方法
        Console.WriteLine("\n【方法】");
        var methods = type.GetMethods(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.DeclaredOnly);
        if (methods.Length == 0)
            Console.WriteLine("  无");
        else
            foreach (var method in methods)
            {
                var parameters = string.Join(", ", method.GetParameters().Select(p => $"{p.ParameterType.Name} {p.Name}"));
                Console.WriteLine($"  {method.ReturnType.Name} {method.Name}({parameters})");
            }
    }
}

// 使用
TypeInspector.Inspect(typeof(Person));
```

输出示例：
```
=== MyApp.Models.Person ===
程序集: MyApp
基类: Object

【属性】
  String Name
  Int32 Age

【方法】
  无
```

---

## 6. BindingFlags 详解

获取成员时，`BindingFlags` 控制搜索范围：

```csharp
Type type = typeof(Person);

// 只获取公开成员（默认）
type.GetProperties();

// 获取公开和私有成员
type.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);

// 只获取声明在该类型上的成员（不包括继承的）
type.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.DeclaredOnly);

// 获取静态成员
type.GetProperties(System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public);

// 获取实例成员
type.GetProperties(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public);
```

常用组合：
- `Public | Instance` — 公开实例成员
- `Public | Static` — 公开静态成员
- `Public | NonPublic | Instance` — 所有实例成员
- `Public | NonPublic | Static | Instance | DeclaredOnly` — 该类型声明的所有成员

---

## 总结

- **反射** 让程序能在运行时检查和操作类型信息
- **Type** 是反射的核心，代表一个类型的元数据
- 通过 `typeof`、`GetType()`、`Type.GetType()` 获取 Type 对象
- 使用 `GetProperties()`、`GetMethods()`、`GetFields()` 等方法获取成员信息
- **BindingFlags** 控制成员搜索的范围

下一篇我们将深入讲解如何通过反射**动态调用方法和访问属性**。
